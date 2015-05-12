/*global require, describe, it, process*/
'use strict';

var harness = require('./test.harness'),
  RedisEventNotifier = require(harness.lib + 'RedisEventNotifier'),
  redis = require('redis'),
  sentinel = require('redis-sentinel'),
  notifierOptions = {
	dbConfig: {
		useRedisSentinel: false,
		db:		 0,
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
    logLevel : 'DEBUG'
  };


//Integration Test Suite
describe('RedisEventNotifier Integration Suite', function () {

  it('Should create a successful redis connection', function (done) {
    var eventNotifier = new RedisEventNotifier(redis, sentinel, notifierOptions);

    //Wait For Event Notifier To Be Ready
    eventNotifier.on('ready', function () {
      expect(this.subscriber.connected).toBeTruthy();
      done();
    });
  });

  it('Should Receive a __keyevent@0__:expired event upon key expire', function (done) {
    var eventNotifier = new RedisEventNotifier(redis, sentinel, notifierOptions);

    //Wait for Message Event
    eventNotifier.on('message', function (pattern, channel, key) {
      expect(pattern).toBe('__keyevent@0__:expired');
      expect(channel).toBe('__keyevent@0__:expired');
      expect(key).toBe('test.key');
      done();
    });

    //Wait For Event Notifier To Be Ready
    eventNotifier.on('ready', function () {
      //Test Client To Expire Key
      var client = redis.createClient();
      //select correct db
      client.select(0);
      //Wait For Client TO Be Ready So I can Issue TTL Command
      client.on('ready', function () {
        //Set Expire event for the Notifier to pick up
        client.SETEX(['test.key', 2, 'value'], function() {});
      });
    });
  });
});