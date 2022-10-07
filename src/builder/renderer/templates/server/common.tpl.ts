import { source } from "common-tags";

export function render(): string {
  // prettier-ignore
  return source`
    /** Catch and report async endpoint errors like normal ones. This will become unnecessary in express 5.x */
    function endpointHandlerGuard(handler) {
      return async (req, resp, next) => {
        try {
          await handler(req, resp)
        }
        catch(err) {
          next(err)
        }
      }
    }

    // ----- errors

    class EndpointError extends Error {
      constructor(status, body, cause) {
        super('Endpoint action error');
        this.status = status;
        this.body = body;
        this.cause = cause;
      }
    }

    // ----- middleware

    /** Simple request logger */
    function requestLogger(req, resp, next) {
      resp.on('finish', () => {
        console.log(\`[REQ] \${req.method} \${req.originalUrl} \${resp.statusCode}\`);
      });

      next();
    }

    /** Error logging middleware */
    function errorLogger(error, req, res, next) {
      console.error("[ERROR]", error);
      next(error);
    }

    /** Central error responder */
    function errorResponder(error, req, res, next) {
      if (error instanceof EndpointError) {
        res.status(error.status).json(error.body);
      } else {
        // default error handler
        res.status(500).send(error);
      }
    }

    // ----- exports

    module.exports = {
      endpointHandlerGuard,
      EndpointError,
      requestLogger, errorLogger, errorResponder
    };
  `
}
