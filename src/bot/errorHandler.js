require("dotenv").config();
const Sentry = require("@sentry/node");
const { ProfilingIntegration } = require("@sentry/profiling-node");
const express = require("express");
const bodyParser = require("body-parser");

const app = express().use(bodyParser.json());

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
    new ProfilingIntegration(),
  ],
  tracesSampleRate: 0,
  profilesSampleRate: 0,
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

app.use(Sentry.Handlers.errorHandler());

app.use(function onError(err, req, res, next) {
  res.statusCode = 500;
  res.end(res.sentry + "\n");
});

const catchError = async (e) => {
  if (
    process.env.ENVIRONMENT == "production" ||
    process.env.ENVIRONMENT == "dev"
  ) {
    Sentry.captureException(e);
  }
};

module.exports = { app, catchError };
