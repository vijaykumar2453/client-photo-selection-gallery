// Route handlers use async/await; this wrapper forwards rejected promises to Express error handling.
function asyncHandler(controller) {
  return function (req, res, next) {
    Promise.resolve(controller(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
