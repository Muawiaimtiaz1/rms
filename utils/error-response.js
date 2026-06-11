const { ZodError } = require("zod");

function humanizeField(path) {
  if (!path || !path.length) return "field";
  return path
    .map((part) => String(part).replace(/_/g, " "))
    .join(" ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanZodMessage(issue) {
  const field = humanizeField(issue.path);
  if (issue.code === "invalid_type") return `${field} is required or has the wrong value.`;
  if (issue.code === "too_small") return `${field} is too small.`;
  if (issue.code === "too_big") return `${field} is too large.`;
  if (issue.code === "invalid_enum_value") return `${field} must be one of the allowed options.`;
  return `${field}: ${issue.message}`;
}

function formatErrorResponse(error, fallbackMessage = "Something went wrong") {
  if (error instanceof ZodError) {
    const details = error.issues.map(cleanZodMessage);
    return {
      status: 400,
      body: {
        error: "Please check the form details.",
        details,
      },
    };
  }

  if (error?.code === "23505" || error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
    return {
      status: 409,
      body: { error: "This record already exists. Please use a different value." },
    };
  }

  if (error?.code === "23503" || error?.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
    return {
      status: 400,
      body: { error: "This record is linked to another record and cannot be saved like this." },
    };
  }

  if (error?.status && error?.message) {
    return { status: error.status, body: { error: error.message } };
  }

  if (error?.message && !/^(select|insert|update|delete)\b/i.test(error.message)) {
    return { status: 400, body: { error: error.message } };
  }

  return {
    status: 500,
    body: { error: fallbackMessage },
  };
}

function sendError(res, error, fallbackMessage) {
  const { status, body } = formatErrorResponse(error, fallbackMessage);
  return res.status(status).json(body);
}

module.exports = {
  formatErrorResponse,
  sendError,
};
