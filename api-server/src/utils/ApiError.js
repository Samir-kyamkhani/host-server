class ApiError extends Error {
  constructor(message = "Something went wrong!", statusCode = 500, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.success = false;
  }

  static send(res, statusCode, message = "Something went wrong!", errors = []) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
      statusCode,
      stack: process.env.NODE_ENV === "development" ? new Error().stack : undefined,
    });
  }

  static badRequest(message = "Bad Request", errors = []) {
    return new ApiError(message, 400, errors);
  }

  static unauthorized(message = "Unauthorized", errors = []) {
    return new ApiError(message, 401, errors);
  }

  static forbidden(message = "Forbidden", errors = []) {
    return new ApiError(message, 403, errors);
  }

  static notFound(message = "Not Found", errors = []) {
    return new ApiError(message, 404, errors);
  }

  static conflict(message = "Conflict", errors = []) {
    return new ApiError(message, 409, errors);
  }

  static internal(message = "Internal Server Error", errors = []) {
    return new ApiError(message, 500, errors);
  }
}

export { ApiError };