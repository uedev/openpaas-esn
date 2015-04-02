'use strict';

var cron = require('cron');
var uuid = require('node-uuid');

module.exports = function(dependencies) {

  var logger = dependencies('logger');
  var registry = require('./registry')(dependencies);

  function setJobState(id, state, callback) {
    registry.get(id, function(err, job) {
      if (err) {
        return callback(err);
      }

      if (!job) {
        return callback(new Error('No such job'));
      }

      job.state = state;
      job.updatedAt = new Date();
      registry.update(job, callback);
    });
  }

  function abort(id, callback) {
    registry.get(id, function(err, job) {
      if (err) {
        return callback(err);
      }

      if (!job) {
        return callback(new Error('No such job'));
      }

      if (!job.job) {
        return callback(new Error('No job to stop'));
      }

      job.job.stop();
      return callback();
    });
  }

  function submit(description, cronTime, job, onStopped, callback) {

    description = description || 'No description';

    if (!cronTime) {
      logger.error('Can not submit a cron job without a crontime');
      return callback(new Error('Crontime is required'));
    }

    if (!job) {
      logger.error('Can not submit an empty cron job');
      return callback(new Error('Job is required'));
    }

    if (typeof job !== 'function') {
      logger.error('Job must be a function');
      return callback(new Error('Job must be a function'));
    }

    if (!callback) {
      callback = onStopped;
      onStopped = function() {};
    }

    var CronJob = cron.CronJob;
    var id = uuid.v4();

    var cronjob = new CronJob(cronTime, function() {
        logger.info('Starting the cronjob %s', id);
        setJobState(id, 'running', function(err) {
          if (err) {
            logger.warning('Can not update the job state', err);
          }
          job();
        });
      }, function() {
        logger.info('Cronjob %s is stoped', id);
        setJobState(id, 'stopped', function(err) {
          if (err) {
            logger.warning('Can not update the job state', err);
          }
          onStopped();
        });
      },
      true
    );

    registry.store(id, description, cronjob, function(err, saved) {
      if (err) {
        logger.warning('Error while storing the job', err);
      }
      cronjob.start();
      return callback(null, saved);
    });
  }

  return {
    submit: submit,
    abort: abort,
    registry: registry
  };
};
