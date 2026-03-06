import { describe, expect, test, beforeEach } from "bun:test";
import { ApiError, formatError } from "./errors.js";

describe("ApiError", () => {
  test("constructor sets status, code, message, and details", () => {
    const err = new ApiError(400, "bad_request", "Invalid input", {
      field: "name",
    });
    expect(err.status).toBe(400);
    expect(err.code).toBe("bad_request");
    expect(err.message).toBe("Invalid input");
    expect(err.details).toEqual({ field: "name" });
  });

  test("extends Error", () => {
    const err = new ApiError(500, "internal", "Something broke");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  test("details is optional and defaults to undefined", () => {
    const err = new ApiError(404, "not_found", "Resource not found");
    expect(err.details).toBeUndefined();
  });

  test("has a stack trace", () => {
    const err = new ApiError(422, "validation", "Bad data");
    expect(err.stack).toBeDefined();
    expect(typeof err.stack).toBe("string");
  });

  test("name property is inherited from Error", () => {
    const err = new ApiError(500, "err", "msg");
    expect(err.name).toBe("Error");
  });
});

describe("formatError", () => {
  test("formats error with all fields", () => {
    const err = new ApiError(400, "bad_request", "Invalid input", {
      field: "email",
    });
    const result = formatError(err);
    expect(result).toEqual({
      code: "bad_request",
      message: "Invalid input",
      details: { field: "email" },
    });
  });

  test("formats error without details", () => {
    const err = new ApiError(404, "not_found", "Not found");
    const result = formatError(err);
    expect(result.code).toBe("not_found");
    expect(result.message).toBe("Not found");
    expect(result.details).toBeUndefined();
  });

  test("preserves complex details", () => {
    const details = [{ code: "InvalidChar", offset: 5, length: 1 }];
    const err = new ApiError(422, "parse_error", "Failed", details);
    const result = formatError(err);
    expect(result.details).toEqual(details);
  });
});
