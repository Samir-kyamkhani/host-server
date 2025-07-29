class ApiResponse {
  constructor(statusCode, message = "Success", data = null) {
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.success = statusCode < 400;
  }

  static success(data = null, message = "Success", statusCode = 200) {
    return new ApiResponse(statusCode, message, data);
  }

  static error(message = "Error", statusCode = 500, data = null) {
    return new ApiResponse(statusCode, message, data);
  }

  toJSON() {
    return {
      success: this.success,
      message: this.message,
      data: this.data,
      statusCode: this.statusCode
    };
  }
}

export { ApiResponse };