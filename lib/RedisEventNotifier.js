/*global require, module*/

//node
var EventEmitter = require('events').EventEmitter;
//npm
var extend = require('extend');
//local
var logAdapter = require('./adapters/logger'),
  logger = logAdapter.getInstance('redis-event-notifier');


/**
 * Redis Event Notifier
 * Subscribe to Redis Keyspace Notifications(v2.8.x)
 * @param redis
 * @param options
 * @constructor
 */
function RedisNotifier(redis, sentinel, options) {

  this.settings = extend(true, {
	dbConfig: {
		useRedisSentinel: false,
		db: 0,
		redis: {
			host: 'localhost',
			port: 6379,
			// auth_pass: 'yourpassword',
			// return_buffers: true, // required if storing binary data
			// retry_max_delay: 1000
		},
		redisSentinel: {
			masterName: 'mymaster',
			endPoints: [
				{host: 'localhost', port: 26379},
				{host: 'localhost', port: 26380},
				{host: 'localhost', port: 26381}
			],
			options: {
				// auth_pass: 'yourpassword'
				// , return_buffers: true // required if storing binary data
				//, connect_timeout: 10000
				//, retry_max_delay: 1000
			}
		}
	},
	expired: true,
	evicted: true,
    logLevel : 'INFO'
  }, options || {});
  
  console.log('this.settings', this.settings);

  //Set Global Log Level
  logAdapter.setLogLevel(this.settings.logLevel);

  //Require Redis if its not injected
  if (!redis || typeof redis !== 'object') {
    throw new Error("You must provide a Redis module");
  }

  //The Redis Subscriber Instance
  logger.info("Initializing" + JSON.stringify(this.settings));
  
  var dbConfig = this.settings.dbConfig;
  logger.warn('RedisEventNotifier: dbConfig.useRedisSentinel', dbConfig.useRedisSentinel);

  // Call the super EventEmitter constructor.
  EventEmitter.call(this);

  //Create Redis Subscriber Client
  //this.subscriber = redis.createClient(this.settings.redis.port, this.settings.redis.host, this.settings.redis.options);
  //Select Appropriate Database
    
  if (isNaN(dbConfig.db) || dbConfig.db > 15 || dbConfig.db < 0) {
	throw new Error("RedisEventNotifier: You must provide db number");
  }
  
  if (!dbConfig.useRedisSentinel) {
	if (!dbConfig.redis || !dbConfig.redis.host || !dbConfig.redis.port
		|| dbConfig.redis.host.length == 0 || dbConfig.redis.port == 0) {
		throw new Error("RedisEventNotifier: You must provide redis configuration settings");
	}

	//Create Redis Subscriber Client
	logger.info('RedisEventNotifier: using redis. Redis config is', dbConfig.redis);
	//redis.debug_mode = true;
	this.subscriber = redis
		.createClient(dbConfig.redis.port, dbConfig.redis.host, dbConfig.redis.options);

  } else {
	// instantiate sentinel client
	logger.info('RedisEventNotifier: using redis SENTINEL -------- Sentinel config is', dbConfig.redisSentinel);
	//sentinel.debug_mode = true;
	this.subscriber = sentinel
		.createClient(dbConfig.redisSentinel.endPoints, dbConfig.redisSentinel.masterName,  dbConfig.redisSentinel.options);
  }
  
  // If not authenticated yet, perform authentication.
  if (dbConfig.redis.auth) {
	this.subscriber.auth(dbConfig.redis.auth, function(err) {
		if (!err) {
			logger.info('RedisEventNotifier: Redis Authenticated -----------');
		} else {
			// TODO: need to handle error
			logger.error('RedisEventNotifier: Error authenticating redis -----------', err);
		}
	});
  }
	
  //Select Appropriate Database
  this.subscriber.select(dbConfig.db);

  //Redis Ready To Subscribe
  this.subscriber.on('ready', function () {
    logger.info("Redis Subscriber Ready");
    //Subscribe To Expired/Evicted Events
    this._subscribeToEvents.call(this);
  }.bind(this));

  //Bind To Redis Store Message Handler
  this.subscriber.on("pmessage", function (pattern, channel, key) {
    logger.debug("Received Message" + JSON.stringify(arguments));
    this.emit('message', pattern, channel, key);
  }.bind(this));
}

//Inherit From The EventEmitter Prototype
RedisNotifier.prototype = Object.create(EventEmitter.prototype);

/**
 * Subscribe to Expired/Evicted Events
 * Emitted From Redis
 * @private
 */
RedisNotifier.prototype._subscribeToEvents = function () {
  logger.info("Subscribing To Events");
  //events generated every time a key expires
  if (this.settings.expired) {
    this._subscribeKeyevent('expired');
  }
  //events generated when a key is evicted for max-memory
  if (this.settings.evicted) {
    this._subscribeKeyevent('evicted');
  }

  //Let user know its ready to handle subscriptions
  this.emit('ready');
};


/**
 * De-init the subscriptions
 */
RedisNotifier.prototype.deinit = function() {
  if (this.settings.expired) {
    this._unsubscribeKeyevent('expired');
  }
  if (this.settings.evicted) {
    this._unsubscribeKeyevent('evicted');
  }
};

/**
 * Parse The Type/Key From ChannelKey
 * @param channel
 * @returns {{type: *, key: *}}
 */
RedisNotifier.prototype.parseMessageChannel = function (channel) {
  //__keyevent@0__:expired
  var re = /__([a-z]*)+@([0-9])+__:([a-z]*)/i;
  var parts = channel.match(re);

  return {
    type : parts[1],
    key  : parts[3]
  };
};

/**
 * Subscribe To Specific Redis Keyspace Event
 * @param key
 * @private
 */
RedisNotifier.prototype._subscribeKeyspace = function (key) {
  var subscriptionKey = "__keyspace@" + this.settings.dbConfig.db + "__:" + key;
  logger.debug("Subscribing To Event " + subscriptionKey);
  this.subscriber.psubscribe(subscriptionKey);
};

/**
 * UnSubscribe To Specific Redis Keyspace Event
 * @param key
 * @private
 */
RedisNotifier.prototype._unsubscribeKeyspace = function (key) {
  var subscriptionKey = "__keyspace@" + this.settings.dbConfig.db + "__:" + key;
  logger.debug("UnSubscribing From Event " + subscriptionKey);
  this.subscriber.punsubscribe(subscriptionKey);
};

/**
 * Subscribe To KeyEvent (Expired/Evicted)
 * @param key
 * @private
 */
RedisNotifier.prototype._subscribeKeyevent = function (key) {
  var subscriptionKey = "__keyevent@" + this.settings.dbConfig.db + "__:" + key;
  logger.debug("Subscribing To Event :" + subscriptionKey);
  this.subscriber.psubscribe(subscriptionKey);
};


/**
 * UnSubscribe To KeyEvent (Expired/Evicted)
 * @param key
 * @private
 */
RedisNotifier.prototype._unsubscribeKeyevent = function (key) {
  var subscriptionKey = "__keyevent@" + this.settings.dbConfig.db + "__:" + key;
  logger.debug("UnSubscribing From Event :" + subscriptionKey);
  this.subscriber.punsubscribe(subscriptionKey);
};


module.exports = RedisNotifier;