/*global process*/

"use strict";

//node
var EventEmitter = require('events').EventEmitter;
var util = require('util');

function RedisSentinelClient(options) {
  this.options = options;

  // Call the super EventEmitter constructor.
  EventEmitter.call(this);

  var self = this;
  process.nextTick(function() {
    self.emit('ready');
  });
}

//Inherit EventEmitter Prototype Methods
RedisSentinelClient.prototype = Object.create( EventEmitter.prototype );

RedisSentinelClient.prototype.psubscribe = function(key) {};
RedisSentinelClient.prototype.punsubscribe = function(key) {};
RedisSentinelClient.prototype.select = function(key) {};


//Test Helper
RedisSentinelClient.prototype._triggerMessage = function(pattern, channel, expiredKey) {
  this.emit("pmessage", pattern, channel, expiredKey);
};

module.exports = {

  createClient : function(options) {
    return new RedisSentinelClient(options);
  }

};
