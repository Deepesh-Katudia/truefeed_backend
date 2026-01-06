// Lightweight validation/sanitization helpers for JSON payloads
// Usage: attach per-route with a schema describing expected fields.

function isString(v) {
  return typeof v === "string";
}

function sanitizeString(v, { trim = true, maxLen = 2000 } = {}) {
  if (!isString(v)) return v;
  let s = v;
  if (trim) s = s.trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  // basic control-char removal (except \n, \r, \t)
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return s;
}

// schema format example:
// {
//   content: { type: 'string', required: false, maxLen: 2000 },
//   mediaUrl: { type: 'string', required: false, maxLen: 1024 },
// }
function validateBody(schema) {
  return (req, res, next) => {
    const body = req.body || {};
    const errors = [];
    const out = {};

    for (const [key, rules] of Object.entries(schema || {})) {
      const val = body[key];
      const required = !!rules.required;
      const type = rules.type;

      if (val === undefined || val === null) {
        if (required) errors.push(`${key} is required`);
        continue;
      }

      if (type === "string") {
        if (!isString(val)) {
          errors.push(`${key} must be a string`);
        } else {
          out[key] = sanitizeString(val, {
            trim: rules.trim !== false,
            maxLen: rules.maxLen || 2000,
          });
          // rudimentary URL check if flagged
          if (rules.format === "url" && !/^https?:\/\//i.test(out[key])) {
            errors.push(`${key} must be an http(s) URL`);
          }
        }
      } else if (type === "number") {
        if (typeof val !== "number" || Number.isNaN(val)) {
          errors.push(`${key} must be a number`);
        } else {
          out[key] = val;
        }
      } else if (type === "boolean") {
        if (typeof val !== "boolean") {
          errors.push(`${key} must be a boolean`);
        } else {
          out[key] = val;
        }
      } else if (type === "any") {
        out[key] = val;
      }
    }

    if (errors.length) {
      return res.status(400).json({ error: "validation", details: errors });
    }

    // attach sanitized body for downstream usage
    req.validatedBody = out;
    next();
  };
}

module.exports = { validateBody, sanitizeString };
