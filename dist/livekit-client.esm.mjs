function _mergeNamespaces(n, m) {
	m.forEach(function (e) {
		e && typeof e !== 'string' && !Array.isArray(e) && Object.keys(e).forEach(function (k) {
			if (k !== 'default' && !(k in n)) {
				var d = Object.getOwnPropertyDescriptor(e, k);
				Object.defineProperty(n, k, d.get ? d : {
					enumerable: true,
					get: function () { return e[k]; }
				});
			}
		});
	});
	return Object.freeze(n);
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var loglevel = {exports: {}};

/*
* loglevel - https://github.com/pimterry/loglevel
*
* Copyright (c) 2013 Tim Perry
* Licensed under the MIT license.
*/
(function (module) {
  (function (root, definition) {

    if (module.exports) {
      module.exports = definition();
    } else {
      root.log = definition();
    }
  })(commonjsGlobal, function () {

    // Slightly dubious tricks to cut down minimized file size
    var noop = function () {};
    var undefinedType = "undefined";
    var isIE = typeof window !== undefinedType && typeof window.navigator !== undefinedType && /Trident\/|MSIE /.test(window.navigator.userAgent);
    var logMethods = ["trace", "debug", "info", "warn", "error"];

    // Cross-browser bind equivalent that works at least back to IE6
    function bindMethod(obj, methodName) {
      var method = obj[methodName];
      if (typeof method.bind === 'function') {
        return method.bind(obj);
      } else {
        try {
          return Function.prototype.bind.call(method, obj);
        } catch (e) {
          // Missing bind shim or IE8 + Modernizr, fallback to wrapping
          return function () {
            return Function.prototype.apply.apply(method, [obj, arguments]);
          };
        }
      }
    }

    // Trace() doesn't print the message in IE, so for that case we need to wrap it
    function traceForIE() {
      if (console.log) {
        if (console.log.apply) {
          console.log.apply(console, arguments);
        } else {
          // In old IE, native console methods themselves don't have apply().
          Function.prototype.apply.apply(console.log, [console, arguments]);
        }
      }
      if (console.trace) console.trace();
    }

    // Build the best logging method possible for this env
    // Wherever possible we want to bind, not wrap, to preserve stack traces
    function realMethod(methodName) {
      if (methodName === 'debug') {
        methodName = 'log';
      }
      if (typeof console === undefinedType) {
        return false; // No method possible, for now - fixed later by enableLoggingWhenConsoleArrives
      } else if (methodName === 'trace' && isIE) {
        return traceForIE;
      } else if (console[methodName] !== undefined) {
        return bindMethod(console, methodName);
      } else if (console.log !== undefined) {
        return bindMethod(console, 'log');
      } else {
        return noop;
      }
    }

    // These private functions always need `this` to be set properly

    function replaceLoggingMethods(level, loggerName) {
      /*jshint validthis:true */
      for (var i = 0; i < logMethods.length; i++) {
        var methodName = logMethods[i];
        this[methodName] = i < level ? noop : this.methodFactory(methodName, level, loggerName);
      }

      // Define log.log as an alias for log.debug
      this.log = this.debug;
    }

    // In old IE versions, the console isn't present until you first open it.
    // We build realMethod() replacements here that regenerate logging methods
    function enableLoggingWhenConsoleArrives(methodName, level, loggerName) {
      return function () {
        if (typeof console !== undefinedType) {
          replaceLoggingMethods.call(this, level, loggerName);
          this[methodName].apply(this, arguments);
        }
      };
    }

    // By default, we use closely bound real methods wherever possible, and
    // otherwise we wait for a console to appear, and then try again.
    function defaultMethodFactory(methodName, level, loggerName) {
      /*jshint validthis:true */
      return realMethod(methodName) || enableLoggingWhenConsoleArrives.apply(this, arguments);
    }
    function Logger(name, defaultLevel, factory) {
      var self = this;
      var currentLevel;
      defaultLevel = defaultLevel == null ? "WARN" : defaultLevel;
      var storageKey = "loglevel";
      if (typeof name === "string") {
        storageKey += ":" + name;
      } else if (typeof name === "symbol") {
        storageKey = undefined;
      }
      function persistLevelIfPossible(levelNum) {
        var levelName = (logMethods[levelNum] || 'silent').toUpperCase();
        if (typeof window === undefinedType || !storageKey) return;

        // Use localStorage if available
        try {
          window.localStorage[storageKey] = levelName;
          return;
        } catch (ignore) {}

        // Use session cookie as fallback
        try {
          window.document.cookie = encodeURIComponent(storageKey) + "=" + levelName + ";";
        } catch (ignore) {}
      }
      function getPersistedLevel() {
        var storedLevel;
        if (typeof window === undefinedType || !storageKey) return;
        try {
          storedLevel = window.localStorage[storageKey];
        } catch (ignore) {}

        // Fallback to cookies if local storage gives us nothing
        if (typeof storedLevel === undefinedType) {
          try {
            var cookie = window.document.cookie;
            var location = cookie.indexOf(encodeURIComponent(storageKey) + "=");
            if (location !== -1) {
              storedLevel = /^([^;]+)/.exec(cookie.slice(location))[1];
            }
          } catch (ignore) {}
        }

        // If the stored level is not valid, treat it as if nothing was stored.
        if (self.levels[storedLevel] === undefined) {
          storedLevel = undefined;
        }
        return storedLevel;
      }
      function clearPersistedLevel() {
        if (typeof window === undefinedType || !storageKey) return;

        // Use localStorage if available
        try {
          window.localStorage.removeItem(storageKey);
          return;
        } catch (ignore) {}

        // Use session cookie as fallback
        try {
          window.document.cookie = encodeURIComponent(storageKey) + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC";
        } catch (ignore) {}
      }

      /*
       *
       * Public logger API - see https://github.com/pimterry/loglevel for details
       *
       */

      self.name = name;
      self.levels = {
        "TRACE": 0,
        "DEBUG": 1,
        "INFO": 2,
        "WARN": 3,
        "ERROR": 4,
        "SILENT": 5
      };
      self.methodFactory = factory || defaultMethodFactory;
      self.getLevel = function () {
        return currentLevel;
      };
      self.setLevel = function (level, persist) {
        if (typeof level === "string" && self.levels[level.toUpperCase()] !== undefined) {
          level = self.levels[level.toUpperCase()];
        }
        if (typeof level === "number" && level >= 0 && level <= self.levels.SILENT) {
          currentLevel = level;
          if (persist !== false) {
            // defaults to true
            persistLevelIfPossible(level);
          }
          replaceLoggingMethods.call(self, level, name);
          if (typeof console === undefinedType && level < self.levels.SILENT) {
            return "No console available for logging";
          }
        } else {
          throw "log.setLevel() called with invalid level: " + level;
        }
      };
      self.setDefaultLevel = function (level) {
        defaultLevel = level;
        if (!getPersistedLevel()) {
          self.setLevel(level, false);
        }
      };
      self.resetLevel = function () {
        self.setLevel(defaultLevel, false);
        clearPersistedLevel();
      };
      self.enableAll = function (persist) {
        self.setLevel(self.levels.TRACE, persist);
      };
      self.disableAll = function (persist) {
        self.setLevel(self.levels.SILENT, persist);
      };

      // Initialize with the right level
      var initialLevel = getPersistedLevel();
      if (initialLevel == null) {
        initialLevel = defaultLevel;
      }
      self.setLevel(initialLevel, false);
    }

    /*
     *
     * Top-level API
     *
     */

    var defaultLogger = new Logger();
    var _loggersByName = {};
    defaultLogger.getLogger = function getLogger(name) {
      if (typeof name !== "symbol" && typeof name !== "string" || name === "") {
        throw new TypeError("You must supply a name when creating a logger.");
      }
      var logger = _loggersByName[name];
      if (!logger) {
        logger = _loggersByName[name] = new Logger(name, defaultLogger.getLevel(), defaultLogger.methodFactory);
      }
      return logger;
    };

    // Grab the current global log variable in case of overwrite
    var _log = typeof window !== undefinedType ? window.log : undefined;
    defaultLogger.noConflict = function () {
      if (typeof window !== undefinedType && window.log === defaultLogger) {
        window.log = _log;
      }
      return defaultLogger;
    };
    defaultLogger.getLoggers = function getLoggers() {
      return _loggersByName;
    };

    // ES6 default export, for compatibility
    defaultLogger['default'] = defaultLogger;
    return defaultLogger;
  });
})(loglevel);
var loglevelExports = loglevel.exports;

var LogLevel;
(function (LogLevel) {
  LogLevel[LogLevel["trace"] = 0] = "trace";
  LogLevel[LogLevel["debug"] = 1] = "debug";
  LogLevel[LogLevel["info"] = 2] = "info";
  LogLevel[LogLevel["warn"] = 3] = "warn";
  LogLevel[LogLevel["error"] = 4] = "error";
  LogLevel[LogLevel["silent"] = 5] = "silent";
})(LogLevel || (LogLevel = {}));
const livekitLogger = loglevelExports.getLogger('livekit');
livekitLogger.setDefaultLevel(LogLevel.info);
function setLogLevel(level, loggerName) {
  if (loggerName) {
    loglevelExports.getLogger(loggerName).setLevel(level);
  }
  for (const logger of Object.values(loglevelExports.getLoggers())) {
    logger.setLevel(level);
  }
}
/**
 * use this to hook into the logging function to allow sending internal livekit logs to third party services
 * if set, the browser logs will lose their stacktrace information (see https://github.com/pimterry/loglevel#writing-plugins)
 */
function setLogExtension(extension) {
  const originalFactory = livekitLogger.methodFactory;
  livekitLogger.methodFactory = (methodName, configLevel, loggerName) => {
    const rawMethod = originalFactory(methodName, configLevel, loggerName);
    const logLevel = LogLevel[methodName];
    const needLog = logLevel >= configLevel && logLevel < LogLevel.silent;
    return (msg, context) => {
      if (context) rawMethod(msg, context);else rawMethod(msg);
      if (needLog) {
        extension(logLevel, msg, context);
      }
    };
  };
  livekitLogger.setLevel(livekitLogger.getLevel()); // Be sure to call setLevel method in order to apply plugin
}

loglevelExports.getLogger('lk-e2ee');

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * Assert that condition is truthy or throw error (with message)
 */
function assert(condition, msg) {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- we want the implicit conversion to boolean
  if (!condition) {
    throw new Error(msg);
  }
}
const FLOAT32_MAX = 3.4028234663852886e38,
  FLOAT32_MIN = -3.4028234663852886e38,
  UINT32_MAX = 0xffffffff,
  INT32_MAX = 0x7fffffff,
  INT32_MIN = -0x80000000;
/**
 * Assert a valid signed protobuf 32-bit integer.
 */
function assertInt32(arg) {
  if (typeof arg !== "number") throw new Error("invalid int 32: " + typeof arg);
  if (!Number.isInteger(arg) || arg > INT32_MAX || arg < INT32_MIN) throw new Error("invalid int 32: " + arg); // eslint-disable-line @typescript-eslint/restrict-plus-operands -- we want the implicit conversion to string
}
/**
 * Assert a valid unsigned protobuf 32-bit integer.
 */
function assertUInt32(arg) {
  if (typeof arg !== "number") throw new Error("invalid uint 32: " + typeof arg);
  if (!Number.isInteger(arg) || arg > UINT32_MAX || arg < 0) throw new Error("invalid uint 32: " + arg); // eslint-disable-line @typescript-eslint/restrict-plus-operands -- we want the implicit conversion to string
}
/**
 * Assert a valid protobuf float value.
 */
function assertFloat32(arg) {
  if (typeof arg !== "number") throw new Error("invalid float 32: " + typeof arg);
  if (!Number.isFinite(arg)) return;
  if (arg > FLOAT32_MAX || arg < FLOAT32_MIN) throw new Error("invalid float 32: " + arg); // eslint-disable-line @typescript-eslint/restrict-plus-operands -- we want the implicit conversion to string
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
const enumTypeSymbol = Symbol("@bufbuild/protobuf/enum-type");
/**
 * Get reflection information from a generated enum.
 * If this function is called on something other than a generated
 * enum, it raises an error.
 */
function getEnumType(enumObject) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-explicit-any
  const t = enumObject[enumTypeSymbol];
  assert(t, "missing enum type on enum object");
  return t; // eslint-disable-line @typescript-eslint/no-unsafe-return
}
/**
 * Sets reflection information on a generated enum.
 */
function setEnumType(enumObject, typeName, values, opt) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  enumObject[enumTypeSymbol] = makeEnumType(typeName, values.map(v => ({
    no: v.no,
    name: v.name,
    localName: enumObject[v.no]
  })));
}
/**
 * Create a new EnumType with the given values.
 */
function makeEnumType(typeName, values,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
_opt) {
  const names = Object.create(null);
  const numbers = Object.create(null);
  const normalValues = [];
  for (const value of values) {
    // We do not surface options at this time
    // const value: EnumValueInfo = {...v, options: v.options ?? emptyReadonlyObject};
    const n = normalizeEnumValue(value);
    normalValues.push(n);
    names[value.name] = n;
    numbers[value.no] = n;
  }
  return {
    typeName,
    values: normalValues,
    // We do not surface options at this time
    // options: opt?.options ?? Object.create(null),
    findName(name) {
      return names[name];
    },
    findNumber(no) {
      return numbers[no];
    }
  };
}
/**
 * Create a new enum object with the given values.
 * Sets reflection information.
 */
function makeEnum(typeName, values, opt) {
  const enumObject = {};
  for (const value of values) {
    const n = normalizeEnumValue(value);
    enumObject[n.localName] = n.no;
    enumObject[n.no] = n.localName;
  }
  setEnumType(enumObject, typeName, values);
  return enumObject;
}
function normalizeEnumValue(value) {
  if ("localName" in value) {
    return value;
  }
  return Object.assign(Object.assign({}, value), {
    localName: value.name
  });
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * Message is the base class of every message, generated, or created at
 * runtime.
 *
 * It is _not_ safe to extend this class. If you want to create a message at
 * run time, use proto3.makeMessageType().
 */
class Message {
  /**
   * Compare with a message of the same type.
   */
  equals(other) {
    return this.getType().runtime.util.equals(this.getType(), this, other);
  }
  /**
   * Create a deep copy.
   */
  clone() {
    return this.getType().runtime.util.clone(this);
  }
  /**
   * Parse from binary data, merging fields.
   *
   * Repeated fields are appended. Map entries are added, overwriting
   * existing keys.
   *
   * If a message field is already present, it will be merged with the
   * new data.
   */
  fromBinary(bytes, options) {
    const type = this.getType(),
      format = type.runtime.bin,
      opt = format.makeReadOptions(options);
    format.readMessage(this, opt.readerFactory(bytes), bytes.byteLength, opt);
    return this;
  }
  /**
   * Parse a message from a JSON value.
   */
  fromJson(jsonValue, options) {
    const type = this.getType(),
      format = type.runtime.json,
      opt = format.makeReadOptions(options);
    format.readMessage(type, jsonValue, opt, this);
    return this;
  }
  /**
   * Parse a message from a JSON string.
   */
  fromJsonString(jsonString, options) {
    let json;
    try {
      json = JSON.parse(jsonString);
    } catch (e) {
      throw new Error("cannot decode ".concat(this.getType().typeName, " from JSON: ").concat(e instanceof Error ? e.message : String(e)));
    }
    return this.fromJson(json, options);
  }
  /**
   * Serialize the message to binary data.
   */
  toBinary(options) {
    const type = this.getType(),
      bin = type.runtime.bin,
      opt = bin.makeWriteOptions(options),
      writer = opt.writerFactory();
    bin.writeMessage(this, writer, opt);
    return writer.finish();
  }
  /**
   * Serialize the message to a JSON value, a JavaScript value that can be
   * passed to JSON.stringify().
   */
  toJson(options) {
    const type = this.getType(),
      json = type.runtime.json,
      opt = json.makeWriteOptions(options);
    return json.writeMessage(this, opt);
  }
  /**
   * Serialize the message to a JSON string.
   */
  toJsonString(options) {
    var _a;
    const value = this.toJson(options);
    return JSON.stringify(value, null, (_a = options === null || options === void 0 ? void 0 : options.prettySpaces) !== null && _a !== void 0 ? _a : 0);
  }
  /**
   * Override for serialization behavior. This will be invoked when calling
   * JSON.stringify on this message (i.e. JSON.stringify(msg)).
   *
   * Note that this will not serialize google.protobuf.Any with a packed
   * message because the protobuf JSON format specifies that it needs to be
   * unpacked, and this is only possible with a type registry to look up the
   * message type.  As a result, attempting to serialize a message with this
   * type will throw an Error.
   *
   * This method is protected because you should not need to invoke it
   * directly -- instead use JSON.stringify or toJsonString for
   * stringified JSON.  Alternatively, if actual JSON is desired, you should
   * use toJson.
   */
  toJSON() {
    return this.toJson({
      emitDefaultValues: true
    });
  }
  /**
   * Retrieve the MessageType of this message - a singleton that represents
   * the protobuf message declaration and provides metadata for reflection-
   * based operations.
   */
  getType() {
    // Any class that extends Message _must_ provide a complete static
    // implementation of MessageType.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-return
    return Object.getPrototypeOf(this).constructor;
  }
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * Create a new message type using the given runtime.
 */
function makeMessageType(runtime, typeName, fields, opt) {
  var _a;
  const localName = (_a = opt === null || opt === void 0 ? void 0 : opt.localName) !== null && _a !== void 0 ? _a : typeName.substring(typeName.lastIndexOf(".") + 1);
  const type = {
    [localName]: function (data) {
      runtime.util.initFields(this);
      runtime.util.initPartial(data, this);
    }
  }[localName];
  Object.setPrototypeOf(type.prototype, new Message());
  Object.assign(type, {
    runtime,
    typeName,
    fields: runtime.util.newFieldList(fields),
    fromBinary(bytes, options) {
      return new type().fromBinary(bytes, options);
    },
    fromJson(jsonValue, options) {
      return new type().fromJson(jsonValue, options);
    },
    fromJsonString(jsonString, options) {
      return new type().fromJsonString(jsonString, options);
    },
    equals(a, b) {
      return runtime.util.equals(type, a, b);
    }
  });
  return type;
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
function makeProtoRuntime(syntax, json, bin, util) {
  return {
    syntax,
    json,
    bin,
    util,
    makeMessageType(typeName, fields, opt) {
      return makeMessageType(this, typeName, fields, opt);
    },
    makeEnum,
    makeEnumType,
    getEnumType
  };
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * Scalar value types. This is a subset of field types declared by protobuf
 * enum google.protobuf.FieldDescriptorProto.Type The types GROUP and MESSAGE
 * are omitted, but the numerical values are identical.
 */
var ScalarType;
(function (ScalarType) {
  // 0 is reserved for errors.
  // Order is weird for historical reasons.
  ScalarType[ScalarType["DOUBLE"] = 1] = "DOUBLE";
  ScalarType[ScalarType["FLOAT"] = 2] = "FLOAT";
  // Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT64 if
  // negative values are likely.
  ScalarType[ScalarType["INT64"] = 3] = "INT64";
  ScalarType[ScalarType["UINT64"] = 4] = "UINT64";
  // Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT32 if
  // negative values are likely.
  ScalarType[ScalarType["INT32"] = 5] = "INT32";
  ScalarType[ScalarType["FIXED64"] = 6] = "FIXED64";
  ScalarType[ScalarType["FIXED32"] = 7] = "FIXED32";
  ScalarType[ScalarType["BOOL"] = 8] = "BOOL";
  ScalarType[ScalarType["STRING"] = 9] = "STRING";
  // Tag-delimited aggregate.
  // Group type is deprecated and not supported in proto3. However, Proto3
  // implementations should still be able to parse the group wire format and
  // treat group fields as unknown fields.
  // TYPE_GROUP = 10,
  // TYPE_MESSAGE = 11,  // Length-delimited aggregate.
  // New in version 2.
  ScalarType[ScalarType["BYTES"] = 12] = "BYTES";
  ScalarType[ScalarType["UINT32"] = 13] = "UINT32";
  // TYPE_ENUM = 14,
  ScalarType[ScalarType["SFIXED32"] = 15] = "SFIXED32";
  ScalarType[ScalarType["SFIXED64"] = 16] = "SFIXED64";
  ScalarType[ScalarType["SINT32"] = 17] = "SINT32";
  ScalarType[ScalarType["SINT64"] = 18] = "SINT64";
})(ScalarType || (ScalarType = {}));

// Copyright 2008 Google Inc.  All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
// * Redistributions of source code must retain the above copyright
// notice, this list of conditions and the following disclaimer.
// * Redistributions in binary form must reproduce the above
// copyright notice, this list of conditions and the following disclaimer
// in the documentation and/or other materials provided with the
// distribution.
// * Neither the name of Google Inc. nor the names of its
// contributors may be used to endorse or promote products derived from
// this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// Code generated by the Protocol Buffer compiler is owned by the owner
// of the input file used when generating it.  This code is not
// standalone and requires a support library to be linked with it.  This
// support library is itself covered by the above license.
/* eslint-disable prefer-const,@typescript-eslint/restrict-plus-operands */
/**
 * Read a 64 bit varint as two JS numbers.
 *
 * Returns tuple:
 * [0]: low bits
 * [1]: high bits
 *
 * Copyright 2008 Google Inc.  All rights reserved.
 *
 * See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/buffer_decoder.js#L175
 */
function varint64read() {
  let lowBits = 0;
  let highBits = 0;
  for (let shift = 0; shift < 28; shift += 7) {
    let b = this.buf[this.pos++];
    lowBits |= (b & 0x7f) << shift;
    if ((b & 0x80) == 0) {
      this.assertBounds();
      return [lowBits, highBits];
    }
  }
  let middleByte = this.buf[this.pos++];
  // last four bits of the first 32 bit number
  lowBits |= (middleByte & 0x0f) << 28;
  // 3 upper bits are part of the next 32 bit number
  highBits = (middleByte & 0x70) >> 4;
  if ((middleByte & 0x80) == 0) {
    this.assertBounds();
    return [lowBits, highBits];
  }
  for (let shift = 3; shift <= 31; shift += 7) {
    let b = this.buf[this.pos++];
    highBits |= (b & 0x7f) << shift;
    if ((b & 0x80) == 0) {
      this.assertBounds();
      return [lowBits, highBits];
    }
  }
  throw new Error("invalid varint");
}
/**
 * Write a 64 bit varint, given as two JS numbers, to the given bytes array.
 *
 * Copyright 2008 Google Inc.  All rights reserved.
 *
 * See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/writer.js#L344
 */
function varint64write(lo, hi, bytes) {
  for (let i = 0; i < 28; i = i + 7) {
    const shift = lo >>> i;
    const hasNext = !(shift >>> 7 == 0 && hi == 0);
    const byte = (hasNext ? shift | 0x80 : shift) & 0xff;
    bytes.push(byte);
    if (!hasNext) {
      return;
    }
  }
  const splitBits = lo >>> 28 & 0x0f | (hi & 0x07) << 4;
  const hasMoreBits = !(hi >> 3 == 0);
  bytes.push((hasMoreBits ? splitBits | 0x80 : splitBits) & 0xff);
  if (!hasMoreBits) {
    return;
  }
  for (let i = 3; i < 31; i = i + 7) {
    const shift = hi >>> i;
    const hasNext = !(shift >>> 7 == 0);
    const byte = (hasNext ? shift | 0x80 : shift) & 0xff;
    bytes.push(byte);
    if (!hasNext) {
      return;
    }
  }
  bytes.push(hi >>> 31 & 0x01);
}
// constants for binary math
const TWO_PWR_32_DBL = 0x100000000;
/**
 * Parse decimal string of 64 bit integer value as two JS numbers.
 *
 * Copyright 2008 Google Inc.  All rights reserved.
 *
 * See https://github.com/protocolbuffers/protobuf-javascript/blob/a428c58273abad07c66071d9753bc4d1289de426/experimental/runtime/int64.js#L10
 */
function int64FromString(dec) {
  // Check for minus sign.
  const minus = dec[0] === "-";
  if (minus) {
    dec = dec.slice(1);
  }
  // Work 6 decimal digits at a time, acting like we're converting base 1e6
  // digits to binary. This is safe to do with floating point math because
  // Number.isSafeInteger(ALL_32_BITS * 1e6) == true.
  const base = 1e6;
  let lowBits = 0;
  let highBits = 0;
  function add1e6digit(begin, end) {
    // Note: Number('') is 0.
    const digit1e6 = Number(dec.slice(begin, end));
    highBits *= base;
    lowBits = lowBits * base + digit1e6;
    // Carry bits from lowBits to
    if (lowBits >= TWO_PWR_32_DBL) {
      highBits = highBits + (lowBits / TWO_PWR_32_DBL | 0);
      lowBits = lowBits % TWO_PWR_32_DBL;
    }
  }
  add1e6digit(-24, -18);
  add1e6digit(-18, -12);
  add1e6digit(-12, -6);
  add1e6digit(-6);
  return minus ? negate(lowBits, highBits) : newBits(lowBits, highBits);
}
/**
 * Losslessly converts a 64-bit signed integer in 32:32 split representation
 * into a decimal string.
 *
 * Copyright 2008 Google Inc.  All rights reserved.
 *
 * See https://github.com/protocolbuffers/protobuf-javascript/blob/a428c58273abad07c66071d9753bc4d1289de426/experimental/runtime/int64.js#L10
 */
function int64ToString(lo, hi) {
  let bits = newBits(lo, hi);
  // If we're treating the input as a signed value and the high bit is set, do
  // a manual two's complement conversion before the decimal conversion.
  const negative = bits.hi & 0x80000000;
  if (negative) {
    bits = negate(bits.lo, bits.hi);
  }
  const result = uInt64ToString(bits.lo, bits.hi);
  return negative ? "-" + result : result;
}
/**
 * Losslessly converts a 64-bit unsigned integer in 32:32 split representation
 * into a decimal string.
 *
 * Copyright 2008 Google Inc.  All rights reserved.
 *
 * See https://github.com/protocolbuffers/protobuf-javascript/blob/a428c58273abad07c66071d9753bc4d1289de426/experimental/runtime/int64.js#L10
 */
function uInt64ToString(lo, hi) {
  ({
    lo,
    hi
  } = toUnsigned(lo, hi));
  // Skip the expensive conversion if the number is small enough to use the
  // built-in conversions.
  // Number.MAX_SAFE_INTEGER = 0x001FFFFF FFFFFFFF, thus any number with
  // highBits <= 0x1FFFFF can be safely expressed with a double and retain
  // integer precision.
  // Proven by: Number.isSafeInteger(0x1FFFFF * 2**32 + 0xFFFFFFFF) == true.
  if (hi <= 0x1FFFFF) {
    return String(TWO_PWR_32_DBL * hi + lo);
  }
  // What this code is doing is essentially converting the input number from
  // base-2 to base-1e7, which allows us to represent the 64-bit range with
  // only 3 (very large) digits. Those digits are then trivial to convert to
  // a base-10 string.
  // The magic numbers used here are -
  // 2^24 = 16777216 = (1,6777216) in base-1e7.
  // 2^48 = 281474976710656 = (2,8147497,6710656) in base-1e7.
  // Split 32:32 representation into 16:24:24 representation so our
  // intermediate digits don't overflow.
  const low = lo & 0xFFFFFF;
  const mid = (lo >>> 24 | hi << 8) & 0xFFFFFF;
  const high = hi >> 16 & 0xFFFF;
  // Assemble our three base-1e7 digits, ignoring carries. The maximum
  // value in a digit at this step is representable as a 48-bit integer, which
  // can be stored in a 64-bit floating point number.
  let digitA = low + mid * 6777216 + high * 6710656;
  let digitB = mid + high * 8147497;
  let digitC = high * 2;
  // Apply carries from A to B and from B to C.
  const base = 10000000;
  if (digitA >= base) {
    digitB += Math.floor(digitA / base);
    digitA %= base;
  }
  if (digitB >= base) {
    digitC += Math.floor(digitB / base);
    digitB %= base;
  }
  // If digitC is 0, then we should have returned in the trivial code path
  // at the top for non-safe integers. Given this, we can assume both digitB
  // and digitA need leading zeros.
  return digitC.toString() + decimalFrom1e7WithLeadingZeros(digitB) + decimalFrom1e7WithLeadingZeros(digitA);
}
function toUnsigned(lo, hi) {
  return {
    lo: lo >>> 0,
    hi: hi >>> 0
  };
}
function newBits(lo, hi) {
  return {
    lo: lo | 0,
    hi: hi | 0
  };
}
/**
 * Returns two's compliment negation of input.
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Signed_32-bit_integers
 */
function negate(lowBits, highBits) {
  highBits = ~highBits;
  if (lowBits) {
    lowBits = ~lowBits + 1;
  } else {
    // If lowBits is 0, then bitwise-not is 0xFFFFFFFF,
    // adding 1 to that, results in 0x100000000, which leaves
    // the low bits 0x0 and simply adds one to the high bits.
    highBits += 1;
  }
  return newBits(lowBits, highBits);
}
/**
 * Returns decimal representation of digit1e7 with leading zeros.
 */
const decimalFrom1e7WithLeadingZeros = digit1e7 => {
  const partial = String(digit1e7);
  return "0000000".slice(partial.length) + partial;
};
/**
 * Write a 32 bit varint, signed or unsigned. Same as `varint64write(0, value, bytes)`
 *
 * Copyright 2008 Google Inc.  All rights reserved.
 *
 * See https://github.com/protocolbuffers/protobuf/blob/1b18833f4f2a2f681f4e4a25cdf3b0a43115ec26/js/binary/encoder.js#L144
 */
function varint32write(value, bytes) {
  if (value >= 0) {
    // write value as varint 32
    while (value > 0x7f) {
      bytes.push(value & 0x7f | 0x80);
      value = value >>> 7;
    }
    bytes.push(value);
  } else {
    for (let i = 0; i < 9; i++) {
      bytes.push(value & 127 | 128);
      value = value >> 7;
    }
    bytes.push(1);
  }
}
/**
 * Read an unsigned 32 bit varint.
 *
 * See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/buffer_decoder.js#L220
 */
function varint32read() {
  let b = this.buf[this.pos++];
  let result = b & 0x7f;
  if ((b & 0x80) == 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 0x7f) << 7;
  if ((b & 0x80) == 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 0x7f) << 14;
  if ((b & 0x80) == 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 0x7f) << 21;
  if ((b & 0x80) == 0) {
    this.assertBounds();
    return result;
  }
  // Extract only last 4 bits
  b = this.buf[this.pos++];
  result |= (b & 0x0f) << 28;
  for (let readBytes = 5; (b & 0x80) !== 0 && readBytes < 10; readBytes++) b = this.buf[this.pos++];
  if ((b & 0x80) != 0) throw new Error("invalid varint");
  this.assertBounds();
  // Result can have 32 bits, convert it to unsigned
  return result >>> 0;
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
function makeInt64Support() {
  const dv = new DataView(new ArrayBuffer(8));
  // note that Safari 14 implements BigInt, but not the DataView methods
  const ok = typeof BigInt === "function" && typeof dv.getBigInt64 === "function" && typeof dv.getBigUint64 === "function" && typeof dv.setBigInt64 === "function" && typeof dv.setBigUint64 === "function" && (typeof process != "object" || typeof process.env != "object" || process.env.BUF_BIGINT_DISABLE !== "1");
  if (ok) {
    const MIN = BigInt("-9223372036854775808"),
      MAX = BigInt("9223372036854775807"),
      UMIN = BigInt("0"),
      UMAX = BigInt("18446744073709551615");
    return {
      zero: BigInt(0),
      supported: true,
      parse(value) {
        const bi = typeof value == "bigint" ? value : BigInt(value);
        if (bi > MAX || bi < MIN) {
          throw new Error("int64 invalid: ".concat(value));
        }
        return bi;
      },
      uParse(value) {
        const bi = typeof value == "bigint" ? value : BigInt(value);
        if (bi > UMAX || bi < UMIN) {
          throw new Error("uint64 invalid: ".concat(value));
        }
        return bi;
      },
      enc(value) {
        dv.setBigInt64(0, this.parse(value), true);
        return {
          lo: dv.getInt32(0, true),
          hi: dv.getInt32(4, true)
        };
      },
      uEnc(value) {
        dv.setBigInt64(0, this.uParse(value), true);
        return {
          lo: dv.getInt32(0, true),
          hi: dv.getInt32(4, true)
        };
      },
      dec(lo, hi) {
        dv.setInt32(0, lo, true);
        dv.setInt32(4, hi, true);
        return dv.getBigInt64(0, true);
      },
      uDec(lo, hi) {
        dv.setInt32(0, lo, true);
        dv.setInt32(4, hi, true);
        return dv.getBigUint64(0, true);
      }
    };
  }
  const assertInt64String = value => assert(/^-?[0-9]+$/.test(value), "int64 invalid: ".concat(value));
  const assertUInt64String = value => assert(/^[0-9]+$/.test(value), "uint64 invalid: ".concat(value));
  return {
    zero: "0",
    supported: false,
    parse(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertInt64String(value);
      return value;
    },
    uParse(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertUInt64String(value);
      return value;
    },
    enc(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertInt64String(value);
      return int64FromString(value);
    },
    uEnc(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertUInt64String(value);
      return int64FromString(value);
    },
    dec(lo, hi) {
      return int64ToString(lo, hi);
    },
    uDec(lo, hi) {
      return uInt64ToString(lo, hi);
    }
  };
}
const protoInt64 = makeInt64Support();

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/* eslint-disable prefer-const,no-case-declarations,@typescript-eslint/restrict-plus-operands */
/**
 * Protobuf binary format wire types.
 *
 * A wire type provides just enough information to find the length of the
 * following value.
 *
 * See https://developers.google.com/protocol-buffers/docs/encoding#structure
 */
var WireType;
(function (WireType) {
  /**
   * Used for int32, int64, uint32, uint64, sint32, sint64, bool, enum
   */
  WireType[WireType["Varint"] = 0] = "Varint";
  /**
   * Used for fixed64, sfixed64, double.
   * Always 8 bytes with little-endian byte order.
   */
  WireType[WireType["Bit64"] = 1] = "Bit64";
  /**
   * Used for string, bytes, embedded messages, packed repeated fields
   *
   * Only repeated numeric types (types which use the varint, 32-bit,
   * or 64-bit wire types) can be packed. In proto3, such fields are
   * packed by default.
   */
  WireType[WireType["LengthDelimited"] = 2] = "LengthDelimited";
  /**
   * Used for groups
   * @deprecated
   */
  WireType[WireType["StartGroup"] = 3] = "StartGroup";
  /**
   * Used for groups
   * @deprecated
   */
  WireType[WireType["EndGroup"] = 4] = "EndGroup";
  /**
   * Used for fixed32, sfixed32, float.
   * Always 4 bytes with little-endian byte order.
   */
  WireType[WireType["Bit32"] = 5] = "Bit32";
})(WireType || (WireType = {}));
class BinaryWriter {
  constructor(textEncoder) {
    /**
     * Previous fork states.
     */
    this.stack = [];
    this.textEncoder = textEncoder !== null && textEncoder !== void 0 ? textEncoder : new TextEncoder();
    this.chunks = [];
    this.buf = [];
  }
  /**
   * Return all bytes written and reset this writer.
   */
  finish() {
    this.chunks.push(new Uint8Array(this.buf)); // flush the buffer
    let len = 0;
    for (let i = 0; i < this.chunks.length; i++) len += this.chunks[i].length;
    let bytes = new Uint8Array(len);
    let offset = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      bytes.set(this.chunks[i], offset);
      offset += this.chunks[i].length;
    }
    this.chunks = [];
    return bytes;
  }
  /**
   * Start a new fork for length-delimited data like a message
   * or a packed repeated field.
   *
   * Must be joined later with `join()`.
   */
  fork() {
    this.stack.push({
      chunks: this.chunks,
      buf: this.buf
    });
    this.chunks = [];
    this.buf = [];
    return this;
  }
  /**
   * Join the last fork. Write its length and bytes, then
   * return to the previous state.
   */
  join() {
    // get chunk of fork
    let chunk = this.finish();
    // restore previous state
    let prev = this.stack.pop();
    if (!prev) throw new Error("invalid state, fork stack empty");
    this.chunks = prev.chunks;
    this.buf = prev.buf;
    // write length of chunk as varint
    this.uint32(chunk.byteLength);
    return this.raw(chunk);
  }
  /**
   * Writes a tag (field number and wire type).
   *
   * Equivalent to `uint32( (fieldNo << 3 | type) >>> 0 )`.
   *
   * Generated code should compute the tag ahead of time and call `uint32()`.
   */
  tag(fieldNo, type) {
    return this.uint32((fieldNo << 3 | type) >>> 0);
  }
  /**
   * Write a chunk of raw bytes.
   */
  raw(chunk) {
    if (this.buf.length) {
      this.chunks.push(new Uint8Array(this.buf));
      this.buf = [];
    }
    this.chunks.push(chunk);
    return this;
  }
  /**
   * Write a `uint32` value, an unsigned 32 bit varint.
   */
  uint32(value) {
    assertUInt32(value);
    // write value as varint 32, inlined for speed
    while (value > 0x7f) {
      this.buf.push(value & 0x7f | 0x80);
      value = value >>> 7;
    }
    this.buf.push(value);
    return this;
  }
  /**
   * Write a `int32` value, a signed 32 bit varint.
   */
  int32(value) {
    assertInt32(value);
    varint32write(value, this.buf);
    return this;
  }
  /**
   * Write a `bool` value, a variant.
   */
  bool(value) {
    this.buf.push(value ? 1 : 0);
    return this;
  }
  /**
   * Write a `bytes` value, length-delimited arbitrary data.
   */
  bytes(value) {
    this.uint32(value.byteLength); // write length of chunk as varint
    return this.raw(value);
  }
  /**
   * Write a `string` value, length-delimited data converted to UTF-8 text.
   */
  string(value) {
    let chunk = this.textEncoder.encode(value);
    this.uint32(chunk.byteLength); // write length of chunk as varint
    return this.raw(chunk);
  }
  /**
   * Write a `float` value, 32-bit floating point number.
   */
  float(value) {
    assertFloat32(value);
    let chunk = new Uint8Array(4);
    new DataView(chunk.buffer).setFloat32(0, value, true);
    return this.raw(chunk);
  }
  /**
   * Write a `double` value, a 64-bit floating point number.
   */
  double(value) {
    let chunk = new Uint8Array(8);
    new DataView(chunk.buffer).setFloat64(0, value, true);
    return this.raw(chunk);
  }
  /**
   * Write a `fixed32` value, an unsigned, fixed-length 32-bit integer.
   */
  fixed32(value) {
    assertUInt32(value);
    let chunk = new Uint8Array(4);
    new DataView(chunk.buffer).setUint32(0, value, true);
    return this.raw(chunk);
  }
  /**
   * Write a `sfixed32` value, a signed, fixed-length 32-bit integer.
   */
  sfixed32(value) {
    assertInt32(value);
    let chunk = new Uint8Array(4);
    new DataView(chunk.buffer).setInt32(0, value, true);
    return this.raw(chunk);
  }
  /**
   * Write a `sint32` value, a signed, zigzag-encoded 32-bit varint.
   */
  sint32(value) {
    assertInt32(value);
    // zigzag encode
    value = (value << 1 ^ value >> 31) >>> 0;
    varint32write(value, this.buf);
    return this;
  }
  /**
   * Write a `fixed64` value, a signed, fixed-length 64-bit integer.
   */
  sfixed64(value) {
    let chunk = new Uint8Array(8),
      view = new DataView(chunk.buffer),
      tc = protoInt64.enc(value);
    view.setInt32(0, tc.lo, true);
    view.setInt32(4, tc.hi, true);
    return this.raw(chunk);
  }
  /**
   * Write a `fixed64` value, an unsigned, fixed-length 64 bit integer.
   */
  fixed64(value) {
    let chunk = new Uint8Array(8),
      view = new DataView(chunk.buffer),
      tc = protoInt64.uEnc(value);
    view.setInt32(0, tc.lo, true);
    view.setInt32(4, tc.hi, true);
    return this.raw(chunk);
  }
  /**
   * Write a `int64` value, a signed 64-bit varint.
   */
  int64(value) {
    let tc = protoInt64.enc(value);
    varint64write(tc.lo, tc.hi, this.buf);
    return this;
  }
  /**
   * Write a `sint64` value, a signed, zig-zag-encoded 64-bit varint.
   */
  sint64(value) {
    let tc = protoInt64.enc(value),
      // zigzag encode
      sign = tc.hi >> 31,
      lo = tc.lo << 1 ^ sign,
      hi = (tc.hi << 1 | tc.lo >>> 31) ^ sign;
    varint64write(lo, hi, this.buf);
    return this;
  }
  /**
   * Write a `uint64` value, an unsigned 64-bit varint.
   */
  uint64(value) {
    let tc = protoInt64.uEnc(value);
    varint64write(tc.lo, tc.hi, this.buf);
    return this;
  }
}
class BinaryReader {
  constructor(buf, textDecoder) {
    this.varint64 = varint64read; // dirty cast for `this`
    /**
     * Read a `uint32` field, an unsigned 32 bit varint.
     */
    this.uint32 = varint32read; // dirty cast for `this` and access to protected `buf`
    this.buf = buf;
    this.len = buf.length;
    this.pos = 0;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.textDecoder = textDecoder !== null && textDecoder !== void 0 ? textDecoder : new TextDecoder();
  }
  /**
   * Reads a tag - field number and wire type.
   */
  tag() {
    let tag = this.uint32(),
      fieldNo = tag >>> 3,
      wireType = tag & 7;
    if (fieldNo <= 0 || wireType < 0 || wireType > 5) throw new Error("illegal tag: field no " + fieldNo + " wire type " + wireType);
    return [fieldNo, wireType];
  }
  /**
   * Skip one element on the wire and return the skipped data.
   * Supports WireType.StartGroup since v2.0.0-alpha.23.
   */
  skip(wireType) {
    let start = this.pos;
    switch (wireType) {
      case WireType.Varint:
        while (this.buf[this.pos++] & 0x80) {
          // ignore
        }
        break;
      // eslint-disable-next-line
      // @ts-ignore TS7029: Fallthrough case in switch
      case WireType.Bit64:
        this.pos += 4;
      // eslint-disable-next-line
      // @ts-ignore TS7029: Fallthrough case in switch
      case WireType.Bit32:
        this.pos += 4;
        break;
      case WireType.LengthDelimited:
        let len = this.uint32();
        this.pos += len;
        break;
      case WireType.StartGroup:
        // From descriptor.proto: Group type is deprecated, not supported in proto3.
        // But we must still be able to parse and treat as unknown.
        let t;
        while ((t = this.tag()[1]) !== WireType.EndGroup) {
          this.skip(t);
        }
        break;
      default:
        throw new Error("cant skip wire type " + wireType);
    }
    this.assertBounds();
    return this.buf.subarray(start, this.pos);
  }
  /**
   * Throws error if position in byte array is out of range.
   */
  assertBounds() {
    if (this.pos > this.len) throw new RangeError("premature EOF");
  }
  /**
   * Read a `int32` field, a signed 32 bit varint.
   */
  int32() {
    return this.uint32() | 0;
  }
  /**
   * Read a `sint32` field, a signed, zigzag-encoded 32-bit varint.
   */
  sint32() {
    let zze = this.uint32();
    // decode zigzag
    return zze >>> 1 ^ -(zze & 1);
  }
  /**
   * Read a `int64` field, a signed 64-bit varint.
   */
  int64() {
    return protoInt64.dec(...this.varint64());
  }
  /**
   * Read a `uint64` field, an unsigned 64-bit varint.
   */
  uint64() {
    return protoInt64.uDec(...this.varint64());
  }
  /**
   * Read a `sint64` field, a signed, zig-zag-encoded 64-bit varint.
   */
  sint64() {
    let [lo, hi] = this.varint64();
    // decode zig zag
    let s = -(lo & 1);
    lo = (lo >>> 1 | (hi & 1) << 31) ^ s;
    hi = hi >>> 1 ^ s;
    return protoInt64.dec(lo, hi);
  }
  /**
   * Read a `bool` field, a variant.
   */
  bool() {
    let [lo, hi] = this.varint64();
    return lo !== 0 || hi !== 0;
  }
  /**
   * Read a `fixed32` field, an unsigned, fixed-length 32-bit integer.
   */
  fixed32() {
    return this.view.getUint32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `sfixed32` field, a signed, fixed-length 32-bit integer.
   */
  sfixed32() {
    return this.view.getInt32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `fixed64` field, an unsigned, fixed-length 64 bit integer.
   */
  fixed64() {
    return protoInt64.uDec(this.sfixed32(), this.sfixed32());
  }
  /**
   * Read a `fixed64` field, a signed, fixed-length 64-bit integer.
   */
  sfixed64() {
    return protoInt64.dec(this.sfixed32(), this.sfixed32());
  }
  /**
   * Read a `float` field, 32-bit floating point number.
   */
  float() {
    return this.view.getFloat32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `double` field, a 64-bit floating point number.
   */
  double() {
    return this.view.getFloat64((this.pos += 8) - 8, true);
  }
  /**
   * Read a `bytes` field, length-delimited arbitrary data.
   */
  bytes() {
    let len = this.uint32(),
      start = this.pos;
    this.pos += len;
    this.assertBounds();
    return this.buf.subarray(start, start + len);
  }
  /**
   * Read a `string` field, length-delimited data converted to UTF-8 text.
   */
  string() {
    return this.textDecoder.decode(this.bytes());
  }
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * Wrap a primitive message field value in its corresponding wrapper
 * message. This function is idempotent.
 */
function wrapField(type, value) {
  if (value instanceof Message || !type.fieldWrapper) {
    return value;
  }
  return type.fieldWrapper.wrapField(value);
}
({
  "google.protobuf.DoubleValue": ScalarType.DOUBLE,
  "google.protobuf.FloatValue": ScalarType.FLOAT,
  "google.protobuf.Int64Value": ScalarType.INT64,
  "google.protobuf.UInt64Value": ScalarType.UINT64,
  "google.protobuf.Int32Value": ScalarType.INT32,
  "google.protobuf.UInt32Value": ScalarType.UINT32,
  "google.protobuf.BoolValue": ScalarType.BOOL,
  "google.protobuf.StringValue": ScalarType.STRING,
  "google.protobuf.BytesValue": ScalarType.BYTES
});

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Returns true if both scalar values are equal.
 */
function scalarEquals(type, a, b) {
  if (a === b) {
    // This correctly matches equal values except BYTES and (possibly) 64-bit integers.
    return true;
  }
  // Special case BYTES - we need to compare each byte individually
  if (type == ScalarType.BYTES) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
  // Special case 64-bit integers - we support number, string and bigint representation.
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (type) {
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      // Loose comparison will match between 0n, 0 and "0".
      return a == b;
  }
  // Anything that hasn't been caught by strict comparison or special cased
  // BYTES and 64-bit integers is not equal.
  return false;
}
/**
 * Returns the default value for the given scalar type, following
 * proto3 semantics.
 */
function scalarDefaultValue(type) {
  switch (type) {
    case ScalarType.BOOL:
      return false;
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      return protoInt64.zero;
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      return 0.0;
    case ScalarType.BYTES:
      return new Uint8Array(0);
    case ScalarType.STRING:
      return "";
    default:
      // Handles INT32, UINT32, SINT32, FIXED32, SFIXED32.
      // We do not use individual cases to save a few bytes code size.
      return 0;
  }
}
/**
 * Get information for writing a scalar value.
 *
 * Returns tuple:
 * [0]: appropriate WireType
 * [1]: name of the appropriate method of IBinaryWriter
 * [2]: whether the given value is a default value for proto3 semantics
 *
 * If argument `value` is omitted, [2] is always false.
 */
function scalarTypeInfo(type, value) {
  const isUndefined = value === undefined;
  let wireType = WireType.Varint;
  let isIntrinsicDefault = value === 0;
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- INT32, UINT32, SINT32 are covered by the defaults
  switch (type) {
    case ScalarType.STRING:
      isIntrinsicDefault = isUndefined || !value.length;
      wireType = WireType.LengthDelimited;
      break;
    case ScalarType.BOOL:
      isIntrinsicDefault = value === false;
      break;
    case ScalarType.DOUBLE:
      wireType = WireType.Bit64;
      break;
    case ScalarType.FLOAT:
      wireType = WireType.Bit32;
      break;
    case ScalarType.INT64:
      isIntrinsicDefault = isUndefined || value == 0;
      break;
    case ScalarType.UINT64:
      isIntrinsicDefault = isUndefined || value == 0;
      break;
    case ScalarType.FIXED64:
      isIntrinsicDefault = isUndefined || value == 0;
      wireType = WireType.Bit64;
      break;
    case ScalarType.BYTES:
      isIntrinsicDefault = isUndefined || !value.byteLength;
      wireType = WireType.LengthDelimited;
      break;
    case ScalarType.FIXED32:
      wireType = WireType.Bit32;
      break;
    case ScalarType.SFIXED32:
      wireType = WireType.Bit32;
      break;
    case ScalarType.SFIXED64:
      isIntrinsicDefault = isUndefined || value == 0;
      wireType = WireType.Bit64;
      break;
    case ScalarType.SINT64:
      isIntrinsicDefault = isUndefined || value == 0;
      break;
  }
  const method = ScalarType[type].toLowerCase();
  return [wireType, method, isUndefined || isIntrinsicDefault];
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unnecessary-condition, no-case-declarations, prefer-const */
const unknownFieldsSymbol = Symbol("@bufbuild/protobuf/unknown-fields");
// Default options for parsing binary data.
const readDefaults = {
  readUnknownFields: true,
  readerFactory: bytes => new BinaryReader(bytes)
};
// Default options for serializing binary data.
const writeDefaults = {
  writeUnknownFields: true,
  writerFactory: () => new BinaryWriter()
};
function makeReadOptions$1(options) {
  return options ? Object.assign(Object.assign({}, readDefaults), options) : readDefaults;
}
function makeWriteOptions$1(options) {
  return options ? Object.assign(Object.assign({}, writeDefaults), options) : writeDefaults;
}
function makeBinaryFormatCommon() {
  return {
    makeReadOptions: makeReadOptions$1,
    makeWriteOptions: makeWriteOptions$1,
    listUnknownFields(message) {
      var _a;
      return (_a = message[unknownFieldsSymbol]) !== null && _a !== void 0 ? _a : [];
    },
    discardUnknownFields(message) {
      delete message[unknownFieldsSymbol];
    },
    writeUnknownFields(message, writer) {
      const m = message;
      const c = m[unknownFieldsSymbol];
      if (c) {
        for (const f of c) {
          writer.tag(f.no, f.wireType).raw(f.data);
        }
      }
    },
    onUnknownField(message, no, wireType, data) {
      const m = message;
      if (!Array.isArray(m[unknownFieldsSymbol])) {
        m[unknownFieldsSymbol] = [];
      }
      m[unknownFieldsSymbol].push({
        no,
        wireType,
        data
      });
    },
    readMessage(message, reader, length, options) {
      const type = message.getType();
      const end = length === undefined ? reader.len : reader.pos + length;
      while (reader.pos < end) {
        const [fieldNo, wireType] = reader.tag(),
          field = type.fields.find(fieldNo);
        if (!field) {
          const data = reader.skip(wireType);
          if (options.readUnknownFields) {
            this.onUnknownField(message, fieldNo, wireType, data);
          }
          continue;
        }
        let target = message,
          repeated = field.repeated,
          localName = field.localName;
        if (field.oneof) {
          target = target[field.oneof.localName];
          if (target.case != localName) {
            delete target.value;
          }
          target.case = localName;
          localName = "value";
        }
        switch (field.kind) {
          case "scalar":
          case "enum":
            const scalarType = field.kind == "enum" ? ScalarType.INT32 : field.T;
            if (repeated) {
              let arr = target[localName]; // safe to assume presence of array, oneof cannot contain repeated values
              if (wireType == WireType.LengthDelimited && scalarType != ScalarType.STRING && scalarType != ScalarType.BYTES) {
                let e = reader.uint32() + reader.pos;
                while (reader.pos < e) {
                  arr.push(readScalar$1(reader, scalarType));
                }
              } else {
                arr.push(readScalar$1(reader, scalarType));
              }
            } else {
              target[localName] = readScalar$1(reader, scalarType);
            }
            break;
          case "message":
            const messageType = field.T;
            if (repeated) {
              // safe to assume presence of array, oneof cannot contain repeated values
              target[localName].push(readMessageField(reader, new messageType(), options));
            } else {
              if (target[localName] instanceof Message) {
                readMessageField(reader, target[localName], options);
              } else {
                target[localName] = readMessageField(reader, new messageType(), options);
                if (messageType.fieldWrapper && !field.oneof && !field.repeated) {
                  target[localName] = messageType.fieldWrapper.unwrapField(target[localName]);
                }
              }
            }
            break;
          case "map":
            let [mapKey, mapVal] = readMapEntry(field, reader, options);
            // safe to assume presence of map object, oneof cannot contain repeated values
            target[localName][mapKey] = mapVal;
            break;
        }
      }
    }
  };
}
// Read a message, avoiding MessageType.fromBinary() to re-use the
// BinaryReadOptions and the IBinaryReader.
function readMessageField(reader, message, options) {
  const format = message.getType().runtime.bin;
  format.readMessage(message, reader, reader.uint32(), options);
  return message;
}
// Read a map field, expecting key field = 1, value field = 2
function readMapEntry(field, reader, options) {
  const length = reader.uint32(),
    end = reader.pos + length;
  let key, val;
  while (reader.pos < end) {
    let [fieldNo] = reader.tag();
    switch (fieldNo) {
      case 1:
        key = readScalar$1(reader, field.K);
        break;
      case 2:
        switch (field.V.kind) {
          case "scalar":
            val = readScalar$1(reader, field.V.T);
            break;
          case "enum":
            val = reader.int32();
            break;
          case "message":
            val = readMessageField(reader, new field.V.T(), options);
            break;
        }
        break;
    }
  }
  if (key === undefined) {
    let keyRaw = scalarDefaultValue(field.K);
    key = field.K == ScalarType.BOOL ? keyRaw.toString() : keyRaw;
  }
  if (typeof key != "string" && typeof key != "number") {
    key = key.toString();
  }
  if (val === undefined) {
    switch (field.V.kind) {
      case "scalar":
        val = scalarDefaultValue(field.V.T);
        break;
      case "enum":
        val = 0;
        break;
      case "message":
        val = new field.V.T();
        break;
    }
  }
  return [key, val];
}
// Does not use scalarTypeInfo() for better performance.
function readScalar$1(reader, type) {
  switch (type) {
    case ScalarType.STRING:
      return reader.string();
    case ScalarType.BOOL:
      return reader.bool();
    case ScalarType.DOUBLE:
      return reader.double();
    case ScalarType.FLOAT:
      return reader.float();
    case ScalarType.INT32:
      return reader.int32();
    case ScalarType.INT64:
      return reader.int64();
    case ScalarType.UINT64:
      return reader.uint64();
    case ScalarType.FIXED64:
      return reader.fixed64();
    case ScalarType.BYTES:
      return reader.bytes();
    case ScalarType.FIXED32:
      return reader.fixed32();
    case ScalarType.SFIXED32:
      return reader.sfixed32();
    case ScalarType.SFIXED64:
      return reader.sfixed64();
    case ScalarType.SINT64:
      return reader.sint64();
    case ScalarType.UINT32:
      return reader.uint32();
    case ScalarType.SINT32:
      return reader.sint32();
  }
}
function writeMapEntry(writer, options, field, key, value) {
  writer.tag(field.no, WireType.LengthDelimited);
  writer.fork();
  // javascript only allows number or string for object properties
  // we convert from our representation to the protobuf type
  let keyValue = key;
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- we deliberately handle just the special cases for map keys
  switch (field.K) {
    case ScalarType.INT32:
    case ScalarType.FIXED32:
    case ScalarType.UINT32:
    case ScalarType.SFIXED32:
    case ScalarType.SINT32:
      keyValue = Number.parseInt(key);
      break;
    case ScalarType.BOOL:
      assert(key == "true" || key == "false");
      keyValue = key == "true";
      break;
  }
  // write key, expecting key field number = 1
  writeScalar$1(writer, field.K, 1, keyValue, true);
  // write value, expecting value field number = 2
  switch (field.V.kind) {
    case "scalar":
      writeScalar$1(writer, field.V.T, 2, value, true);
      break;
    case "enum":
      writeScalar$1(writer, ScalarType.INT32, 2, value, true);
      break;
    case "message":
      writeMessageField(writer, options, field.V.T, 2, value);
      break;
  }
  writer.join();
}
function writeMessageField(writer, options, type, fieldNo, value) {
  if (value !== undefined) {
    const message = wrapField(type, value);
    writer.tag(fieldNo, WireType.LengthDelimited).bytes(message.toBinary(options));
  }
}
function writeScalar$1(writer, type, fieldNo, value, emitIntrinsicDefault) {
  let [wireType, method, isIntrinsicDefault] = scalarTypeInfo(type, value);
  if (!isIntrinsicDefault || emitIntrinsicDefault) {
    writer.tag(fieldNo, wireType)[method](value);
  }
}
function writePacked(writer, type, fieldNo, value) {
  if (!value.length) {
    return;
  }
  writer.tag(fieldNo, WireType.LengthDelimited).fork();
  let [, method] = scalarTypeInfo(type);
  for (let i = 0; i < value.length; i++) {
    writer[method](value[i]);
  }
  writer.join();
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions, prefer-const, no-case-declarations */
function makeBinaryFormatProto3() {
  return Object.assign(Object.assign({}, makeBinaryFormatCommon()), {
    writeMessage(message, writer, options) {
      const type = message.getType();
      for (const field of type.fields.byNumber()) {
        let value,
          // this will be our field value, whether it is member of a oneof or regular field
          repeated = field.repeated,
          localName = field.localName;
        if (field.oneof) {
          const oneof = message[field.oneof.localName];
          if (oneof.case !== localName) {
            continue; // field is not selected, skip
          }

          value = oneof.value;
        } else {
          value = message[localName];
        }
        switch (field.kind) {
          case "scalar":
          case "enum":
            let scalarType = field.kind == "enum" ? ScalarType.INT32 : field.T;
            if (repeated) {
              if (field.packed) {
                writePacked(writer, scalarType, field.no, value);
              } else {
                for (const item of value) {
                  writeScalar$1(writer, scalarType, field.no, item, true);
                }
              }
            } else {
              if (value !== undefined) {
                writeScalar$1(writer, scalarType, field.no, value, !!field.oneof || field.opt);
              }
            }
            break;
          case "message":
            if (repeated) {
              for (const item of value) {
                writeMessageField(writer, options, field.T, field.no, item);
              }
            } else {
              writeMessageField(writer, options, field.T, field.no, value);
            }
            break;
          case "map":
            for (const [key, val] of Object.entries(value)) {
              writeMapEntry(writer, options, field, key, val);
            }
            break;
        }
      }
      if (options.writeUnknownFields) {
        this.writeUnknownFields(message, writer);
      }
      return writer;
    }
  });
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unnecessary-condition, prefer-const */
// lookup table from base64 character to byte
let encTable = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
// lookup table from base64 character *code* to byte because lookup by number is fast
let decTable = [];
for (let i = 0; i < encTable.length; i++) decTable[encTable[i].charCodeAt(0)] = i;
// support base64url variants
decTable["-".charCodeAt(0)] = encTable.indexOf("+");
decTable["_".charCodeAt(0)] = encTable.indexOf("/");
const protoBase64 = {
  /**
   * Decodes a base64 string to a byte array.
   *
   * - ignores white-space, including line breaks and tabs
   * - allows inner padding (can decode concatenated base64 strings)
   * - does not require padding
   * - understands base64url encoding:
   *   "-" instead of "+",
   *   "_" instead of "/",
   *   no padding
   */
  dec(base64Str) {
    // estimate byte size, not accounting for inner padding and whitespace
    let es = base64Str.length * 3 / 4;
    if (base64Str[base64Str.length - 2] == "=") es -= 2;else if (base64Str[base64Str.length - 1] == "=") es -= 1;
    let bytes = new Uint8Array(es),
      bytePos = 0,
      // position in byte array
      groupPos = 0,
      // position in base64 group
      b,
      // current byte
      p = 0; // previous byte
    for (let i = 0; i < base64Str.length; i++) {
      b = decTable[base64Str.charCodeAt(i)];
      if (b === undefined) {
        switch (base64Str[i]) {
          // @ts-ignore TS7029: Fallthrough case in switch
          case "=":
            groupPos = 0;
          // reset state when padding found
          // @ts-ignore TS7029: Fallthrough case in switch
          case "\n":
          case "\r":
          case "\t":
          case " ":
            continue;
          // skip white-space, and padding
          default:
            throw Error("invalid base64 string.");
        }
      }
      switch (groupPos) {
        case 0:
          p = b;
          groupPos = 1;
          break;
        case 1:
          bytes[bytePos++] = p << 2 | (b & 48) >> 4;
          p = b;
          groupPos = 2;
          break;
        case 2:
          bytes[bytePos++] = (p & 15) << 4 | (b & 60) >> 2;
          p = b;
          groupPos = 3;
          break;
        case 3:
          bytes[bytePos++] = (p & 3) << 6 | b;
          groupPos = 0;
          break;
      }
    }
    if (groupPos == 1) throw Error("invalid base64 string.");
    return bytes.subarray(0, bytePos);
  },
  /**
   * Encode a byte array to a base64 string.
   */
  enc(bytes) {
    let base64 = "",
      groupPos = 0,
      // position in base64 group
      b,
      // current byte
      p = 0; // carry over from previous byte
    for (let i = 0; i < bytes.length; i++) {
      b = bytes[i];
      switch (groupPos) {
        case 0:
          base64 += encTable[b >> 2];
          p = (b & 3) << 4;
          groupPos = 1;
          break;
        case 1:
          base64 += encTable[p | b >> 4];
          p = (b & 15) << 2;
          groupPos = 2;
          break;
        case 2:
          base64 += encTable[p | b >> 6];
          base64 += encTable[b & 63];
          groupPos = 0;
          break;
      }
    }
    // add output padding
    if (groupPos) {
      base64 += encTable[p];
      base64 += "=";
      if (groupPos == 1) base64 += "=";
    }
    return base64;
  }
};

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/* eslint-disable no-case-declarations, @typescript-eslint/restrict-plus-operands,@typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-argument */
// Default options for parsing JSON.
const jsonReadDefaults = {
  ignoreUnknownFields: false
};
// Default options for serializing to JSON.
const jsonWriteDefaults = {
  emitDefaultValues: false,
  enumAsInteger: false,
  useProtoFieldName: false,
  prettySpaces: 0
};
function makeReadOptions(options) {
  return options ? Object.assign(Object.assign({}, jsonReadDefaults), options) : jsonReadDefaults;
}
function makeWriteOptions(options) {
  return options ? Object.assign(Object.assign({}, jsonWriteDefaults), options) : jsonWriteDefaults;
}
function makeJsonFormatCommon(makeWriteField) {
  const writeField = makeWriteField(writeEnum, writeScalar);
  return {
    makeReadOptions,
    makeWriteOptions,
    readMessage(type, json, options, message) {
      if (json == null || Array.isArray(json) || typeof json != "object") {
        throw new Error("cannot decode message ".concat(type.typeName, " from JSON: ").concat(this.debug(json)));
      }
      message = message !== null && message !== void 0 ? message : new type();
      const oneofSeen = {};
      for (const [jsonKey, jsonValue] of Object.entries(json)) {
        const field = type.fields.findJsonName(jsonKey);
        if (!field) {
          if (!options.ignoreUnknownFields) {
            throw new Error("cannot decode message ".concat(type.typeName, " from JSON: key \"").concat(jsonKey, "\" is unknown"));
          }
          continue;
        }
        let localName = field.localName;
        let target = message;
        if (field.oneof) {
          if (jsonValue === null && field.kind == "scalar") {
            // see conformance test Required.Proto3.JsonInput.OneofFieldNull{First,Second}
            continue;
          }
          const seen = oneofSeen[field.oneof.localName];
          if (seen) {
            throw new Error("cannot decode message ".concat(type.typeName, " from JSON: multiple keys for oneof \"").concat(field.oneof.name, "\" present: \"").concat(seen, "\", \"").concat(jsonKey, "\""));
          }
          oneofSeen[field.oneof.localName] = jsonKey;
          target = target[field.oneof.localName] = {
            case: localName
          };
          localName = "value";
        }
        if (field.repeated) {
          if (jsonValue === null) {
            continue;
          }
          if (!Array.isArray(jsonValue)) {
            throw new Error("cannot decode field ".concat(type.typeName, ".").concat(field.name, " from JSON: ").concat(this.debug(jsonValue)));
          }
          const targetArray = target[localName];
          for (const jsonItem of jsonValue) {
            if (jsonItem === null) {
              throw new Error("cannot decode field ".concat(type.typeName, ".").concat(field.name, " from JSON: ").concat(this.debug(jsonItem)));
            }
            let val;
            // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- "map" is invalid for repeated fields
            switch (field.kind) {
              case "message":
                val = field.T.fromJson(jsonItem, options);
                break;
              case "enum":
                val = readEnum(field.T, jsonItem, options.ignoreUnknownFields);
                if (val === undefined) continue;
                break;
              case "scalar":
                try {
                  val = readScalar(field.T, jsonItem);
                } catch (e) {
                  let m = "cannot decode field ".concat(type.typeName, ".").concat(field.name, " from JSON: ").concat(this.debug(jsonItem));
                  if (e instanceof Error && e.message.length > 0) {
                    m += ": ".concat(e.message);
                  }
                  throw new Error(m);
                }
                break;
            }
            targetArray.push(val);
          }
        } else if (field.kind == "map") {
          if (jsonValue === null) {
            continue;
          }
          if (Array.isArray(jsonValue) || typeof jsonValue != "object") {
            throw new Error("cannot decode field ".concat(type.typeName, ".").concat(field.name, " from JSON: ").concat(this.debug(jsonValue)));
          }
          const targetMap = target[localName];
          for (const [jsonMapKey, jsonMapValue] of Object.entries(jsonValue)) {
            if (jsonMapValue === null) {
              throw new Error("cannot decode field ".concat(type.typeName, ".").concat(field.name, " from JSON: map value null"));
            }
            let val;
            switch (field.V.kind) {
              case "message":
                val = field.V.T.fromJson(jsonMapValue, options);
                break;
              case "enum":
                val = readEnum(field.V.T, jsonMapValue, options.ignoreUnknownFields);
                if (val === undefined) continue;
                break;
              case "scalar":
                try {
                  val = readScalar(field.V.T, jsonMapValue);
                } catch (e) {
                  let m = "cannot decode map value for field ".concat(type.typeName, ".").concat(field.name, " from JSON: ").concat(this.debug(jsonValue));
                  if (e instanceof Error && e.message.length > 0) {
                    m += ": ".concat(e.message);
                  }
                  throw new Error(m);
                }
                break;
            }
            try {
              targetMap[readScalar(field.K, field.K == ScalarType.BOOL ? jsonMapKey == "true" ? true : jsonMapKey == "false" ? false : jsonMapKey : jsonMapKey).toString()] = val;
            } catch (e) {
              let m = "cannot decode map key for field ".concat(type.typeName, ".").concat(field.name, " from JSON: ").concat(this.debug(jsonValue));
              if (e instanceof Error && e.message.length > 0) {
                m += ": ".concat(e.message);
              }
              throw new Error(m);
            }
          }
        } else {
          switch (field.kind) {
            case "message":
              const messageType = field.T;
              if (jsonValue === null && messageType.typeName != "google.protobuf.Value") {
                if (field.oneof) {
                  throw new Error("cannot decode field ".concat(type.typeName, ".").concat(field.name, " from JSON: null is invalid for oneof field \"").concat(jsonKey, "\""));
                }
                continue;
              }
              if (target[localName] instanceof Message) {
                target[localName].fromJson(jsonValue, options);
              } else {
                target[localName] = messageType.fromJson(jsonValue, options);
                if (messageType.fieldWrapper && !field.oneof) {
                  target[localName] = messageType.fieldWrapper.unwrapField(target[localName]);
                }
              }
              break;
            case "enum":
              const enumValue = readEnum(field.T, jsonValue, options.ignoreUnknownFields);
              if (enumValue !== undefined) {
                target[localName] = enumValue;
              }
              break;
            case "scalar":
              try {
                target[localName] = readScalar(field.T, jsonValue);
              } catch (e) {
                let m = "cannot decode field ".concat(type.typeName, ".").concat(field.name, " from JSON: ").concat(this.debug(jsonValue));
                if (e instanceof Error && e.message.length > 0) {
                  m += ": ".concat(e.message);
                }
                throw new Error(m);
              }
              break;
          }
        }
      }
      return message;
    },
    writeMessage(message, options) {
      const type = message.getType();
      const json = {};
      let field;
      try {
        for (const member of type.fields.byMember()) {
          let jsonValue;
          if (member.kind == "oneof") {
            const oneof = message[member.localName];
            if (oneof.value === undefined) {
              continue;
            }
            field = member.findField(oneof.case);
            if (!field) {
              throw "oneof case not found: " + oneof.case;
            }
            jsonValue = writeField(field, oneof.value, options);
          } else {
            field = member;
            jsonValue = writeField(field, message[field.localName], options);
          }
          if (jsonValue !== undefined) {
            json[options.useProtoFieldName ? field.name : field.jsonName] = jsonValue;
          }
        }
      } catch (e) {
        const m = field ? "cannot encode field ".concat(type.typeName, ".").concat(field.name, " to JSON") : "cannot encode message ".concat(type.typeName, " to JSON");
        const r = e instanceof Error ? e.message : String(e);
        throw new Error(m + (r.length > 0 ? ": ".concat(r) : ""));
      }
      return json;
    },
    readScalar,
    writeScalar,
    debug: debugJsonValue
  };
}
function debugJsonValue(json) {
  if (json === null) {
    return "null";
  }
  switch (typeof json) {
    case "object":
      return Array.isArray(json) ? "array" : "object";
    case "string":
      return json.length > 100 ? "string" : "\"".concat(json.split('"').join('\\"'), "\"");
    default:
      return json.toString();
  }
}
// May throw an error. If the error message is non-blank, it should be shown.
// It is up to the caller to provide context.
function readScalar(type, json) {
  // every valid case in the switch below returns, and every fall
  // through is regarded as a failure.
  switch (type) {
    // float, double: JSON value will be a number or one of the special string values "NaN", "Infinity", and "-Infinity".
    // Either numbers or strings are accepted. Exponent notation is also accepted.
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      if (json === null) return 0.0;
      if (json === "NaN") return Number.NaN;
      if (json === "Infinity") return Number.POSITIVE_INFINITY;
      if (json === "-Infinity") return Number.NEGATIVE_INFINITY;
      if (json === "") {
        // empty string is not a number
        break;
      }
      if (typeof json == "string" && json.trim().length !== json.length) {
        // extra whitespace
        break;
      }
      if (typeof json != "string" && typeof json != "number") {
        break;
      }
      const float = Number(json);
      if (Number.isNaN(float)) {
        // not a number
        break;
      }
      if (!Number.isFinite(float)) {
        // infinity and -infinity are handled by string representation above, so this is an error
        break;
      }
      if (type == ScalarType.FLOAT) assertFloat32(float);
      return float;
    // int32, fixed32, uint32: JSON value will be a decimal number. Either numbers or strings are accepted.
    case ScalarType.INT32:
    case ScalarType.FIXED32:
    case ScalarType.SFIXED32:
    case ScalarType.SINT32:
    case ScalarType.UINT32:
      if (json === null) return 0;
      let int32;
      if (typeof json == "number") int32 = json;else if (typeof json == "string" && json.length > 0) {
        if (json.trim().length === json.length) int32 = Number(json);
      }
      if (int32 === undefined) break;
      if (type == ScalarType.UINT32) assertUInt32(int32);else assertInt32(int32);
      return int32;
    // int64, fixed64, uint64: JSON value will be a decimal string. Either numbers or strings are accepted.
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      if (json === null) return protoInt64.zero;
      if (typeof json != "number" && typeof json != "string") break;
      return protoInt64.parse(json);
    case ScalarType.FIXED64:
    case ScalarType.UINT64:
      if (json === null) return protoInt64.zero;
      if (typeof json != "number" && typeof json != "string") break;
      return protoInt64.uParse(json);
    // bool:
    case ScalarType.BOOL:
      if (json === null) return false;
      if (typeof json !== "boolean") break;
      return json;
    // string:
    case ScalarType.STRING:
      if (json === null) return "";
      if (typeof json !== "string") {
        break;
      }
      // A string must always contain UTF-8 encoded or 7-bit ASCII.
      // We validate with encodeURIComponent, which appears to be the fastest widely available option.
      try {
        encodeURIComponent(json);
      } catch (e) {
        throw new Error("invalid UTF8");
      }
      return json;
    // bytes: JSON value will be the data encoded as a string using standard base64 encoding with paddings.
    // Either standard or URL-safe base64 encoding with/without paddings are accepted.
    case ScalarType.BYTES:
      if (json === null || json === "") return new Uint8Array(0);
      if (typeof json !== "string") break;
      return protoBase64.dec(json);
  }
  throw new Error();
}
function readEnum(type, json, ignoreUnknownFields) {
  if (json === null) {
    // proto3 requires 0 to be default value for all enums
    return 0;
  }
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (typeof json) {
    case "number":
      if (Number.isInteger(json)) {
        return json;
      }
      break;
    case "string":
      const value = type.findName(json);
      if (value || ignoreUnknownFields) {
        return value === null || value === void 0 ? void 0 : value.no;
      }
      break;
  }
  throw new Error("cannot decode enum ".concat(type.typeName, " from JSON: ").concat(debugJsonValue(json)));
}
function writeEnum(type, value, emitIntrinsicDefault, enumAsInteger) {
  var _a;
  if (value === undefined) {
    return value;
  }
  if (value === 0 && !emitIntrinsicDefault) {
    // proto3 requires 0 to be default value for all enums
    return undefined;
  }
  if (enumAsInteger) {
    return value;
  }
  if (type.typeName == "google.protobuf.NullValue") {
    return null;
  }
  const val = type.findNumber(value);
  return (_a = val === null || val === void 0 ? void 0 : val.name) !== null && _a !== void 0 ? _a : value; // if we don't know the enum value, just return the number
}

function writeScalar(type, value, emitIntrinsicDefault) {
  if (value === undefined) {
    return undefined;
  }
  switch (type) {
    // int32, fixed32, uint32: JSON value will be a decimal number. Either numbers or strings are accepted.
    case ScalarType.INT32:
    case ScalarType.SFIXED32:
    case ScalarType.SINT32:
    case ScalarType.FIXED32:
    case ScalarType.UINT32:
      assert(typeof value == "number");
      return value != 0 || emitIntrinsicDefault ? value : undefined;
    // float, double: JSON value will be a number or one of the special string values "NaN", "Infinity", and "-Infinity".
    // Either numbers or strings are accepted. Exponent notation is also accepted.
    case ScalarType.FLOAT:
    // assertFloat32(value);
    case ScalarType.DOUBLE:
      // eslint-disable-line no-fallthrough
      assert(typeof value == "number");
      if (Number.isNaN(value)) return "NaN";
      if (value === Number.POSITIVE_INFINITY) return "Infinity";
      if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
      return value !== 0 || emitIntrinsicDefault ? value : undefined;
    // string:
    case ScalarType.STRING:
      assert(typeof value == "string");
      return value.length > 0 || emitIntrinsicDefault ? value : undefined;
    // bool:
    case ScalarType.BOOL:
      assert(typeof value == "boolean");
      return value || emitIntrinsicDefault ? value : undefined;
    // JSON value will be a decimal string. Either numbers or strings are accepted.
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      assert(typeof value == "bigint" || typeof value == "string" || typeof value == "number");
      // We use implicit conversion with `value != 0` to catch both 0n and "0"
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return emitIntrinsicDefault || value != 0 ? value.toString(10) : undefined;
    // bytes: JSON value will be the data encoded as a string using standard base64 encoding with paddings.
    // Either standard or URL-safe base64 encoding with/without paddings are accepted.
    case ScalarType.BYTES:
      assert(value instanceof Uint8Array);
      return emitIntrinsicDefault || value.byteLength > 0 ? protoBase64.enc(value) : undefined;
  }
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/* eslint-disable no-case-declarations, @typescript-eslint/restrict-plus-operands,@typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-argument */
function makeJsonFormatProto3() {
  return makeJsonFormatCommon((writeEnum, writeScalar) => {
    return function writeField(field, value, options) {
      if (field.kind == "map") {
        const jsonObj = {};
        switch (field.V.kind) {
          case "scalar":
            for (const [entryKey, entryValue] of Object.entries(value)) {
              const val = writeScalar(field.V.T, entryValue, true);
              assert(val !== undefined);
              jsonObj[entryKey.toString()] = val; // JSON standard allows only (double quoted) string as property key
            }

            break;
          case "message":
            for (const [entryKey, entryValue] of Object.entries(value)) {
              // JSON standard allows only (double quoted) string as property key
              jsonObj[entryKey.toString()] = entryValue.toJson(options);
            }
            break;
          case "enum":
            const enumType = field.V.T;
            for (const [entryKey, entryValue] of Object.entries(value)) {
              assert(entryValue === undefined || typeof entryValue == "number");
              const val = writeEnum(enumType, entryValue, true, options.enumAsInteger);
              assert(val !== undefined);
              jsonObj[entryKey.toString()] = val; // JSON standard allows only (double quoted) string as property key
            }

            break;
        }
        return options.emitDefaultValues || Object.keys(jsonObj).length > 0 ? jsonObj : undefined;
      } else if (field.repeated) {
        const jsonArr = [];
        switch (field.kind) {
          case "scalar":
            for (let i = 0; i < value.length; i++) {
              jsonArr.push(writeScalar(field.T, value[i], true));
            }
            break;
          case "enum":
            for (let i = 0; i < value.length; i++) {
              jsonArr.push(writeEnum(field.T, value[i], true, options.enumAsInteger));
            }
            break;
          case "message":
            for (let i = 0; i < value.length; i++) {
              jsonArr.push(wrapField(field.T, value[i]).toJson(options));
            }
            break;
        }
        return options.emitDefaultValues || jsonArr.length > 0 ? jsonArr : undefined;
      } else {
        switch (field.kind) {
          case "scalar":
            return writeScalar(field.T, value, !!field.oneof || field.opt || options.emitDefaultValues);
          case "enum":
            return writeEnum(field.T, value, !!field.oneof || field.opt || options.emitDefaultValues, options.enumAsInteger);
          case "message":
            return value !== undefined ? wrapField(field.T, value).toJson(options) : undefined;
        }
      }
    };
  });
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-argument,no-case-declarations */
function makeUtilCommon() {
  return {
    setEnumType,
    initPartial(source, target) {
      if (source === undefined) {
        return;
      }
      const type = target.getType();
      for (const member of type.fields.byMember()) {
        const localName = member.localName,
          t = target,
          s = source;
        if (s[localName] === undefined) {
          continue;
        }
        switch (member.kind) {
          case "oneof":
            const sk = s[localName].case;
            if (sk === undefined) {
              continue;
            }
            const sourceField = member.findField(sk);
            let val = s[localName].value;
            if (sourceField && sourceField.kind == "message" && !(val instanceof sourceField.T)) {
              val = new sourceField.T(val);
            }
            t[localName] = {
              case: sk,
              value: val
            };
            break;
          case "scalar":
          case "enum":
            t[localName] = s[localName];
            break;
          case "map":
            switch (member.V.kind) {
              case "scalar":
              case "enum":
                Object.assign(t[localName], s[localName]);
                break;
              case "message":
                const messageType = member.V.T;
                for (const k of Object.keys(s[localName])) {
                  let val = s[localName][k];
                  if (!messageType.fieldWrapper) {
                    // We only take partial input for messages that are not a wrapper type.
                    // For those messages, we recursively normalize the partial input.
                    val = new messageType(val);
                  }
                  t[localName][k] = val;
                }
                break;
            }
            break;
          case "message":
            const mt = member.T;
            if (member.repeated) {
              t[localName] = s[localName].map(val => val instanceof mt ? val : new mt(val));
            } else if (s[localName] !== undefined) {
              const val = s[localName];
              if (mt.fieldWrapper) {
                t[localName] = val;
              } else {
                t[localName] = val instanceof mt ? val : new mt(val);
              }
            }
            break;
        }
      }
    },
    equals(type, a, b) {
      if (a === b) {
        return true;
      }
      if (!a || !b) {
        return false;
      }
      return type.fields.byMember().every(m => {
        const va = a[m.localName];
        const vb = b[m.localName];
        if (m.repeated) {
          if (va.length !== vb.length) {
            return false;
          }
          // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- repeated fields are never "map"
          switch (m.kind) {
            case "message":
              return va.every((a, i) => m.T.equals(a, vb[i]));
            case "scalar":
              return va.every((a, i) => scalarEquals(m.T, a, vb[i]));
            case "enum":
              return va.every((a, i) => scalarEquals(ScalarType.INT32, a, vb[i]));
          }
          throw new Error("repeated cannot contain ".concat(m.kind));
        }
        switch (m.kind) {
          case "message":
            return m.T.equals(va, vb);
          case "enum":
            return scalarEquals(ScalarType.INT32, va, vb);
          case "scalar":
            return scalarEquals(m.T, va, vb);
          case "oneof":
            if (va.case !== vb.case) {
              return false;
            }
            const s = m.findField(va.case);
            if (s === undefined) {
              return true;
            }
            // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- oneof fields are never "map"
            switch (s.kind) {
              case "message":
                return s.T.equals(va.value, vb.value);
              case "enum":
                return scalarEquals(ScalarType.INT32, va.value, vb.value);
              case "scalar":
                return scalarEquals(s.T, va.value, vb.value);
            }
            throw new Error("oneof cannot contain ".concat(s.kind));
          case "map":
            const keys = Object.keys(va).concat(Object.keys(vb));
            switch (m.V.kind) {
              case "message":
                const messageType = m.V.T;
                return keys.every(k => messageType.equals(va[k], vb[k]));
              case "enum":
                return keys.every(k => scalarEquals(ScalarType.INT32, va[k], vb[k]));
              case "scalar":
                const scalarType = m.V.T;
                return keys.every(k => scalarEquals(scalarType, va[k], vb[k]));
            }
            break;
        }
      });
    },
    clone(message) {
      const type = message.getType(),
        target = new type(),
        any = target;
      for (const member of type.fields.byMember()) {
        const source = message[member.localName];
        let copy;
        if (member.repeated) {
          copy = source.map(e => cloneSingularField(member, e));
        } else if (member.kind == "map") {
          copy = any[member.localName];
          for (const [key, v] of Object.entries(source)) {
            copy[key] = cloneSingularField(member.V, v);
          }
        } else if (member.kind == "oneof") {
          const f = member.findField(source.case);
          copy = f ? {
            case: source.case,
            value: cloneSingularField(f, source.value)
          } : {
            case: undefined
          };
        } else {
          copy = cloneSingularField(member, source);
        }
        any[member.localName] = copy;
      }
      return target;
    }
  };
}
// clone a single field value - i.e. the element type of repeated fields, the value type of maps
function cloneSingularField(field, value) {
  if (value === undefined) {
    return value;
  }
  if (value instanceof Message) {
    return value.clone();
  }
  if (value instanceof Uint8Array) {
    const c = new Uint8Array(value.byteLength);
    c.set(value);
    return c;
  }
  return value;
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
class InternalFieldList {
  constructor(fields, normalizer) {
    this._fields = fields;
    this._normalizer = normalizer;
  }
  findJsonName(jsonName) {
    if (!this.jsonNames) {
      const t = {};
      for (const f of this.list()) {
        t[f.jsonName] = t[f.name] = f;
      }
      this.jsonNames = t;
    }
    return this.jsonNames[jsonName];
  }
  find(fieldNo) {
    if (!this.numbers) {
      const t = {};
      for (const f of this.list()) {
        t[f.no] = f;
      }
      this.numbers = t;
    }
    return this.numbers[fieldNo];
  }
  list() {
    if (!this.all) {
      this.all = this._normalizer(this._fields);
    }
    return this.all;
  }
  byNumber() {
    if (!this.numbersAsc) {
      this.numbersAsc = this.list().concat().sort((a, b) => a.no - b.no);
    }
    return this.numbersAsc;
  }
  byMember() {
    if (!this.members) {
      this.members = [];
      const a = this.members;
      let o;
      for (const f of this.list()) {
        if (f.oneof) {
          if (f.oneof !== o) {
            o = f.oneof;
            a.push(o);
          }
        } else {
          a.push(f);
        }
      }
    }
    return this.members;
  }
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * Returns the name of a protobuf element in generated code.
 *
 * Field names - including oneofs - are converted to lowerCamelCase. For
 * messages, enumerations and services, the package name is stripped from
 * the type name. For nested messages and enumerations, the names are joined
 * with an underscore. For methods, the first character is made lowercase.
 */
/**
 * Returns the name of a field in generated code.
 */
function localFieldName(protoName, inOneof) {
  const name = protoCamelCase(protoName);
  if (inOneof) {
    // oneof member names are not properties, but values of the `case` property.
    return name;
  }
  return safeObjectProperty(safeMessageProperty(name));
}
/**
 * Returns the name of a oneof group in generated code.
 */
function localOneofName(protoName) {
  return localFieldName(protoName, false);
}
/**
 * Returns the JSON name for a protobuf field, exactly like protoc does.
 */
const fieldJsonName = protoCamelCase;
/**
 * Converts snake_case to protoCamelCase according to the convention
 * used by protoc to convert a field name to a JSON name.
 */
function protoCamelCase(snakeCase) {
  let capNext = false;
  const b = [];
  for (let i = 0; i < snakeCase.length; i++) {
    let c = snakeCase.charAt(i);
    switch (c) {
      case "_":
        capNext = true;
        break;
      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        b.push(c);
        capNext = false;
        break;
      default:
        if (capNext) {
          capNext = false;
          c = c.toUpperCase();
        }
        b.push(c);
        break;
    }
  }
  return b.join("");
}
/**
 * Names that cannot be used for object properties because they are reserved
 * by built-in JavaScript properties.
 */
const reservedObjectProperties = new Set([
// names reserved by JavaScript
"constructor", "toString", "toJSON", "valueOf"]);
/**
 * Names that cannot be used for object properties because they are reserved
 * by the runtime.
 */
const reservedMessageProperties = new Set([
// names reserved by the runtime
"getType", "clone", "equals", "fromBinary", "fromJson", "fromJsonString", "toBinary", "toJson", "toJsonString",
// names reserved by the runtime for the future
"toObject"]);
const fallback = name => "".concat(name, "$");
/**
 * Will wrap names that are Object prototype properties or names reserved
 * for `Message`s.
 */
const safeMessageProperty = name => {
  if (reservedMessageProperties.has(name)) {
    return fallback(name);
  }
  return name;
};
/**
 * Names that cannot be used for object properties because they are reserved
 * by built-in JavaScript properties.
 */
const safeObjectProperty = name => {
  if (reservedObjectProperties.has(name)) {
    return fallback(name);
  }
  return name;
};

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
class InternalOneofInfo {
  constructor(name) {
    this.kind = "oneof";
    this.repeated = false;
    this.packed = false;
    this.opt = false;
    this.default = undefined;
    this.fields = [];
    this.name = name;
    this.localName = localOneofName(name);
  }
  addField(field) {
    assert(field.oneof === this, "field ".concat(field.name, " not one of ").concat(this.name));
    this.fields.push(field);
  }
  findField(localName) {
    if (!this._lookup) {
      this._lookup = Object.create(null);
      for (let i = 0; i < this.fields.length; i++) {
        this._lookup[this.fields[i].localName] = this.fields[i];
      }
    }
    return this._lookup[localName];
  }
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * Provides functionality for messages defined with the proto3 syntax.
 */
const proto3 = makeProtoRuntime("proto3", makeJsonFormatProto3(), makeBinaryFormatProto3(), Object.assign(Object.assign({}, makeUtilCommon()), {
  newFieldList(fields) {
    return new InternalFieldList(fields, normalizeFieldInfosProto3);
  },
  initFields(target) {
    for (const member of target.getType().fields.byMember()) {
      if (member.opt) {
        continue;
      }
      const name = member.localName,
        t = target;
      if (member.repeated) {
        t[name] = [];
        continue;
      }
      switch (member.kind) {
        case "oneof":
          t[name] = {
            case: undefined
          };
          break;
        case "enum":
          t[name] = 0;
          break;
        case "map":
          t[name] = {};
          break;
        case "scalar":
          t[name] = scalarDefaultValue(member.T); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
          break;
      }
    }
  }
}));
/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-argument */
function normalizeFieldInfosProto3(fieldInfos) {
  var _a, _b, _c;
  const r = [];
  let o;
  for (const field of typeof fieldInfos == "function" ? fieldInfos() : fieldInfos) {
    const f = field;
    f.localName = localFieldName(field.name, field.oneof !== undefined);
    f.jsonName = (_a = field.jsonName) !== null && _a !== void 0 ? _a : fieldJsonName(field.name);
    f.repeated = (_b = field.repeated) !== null && _b !== void 0 ? _b : false;
    // From the proto3 language guide:
    // > In proto3, repeated fields of scalar numeric types are packed by default.
    // This information is incomplete - according to the conformance tests, BOOL
    // and ENUM are packed by default as well. This means only STRING and BYTES
    // are not packed by default, which makes sense because they are length-delimited.
    f.packed = (_c = field.packed) !== null && _c !== void 0 ? _c : field.kind == "enum" || field.kind == "scalar" && field.T != ScalarType.BYTES && field.T != ScalarType.STRING;
    // We do not surface options at this time
    // f.options = field.options ?? emptyReadonlyObject;
    if (field.oneof !== undefined) {
      const ooname = typeof field.oneof == "string" ? field.oneof : field.oneof.name;
      if (!o || o.name != ooname) {
        o = new InternalOneofInfo(ooname);
      }
      f.oneof = o;
      o.addField(f);
    }
    r.push(f);
  }
  return r;
}

// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * A Timestamp represents a point in time independent of any time zone or local
 * calendar, encoded as a count of seconds and fractions of seconds at
 * nanosecond resolution. The count is relative to an epoch at UTC midnight on
 * January 1, 1970, in the proleptic Gregorian calendar which extends the
 * Gregorian calendar backwards to year one.
 *
 * All minutes are 60 seconds long. Leap seconds are "smeared" so that no leap
 * second table is needed for interpretation, using a [24-hour linear
 * smear](https://developers.google.com/time/smear).
 *
 * The range is from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59.999999999Z. By
 * restricting to that range, we ensure that we can convert to and from [RFC
 * 3339](https://www.ietf.org/rfc/rfc3339.txt) date strings.
 *
 * # Examples
 *
 * Example 1: Compute Timestamp from POSIX `time()`.
 *
 *     Timestamp timestamp;
 *     timestamp.set_seconds(time(NULL));
 *     timestamp.set_nanos(0);
 *
 * Example 2: Compute Timestamp from POSIX `gettimeofday()`.
 *
 *     struct timeval tv;
 *     gettimeofday(&tv, NULL);
 *
 *     Timestamp timestamp;
 *     timestamp.set_seconds(tv.tv_sec);
 *     timestamp.set_nanos(tv.tv_usec * 1000);
 *
 * Example 3: Compute Timestamp from Win32 `GetSystemTimeAsFileTime()`.
 *
 *     FILETIME ft;
 *     GetSystemTimeAsFileTime(&ft);
 *     UINT64 ticks = (((UINT64)ft.dwHighDateTime) << 32) | ft.dwLowDateTime;
 *
 *     // A Windows tick is 100 nanoseconds. Windows epoch 1601-01-01T00:00:00Z
 *     // is 11644473600 seconds before Unix epoch 1970-01-01T00:00:00Z.
 *     Timestamp timestamp;
 *     timestamp.set_seconds((INT64) ((ticks / 10000000) - 11644473600LL));
 *     timestamp.set_nanos((INT32) ((ticks % 10000000) * 100));
 *
 * Example 4: Compute Timestamp from Java `System.currentTimeMillis()`.
 *
 *     long millis = System.currentTimeMillis();
 *
 *     Timestamp timestamp = Timestamp.newBuilder().setSeconds(millis / 1000)
 *         .setNanos((int) ((millis % 1000) * 1000000)).build();
 *
 * Example 5: Compute Timestamp from Java `Instant.now()`.
 *
 *     Instant now = Instant.now();
 *
 *     Timestamp timestamp =
 *         Timestamp.newBuilder().setSeconds(now.getEpochSecond())
 *             .setNanos(now.getNano()).build();
 *
 * Example 6: Compute Timestamp from current time in Python.
 *
 *     timestamp = Timestamp()
 *     timestamp.GetCurrentTime()
 *
 * # JSON Mapping
 *
 * In JSON format, the Timestamp type is encoded as a string in the
 * [RFC 3339](https://www.ietf.org/rfc/rfc3339.txt) format. That is, the
 * format is "{year}-{month}-{day}T{hour}:{min}:{sec}[.{frac_sec}]Z"
 * where {year} is always expressed using four digits while {month}, {day},
 * {hour}, {min}, and {sec} are zero-padded to two digits each. The fractional
 * seconds, which can go up to 9 digits (i.e. up to 1 nanosecond resolution),
 * are optional. The "Z" suffix indicates the timezone ("UTC"); the timezone
 * is required. A proto3 JSON serializer should always use UTC (as indicated by
 * "Z") when printing the Timestamp type and a proto3 JSON parser should be
 * able to accept both UTC and other timezones (as indicated by an offset).
 *
 * For example, "2017-01-15T01:30:15.01Z" encodes 15.01 seconds past
 * 01:30 UTC on January 15, 2017.
 *
 * In JavaScript, one can convert a Date object to this format using the
 * standard
 * [toISOString()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString)
 * method. In Python, a standard `datetime.datetime` object can be converted
 * to this format using
 * [`strftime`](https://docs.python.org/2/library/time.html#time.strftime) with
 * the time format spec '%Y-%m-%dT%H:%M:%S.%fZ'. Likewise, in Java, one can use
 * the Joda Time's [`ISODateTimeFormat.dateTime()`](
 * http://joda-time.sourceforge.net/apidocs/org/joda/time/format/ISODateTimeFormat.html#dateTime()
 * ) to obtain a formatter capable of generating timestamps in this format.
 *
 *
 * @generated from message google.protobuf.Timestamp
 */
class Timestamp extends Message {
  constructor(data) {
    super();
    /**
     * Represents seconds of UTC time since Unix epoch
     * 1970-01-01T00:00:00Z. Must be from 0001-01-01T00:00:00Z to
     * 9999-12-31T23:59:59Z inclusive.
     *
     * @generated from field: int64 seconds = 1;
     */
    this.seconds = protoInt64.zero;
    /**
     * Non-negative fractions of a second at nanosecond resolution. Negative
     * second values with fractions must still have non-negative nanos values
     * that count forward in time. Must be from 0 to 999,999,999
     * inclusive.
     *
     * @generated from field: int32 nanos = 2;
     */
    this.nanos = 0;
    proto3.util.initPartial(data, this);
  }
  fromJson(json, options) {
    if (typeof json !== "string") {
      throw new Error("cannot decode google.protobuf.Timestamp from JSON: ".concat(proto3.json.debug(json)));
    }
    const matches = json.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:Z|\.([0-9]{3,9})Z|([+-][0-9][0-9]:[0-9][0-9]))$/);
    if (!matches) {
      throw new Error("cannot decode google.protobuf.Timestamp from JSON: invalid RFC 3339 string");
    }
    const ms = Date.parse(matches[1] + "-" + matches[2] + "-" + matches[3] + "T" + matches[4] + ":" + matches[5] + ":" + matches[6] + (matches[8] ? matches[8] : "Z"));
    if (Number.isNaN(ms)) {
      throw new Error("cannot decode google.protobuf.Timestamp from JSON: invalid RFC 3339 string");
    }
    if (ms < Date.parse("0001-01-01T00:00:00Z") || ms > Date.parse("9999-12-31T23:59:59Z")) {
      throw new Error("cannot decode message google.protobuf.Timestamp from JSON: must be from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive");
    }
    this.seconds = protoInt64.parse(ms / 1000);
    this.nanos = 0;
    if (matches[7]) {
      this.nanos = parseInt("1" + matches[7] + "0".repeat(9 - matches[7].length)) - 1000000000;
    }
    return this;
  }
  toJson(options) {
    const ms = Number(this.seconds) * 1000;
    if (ms < Date.parse("0001-01-01T00:00:00Z") || ms > Date.parse("9999-12-31T23:59:59Z")) {
      throw new Error("cannot encode google.protobuf.Timestamp to JSON: must be from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive");
    }
    if (this.nanos < 0) {
      throw new Error("cannot encode google.protobuf.Timestamp to JSON: nanos must not be negative");
    }
    let z = "Z";
    if (this.nanos > 0) {
      const nanosStr = (this.nanos + 1000000000).toString().substring(1);
      if (nanosStr.substring(3) === "000000") {
        z = "." + nanosStr.substring(0, 3) + "Z";
      } else if (nanosStr.substring(6) === "000") {
        z = "." + nanosStr.substring(0, 6) + "Z";
      } else {
        z = "." + nanosStr + "Z";
      }
    }
    return new Date(ms).toISOString().replace(".000Z", z);
  }
  toDate() {
    return new Date(Number(this.seconds) * 1000 + Math.ceil(this.nanos / 1000000));
  }
  static now() {
    return Timestamp.fromDate(new Date());
  }
  static fromDate(date) {
    const ms = date.getTime();
    return new Timestamp({
      seconds: protoInt64.parse(Math.floor(ms / 1000)),
      nanos: ms % 1000 * 1000000
    });
  }
  static fromBinary(bytes, options) {
    return new Timestamp().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new Timestamp().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new Timestamp().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(Timestamp, a, b);
  }
}
Timestamp.runtime = proto3;
Timestamp.typeName = "google.protobuf.Timestamp";
Timestamp.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "seconds",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */
}, {
  no: 2,
  name: "nanos",
  kind: "scalar",
  T: 5 /* ScalarType.INT32 */
}]);

// Copyright 2023 LiveKit, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * @generated from enum livekit.AudioCodec
 */
var AudioCodec;
(function (AudioCodec) {
  /**
   * @generated from enum value: DEFAULT_AC = 0;
   */
  AudioCodec[AudioCodec["DEFAULT_AC"] = 0] = "DEFAULT_AC";
  /**
   * @generated from enum value: OPUS = 1;
   */
  AudioCodec[AudioCodec["OPUS"] = 1] = "OPUS";
  /**
   * @generated from enum value: AAC = 2;
   */
  AudioCodec[AudioCodec["AAC"] = 2] = "AAC";
})(AudioCodec || (AudioCodec = {}));
// Retrieve enum metadata with: proto3.getEnumType(AudioCodec)
proto3.util.setEnumType(AudioCodec, "livekit.AudioCodec", [{
  no: 0,
  name: "DEFAULT_AC"
}, {
  no: 1,
  name: "OPUS"
}, {
  no: 2,
  name: "AAC"
}]);
/**
 * @generated from enum livekit.VideoCodec
 */
var VideoCodec;
(function (VideoCodec) {
  /**
   * @generated from enum value: DEFAULT_VC = 0;
   */
  VideoCodec[VideoCodec["DEFAULT_VC"] = 0] = "DEFAULT_VC";
  /**
   * @generated from enum value: H264_BASELINE = 1;
   */
  VideoCodec[VideoCodec["H264_BASELINE"] = 1] = "H264_BASELINE";
  /**
   * @generated from enum value: H264_MAIN = 2;
   */
  VideoCodec[VideoCodec["H264_MAIN"] = 2] = "H264_MAIN";
  /**
   * @generated from enum value: H264_HIGH = 3;
   */
  VideoCodec[VideoCodec["H264_HIGH"] = 3] = "H264_HIGH";
  /**
   * @generated from enum value: VP8 = 4;
   */
  VideoCodec[VideoCodec["VP8"] = 4] = "VP8";
})(VideoCodec || (VideoCodec = {}));
// Retrieve enum metadata with: proto3.getEnumType(VideoCodec)
proto3.util.setEnumType(VideoCodec, "livekit.VideoCodec", [{
  no: 0,
  name: "DEFAULT_VC"
}, {
  no: 1,
  name: "H264_BASELINE"
}, {
  no: 2,
  name: "H264_MAIN"
}, {
  no: 3,
  name: "H264_HIGH"
}, {
  no: 4,
  name: "VP8"
}]);
/**
 * @generated from enum livekit.TrackType
 */
var TrackType;
(function (TrackType) {
  /**
   * @generated from enum value: AUDIO = 0;
   */
  TrackType[TrackType["AUDIO"] = 0] = "AUDIO";
  /**
   * @generated from enum value: VIDEO = 1;
   */
  TrackType[TrackType["VIDEO"] = 1] = "VIDEO";
  /**
   * @generated from enum value: DATA = 2;
   */
  TrackType[TrackType["DATA"] = 2] = "DATA";
})(TrackType || (TrackType = {}));
// Retrieve enum metadata with: proto3.getEnumType(TrackType)
proto3.util.setEnumType(TrackType, "livekit.TrackType", [{
  no: 0,
  name: "AUDIO"
}, {
  no: 1,
  name: "VIDEO"
}, {
  no: 2,
  name: "DATA"
}]);
/**
 * @generated from enum livekit.TrackSource
 */
var TrackSource;
(function (TrackSource) {
  /**
   * @generated from enum value: UNKNOWN = 0;
   */
  TrackSource[TrackSource["UNKNOWN"] = 0] = "UNKNOWN";
  /**
   * @generated from enum value: CAMERA = 1;
   */
  TrackSource[TrackSource["CAMERA"] = 1] = "CAMERA";
  /**
   * @generated from enum value: MICROPHONE = 2;
   */
  TrackSource[TrackSource["MICROPHONE"] = 2] = "MICROPHONE";
  /**
   * @generated from enum value: SCREEN_SHARE = 3;
   */
  TrackSource[TrackSource["SCREEN_SHARE"] = 3] = "SCREEN_SHARE";
  /**
   * @generated from enum value: SCREEN_SHARE_AUDIO = 4;
   */
  TrackSource[TrackSource["SCREEN_SHARE_AUDIO"] = 4] = "SCREEN_SHARE_AUDIO";
})(TrackSource || (TrackSource = {}));
// Retrieve enum metadata with: proto3.getEnumType(TrackSource)
proto3.util.setEnumType(TrackSource, "livekit.TrackSource", [{
  no: 0,
  name: "UNKNOWN"
}, {
  no: 1,
  name: "CAMERA"
}, {
  no: 2,
  name: "MICROPHONE"
}, {
  no: 3,
  name: "SCREEN_SHARE"
}, {
  no: 4,
  name: "SCREEN_SHARE_AUDIO"
}]);
/**
 * @generated from enum livekit.VideoQuality
 */
var VideoQuality;
(function (VideoQuality) {
  /**
   * @generated from enum value: LOW = 0;
   */
  VideoQuality[VideoQuality["LOW"] = 0] = "LOW";
  /**
   * @generated from enum value: MEDIUM = 1;
   */
  VideoQuality[VideoQuality["MEDIUM"] = 1] = "MEDIUM";
  /**
   * @generated from enum value: HIGH = 2;
   */
  VideoQuality[VideoQuality["HIGH"] = 2] = "HIGH";
  /**
   * @generated from enum value: OFF = 3;
   */
  VideoQuality[VideoQuality["OFF"] = 3] = "OFF";
})(VideoQuality || (VideoQuality = {}));
// Retrieve enum metadata with: proto3.getEnumType(VideoQuality)
proto3.util.setEnumType(VideoQuality, "livekit.VideoQuality", [{
  no: 0,
  name: "LOW"
}, {
  no: 1,
  name: "MEDIUM"
}, {
  no: 2,
  name: "HIGH"
}, {
  no: 3,
  name: "OFF"
}]);
/**
 * @generated from enum livekit.ConnectionQuality
 */
var ConnectionQuality$1;
(function (ConnectionQuality) {
  /**
   * @generated from enum value: POOR = 0;
   */
  ConnectionQuality[ConnectionQuality["POOR"] = 0] = "POOR";
  /**
   * @generated from enum value: GOOD = 1;
   */
  ConnectionQuality[ConnectionQuality["GOOD"] = 1] = "GOOD";
  /**
   * @generated from enum value: EXCELLENT = 2;
   */
  ConnectionQuality[ConnectionQuality["EXCELLENT"] = 2] = "EXCELLENT";
})(ConnectionQuality$1 || (ConnectionQuality$1 = {}));
// Retrieve enum metadata with: proto3.getEnumType(ConnectionQuality)
proto3.util.setEnumType(ConnectionQuality$1, "livekit.ConnectionQuality", [{
  no: 0,
  name: "POOR"
}, {
  no: 1,
  name: "GOOD"
}, {
  no: 2,
  name: "EXCELLENT"
}]);
/**
 * @generated from enum livekit.ClientConfigSetting
 */
var ClientConfigSetting;
(function (ClientConfigSetting) {
  /**
   * @generated from enum value: UNSET = 0;
   */
  ClientConfigSetting[ClientConfigSetting["UNSET"] = 0] = "UNSET";
  /**
   * @generated from enum value: DISABLED = 1;
   */
  ClientConfigSetting[ClientConfigSetting["DISABLED"] = 1] = "DISABLED";
  /**
   * @generated from enum value: ENABLED = 2;
   */
  ClientConfigSetting[ClientConfigSetting["ENABLED"] = 2] = "ENABLED";
})(ClientConfigSetting || (ClientConfigSetting = {}));
// Retrieve enum metadata with: proto3.getEnumType(ClientConfigSetting)
proto3.util.setEnumType(ClientConfigSetting, "livekit.ClientConfigSetting", [{
  no: 0,
  name: "UNSET"
}, {
  no: 1,
  name: "DISABLED"
}, {
  no: 2,
  name: "ENABLED"
}]);
/**
 * @generated from enum livekit.DisconnectReason
 */
var DisconnectReason;
(function (DisconnectReason) {
  /**
   * @generated from enum value: UNKNOWN_REASON = 0;
   */
  DisconnectReason[DisconnectReason["UNKNOWN_REASON"] = 0] = "UNKNOWN_REASON";
  /**
   * @generated from enum value: CLIENT_INITIATED = 1;
   */
  DisconnectReason[DisconnectReason["CLIENT_INITIATED"] = 1] = "CLIENT_INITIATED";
  /**
   * @generated from enum value: DUPLICATE_IDENTITY = 2;
   */
  DisconnectReason[DisconnectReason["DUPLICATE_IDENTITY"] = 2] = "DUPLICATE_IDENTITY";
  /**
   * @generated from enum value: SERVER_SHUTDOWN = 3;
   */
  DisconnectReason[DisconnectReason["SERVER_SHUTDOWN"] = 3] = "SERVER_SHUTDOWN";
  /**
   * @generated from enum value: PARTICIPANT_REMOVED = 4;
   */
  DisconnectReason[DisconnectReason["PARTICIPANT_REMOVED"] = 4] = "PARTICIPANT_REMOVED";
  /**
   * @generated from enum value: ROOM_DELETED = 5;
   */
  DisconnectReason[DisconnectReason["ROOM_DELETED"] = 5] = "ROOM_DELETED";
  /**
   * @generated from enum value: STATE_MISMATCH = 6;
   */
  DisconnectReason[DisconnectReason["STATE_MISMATCH"] = 6] = "STATE_MISMATCH";
  /**
   * @generated from enum value: JOIN_FAILURE = 7;
   */
  DisconnectReason[DisconnectReason["JOIN_FAILURE"] = 7] = "JOIN_FAILURE";
})(DisconnectReason || (DisconnectReason = {}));
// Retrieve enum metadata with: proto3.getEnumType(DisconnectReason)
proto3.util.setEnumType(DisconnectReason, "livekit.DisconnectReason", [{
  no: 0,
  name: "UNKNOWN_REASON"
}, {
  no: 1,
  name: "CLIENT_INITIATED"
}, {
  no: 2,
  name: "DUPLICATE_IDENTITY"
}, {
  no: 3,
  name: "SERVER_SHUTDOWN"
}, {
  no: 4,
  name: "PARTICIPANT_REMOVED"
}, {
  no: 5,
  name: "ROOM_DELETED"
}, {
  no: 6,
  name: "STATE_MISMATCH"
}, {
  no: 7,
  name: "JOIN_FAILURE"
}]);
/**
 * @generated from enum livekit.ReconnectReason
 */
var ReconnectReason;
(function (ReconnectReason) {
  /**
   * @generated from enum value: RR_UNKNOWN = 0;
   */
  ReconnectReason[ReconnectReason["RR_UNKNOWN"] = 0] = "RR_UNKNOWN";
  /**
   * @generated from enum value: RR_SIGNAL_DISCONNECTED = 1;
   */
  ReconnectReason[ReconnectReason["RR_SIGNAL_DISCONNECTED"] = 1] = "RR_SIGNAL_DISCONNECTED";
  /**
   * @generated from enum value: RR_PUBLISHER_FAILED = 2;
   */
  ReconnectReason[ReconnectReason["RR_PUBLISHER_FAILED"] = 2] = "RR_PUBLISHER_FAILED";
  /**
   * @generated from enum value: RR_SUBSCRIBER_FAILED = 3;
   */
  ReconnectReason[ReconnectReason["RR_SUBSCRIBER_FAILED"] = 3] = "RR_SUBSCRIBER_FAILED";
  /**
   * @generated from enum value: RR_SWITCH_CANDIDATE = 4;
   */
  ReconnectReason[ReconnectReason["RR_SWITCH_CANDIDATE"] = 4] = "RR_SWITCH_CANDIDATE";
})(ReconnectReason || (ReconnectReason = {}));
// Retrieve enum metadata with: proto3.getEnumType(ReconnectReason)
proto3.util.setEnumType(ReconnectReason, "livekit.ReconnectReason", [{
  no: 0,
  name: "RR_UNKNOWN"
}, {
  no: 1,
  name: "RR_SIGNAL_DISCONNECTED"
}, {
  no: 2,
  name: "RR_PUBLISHER_FAILED"
}, {
  no: 3,
  name: "RR_SUBSCRIBER_FAILED"
}, {
  no: 4,
  name: "RR_SWITCH_CANDIDATE"
}]);
/**
 * @generated from enum livekit.SubscriptionError
 */
var SubscriptionError;
(function (SubscriptionError) {
  /**
   * @generated from enum value: SE_UNKNOWN = 0;
   */
  SubscriptionError[SubscriptionError["SE_UNKNOWN"] = 0] = "SE_UNKNOWN";
  /**
   * @generated from enum value: SE_CODEC_UNSUPPORTED = 1;
   */
  SubscriptionError[SubscriptionError["SE_CODEC_UNSUPPORTED"] = 1] = "SE_CODEC_UNSUPPORTED";
  /**
   * @generated from enum value: SE_TRACK_NOTFOUND = 2;
   */
  SubscriptionError[SubscriptionError["SE_TRACK_NOTFOUND"] = 2] = "SE_TRACK_NOTFOUND";
})(SubscriptionError || (SubscriptionError = {}));
// Retrieve enum metadata with: proto3.getEnumType(SubscriptionError)
proto3.util.setEnumType(SubscriptionError, "livekit.SubscriptionError", [{
  no: 0,
  name: "SE_UNKNOWN"
}, {
  no: 1,
  name: "SE_CODEC_UNSUPPORTED"
}, {
  no: 2,
  name: "SE_TRACK_NOTFOUND"
}]);
/**
 * @generated from message livekit.Room
 */
let Room$1 = class Room extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string sid = 1;
     */
    this.sid = "";
    /**
     * @generated from field: string name = 2;
     */
    this.name = "";
    /**
     * @generated from field: uint32 empty_timeout = 3;
     */
    this.emptyTimeout = 0;
    /**
     * @generated from field: uint32 max_participants = 4;
     */
    this.maxParticipants = 0;
    /**
     * @generated from field: int64 creation_time = 5;
     */
    this.creationTime = protoInt64.zero;
    /**
     * @generated from field: string turn_password = 6;
     */
    this.turnPassword = "";
    /**
     * @generated from field: repeated livekit.Codec enabled_codecs = 7;
     */
    this.enabledCodecs = [];
    /**
     * @generated from field: string metadata = 8;
     */
    this.metadata = "";
    /**
     * @generated from field: uint32 num_participants = 9;
     */
    this.numParticipants = 0;
    /**
     * @generated from field: uint32 num_publishers = 11;
     */
    this.numPublishers = 0;
    /**
     * @generated from field: bool active_recording = 10;
     */
    this.activeRecording = false;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new Room().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new Room().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new Room().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(Room, a, b);
  }
};
Room$1.runtime = proto3;
Room$1.typeName = "livekit.Room";
Room$1.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "name",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 3,
  name: "empty_timeout",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 4,
  name: "max_participants",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 5,
  name: "creation_time",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */
}, {
  no: 6,
  name: "turn_password",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 7,
  name: "enabled_codecs",
  kind: "message",
  T: Codec,
  repeated: true
}, {
  no: 8,
  name: "metadata",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 9,
  name: "num_participants",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 11,
  name: "num_publishers",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 10,
  name: "active_recording",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 12,
  name: "playout_delay",
  kind: "message",
  T: PlayoutDelay
}]);
/**
 * @generated from message livekit.Codec
 */
class Codec extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string mime = 1;
     */
    this.mime = "";
    /**
     * @generated from field: string fmtp_line = 2;
     */
    this.fmtpLine = "";
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new Codec().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new Codec().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new Codec().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(Codec, a, b);
  }
}
Codec.runtime = proto3;
Codec.typeName = "livekit.Codec";
Codec.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "mime",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "fmtp_line",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}]);
/**
 * @generated from message livekit.PlayoutDelay
 */
class PlayoutDelay extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: bool enabled = 1;
     */
    this.enabled = false;
    /**
     * @generated from field: uint32 min = 2;
     */
    this.min = 0;
    /**
     * @generated from field: uint32 max = 3;
     */
    this.max = 0;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new PlayoutDelay().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new PlayoutDelay().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new PlayoutDelay().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(PlayoutDelay, a, b);
  }
}
PlayoutDelay.runtime = proto3;
PlayoutDelay.typeName = "livekit.PlayoutDelay";
PlayoutDelay.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "enabled",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 2,
  name: "min",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 3,
  name: "max",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}]);
/**
 * @generated from message livekit.ParticipantPermission
 */
class ParticipantPermission extends Message {
  constructor(data) {
    super();
    /**
     * allow participant to subscribe to other tracks in the room
     *
     * @generated from field: bool can_subscribe = 1;
     */
    this.canSubscribe = false;
    /**
     * allow participant to publish new tracks to room
     *
     * @generated from field: bool can_publish = 2;
     */
    this.canPublish = false;
    /**
     * allow participant to publish data
     *
     * @generated from field: bool can_publish_data = 3;
     */
    this.canPublishData = false;
    /**
     * sources that are allowed to be published
     *
     * @generated from field: repeated livekit.TrackSource can_publish_sources = 9;
     */
    this.canPublishSources = [];
    /**
     * indicates that it's hidden to others
     *
     * @generated from field: bool hidden = 7;
     */
    this.hidden = false;
    /**
     * indicates it's a recorder instance
     *
     * @generated from field: bool recorder = 8;
     */
    this.recorder = false;
    /**
     * indicates that participant can update own metadata
     *
     * @generated from field: bool can_update_metadata = 10;
     */
    this.canUpdateMetadata = false;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ParticipantPermission().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ParticipantPermission().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ParticipantPermission().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ParticipantPermission, a, b);
  }
}
ParticipantPermission.runtime = proto3;
ParticipantPermission.typeName = "livekit.ParticipantPermission";
ParticipantPermission.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "can_subscribe",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 2,
  name: "can_publish",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 3,
  name: "can_publish_data",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 9,
  name: "can_publish_sources",
  kind: "enum",
  T: proto3.getEnumType(TrackSource),
  repeated: true
}, {
  no: 7,
  name: "hidden",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 8,
  name: "recorder",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 10,
  name: "can_update_metadata",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}]);
/**
 * @generated from message livekit.ParticipantInfo
 */
class ParticipantInfo extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string sid = 1;
     */
    this.sid = "";
    /**
     * @generated from field: string identity = 2;
     */
    this.identity = "";
    /**
     * @generated from field: livekit.ParticipantInfo.State state = 3;
     */
    this.state = ParticipantInfo_State.JOINING;
    /**
     * @generated from field: repeated livekit.TrackInfo tracks = 4;
     */
    this.tracks = [];
    /**
     * @generated from field: string metadata = 5;
     */
    this.metadata = "";
    /**
     * timestamp when participant joined room, in seconds
     *
     * @generated from field: int64 joined_at = 6;
     */
    this.joinedAt = protoInt64.zero;
    /**
     * @generated from field: string name = 9;
     */
    this.name = "";
    /**
     * @generated from field: uint32 version = 10;
     */
    this.version = 0;
    /**
     * @generated from field: string region = 12;
     */
    this.region = "";
    /**
     * indicates the participant has an active publisher connection
     * and can publish to the server
     *
     * @generated from field: bool is_publisher = 13;
     */
    this.isPublisher = false;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ParticipantInfo().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ParticipantInfo().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ParticipantInfo().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ParticipantInfo, a, b);
  }
}
ParticipantInfo.runtime = proto3;
ParticipantInfo.typeName = "livekit.ParticipantInfo";
ParticipantInfo.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "identity",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 3,
  name: "state",
  kind: "enum",
  T: proto3.getEnumType(ParticipantInfo_State)
}, {
  no: 4,
  name: "tracks",
  kind: "message",
  T: TrackInfo,
  repeated: true
}, {
  no: 5,
  name: "metadata",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 6,
  name: "joined_at",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */
}, {
  no: 9,
  name: "name",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 10,
  name: "version",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 11,
  name: "permission",
  kind: "message",
  T: ParticipantPermission
}, {
  no: 12,
  name: "region",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 13,
  name: "is_publisher",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}]);
/**
 * @generated from enum livekit.ParticipantInfo.State
 */
var ParticipantInfo_State;
(function (ParticipantInfo_State) {
  /**
   * websocket' connected, but not offered yet
   *
   * @generated from enum value: JOINING = 0;
   */
  ParticipantInfo_State[ParticipantInfo_State["JOINING"] = 0] = "JOINING";
  /**
   * server received client offer
   *
   * @generated from enum value: JOINED = 1;
   */
  ParticipantInfo_State[ParticipantInfo_State["JOINED"] = 1] = "JOINED";
  /**
   * ICE connectivity established
   *
   * @generated from enum value: ACTIVE = 2;
   */
  ParticipantInfo_State[ParticipantInfo_State["ACTIVE"] = 2] = "ACTIVE";
  /**
   * WS disconnected
   *
   * @generated from enum value: DISCONNECTED = 3;
   */
  ParticipantInfo_State[ParticipantInfo_State["DISCONNECTED"] = 3] = "DISCONNECTED";
})(ParticipantInfo_State || (ParticipantInfo_State = {}));
// Retrieve enum metadata with: proto3.getEnumType(ParticipantInfo_State)
proto3.util.setEnumType(ParticipantInfo_State, "livekit.ParticipantInfo.State", [{
  no: 0,
  name: "JOINING"
}, {
  no: 1,
  name: "JOINED"
}, {
  no: 2,
  name: "ACTIVE"
}, {
  no: 3,
  name: "DISCONNECTED"
}]);
/**
 * @generated from message livekit.Encryption
 */
class Encryption extends Message {
  constructor(data) {
    super();
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new Encryption().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new Encryption().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new Encryption().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(Encryption, a, b);
  }
}
Encryption.runtime = proto3;
Encryption.typeName = "livekit.Encryption";
Encryption.fields = proto3.util.newFieldList(() => []);
/**
 * @generated from enum livekit.Encryption.Type
 */
var Encryption_Type;
(function (Encryption_Type) {
  /**
   * @generated from enum value: NONE = 0;
   */
  Encryption_Type[Encryption_Type["NONE"] = 0] = "NONE";
  /**
   * @generated from enum value: GCM = 1;
   */
  Encryption_Type[Encryption_Type["GCM"] = 1] = "GCM";
  /**
   * @generated from enum value: CUSTOM = 2;
   */
  Encryption_Type[Encryption_Type["CUSTOM"] = 2] = "CUSTOM";
})(Encryption_Type || (Encryption_Type = {}));
// Retrieve enum metadata with: proto3.getEnumType(Encryption_Type)
proto3.util.setEnumType(Encryption_Type, "livekit.Encryption.Type", [{
  no: 0,
  name: "NONE"
}, {
  no: 1,
  name: "GCM"
}, {
  no: 2,
  name: "CUSTOM"
}]);
/**
 * @generated from message livekit.SimulcastCodecInfo
 */
class SimulcastCodecInfo extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string mime_type = 1;
     */
    this.mimeType = "";
    /**
     * @generated from field: string mid = 2;
     */
    this.mid = "";
    /**
     * @generated from field: string cid = 3;
     */
    this.cid = "";
    /**
     * @generated from field: repeated livekit.VideoLayer layers = 4;
     */
    this.layers = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SimulcastCodecInfo().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SimulcastCodecInfo().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SimulcastCodecInfo().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SimulcastCodecInfo, a, b);
  }
}
SimulcastCodecInfo.runtime = proto3;
SimulcastCodecInfo.typeName = "livekit.SimulcastCodecInfo";
SimulcastCodecInfo.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "mime_type",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "mid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 3,
  name: "cid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 4,
  name: "layers",
  kind: "message",
  T: VideoLayer,
  repeated: true
}]);
/**
 * @generated from message livekit.TrackInfo
 */
class TrackInfo extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string sid = 1;
     */
    this.sid = "";
    /**
     * @generated from field: livekit.TrackType type = 2;
     */
    this.type = TrackType.AUDIO;
    /**
     * @generated from field: string name = 3;
     */
    this.name = "";
    /**
     * @generated from field: bool muted = 4;
     */
    this.muted = false;
    /**
     * original width of video (unset for audio)
     * clients may receive a lower resolution version with simulcast
     *
     * @generated from field: uint32 width = 5;
     */
    this.width = 0;
    /**
     * original height of video (unset for audio)
     *
     * @generated from field: uint32 height = 6;
     */
    this.height = 0;
    /**
     * true if track is simulcasted
     *
     * @generated from field: bool simulcast = 7;
     */
    this.simulcast = false;
    /**
     * true if DTX (Discontinuous Transmission) is disabled for audio
     *
     * @generated from field: bool disable_dtx = 8;
     */
    this.disableDtx = false;
    /**
     * source of media
     *
     * @generated from field: livekit.TrackSource source = 9;
     */
    this.source = TrackSource.UNKNOWN;
    /**
     * @generated from field: repeated livekit.VideoLayer layers = 10;
     */
    this.layers = [];
    /**
     * mime type of codec
     *
     * @generated from field: string mime_type = 11;
     */
    this.mimeType = "";
    /**
     * @generated from field: string mid = 12;
     */
    this.mid = "";
    /**
     * @generated from field: repeated livekit.SimulcastCodecInfo codecs = 13;
     */
    this.codecs = [];
    /**
     * @generated from field: bool stereo = 14;
     */
    this.stereo = false;
    /**
     * true if RED (Redundant Encoding) is disabled for audio
     *
     * @generated from field: bool disable_red = 15;
     */
    this.disableRed = false;
    /**
     * @generated from field: livekit.Encryption.Type encryption = 16;
     */
    this.encryption = Encryption_Type.NONE;
    /**
     * @generated from field: string stream = 17;
     */
    this.stream = "";
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new TrackInfo().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new TrackInfo().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new TrackInfo().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(TrackInfo, a, b);
  }
}
TrackInfo.runtime = proto3;
TrackInfo.typeName = "livekit.TrackInfo";
TrackInfo.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "type",
  kind: "enum",
  T: proto3.getEnumType(TrackType)
}, {
  no: 3,
  name: "name",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 4,
  name: "muted",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 5,
  name: "width",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 6,
  name: "height",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 7,
  name: "simulcast",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 8,
  name: "disable_dtx",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 9,
  name: "source",
  kind: "enum",
  T: proto3.getEnumType(TrackSource)
}, {
  no: 10,
  name: "layers",
  kind: "message",
  T: VideoLayer,
  repeated: true
}, {
  no: 11,
  name: "mime_type",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 12,
  name: "mid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 13,
  name: "codecs",
  kind: "message",
  T: SimulcastCodecInfo,
  repeated: true
}, {
  no: 14,
  name: "stereo",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 15,
  name: "disable_red",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 16,
  name: "encryption",
  kind: "enum",
  T: proto3.getEnumType(Encryption_Type)
}, {
  no: 17,
  name: "stream",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}]);
/**
 * provide information about available spatial layers
 *
 * @generated from message livekit.VideoLayer
 */
class VideoLayer extends Message {
  constructor(data) {
    super();
    /**
     * for tracks with a single layer, this should be HIGH
     *
     * @generated from field: livekit.VideoQuality quality = 1;
     */
    this.quality = VideoQuality.LOW;
    /**
     * @generated from field: uint32 width = 2;
     */
    this.width = 0;
    /**
     * @generated from field: uint32 height = 3;
     */
    this.height = 0;
    /**
     * target bitrate in bit per second (bps), server will measure actual
     *
     * @generated from field: uint32 bitrate = 4;
     */
    this.bitrate = 0;
    /**
     * @generated from field: uint32 ssrc = 5;
     */
    this.ssrc = 0;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new VideoLayer().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new VideoLayer().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new VideoLayer().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(VideoLayer, a, b);
  }
}
VideoLayer.runtime = proto3;
VideoLayer.typeName = "livekit.VideoLayer";
VideoLayer.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "quality",
  kind: "enum",
  T: proto3.getEnumType(VideoQuality)
}, {
  no: 2,
  name: "width",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 3,
  name: "height",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 4,
  name: "bitrate",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 5,
  name: "ssrc",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}]);
/**
 * new DataPacket API
 *
 * @generated from message livekit.DataPacket
 */
class DataPacket extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: livekit.DataPacket.Kind kind = 1;
     */
    this.kind = DataPacket_Kind.RELIABLE;
    /**
     * @generated from oneof livekit.DataPacket.value
     */
    this.value = {
      case: undefined
    };
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new DataPacket().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new DataPacket().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new DataPacket().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(DataPacket, a, b);
  }
}
DataPacket.runtime = proto3;
DataPacket.typeName = "livekit.DataPacket";
DataPacket.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "kind",
  kind: "enum",
  T: proto3.getEnumType(DataPacket_Kind)
}, {
  no: 2,
  name: "user",
  kind: "message",
  T: UserPacket,
  oneof: "value"
}, {
  no: 3,
  name: "speaker",
  kind: "message",
  T: ActiveSpeakerUpdate,
  oneof: "value"
}]);
/**
 * @generated from enum livekit.DataPacket.Kind
 */
var DataPacket_Kind;
(function (DataPacket_Kind) {
  /**
   * @generated from enum value: RELIABLE = 0;
   */
  DataPacket_Kind[DataPacket_Kind["RELIABLE"] = 0] = "RELIABLE";
  /**
   * @generated from enum value: LOSSY = 1;
   */
  DataPacket_Kind[DataPacket_Kind["LOSSY"] = 1] = "LOSSY";
})(DataPacket_Kind || (DataPacket_Kind = {}));
// Retrieve enum metadata with: proto3.getEnumType(DataPacket_Kind)
proto3.util.setEnumType(DataPacket_Kind, "livekit.DataPacket.Kind", [{
  no: 0,
  name: "RELIABLE"
}, {
  no: 1,
  name: "LOSSY"
}]);
/**
 * @generated from message livekit.ActiveSpeakerUpdate
 */
class ActiveSpeakerUpdate extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated livekit.SpeakerInfo speakers = 1;
     */
    this.speakers = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ActiveSpeakerUpdate().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ActiveSpeakerUpdate().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ActiveSpeakerUpdate().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ActiveSpeakerUpdate, a, b);
  }
}
ActiveSpeakerUpdate.runtime = proto3;
ActiveSpeakerUpdate.typeName = "livekit.ActiveSpeakerUpdate";
ActiveSpeakerUpdate.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "speakers",
  kind: "message",
  T: SpeakerInfo,
  repeated: true
}]);
/**
 * @generated from message livekit.SpeakerInfo
 */
class SpeakerInfo extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string sid = 1;
     */
    this.sid = "";
    /**
     * audio level, 0-1.0, 1 is loudest
     *
     * @generated from field: float level = 2;
     */
    this.level = 0;
    /**
     * true if speaker is currently active
     *
     * @generated from field: bool active = 3;
     */
    this.active = false;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SpeakerInfo().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SpeakerInfo().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SpeakerInfo().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SpeakerInfo, a, b);
  }
}
SpeakerInfo.runtime = proto3;
SpeakerInfo.typeName = "livekit.SpeakerInfo";
SpeakerInfo.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "level",
  kind: "scalar",
  T: 2 /* ScalarType.FLOAT */
}, {
  no: 3,
  name: "active",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}]);
/**
 * @generated from message livekit.UserPacket
 */
class UserPacket extends Message {
  constructor(data) {
    super();
    /**
     * participant ID of user that sent the message
     *
     * @generated from field: string participant_sid = 1;
     */
    this.participantSid = "";
    /**
     * user defined payload
     *
     * @generated from field: bytes payload = 2;
     */
    this.payload = new Uint8Array(0);
    /**
     * the ID of the participants who will receive the message (the message will be sent to all the people in the room if this variable is empty)
     *
     * @generated from field: repeated string destination_sids = 3;
     */
    this.destinationSids = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new UserPacket().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new UserPacket().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new UserPacket().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(UserPacket, a, b);
  }
}
UserPacket.runtime = proto3;
UserPacket.typeName = "livekit.UserPacket";
UserPacket.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "participant_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "payload",
  kind: "scalar",
  T: 12 /* ScalarType.BYTES */
}, {
  no: 3,
  name: "destination_sids",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */,
  repeated: true
}, {
  no: 4,
  name: "topic",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */,
  opt: true
}]);
/**
 * @generated from message livekit.ParticipantTracks
 */
class ParticipantTracks extends Message {
  constructor(data) {
    super();
    /**
     * participant ID of participant to whom the tracks belong
     *
     * @generated from field: string participant_sid = 1;
     */
    this.participantSid = "";
    /**
     * @generated from field: repeated string track_sids = 2;
     */
    this.trackSids = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ParticipantTracks().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ParticipantTracks().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ParticipantTracks().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ParticipantTracks, a, b);
  }
}
ParticipantTracks.runtime = proto3;
ParticipantTracks.typeName = "livekit.ParticipantTracks";
ParticipantTracks.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "participant_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "track_sids",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */,
  repeated: true
}]);
/**
 * details about the server
 *
 * @generated from message livekit.ServerInfo
 */
class ServerInfo extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: livekit.ServerInfo.Edition edition = 1;
     */
    this.edition = ServerInfo_Edition.Standard;
    /**
     * @generated from field: string version = 2;
     */
    this.version = "";
    /**
     * @generated from field: int32 protocol = 3;
     */
    this.protocol = 0;
    /**
     * @generated from field: string region = 4;
     */
    this.region = "";
    /**
     * @generated from field: string node_id = 5;
     */
    this.nodeId = "";
    /**
     * additional debugging information. sent only if server is in development mode
     *
     * @generated from field: string debug_info = 6;
     */
    this.debugInfo = "";
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ServerInfo().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ServerInfo().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ServerInfo().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ServerInfo, a, b);
  }
}
ServerInfo.runtime = proto3;
ServerInfo.typeName = "livekit.ServerInfo";
ServerInfo.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "edition",
  kind: "enum",
  T: proto3.getEnumType(ServerInfo_Edition)
}, {
  no: 2,
  name: "version",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 3,
  name: "protocol",
  kind: "scalar",
  T: 5 /* ScalarType.INT32 */
}, {
  no: 4,
  name: "region",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 5,
  name: "node_id",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 6,
  name: "debug_info",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}]);
/**
 * @generated from enum livekit.ServerInfo.Edition
 */
var ServerInfo_Edition;
(function (ServerInfo_Edition) {
  /**
   * @generated from enum value: Standard = 0;
   */
  ServerInfo_Edition[ServerInfo_Edition["Standard"] = 0] = "Standard";
  /**
   * @generated from enum value: Cloud = 1;
   */
  ServerInfo_Edition[ServerInfo_Edition["Cloud"] = 1] = "Cloud";
})(ServerInfo_Edition || (ServerInfo_Edition = {}));
// Retrieve enum metadata with: proto3.getEnumType(ServerInfo_Edition)
proto3.util.setEnumType(ServerInfo_Edition, "livekit.ServerInfo.Edition", [{
  no: 0,
  name: "Standard"
}, {
  no: 1,
  name: "Cloud"
}]);
/**
 * details about the client
 *
 * @generated from message livekit.ClientInfo
 */
class ClientInfo extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: livekit.ClientInfo.SDK sdk = 1;
     */
    this.sdk = ClientInfo_SDK.UNKNOWN;
    /**
     * @generated from field: string version = 2;
     */
    this.version = "";
    /**
     * @generated from field: int32 protocol = 3;
     */
    this.protocol = 0;
    /**
     * @generated from field: string os = 4;
     */
    this.os = "";
    /**
     * @generated from field: string os_version = 5;
     */
    this.osVersion = "";
    /**
     * @generated from field: string device_model = 6;
     */
    this.deviceModel = "";
    /**
     * @generated from field: string browser = 7;
     */
    this.browser = "";
    /**
     * @generated from field: string browser_version = 8;
     */
    this.browserVersion = "";
    /**
     * @generated from field: string address = 9;
     */
    this.address = "";
    /**
     * wifi, wired, cellular, vpn, empty if not known
     *
     * @generated from field: string network = 10;
     */
    this.network = "";
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ClientInfo().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ClientInfo().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ClientInfo().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ClientInfo, a, b);
  }
}
ClientInfo.runtime = proto3;
ClientInfo.typeName = "livekit.ClientInfo";
ClientInfo.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "sdk",
  kind: "enum",
  T: proto3.getEnumType(ClientInfo_SDK)
}, {
  no: 2,
  name: "version",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 3,
  name: "protocol",
  kind: "scalar",
  T: 5 /* ScalarType.INT32 */
}, {
  no: 4,
  name: "os",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 5,
  name: "os_version",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 6,
  name: "device_model",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 7,
  name: "browser",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 8,
  name: "browser_version",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 9,
  name: "address",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 10,
  name: "network",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}]);
/**
 * @generated from enum livekit.ClientInfo.SDK
 */
var ClientInfo_SDK;
(function (ClientInfo_SDK) {
  /**
   * @generated from enum value: UNKNOWN = 0;
   */
  ClientInfo_SDK[ClientInfo_SDK["UNKNOWN"] = 0] = "UNKNOWN";
  /**
   * @generated from enum value: JS = 1;
   */
  ClientInfo_SDK[ClientInfo_SDK["JS"] = 1] = "JS";
  /**
   * @generated from enum value: SWIFT = 2;
   */
  ClientInfo_SDK[ClientInfo_SDK["SWIFT"] = 2] = "SWIFT";
  /**
   * @generated from enum value: ANDROID = 3;
   */
  ClientInfo_SDK[ClientInfo_SDK["ANDROID"] = 3] = "ANDROID";
  /**
   * @generated from enum value: FLUTTER = 4;
   */
  ClientInfo_SDK[ClientInfo_SDK["FLUTTER"] = 4] = "FLUTTER";
  /**
   * @generated from enum value: GO = 5;
   */
  ClientInfo_SDK[ClientInfo_SDK["GO"] = 5] = "GO";
  /**
   * @generated from enum value: UNITY = 6;
   */
  ClientInfo_SDK[ClientInfo_SDK["UNITY"] = 6] = "UNITY";
  /**
   * @generated from enum value: REACT_NATIVE = 7;
   */
  ClientInfo_SDK[ClientInfo_SDK["REACT_NATIVE"] = 7] = "REACT_NATIVE";
  /**
   * @generated from enum value: RUST = 8;
   */
  ClientInfo_SDK[ClientInfo_SDK["RUST"] = 8] = "RUST";
})(ClientInfo_SDK || (ClientInfo_SDK = {}));
// Retrieve enum metadata with: proto3.getEnumType(ClientInfo_SDK)
proto3.util.setEnumType(ClientInfo_SDK, "livekit.ClientInfo.SDK", [{
  no: 0,
  name: "UNKNOWN"
}, {
  no: 1,
  name: "JS"
}, {
  no: 2,
  name: "SWIFT"
}, {
  no: 3,
  name: "ANDROID"
}, {
  no: 4,
  name: "FLUTTER"
}, {
  no: 5,
  name: "GO"
}, {
  no: 6,
  name: "UNITY"
}, {
  no: 7,
  name: "REACT_NATIVE"
}, {
  no: 8,
  name: "RUST"
}]);
/**
 * server provided client configuration
 *
 * @generated from message livekit.ClientConfiguration
 */
class ClientConfiguration extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: livekit.ClientConfigSetting resume_connection = 3;
     */
    this.resumeConnection = ClientConfigSetting.UNSET;
    /**
     * @generated from field: livekit.ClientConfigSetting force_relay = 5;
     */
    this.forceRelay = ClientConfigSetting.UNSET;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ClientConfiguration().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ClientConfiguration().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ClientConfiguration().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ClientConfiguration, a, b);
  }
}
ClientConfiguration.runtime = proto3;
ClientConfiguration.typeName = "livekit.ClientConfiguration";
ClientConfiguration.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "video",
  kind: "message",
  T: VideoConfiguration
}, {
  no: 2,
  name: "screen",
  kind: "message",
  T: VideoConfiguration
}, {
  no: 3,
  name: "resume_connection",
  kind: "enum",
  T: proto3.getEnumType(ClientConfigSetting)
}, {
  no: 4,
  name: "disabled_codecs",
  kind: "message",
  T: DisabledCodecs
}, {
  no: 5,
  name: "force_relay",
  kind: "enum",
  T: proto3.getEnumType(ClientConfigSetting)
}]);
/**
 * @generated from message livekit.VideoConfiguration
 */
class VideoConfiguration extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: livekit.ClientConfigSetting hardware_encoder = 1;
     */
    this.hardwareEncoder = ClientConfigSetting.UNSET;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new VideoConfiguration().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new VideoConfiguration().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new VideoConfiguration().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(VideoConfiguration, a, b);
  }
}
VideoConfiguration.runtime = proto3;
VideoConfiguration.typeName = "livekit.VideoConfiguration";
VideoConfiguration.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "hardware_encoder",
  kind: "enum",
  T: proto3.getEnumType(ClientConfigSetting)
}]);
/**
 * @generated from message livekit.DisabledCodecs
 */
class DisabledCodecs extends Message {
  constructor(data) {
    super();
    /**
     * disabled for both publish and subscribe
     *
     * @generated from field: repeated livekit.Codec codecs = 1;
     */
    this.codecs = [];
    /**
     * only disable for publish
     *
     * @generated from field: repeated livekit.Codec publish = 2;
     */
    this.publish = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new DisabledCodecs().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new DisabledCodecs().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new DisabledCodecs().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(DisabledCodecs, a, b);
  }
}
DisabledCodecs.runtime = proto3;
DisabledCodecs.typeName = "livekit.DisabledCodecs";
DisabledCodecs.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "codecs",
  kind: "message",
  T: Codec,
  repeated: true
}, {
  no: 2,
  name: "publish",
  kind: "message",
  T: Codec,
  repeated: true
}]);
/**
 * @generated from message livekit.RTPStats
 */
class RTPStats extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: double duration = 3;
     */
    this.duration = 0;
    /**
     * @generated from field: uint32 packets = 4;
     */
    this.packets = 0;
    /**
     * @generated from field: double packet_rate = 5;
     */
    this.packetRate = 0;
    /**
     * @generated from field: uint64 bytes = 6;
     */
    this.bytes = protoInt64.zero;
    /**
     * @generated from field: uint64 header_bytes = 39;
     */
    this.headerBytes = protoInt64.zero;
    /**
     * @generated from field: double bitrate = 7;
     */
    this.bitrate = 0;
    /**
     * @generated from field: uint32 packets_lost = 8;
     */
    this.packetsLost = 0;
    /**
     * @generated from field: double packet_loss_rate = 9;
     */
    this.packetLossRate = 0;
    /**
     * @generated from field: float packet_loss_percentage = 10;
     */
    this.packetLossPercentage = 0;
    /**
     * @generated from field: uint32 packets_duplicate = 11;
     */
    this.packetsDuplicate = 0;
    /**
     * @generated from field: double packet_duplicate_rate = 12;
     */
    this.packetDuplicateRate = 0;
    /**
     * @generated from field: uint64 bytes_duplicate = 13;
     */
    this.bytesDuplicate = protoInt64.zero;
    /**
     * @generated from field: uint64 header_bytes_duplicate = 40;
     */
    this.headerBytesDuplicate = protoInt64.zero;
    /**
     * @generated from field: double bitrate_duplicate = 14;
     */
    this.bitrateDuplicate = 0;
    /**
     * @generated from field: uint32 packets_padding = 15;
     */
    this.packetsPadding = 0;
    /**
     * @generated from field: double packet_padding_rate = 16;
     */
    this.packetPaddingRate = 0;
    /**
     * @generated from field: uint64 bytes_padding = 17;
     */
    this.bytesPadding = protoInt64.zero;
    /**
     * @generated from field: uint64 header_bytes_padding = 41;
     */
    this.headerBytesPadding = protoInt64.zero;
    /**
     * @generated from field: double bitrate_padding = 18;
     */
    this.bitratePadding = 0;
    /**
     * @generated from field: uint32 packets_out_of_order = 19;
     */
    this.packetsOutOfOrder = 0;
    /**
     * @generated from field: uint32 frames = 20;
     */
    this.frames = 0;
    /**
     * @generated from field: double frame_rate = 21;
     */
    this.frameRate = 0;
    /**
     * @generated from field: double jitter_current = 22;
     */
    this.jitterCurrent = 0;
    /**
     * @generated from field: double jitter_max = 23;
     */
    this.jitterMax = 0;
    /**
     * @generated from field: map<int32, uint32> gap_histogram = 24;
     */
    this.gapHistogram = {};
    /**
     * @generated from field: uint32 nacks = 25;
     */
    this.nacks = 0;
    /**
     * @generated from field: uint32 nack_acks = 37;
     */
    this.nackAcks = 0;
    /**
     * @generated from field: uint32 nack_misses = 26;
     */
    this.nackMisses = 0;
    /**
     * @generated from field: uint32 nack_repeated = 38;
     */
    this.nackRepeated = 0;
    /**
     * @generated from field: uint32 plis = 27;
     */
    this.plis = 0;
    /**
     * @generated from field: uint32 firs = 29;
     */
    this.firs = 0;
    /**
     * @generated from field: uint32 rtt_current = 31;
     */
    this.rttCurrent = 0;
    /**
     * @generated from field: uint32 rtt_max = 32;
     */
    this.rttMax = 0;
    /**
     * @generated from field: uint32 key_frames = 33;
     */
    this.keyFrames = 0;
    /**
     * @generated from field: uint32 layer_lock_plis = 35;
     */
    this.layerLockPlis = 0;
    /**
     * @generated from field: double sample_rate = 42;
     */
    this.sampleRate = 0;
    /**
     * NEXT_ID: 44
     *
     * @generated from field: double drift_ms = 43;
     */
    this.driftMs = 0;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new RTPStats().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new RTPStats().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new RTPStats().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(RTPStats, a, b);
  }
}
RTPStats.runtime = proto3;
RTPStats.typeName = "livekit.RTPStats";
RTPStats.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "start_time",
  kind: "message",
  T: Timestamp
}, {
  no: 2,
  name: "end_time",
  kind: "message",
  T: Timestamp
}, {
  no: 3,
  name: "duration",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 4,
  name: "packets",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 5,
  name: "packet_rate",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 6,
  name: "bytes",
  kind: "scalar",
  T: 4 /* ScalarType.UINT64 */
}, {
  no: 39,
  name: "header_bytes",
  kind: "scalar",
  T: 4 /* ScalarType.UINT64 */
}, {
  no: 7,
  name: "bitrate",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 8,
  name: "packets_lost",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 9,
  name: "packet_loss_rate",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 10,
  name: "packet_loss_percentage",
  kind: "scalar",
  T: 2 /* ScalarType.FLOAT */
}, {
  no: 11,
  name: "packets_duplicate",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 12,
  name: "packet_duplicate_rate",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 13,
  name: "bytes_duplicate",
  kind: "scalar",
  T: 4 /* ScalarType.UINT64 */
}, {
  no: 40,
  name: "header_bytes_duplicate",
  kind: "scalar",
  T: 4 /* ScalarType.UINT64 */
}, {
  no: 14,
  name: "bitrate_duplicate",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 15,
  name: "packets_padding",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 16,
  name: "packet_padding_rate",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 17,
  name: "bytes_padding",
  kind: "scalar",
  T: 4 /* ScalarType.UINT64 */
}, {
  no: 41,
  name: "header_bytes_padding",
  kind: "scalar",
  T: 4 /* ScalarType.UINT64 */
}, {
  no: 18,
  name: "bitrate_padding",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 19,
  name: "packets_out_of_order",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 20,
  name: "frames",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 21,
  name: "frame_rate",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 22,
  name: "jitter_current",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 23,
  name: "jitter_max",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 24,
  name: "gap_histogram",
  kind: "map",
  K: 5 /* ScalarType.INT32 */,
  V: {
    kind: "scalar",
    T: 13 /* ScalarType.UINT32 */
  }
}, {
  no: 25,
  name: "nacks",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 37,
  name: "nack_acks",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 26,
  name: "nack_misses",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 38,
  name: "nack_repeated",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 27,
  name: "plis",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 28,
  name: "last_pli",
  kind: "message",
  T: Timestamp
}, {
  no: 29,
  name: "firs",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 30,
  name: "last_fir",
  kind: "message",
  T: Timestamp
}, {
  no: 31,
  name: "rtt_current",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 32,
  name: "rtt_max",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 33,
  name: "key_frames",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 34,
  name: "last_key_frame",
  kind: "message",
  T: Timestamp
}, {
  no: 35,
  name: "layer_lock_plis",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 36,
  name: "last_layer_lock_pli",
  kind: "message",
  T: Timestamp
}, {
  no: 42,
  name: "sample_rate",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}, {
  no: 43,
  name: "drift_ms",
  kind: "scalar",
  T: 1 /* ScalarType.DOUBLE */
}]);
/**
 * @generated from message livekit.TimedVersion
 */
class TimedVersion extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: int64 unix_micro = 1;
     */
    this.unixMicro = protoInt64.zero;
    /**
     * @generated from field: int32 ticks = 2;
     */
    this.ticks = 0;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new TimedVersion().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new TimedVersion().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new TimedVersion().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(TimedVersion, a, b);
  }
}
TimedVersion.runtime = proto3;
TimedVersion.typeName = "livekit.TimedVersion";
TimedVersion.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "unix_micro",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */
}, {
  no: 2,
  name: "ticks",
  kind: "scalar",
  T: 5 /* ScalarType.INT32 */
}]);

const maxRetryDelay = 7000;
const DEFAULT_RETRY_DELAYS_IN_MS = [0, 300, 2 * 2 * 300, 3 * 3 * 300, 4 * 4 * 300, maxRetryDelay, maxRetryDelay, maxRetryDelay, maxRetryDelay, maxRetryDelay];
class DefaultReconnectPolicy {
  constructor(retryDelays) {
    this._retryDelays = retryDelays !== undefined ? [...retryDelays] : DEFAULT_RETRY_DELAYS_IN_MS;
  }
  nextRetryDelayInMs(context) {
    if (context.retryCount >= this._retryDelays.length) return null;
    const retryDelay = this._retryDelays[context.retryCount];
    if (context.retryCount <= 1) return retryDelay;
    return retryDelay + Math.random() * 1000;
  }
}

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __values(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __asyncValues(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

var events = {exports: {}};

var R = typeof Reflect === 'object' ? Reflect : null;
var ReflectApply = R && typeof R.apply === 'function' ? R.apply : function ReflectApply(target, receiver, args) {
  return Function.prototype.apply.call(target, receiver, args);
};
var ReflectOwnKeys;
if (R && typeof R.ownKeys === 'function') {
  ReflectOwnKeys = R.ownKeys;
} else if (Object.getOwnPropertySymbols) {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target).concat(Object.getOwnPropertySymbols(target));
  };
} else {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target);
  };
}
function ProcessEmitWarning(warning) {
  if (console && console.warn) console.warn(warning);
}
var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
  return value !== value;
};
function EventEmitter() {
  EventEmitter.init.call(this);
}
events.exports = EventEmitter;
events.exports.once = once;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;
function checkListener(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
  }
}
Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
  enumerable: true,
  get: function () {
    return defaultMaxListeners;
  },
  set: function (arg) {
    if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
      throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
    }
    defaultMaxListeners = arg;
  }
});
EventEmitter.init = function () {
  if (this._events === undefined || this._events === Object.getPrototypeOf(this)._events) {
    this._events = Object.create(null);
    this._eventsCount = 0;
  }
  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
    throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
  }
  this._maxListeners = n;
  return this;
};
function _getMaxListeners(that) {
  if (that._maxListeners === undefined) return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}
EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return _getMaxListeners(this);
};
EventEmitter.prototype.emit = function emit(type) {
  var args = [];
  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
  var doError = type === 'error';
  var events = this._events;
  if (events !== undefined) doError = doError && events.error === undefined;else if (!doError) return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    var er;
    if (args.length > 0) er = args[0];
    if (er instanceof Error) {
      // Note: The comments on the `throw` lines are intentional, they show
      // up in Node's output if this results in an unhandled exception.
      throw er; // Unhandled 'error' event
    }
    // At least give some kind of context to the user
    var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
    err.context = er;
    throw err; // Unhandled 'error' event
  }

  var handler = events[type];
  if (handler === undefined) return false;
  if (typeof handler === 'function') {
    ReflectApply(handler, this, args);
  } else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i) ReflectApply(listeners[i], this, args);
  }
  return true;
};
function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;
  checkListener(listener);
  events = target._events;
  if (events === undefined) {
    events = target._events = Object.create(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener !== undefined) {
      target.emit('newListener', type, listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }
  if (existing === undefined) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] = prepend ? [listener, existing] : [existing, listener];
      // If we've already got an array, just append.
    } else if (prepend) {
      existing.unshift(listener);
    } else {
      existing.push(listener);
    }

    // Check for listener leak
    m = _getMaxListeners(target);
    if (m > 0 && existing.length > m && !existing.warned) {
      existing.warned = true;
      // No error code for this since it is a Warning
      // eslint-disable-next-line no-restricted-syntax
      var w = new Error('Possible EventEmitter memory leak detected. ' + existing.length + ' ' + String(type) + ' listeners ' + 'added. Use emitter.setMaxListeners() to ' + 'increase limit');
      w.name = 'MaxListenersExceededWarning';
      w.emitter = target;
      w.type = type;
      w.count = existing.length;
      ProcessEmitWarning(w);
    }
  }
  return target;
}
EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};
EventEmitter.prototype.on = EventEmitter.prototype.addListener;
EventEmitter.prototype.prependListener = function prependListener(type, listener) {
  return _addListener(this, type, listener, true);
};
function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    if (arguments.length === 0) return this.listener.call(this.target);
    return this.listener.apply(this.target, arguments);
  }
}
function _onceWrap(target, type, listener) {
  var state = {
    fired: false,
    wrapFn: undefined,
    target: target,
    type: type,
    listener: listener
  };
  var wrapped = onceWrapper.bind(state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}
EventEmitter.prototype.once = function once(type, listener) {
  checkListener(listener);
  this.on(type, _onceWrap(this, type, listener));
  return this;
};
EventEmitter.prototype.prependOnceListener = function prependOnceListener(type, listener) {
  checkListener(listener);
  this.prependListener(type, _onceWrap(this, type, listener));
  return this;
};

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener = function removeListener(type, listener) {
  var list, events, position, i, originalListener;
  checkListener(listener);
  events = this._events;
  if (events === undefined) return this;
  list = events[type];
  if (list === undefined) return this;
  if (list === listener || list.listener === listener) {
    if (--this._eventsCount === 0) this._events = Object.create(null);else {
      delete events[type];
      if (events.removeListener) this.emit('removeListener', type, list.listener || listener);
    }
  } else if (typeof list !== 'function') {
    position = -1;
    for (i = list.length - 1; i >= 0; i--) {
      if (list[i] === listener || list[i].listener === listener) {
        originalListener = list[i].listener;
        position = i;
        break;
      }
    }
    if (position < 0) return this;
    if (position === 0) list.shift();else {
      spliceOne(list, position);
    }
    if (list.length === 1) events[type] = list[0];
    if (events.removeListener !== undefined) this.emit('removeListener', type, originalListener || listener);
  }
  return this;
};
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.removeAllListeners = function removeAllListeners(type) {
  var listeners, events, i;
  events = this._events;
  if (events === undefined) return this;

  // not listening for removeListener, no need to emit
  if (events.removeListener === undefined) {
    if (arguments.length === 0) {
      this._events = Object.create(null);
      this._eventsCount = 0;
    } else if (events[type] !== undefined) {
      if (--this._eventsCount === 0) this._events = Object.create(null);else delete events[type];
    }
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    var keys = Object.keys(events);
    var key;
    for (i = 0; i < keys.length; ++i) {
      key = keys[i];
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = Object.create(null);
    this._eventsCount = 0;
    return this;
  }
  listeners = events[type];
  if (typeof listeners === 'function') {
    this.removeListener(type, listeners);
  } else if (listeners !== undefined) {
    // LIFO order
    for (i = listeners.length - 1; i >= 0; i--) {
      this.removeListener(type, listeners[i]);
    }
  }
  return this;
};
function _listeners(target, type, unwrap) {
  var events = target._events;
  if (events === undefined) return [];
  var evlistener = events[type];
  if (evlistener === undefined) return [];
  if (typeof evlistener === 'function') return unwrap ? [evlistener.listener || evlistener] : [evlistener];
  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}
EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};
EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};
EventEmitter.listenerCount = function (emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};
EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;
  if (events !== undefined) {
    var evlistener = events[type];
    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener !== undefined) {
      return evlistener.length;
    }
  }
  return 0;
}
EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
};
function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i) copy[i] = arr[i];
  return copy;
}
function spliceOne(list, index) {
  for (; index + 1 < list.length; index++) list[index] = list[index + 1];
  list.pop();
}
function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}
function once(emitter, name) {
  return new Promise(function (resolve, reject) {
    function errorListener(err) {
      emitter.removeListener(name, resolver);
      reject(err);
    }
    function resolver() {
      if (typeof emitter.removeListener === 'function') {
        emitter.removeListener('error', errorListener);
      }
      resolve([].slice.call(arguments));
    }
    eventTargetAgnosticAddListener(emitter, name, resolver, {
      once: true
    });
    if (name !== 'error') {
      addErrorHandlerIfEventEmitter(emitter, errorListener, {
        once: true
      });
    }
  });
}
function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
  if (typeof emitter.on === 'function') {
    eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
  }
}
function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
  if (typeof emitter.on === 'function') {
    if (flags.once) {
      emitter.once(name, listener);
    } else {
      emitter.on(name, listener);
    }
  } else if (typeof emitter.addEventListener === 'function') {
    // EventTarget does not have `error` event semantics like Node
    // EventEmitters, we do not listen for `error` events here.
    emitter.addEventListener(name, function wrapListener(arg) {
      // IE does not have builtin `{ once: true }` support so we
      // have to do it manually.
      if (flags.once) {
        emitter.removeEventListener(name, wrapListener);
      }
      listener(arg);
    });
  } else {
    throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
  }
}
var eventsExports = events.exports;

/*
 *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* eslint-env node */

let logDisabled_ = true;
let deprecationWarnings_ = true;

/**
 * Extract browser version out of the provided user agent string.
 *
 * @param {!string} uastring userAgent string.
 * @param {!string} expr Regular expression used as match criteria.
 * @param {!number} pos position in the version string to be returned.
 * @return {!number} browser version.
 */
function extractVersion(uastring, expr, pos) {
  const match = uastring.match(expr);
  return match && match.length >= pos && parseInt(match[pos], 10);
}

// Wraps the peerconnection event eventNameToWrap in a function
// which returns the modified event object (or false to prevent
// the event).
function wrapPeerConnectionEvent(window, eventNameToWrap, wrapper) {
  if (!window.RTCPeerConnection) {
    return;
  }
  const proto = window.RTCPeerConnection.prototype;
  const nativeAddEventListener = proto.addEventListener;
  proto.addEventListener = function (nativeEventName, cb) {
    if (nativeEventName !== eventNameToWrap) {
      return nativeAddEventListener.apply(this, arguments);
    }
    const wrappedCallback = e => {
      const modifiedEvent = wrapper(e);
      if (modifiedEvent) {
        if (cb.handleEvent) {
          cb.handleEvent(modifiedEvent);
        } else {
          cb(modifiedEvent);
        }
      }
    };
    this._eventMap = this._eventMap || {};
    if (!this._eventMap[eventNameToWrap]) {
      this._eventMap[eventNameToWrap] = new Map();
    }
    this._eventMap[eventNameToWrap].set(cb, wrappedCallback);
    return nativeAddEventListener.apply(this, [nativeEventName, wrappedCallback]);
  };
  const nativeRemoveEventListener = proto.removeEventListener;
  proto.removeEventListener = function (nativeEventName, cb) {
    if (nativeEventName !== eventNameToWrap || !this._eventMap || !this._eventMap[eventNameToWrap]) {
      return nativeRemoveEventListener.apply(this, arguments);
    }
    if (!this._eventMap[eventNameToWrap].has(cb)) {
      return nativeRemoveEventListener.apply(this, arguments);
    }
    const unwrappedCb = this._eventMap[eventNameToWrap].get(cb);
    this._eventMap[eventNameToWrap].delete(cb);
    if (this._eventMap[eventNameToWrap].size === 0) {
      delete this._eventMap[eventNameToWrap];
    }
    if (Object.keys(this._eventMap).length === 0) {
      delete this._eventMap;
    }
    return nativeRemoveEventListener.apply(this, [nativeEventName, unwrappedCb]);
  };
  Object.defineProperty(proto, 'on' + eventNameToWrap, {
    get() {
      return this['_on' + eventNameToWrap];
    },
    set(cb) {
      if (this['_on' + eventNameToWrap]) {
        this.removeEventListener(eventNameToWrap, this['_on' + eventNameToWrap]);
        delete this['_on' + eventNameToWrap];
      }
      if (cb) {
        this.addEventListener(eventNameToWrap, this['_on' + eventNameToWrap] = cb);
      }
    },
    enumerable: true,
    configurable: true
  });
}
function disableLog(bool) {
  if (typeof bool !== 'boolean') {
    return new Error('Argument type: ' + typeof bool + '. Please use a boolean.');
  }
  logDisabled_ = bool;
  return bool ? 'adapter.js logging disabled' : 'adapter.js logging enabled';
}

/**
 * Disable or enable deprecation warnings
 * @param {!boolean} bool set to true to disable warnings.
 */
function disableWarnings(bool) {
  if (typeof bool !== 'boolean') {
    return new Error('Argument type: ' + typeof bool + '. Please use a boolean.');
  }
  deprecationWarnings_ = !bool;
  return 'adapter.js deprecation warnings ' + (bool ? 'disabled' : 'enabled');
}
function log() {
  if (typeof window === 'object') {
    if (logDisabled_) {
      return;
    }
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log.apply(console, arguments);
    }
  }
}

/**
 * Shows a deprecation warning suggesting the modern and spec-compatible API.
 */
function deprecated(oldMethod, newMethod) {
  if (!deprecationWarnings_) {
    return;
  }
  console.warn(oldMethod + ' is deprecated, please use ' + newMethod + ' instead.');
}

/**
 * Browser detector.
 *
 * @return {object} result containing browser and version
 *     properties.
 */
function detectBrowser(window) {
  // Returned result object.
  const result = {
    browser: null,
    version: null
  };

  // Fail early if it's not a browser
  if (typeof window === 'undefined' || !window.navigator || !window.navigator.userAgent) {
    result.browser = 'Not a browser.';
    return result;
  }
  const {
    navigator
  } = window;
  if (navigator.mozGetUserMedia) {
    // Firefox.
    result.browser = 'firefox';
    result.version = extractVersion(navigator.userAgent, /Firefox\/(\d+)\./, 1);
  } else if (navigator.webkitGetUserMedia || window.isSecureContext === false && window.webkitRTCPeerConnection) {
    // Chrome, Chromium, Webview, Opera.
    // Version matches Chrome/WebRTC version.
    // Chrome 74 removed webkitGetUserMedia on http as well so we need the
    // more complicated fallback to webkitRTCPeerConnection.
    result.browser = 'chrome';
    result.version = extractVersion(navigator.userAgent, /Chrom(e|ium)\/(\d+)\./, 2);
  } else if (window.RTCPeerConnection && navigator.userAgent.match(/AppleWebKit\/(\d+)\./)) {
    // Safari.
    result.browser = 'safari';
    result.version = extractVersion(navigator.userAgent, /AppleWebKit\/(\d+)\./, 1);
    result.supportsUnifiedPlan = window.RTCRtpTransceiver && 'currentDirection' in window.RTCRtpTransceiver.prototype;
  } else {
    // Default fallthrough: not supported.
    result.browser = 'Not a supported browser.';
    return result;
  }
  return result;
}

/**
 * Checks if something is an object.
 *
 * @param {*} val The something you want to check.
 * @return true if val is an object, false otherwise.
 */
function isObject(val) {
  return Object.prototype.toString.call(val) === '[object Object]';
}

/**
 * Remove all empty objects and undefined values
 * from a nested object -- an enhanced and vanilla version
 * of Lodash's `compact`.
 */
function compactObject(data) {
  if (!isObject(data)) {
    return data;
  }
  return Object.keys(data).reduce(function (accumulator, key) {
    const isObj = isObject(data[key]);
    const value = isObj ? compactObject(data[key]) : data[key];
    const isEmptyObject = isObj && !Object.keys(value).length;
    if (value === undefined || isEmptyObject) {
      return accumulator;
    }
    return Object.assign(accumulator, {
      [key]: value
    });
  }, {});
}

/* iterates the stats graph recursively. */
function walkStats(stats, base, resultSet) {
  if (!base || resultSet.has(base.id)) {
    return;
  }
  resultSet.set(base.id, base);
  Object.keys(base).forEach(name => {
    if (name.endsWith('Id')) {
      walkStats(stats, stats.get(base[name]), resultSet);
    } else if (name.endsWith('Ids')) {
      base[name].forEach(id => {
        walkStats(stats, stats.get(id), resultSet);
      });
    }
  });
}

/* filter getStats for a sender/receiver track. */
function filterStats(result, track, outbound) {
  const streamStatsType = outbound ? 'outbound-rtp' : 'inbound-rtp';
  const filteredResult = new Map();
  if (track === null) {
    return filteredResult;
  }
  const trackStats = [];
  result.forEach(value => {
    if (value.type === 'track' && value.trackIdentifier === track.id) {
      trackStats.push(value);
    }
  });
  trackStats.forEach(trackStat => {
    result.forEach(stats => {
      if (stats.type === streamStatsType && stats.trackId === trackStat.id) {
        walkStats(result, stats, filteredResult);
      }
    });
  });
  return filteredResult;
}

/*
 *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* eslint-env node */
const logging = log;
function shimGetUserMedia$2(window, browserDetails) {
  const navigator = window && window.navigator;
  if (!navigator.mediaDevices) {
    return;
  }
  const constraintsToChrome_ = function (c) {
    if (typeof c !== 'object' || c.mandatory || c.optional) {
      return c;
    }
    const cc = {};
    Object.keys(c).forEach(key => {
      if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
        return;
      }
      const r = typeof c[key] === 'object' ? c[key] : {
        ideal: c[key]
      };
      if (r.exact !== undefined && typeof r.exact === 'number') {
        r.min = r.max = r.exact;
      }
      const oldname_ = function (prefix, name) {
        if (prefix) {
          return prefix + name.charAt(0).toUpperCase() + name.slice(1);
        }
        return name === 'deviceId' ? 'sourceId' : name;
      };
      if (r.ideal !== undefined) {
        cc.optional = cc.optional || [];
        let oc = {};
        if (typeof r.ideal === 'number') {
          oc[oldname_('min', key)] = r.ideal;
          cc.optional.push(oc);
          oc = {};
          oc[oldname_('max', key)] = r.ideal;
          cc.optional.push(oc);
        } else {
          oc[oldname_('', key)] = r.ideal;
          cc.optional.push(oc);
        }
      }
      if (r.exact !== undefined && typeof r.exact !== 'number') {
        cc.mandatory = cc.mandatory || {};
        cc.mandatory[oldname_('', key)] = r.exact;
      } else {
        ['min', 'max'].forEach(mix => {
          if (r[mix] !== undefined) {
            cc.mandatory = cc.mandatory || {};
            cc.mandatory[oldname_(mix, key)] = r[mix];
          }
        });
      }
    });
    if (c.advanced) {
      cc.optional = (cc.optional || []).concat(c.advanced);
    }
    return cc;
  };
  const shimConstraints_ = function (constraints, func) {
    if (browserDetails.version >= 61) {
      return func(constraints);
    }
    constraints = JSON.parse(JSON.stringify(constraints));
    if (constraints && typeof constraints.audio === 'object') {
      const remap = function (obj, a, b) {
        if (a in obj && !(b in obj)) {
          obj[b] = obj[a];
          delete obj[a];
        }
      };
      constraints = JSON.parse(JSON.stringify(constraints));
      remap(constraints.audio, 'autoGainControl', 'googAutoGainControl');
      remap(constraints.audio, 'noiseSuppression', 'googNoiseSuppression');
      constraints.audio = constraintsToChrome_(constraints.audio);
    }
    if (constraints && typeof constraints.video === 'object') {
      // Shim facingMode for mobile & surface pro.
      let face = constraints.video.facingMode;
      face = face && (typeof face === 'object' ? face : {
        ideal: face
      });
      const getSupportedFacingModeLies = browserDetails.version < 66;
      if (face && (face.exact === 'user' || face.exact === 'environment' || face.ideal === 'user' || face.ideal === 'environment') && !(navigator.mediaDevices.getSupportedConstraints && navigator.mediaDevices.getSupportedConstraints().facingMode && !getSupportedFacingModeLies)) {
        delete constraints.video.facingMode;
        let matches;
        if (face.exact === 'environment' || face.ideal === 'environment') {
          matches = ['back', 'rear'];
        } else if (face.exact === 'user' || face.ideal === 'user') {
          matches = ['front'];
        }
        if (matches) {
          // Look for matches in label, or use last cam for back (typical).
          return navigator.mediaDevices.enumerateDevices().then(devices => {
            devices = devices.filter(d => d.kind === 'videoinput');
            let dev = devices.find(d => matches.some(match => d.label.toLowerCase().includes(match)));
            if (!dev && devices.length && matches.includes('back')) {
              dev = devices[devices.length - 1]; // more likely the back cam
            }

            if (dev) {
              constraints.video.deviceId = face.exact ? {
                exact: dev.deviceId
              } : {
                ideal: dev.deviceId
              };
            }
            constraints.video = constraintsToChrome_(constraints.video);
            logging('chrome: ' + JSON.stringify(constraints));
            return func(constraints);
          });
        }
      }
      constraints.video = constraintsToChrome_(constraints.video);
    }
    logging('chrome: ' + JSON.stringify(constraints));
    return func(constraints);
  };
  const shimError_ = function (e) {
    if (browserDetails.version >= 64) {
      return e;
    }
    return {
      name: {
        PermissionDeniedError: 'NotAllowedError',
        PermissionDismissedError: 'NotAllowedError',
        InvalidStateError: 'NotAllowedError',
        DevicesNotFoundError: 'NotFoundError',
        ConstraintNotSatisfiedError: 'OverconstrainedError',
        TrackStartError: 'NotReadableError',
        MediaDeviceFailedDueToShutdown: 'NotAllowedError',
        MediaDeviceKillSwitchOn: 'NotAllowedError',
        TabCaptureError: 'AbortError',
        ScreenCaptureError: 'AbortError',
        DeviceCaptureError: 'AbortError'
      }[e.name] || e.name,
      message: e.message,
      constraint: e.constraint || e.constraintName,
      toString() {
        return this.name + (this.message && ': ') + this.message;
      }
    };
  };
  const getUserMedia_ = function (constraints, onSuccess, onError) {
    shimConstraints_(constraints, c => {
      navigator.webkitGetUserMedia(c, onSuccess, e => {
        if (onError) {
          onError(shimError_(e));
        }
      });
    });
  };
  navigator.getUserMedia = getUserMedia_.bind(navigator);

  // Even though Chrome 45 has navigator.mediaDevices and a getUserMedia
  // function which returns a Promise, it does not accept spec-style
  // constraints.
  if (navigator.mediaDevices.getUserMedia) {
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (cs) {
      return shimConstraints_(cs, c => origGetUserMedia(c).then(stream => {
        if (c.audio && !stream.getAudioTracks().length || c.video && !stream.getVideoTracks().length) {
          stream.getTracks().forEach(track => {
            track.stop();
          });
          throw new DOMException('', 'NotFoundError');
        }
        return stream;
      }, e => Promise.reject(shimError_(e))));
    };
  }
}

/*
 *  Copyright (c) 2018 The adapter.js project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* eslint-env node */

function shimGetDisplayMedia$1(window, getSourceId) {
  if (window.navigator.mediaDevices && 'getDisplayMedia' in window.navigator.mediaDevices) {
    return;
  }
  if (!window.navigator.mediaDevices) {
    return;
  }
  // getSourceId is a function that returns a promise resolving with
  // the sourceId of the screen/window/tab to be shared.
  if (typeof getSourceId !== 'function') {
    console.error('shimGetDisplayMedia: getSourceId argument is not ' + 'a function');
    return;
  }
  window.navigator.mediaDevices.getDisplayMedia = function getDisplayMedia(constraints) {
    return getSourceId(constraints).then(sourceId => {
      const widthSpecified = constraints.video && constraints.video.width;
      const heightSpecified = constraints.video && constraints.video.height;
      const frameRateSpecified = constraints.video && constraints.video.frameRate;
      constraints.video = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxFrameRate: frameRateSpecified || 3
        }
      };
      if (widthSpecified) {
        constraints.video.mandatory.maxWidth = widthSpecified;
      }
      if (heightSpecified) {
        constraints.video.mandatory.maxHeight = heightSpecified;
      }
      return window.navigator.mediaDevices.getUserMedia(constraints);
    });
  };
}

/*
 *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* eslint-env node */
function shimMediaStream(window) {
  window.MediaStream = window.MediaStream || window.webkitMediaStream;
}
function shimOnTrack$1(window) {
  if (typeof window === 'object' && window.RTCPeerConnection && !('ontrack' in window.RTCPeerConnection.prototype)) {
    Object.defineProperty(window.RTCPeerConnection.prototype, 'ontrack', {
      get() {
        return this._ontrack;
      },
      set(f) {
        if (this._ontrack) {
          this.removeEventListener('track', this._ontrack);
        }
        this.addEventListener('track', this._ontrack = f);
      },
      enumerable: true,
      configurable: true
    });
    const origSetRemoteDescription = window.RTCPeerConnection.prototype.setRemoteDescription;
    window.RTCPeerConnection.prototype.setRemoteDescription = function setRemoteDescription() {
      if (!this._ontrackpoly) {
        this._ontrackpoly = e => {
          // onaddstream does not fire when a track is added to an existing
          // stream. But stream.onaddtrack is implemented so we use that.
          e.stream.addEventListener('addtrack', te => {
            let receiver;
            if (window.RTCPeerConnection.prototype.getReceivers) {
              receiver = this.getReceivers().find(r => r.track && r.track.id === te.track.id);
            } else {
              receiver = {
                track: te.track
              };
            }
            const event = new Event('track');
            event.track = te.track;
            event.receiver = receiver;
            event.transceiver = {
              receiver
            };
            event.streams = [e.stream];
            this.dispatchEvent(event);
          });
          e.stream.getTracks().forEach(track => {
            let receiver;
            if (window.RTCPeerConnection.prototype.getReceivers) {
              receiver = this.getReceivers().find(r => r.track && r.track.id === track.id);
            } else {
              receiver = {
                track
              };
            }
            const event = new Event('track');
            event.track = track;
            event.receiver = receiver;
            event.transceiver = {
              receiver
            };
            event.streams = [e.stream];
            this.dispatchEvent(event);
          });
        };
        this.addEventListener('addstream', this._ontrackpoly);
      }
      return origSetRemoteDescription.apply(this, arguments);
    };
  } else {
    // even if RTCRtpTransceiver is in window, it is only used and
    // emitted in unified-plan. Unfortunately this means we need
    // to unconditionally wrap the event.
    wrapPeerConnectionEvent(window, 'track', e => {
      if (!e.transceiver) {
        Object.defineProperty(e, 'transceiver', {
          value: {
            receiver: e.receiver
          }
        });
      }
      return e;
    });
  }
}
function shimGetSendersWithDtmf(window) {
  // Overrides addTrack/removeTrack, depends on shimAddTrackRemoveTrack.
  if (typeof window === 'object' && window.RTCPeerConnection && !('getSenders' in window.RTCPeerConnection.prototype) && 'createDTMFSender' in window.RTCPeerConnection.prototype) {
    const shimSenderWithDtmf = function (pc, track) {
      return {
        track,
        get dtmf() {
          if (this._dtmf === undefined) {
            if (track.kind === 'audio') {
              this._dtmf = pc.createDTMFSender(track);
            } else {
              this._dtmf = null;
            }
          }
          return this._dtmf;
        },
        _pc: pc
      };
    };

    // augment addTrack when getSenders is not available.
    if (!window.RTCPeerConnection.prototype.getSenders) {
      window.RTCPeerConnection.prototype.getSenders = function getSenders() {
        this._senders = this._senders || [];
        return this._senders.slice(); // return a copy of the internal state.
      };

      const origAddTrack = window.RTCPeerConnection.prototype.addTrack;
      window.RTCPeerConnection.prototype.addTrack = function addTrack(track, stream) {
        let sender = origAddTrack.apply(this, arguments);
        if (!sender) {
          sender = shimSenderWithDtmf(this, track);
          this._senders.push(sender);
        }
        return sender;
      };
      const origRemoveTrack = window.RTCPeerConnection.prototype.removeTrack;
      window.RTCPeerConnection.prototype.removeTrack = function removeTrack(sender) {
        origRemoveTrack.apply(this, arguments);
        const idx = this._senders.indexOf(sender);
        if (idx !== -1) {
          this._senders.splice(idx, 1);
        }
      };
    }
    const origAddStream = window.RTCPeerConnection.prototype.addStream;
    window.RTCPeerConnection.prototype.addStream = function addStream(stream) {
      this._senders = this._senders || [];
      origAddStream.apply(this, [stream]);
      stream.getTracks().forEach(track => {
        this._senders.push(shimSenderWithDtmf(this, track));
      });
    };
    const origRemoveStream = window.RTCPeerConnection.prototype.removeStream;
    window.RTCPeerConnection.prototype.removeStream = function removeStream(stream) {
      this._senders = this._senders || [];
      origRemoveStream.apply(this, [stream]);
      stream.getTracks().forEach(track => {
        const sender = this._senders.find(s => s.track === track);
        if (sender) {
          // remove sender
          this._senders.splice(this._senders.indexOf(sender), 1);
        }
      });
    };
  } else if (typeof window === 'object' && window.RTCPeerConnection && 'getSenders' in window.RTCPeerConnection.prototype && 'createDTMFSender' in window.RTCPeerConnection.prototype && window.RTCRtpSender && !('dtmf' in window.RTCRtpSender.prototype)) {
    const origGetSenders = window.RTCPeerConnection.prototype.getSenders;
    window.RTCPeerConnection.prototype.getSenders = function getSenders() {
      const senders = origGetSenders.apply(this, []);
      senders.forEach(sender => sender._pc = this);
      return senders;
    };
    Object.defineProperty(window.RTCRtpSender.prototype, 'dtmf', {
      get() {
        if (this._dtmf === undefined) {
          if (this.track.kind === 'audio') {
            this._dtmf = this._pc.createDTMFSender(this.track);
          } else {
            this._dtmf = null;
          }
        }
        return this._dtmf;
      }
    });
  }
}
function shimGetStats(window) {
  if (!window.RTCPeerConnection) {
    return;
  }
  const origGetStats = window.RTCPeerConnection.prototype.getStats;
  window.RTCPeerConnection.prototype.getStats = function getStats() {
    const [selector, onSucc, onErr] = arguments;

    // If selector is a function then we are in the old style stats so just
    // pass back the original getStats format to avoid breaking old users.
    if (arguments.length > 0 && typeof selector === 'function') {
      return origGetStats.apply(this, arguments);
    }

    // When spec-style getStats is supported, return those when called with
    // either no arguments or the selector argument is null.
    if (origGetStats.length === 0 && (arguments.length === 0 || typeof selector !== 'function')) {
      return origGetStats.apply(this, []);
    }
    const fixChromeStats_ = function (response) {
      const standardReport = {};
      const reports = response.result();
      reports.forEach(report => {
        const standardStats = {
          id: report.id,
          timestamp: report.timestamp,
          type: {
            localcandidate: 'local-candidate',
            remotecandidate: 'remote-candidate'
          }[report.type] || report.type
        };
        report.names().forEach(name => {
          standardStats[name] = report.stat(name);
        });
        standardReport[standardStats.id] = standardStats;
      });
      return standardReport;
    };

    // shim getStats with maplike support
    const makeMapStats = function (stats) {
      return new Map(Object.keys(stats).map(key => [key, stats[key]]));
    };
    if (arguments.length >= 2) {
      const successCallbackWrapper_ = function (response) {
        onSucc(makeMapStats(fixChromeStats_(response)));
      };
      return origGetStats.apply(this, [successCallbackWrapper_, selector]);
    }

    // promise-support
    return new Promise((resolve, reject) => {
      origGetStats.apply(this, [function (response) {
        resolve(makeMapStats(fixChromeStats_(response)));
      }, reject]);
    }).then(onSucc, onErr);
  };
}
function shimSenderReceiverGetStats(window) {
  if (!(typeof window === 'object' && window.RTCPeerConnection && window.RTCRtpSender && window.RTCRtpReceiver)) {
    return;
  }

  // shim sender stats.
  if (!('getStats' in window.RTCRtpSender.prototype)) {
    const origGetSenders = window.RTCPeerConnection.prototype.getSenders;
    if (origGetSenders) {
      window.RTCPeerConnection.prototype.getSenders = function getSenders() {
        const senders = origGetSenders.apply(this, []);
        senders.forEach(sender => sender._pc = this);
        return senders;
      };
    }
    const origAddTrack = window.RTCPeerConnection.prototype.addTrack;
    if (origAddTrack) {
      window.RTCPeerConnection.prototype.addTrack = function addTrack() {
        const sender = origAddTrack.apply(this, arguments);
        sender._pc = this;
        return sender;
      };
    }
    window.RTCRtpSender.prototype.getStats = function getStats() {
      const sender = this;
      return this._pc.getStats().then(result =>
      /* Note: this will include stats of all senders that
       *   send a track with the same id as sender.track as
       *   it is not possible to identify the RTCRtpSender.
       */
      filterStats(result, sender.track, true));
    };
  }

  // shim receiver stats.
  if (!('getStats' in window.RTCRtpReceiver.prototype)) {
    const origGetReceivers = window.RTCPeerConnection.prototype.getReceivers;
    if (origGetReceivers) {
      window.RTCPeerConnection.prototype.getReceivers = function getReceivers() {
        const receivers = origGetReceivers.apply(this, []);
        receivers.forEach(receiver => receiver._pc = this);
        return receivers;
      };
    }
    wrapPeerConnectionEvent(window, 'track', e => {
      e.receiver._pc = e.srcElement;
      return e;
    });
    window.RTCRtpReceiver.prototype.getStats = function getStats() {
      const receiver = this;
      return this._pc.getStats().then(result => filterStats(result, receiver.track, false));
    };
  }
  if (!('getStats' in window.RTCRtpSender.prototype && 'getStats' in window.RTCRtpReceiver.prototype)) {
    return;
  }

  // shim RTCPeerConnection.getStats(track).
  const origGetStats = window.RTCPeerConnection.prototype.getStats;
  window.RTCPeerConnection.prototype.getStats = function getStats() {
    if (arguments.length > 0 && arguments[0] instanceof window.MediaStreamTrack) {
      const track = arguments[0];
      let sender;
      let receiver;
      let err;
      this.getSenders().forEach(s => {
        if (s.track === track) {
          if (sender) {
            err = true;
          } else {
            sender = s;
          }
        }
      });
      this.getReceivers().forEach(r => {
        if (r.track === track) {
          if (receiver) {
            err = true;
          } else {
            receiver = r;
          }
        }
        return r.track === track;
      });
      if (err || sender && receiver) {
        return Promise.reject(new DOMException('There are more than one sender or receiver for the track.', 'InvalidAccessError'));
      } else if (sender) {
        return sender.getStats();
      } else if (receiver) {
        return receiver.getStats();
      }
      return Promise.reject(new DOMException('There is no sender or receiver for the track.', 'InvalidAccessError'));
    }
    return origGetStats.apply(this, arguments);
  };
}
function shimAddTrackRemoveTrackWithNative(window) {
  // shim addTrack/removeTrack with native variants in order to make
  // the interactions with legacy getLocalStreams behave as in other browsers.
  // Keeps a mapping stream.id => [stream, rtpsenders...]
  window.RTCPeerConnection.prototype.getLocalStreams = function getLocalStreams() {
    this._shimmedLocalStreams = this._shimmedLocalStreams || {};
    return Object.keys(this._shimmedLocalStreams).map(streamId => this._shimmedLocalStreams[streamId][0]);
  };
  const origAddTrack = window.RTCPeerConnection.prototype.addTrack;
  window.RTCPeerConnection.prototype.addTrack = function addTrack(track, stream) {
    if (!stream) {
      return origAddTrack.apply(this, arguments);
    }
    this._shimmedLocalStreams = this._shimmedLocalStreams || {};
    const sender = origAddTrack.apply(this, arguments);
    if (!this._shimmedLocalStreams[stream.id]) {
      this._shimmedLocalStreams[stream.id] = [stream, sender];
    } else if (this._shimmedLocalStreams[stream.id].indexOf(sender) === -1) {
      this._shimmedLocalStreams[stream.id].push(sender);
    }
    return sender;
  };
  const origAddStream = window.RTCPeerConnection.prototype.addStream;
  window.RTCPeerConnection.prototype.addStream = function addStream(stream) {
    this._shimmedLocalStreams = this._shimmedLocalStreams || {};
    stream.getTracks().forEach(track => {
      const alreadyExists = this.getSenders().find(s => s.track === track);
      if (alreadyExists) {
        throw new DOMException('Track already exists.', 'InvalidAccessError');
      }
    });
    const existingSenders = this.getSenders();
    origAddStream.apply(this, arguments);
    const newSenders = this.getSenders().filter(newSender => existingSenders.indexOf(newSender) === -1);
    this._shimmedLocalStreams[stream.id] = [stream].concat(newSenders);
  };
  const origRemoveStream = window.RTCPeerConnection.prototype.removeStream;
  window.RTCPeerConnection.prototype.removeStream = function removeStream(stream) {
    this._shimmedLocalStreams = this._shimmedLocalStreams || {};
    delete this._shimmedLocalStreams[stream.id];
    return origRemoveStream.apply(this, arguments);
  };
  const origRemoveTrack = window.RTCPeerConnection.prototype.removeTrack;
  window.RTCPeerConnection.prototype.removeTrack = function removeTrack(sender) {
    this._shimmedLocalStreams = this._shimmedLocalStreams || {};
    if (sender) {
      Object.keys(this._shimmedLocalStreams).forEach(streamId => {
        const idx = this._shimmedLocalStreams[streamId].indexOf(sender);
        if (idx !== -1) {
          this._shimmedLocalStreams[streamId].splice(idx, 1);
        }
        if (this._shimmedLocalStreams[streamId].length === 1) {
          delete this._shimmedLocalStreams[streamId];
        }
      });
    }
    return origRemoveTrack.apply(this, arguments);
  };
}
function shimAddTrackRemoveTrack(window, browserDetails) {
  if (!window.RTCPeerConnection) {
    return;
  }
  // shim addTrack and removeTrack.
  if (window.RTCPeerConnection.prototype.addTrack && browserDetails.version >= 65) {
    return shimAddTrackRemoveTrackWithNative(window);
  }

  // also shim pc.getLocalStreams when addTrack is shimmed
  // to return the original streams.
  const origGetLocalStreams = window.RTCPeerConnection.prototype.getLocalStreams;
  window.RTCPeerConnection.prototype.getLocalStreams = function getLocalStreams() {
    const nativeStreams = origGetLocalStreams.apply(this);
    this._reverseStreams = this._reverseStreams || {};
    return nativeStreams.map(stream => this._reverseStreams[stream.id]);
  };
  const origAddStream = window.RTCPeerConnection.prototype.addStream;
  window.RTCPeerConnection.prototype.addStream = function addStream(stream) {
    this._streams = this._streams || {};
    this._reverseStreams = this._reverseStreams || {};
    stream.getTracks().forEach(track => {
      const alreadyExists = this.getSenders().find(s => s.track === track);
      if (alreadyExists) {
        throw new DOMException('Track already exists.', 'InvalidAccessError');
      }
    });
    // Add identity mapping for consistency with addTrack.
    // Unless this is being used with a stream from addTrack.
    if (!this._reverseStreams[stream.id]) {
      const newStream = new window.MediaStream(stream.getTracks());
      this._streams[stream.id] = newStream;
      this._reverseStreams[newStream.id] = stream;
      stream = newStream;
    }
    origAddStream.apply(this, [stream]);
  };
  const origRemoveStream = window.RTCPeerConnection.prototype.removeStream;
  window.RTCPeerConnection.prototype.removeStream = function removeStream(stream) {
    this._streams = this._streams || {};
    this._reverseStreams = this._reverseStreams || {};
    origRemoveStream.apply(this, [this._streams[stream.id] || stream]);
    delete this._reverseStreams[this._streams[stream.id] ? this._streams[stream.id].id : stream.id];
    delete this._streams[stream.id];
  };
  window.RTCPeerConnection.prototype.addTrack = function addTrack(track, stream) {
    if (this.signalingState === 'closed') {
      throw new DOMException('The RTCPeerConnection\'s signalingState is \'closed\'.', 'InvalidStateError');
    }
    const streams = [].slice.call(arguments, 1);
    if (streams.length !== 1 || !streams[0].getTracks().find(t => t === track)) {
      // this is not fully correct but all we can manage without
      // [[associated MediaStreams]] internal slot.
      throw new DOMException('The adapter.js addTrack polyfill only supports a single ' + ' stream which is associated with the specified track.', 'NotSupportedError');
    }
    const alreadyExists = this.getSenders().find(s => s.track === track);
    if (alreadyExists) {
      throw new DOMException('Track already exists.', 'InvalidAccessError');
    }
    this._streams = this._streams || {};
    this._reverseStreams = this._reverseStreams || {};
    const oldStream = this._streams[stream.id];
    if (oldStream) {
      // this is using odd Chrome behaviour, use with caution:
      // https://bugs.chromium.org/p/webrtc/issues/detail?id=7815
      // Note: we rely on the high-level addTrack/dtmf shim to
      // create the sender with a dtmf sender.
      oldStream.addTrack(track);

      // Trigger ONN async.
      Promise.resolve().then(() => {
        this.dispatchEvent(new Event('negotiationneeded'));
      });
    } else {
      const newStream = new window.MediaStream([track]);
      this._streams[stream.id] = newStream;
      this._reverseStreams[newStream.id] = stream;
      this.addStream(newStream);
    }
    return this.getSenders().find(s => s.track === track);
  };

  // replace the internal stream id with the external one and
  // vice versa.
  function replaceInternalStreamId(pc, description) {
    let sdp = description.sdp;
    Object.keys(pc._reverseStreams || []).forEach(internalId => {
      const externalStream = pc._reverseStreams[internalId];
      const internalStream = pc._streams[externalStream.id];
      sdp = sdp.replace(new RegExp(internalStream.id, 'g'), externalStream.id);
    });
    return new RTCSessionDescription({
      type: description.type,
      sdp
    });
  }
  function replaceExternalStreamId(pc, description) {
    let sdp = description.sdp;
    Object.keys(pc._reverseStreams || []).forEach(internalId => {
      const externalStream = pc._reverseStreams[internalId];
      const internalStream = pc._streams[externalStream.id];
      sdp = sdp.replace(new RegExp(externalStream.id, 'g'), internalStream.id);
    });
    return new RTCSessionDescription({
      type: description.type,
      sdp
    });
  }
  ['createOffer', 'createAnswer'].forEach(function (method) {
    const nativeMethod = window.RTCPeerConnection.prototype[method];
    const methodObj = {
      [method]() {
        const args = arguments;
        const isLegacyCall = arguments.length && typeof arguments[0] === 'function';
        if (isLegacyCall) {
          return nativeMethod.apply(this, [description => {
            const desc = replaceInternalStreamId(this, description);
            args[0].apply(null, [desc]);
          }, err => {
            if (args[1]) {
              args[1].apply(null, err);
            }
          }, arguments[2]]);
        }
        return nativeMethod.apply(this, arguments).then(description => replaceInternalStreamId(this, description));
      }
    };
    window.RTCPeerConnection.prototype[method] = methodObj[method];
  });
  const origSetLocalDescription = window.RTCPeerConnection.prototype.setLocalDescription;
  window.RTCPeerConnection.prototype.setLocalDescription = function setLocalDescription() {
    if (!arguments.length || !arguments[0].type) {
      return origSetLocalDescription.apply(this, arguments);
    }
    arguments[0] = replaceExternalStreamId(this, arguments[0]);
    return origSetLocalDescription.apply(this, arguments);
  };

  // TODO: mangle getStats: https://w3c.github.io/webrtc-stats/#dom-rtcmediastreamstats-streamidentifier

  const origLocalDescription = Object.getOwnPropertyDescriptor(window.RTCPeerConnection.prototype, 'localDescription');
  Object.defineProperty(window.RTCPeerConnection.prototype, 'localDescription', {
    get() {
      const description = origLocalDescription.get.apply(this);
      if (description.type === '') {
        return description;
      }
      return replaceInternalStreamId(this, description);
    }
  });
  window.RTCPeerConnection.prototype.removeTrack = function removeTrack(sender) {
    if (this.signalingState === 'closed') {
      throw new DOMException('The RTCPeerConnection\'s signalingState is \'closed\'.', 'InvalidStateError');
    }
    // We can not yet check for sender instanceof RTCRtpSender
    // since we shim RTPSender. So we check if sender._pc is set.
    if (!sender._pc) {
      throw new DOMException('Argument 1 of RTCPeerConnection.removeTrack ' + 'does not implement interface RTCRtpSender.', 'TypeError');
    }
    const isLocal = sender._pc === this;
    if (!isLocal) {
      throw new DOMException('Sender was not created by this connection.', 'InvalidAccessError');
    }

    // Search for the native stream the senders track belongs to.
    this._streams = this._streams || {};
    let stream;
    Object.keys(this._streams).forEach(streamid => {
      const hasTrack = this._streams[streamid].getTracks().find(track => sender.track === track);
      if (hasTrack) {
        stream = this._streams[streamid];
      }
    });
    if (stream) {
      if (stream.getTracks().length === 1) {
        // if this is the last track of the stream, remove the stream. This
        // takes care of any shimmed _senders.
        this.removeStream(this._reverseStreams[stream.id]);
      } else {
        // relying on the same odd chrome behaviour as above.
        stream.removeTrack(sender.track);
      }
      this.dispatchEvent(new Event('negotiationneeded'));
    }
  };
}
function shimPeerConnection$1(window, browserDetails) {
  if (!window.RTCPeerConnection && window.webkitRTCPeerConnection) {
    // very basic support for old versions.
    window.RTCPeerConnection = window.webkitRTCPeerConnection;
  }
  if (!window.RTCPeerConnection) {
    return;
  }

  // shim implicit creation of RTCSessionDescription/RTCIceCandidate
  if (browserDetails.version < 53) {
    ['setLocalDescription', 'setRemoteDescription', 'addIceCandidate'].forEach(function (method) {
      const nativeMethod = window.RTCPeerConnection.prototype[method];
      const methodObj = {
        [method]() {
          arguments[0] = new (method === 'addIceCandidate' ? window.RTCIceCandidate : window.RTCSessionDescription)(arguments[0]);
          return nativeMethod.apply(this, arguments);
        }
      };
      window.RTCPeerConnection.prototype[method] = methodObj[method];
    });
  }
}

// Attempt to fix ONN in plan-b mode.
function fixNegotiationNeeded(window, browserDetails) {
  wrapPeerConnectionEvent(window, 'negotiationneeded', e => {
    const pc = e.target;
    if (browserDetails.version < 72 || pc.getConfiguration && pc.getConfiguration().sdpSemantics === 'plan-b') {
      if (pc.signalingState !== 'stable') {
        return;
      }
    }
    return e;
  });
}

var chromeShim = /*#__PURE__*/Object.freeze({
	__proto__: null,
	fixNegotiationNeeded: fixNegotiationNeeded,
	shimAddTrackRemoveTrack: shimAddTrackRemoveTrack,
	shimAddTrackRemoveTrackWithNative: shimAddTrackRemoveTrackWithNative,
	shimGetDisplayMedia: shimGetDisplayMedia$1,
	shimGetSendersWithDtmf: shimGetSendersWithDtmf,
	shimGetStats: shimGetStats,
	shimGetUserMedia: shimGetUserMedia$2,
	shimMediaStream: shimMediaStream,
	shimOnTrack: shimOnTrack$1,
	shimPeerConnection: shimPeerConnection$1,
	shimSenderReceiverGetStats: shimSenderReceiverGetStats
});

/*
 *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* eslint-env node */
function shimGetUserMedia$1(window, browserDetails) {
  const navigator = window && window.navigator;
  const MediaStreamTrack = window && window.MediaStreamTrack;
  navigator.getUserMedia = function (constraints, onSuccess, onError) {
    // Replace Firefox 44+'s deprecation warning with unprefixed version.
    deprecated('navigator.getUserMedia', 'navigator.mediaDevices.getUserMedia');
    navigator.mediaDevices.getUserMedia(constraints).then(onSuccess, onError);
  };
  if (!(browserDetails.version > 55 && 'autoGainControl' in navigator.mediaDevices.getSupportedConstraints())) {
    const remap = function (obj, a, b) {
      if (a in obj && !(b in obj)) {
        obj[b] = obj[a];
        delete obj[a];
      }
    };
    const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (c) {
      if (typeof c === 'object' && typeof c.audio === 'object') {
        c = JSON.parse(JSON.stringify(c));
        remap(c.audio, 'autoGainControl', 'mozAutoGainControl');
        remap(c.audio, 'noiseSuppression', 'mozNoiseSuppression');
      }
      return nativeGetUserMedia(c);
    };
    if (MediaStreamTrack && MediaStreamTrack.prototype.getSettings) {
      const nativeGetSettings = MediaStreamTrack.prototype.getSettings;
      MediaStreamTrack.prototype.getSettings = function () {
        const obj = nativeGetSettings.apply(this, arguments);
        remap(obj, 'mozAutoGainControl', 'autoGainControl');
        remap(obj, 'mozNoiseSuppression', 'noiseSuppression');
        return obj;
      };
    }
    if (MediaStreamTrack && MediaStreamTrack.prototype.applyConstraints) {
      const nativeApplyConstraints = MediaStreamTrack.prototype.applyConstraints;
      MediaStreamTrack.prototype.applyConstraints = function (c) {
        if (this.kind === 'audio' && typeof c === 'object') {
          c = JSON.parse(JSON.stringify(c));
          remap(c, 'autoGainControl', 'mozAutoGainControl');
          remap(c, 'noiseSuppression', 'mozNoiseSuppression');
        }
        return nativeApplyConstraints.apply(this, [c]);
      };
    }
  }
}

/*
 *  Copyright (c) 2018 The adapter.js project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* eslint-env node */

function shimGetDisplayMedia(window, preferredMediaSource) {
  if (window.navigator.mediaDevices && 'getDisplayMedia' in window.navigator.mediaDevices) {
    return;
  }
  if (!window.navigator.mediaDevices) {
    return;
  }
  window.navigator.mediaDevices.getDisplayMedia = function getDisplayMedia(constraints) {
    if (!(constraints && constraints.video)) {
      const err = new DOMException('getDisplayMedia without video ' + 'constraints is undefined');
      err.name = 'NotFoundError';
      // from https://heycam.github.io/webidl/#idl-DOMException-error-names
      err.code = 8;
      return Promise.reject(err);
    }
    if (constraints.video === true) {
      constraints.video = {
        mediaSource: preferredMediaSource
      };
    } else {
      constraints.video.mediaSource = preferredMediaSource;
    }
    return window.navigator.mediaDevices.getUserMedia(constraints);
  };
}

/*
 *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* eslint-env node */
function shimOnTrack(window) {
  if (typeof window === 'object' && window.RTCTrackEvent && 'receiver' in window.RTCTrackEvent.prototype && !('transceiver' in window.RTCTrackEvent.prototype)) {
    Object.defineProperty(window.RTCTrackEvent.prototype, 'transceiver', {
      get() {
        return {
          receiver: this.receiver
        };
      }
    });
  }
}
function shimPeerConnection(window, browserDetails) {
  if (typeof window !== 'object' || !(window.RTCPeerConnection || window.mozRTCPeerConnection)) {
    return; // probably media.peerconnection.enabled=false in about:config
  }

  if (!window.RTCPeerConnection && window.mozRTCPeerConnection) {
    // very basic support for old versions.
    window.RTCPeerConnection = window.mozRTCPeerConnection;
  }
  if (browserDetails.version < 53) {
    // shim away need for obsolete RTCIceCandidate/RTCSessionDescription.
    ['setLocalDescription', 'setRemoteDescription', 'addIceCandidate'].forEach(function (method) {
      const nativeMethod = window.RTCPeerConnection.prototype[method];
      const methodObj = {
        [method]() {
          arguments[0] = new (method === 'addIceCandidate' ? window.RTCIceCandidate : window.RTCSessionDescription)(arguments[0]);
          return nativeMethod.apply(this, arguments);
        }
      };
      window.RTCPeerConnection.prototype[method] = methodObj[method];
    });
  }
  const modernStatsTypes = {
    inboundrtp: 'inbound-rtp',
    outboundrtp: 'outbound-rtp',
    candidatepair: 'candidate-pair',
    localcandidate: 'local-candidate',
    remotecandidate: 'remote-candidate'
  };
  const nativeGetStats = window.RTCPeerConnection.prototype.getStats;
  window.RTCPeerConnection.prototype.getStats = function getStats() {
    const [selector, onSucc, onErr] = arguments;
    return nativeGetStats.apply(this, [selector || null]).then(stats => {
      if (browserDetails.version < 53 && !onSucc) {
        // Shim only promise getStats with spec-hyphens in type names
        // Leave callback version alone; misc old uses of forEach before Map
        try {
          stats.forEach(stat => {
            stat.type = modernStatsTypes[stat.type] || stat.type;
          });
        } catch (e) {
          if (e.name !== 'TypeError') {
            throw e;
          }
          // Avoid TypeError: "type" is read-only, in old versions. 34-43ish
          stats.forEach((stat, i) => {
            stats.set(i, Object.assign({}, stat, {
              type: modernStatsTypes[stat.type] || stat.type
            }));
          });
        }
      }
      return stats;
    }).then(onSucc, onErr);
  };
}
function shimSenderGetStats(window) {
  if (!(typeof window === 'object' && window.RTCPeerConnection && window.RTCRtpSender)) {
    return;
  }
  if (window.RTCRtpSender && 'getStats' in window.RTCRtpSender.prototype) {
    return;
  }
  const origGetSenders = window.RTCPeerConnection.prototype.getSenders;
  if (origGetSenders) {
    window.RTCPeerConnection.prototype.getSenders = function getSenders() {
      const senders = origGetSenders.apply(this, []);
      senders.forEach(sender => sender._pc = this);
      return senders;
    };
  }
  const origAddTrack = window.RTCPeerConnection.prototype.addTrack;
  if (origAddTrack) {
    window.RTCPeerConnection.prototype.addTrack = function addTrack() {
      const sender = origAddTrack.apply(this, arguments);
      sender._pc = this;
      return sender;
    };
  }
  window.RTCRtpSender.prototype.getStats = function getStats() {
    return this.track ? this._pc.getStats(this.track) : Promise.resolve(new Map());
  };
}
function shimReceiverGetStats(window) {
  if (!(typeof window === 'object' && window.RTCPeerConnection && window.RTCRtpSender)) {
    return;
  }
  if (window.RTCRtpSender && 'getStats' in window.RTCRtpReceiver.prototype) {
    return;
  }
  const origGetReceivers = window.RTCPeerConnection.prototype.getReceivers;
  if (origGetReceivers) {
    window.RTCPeerConnection.prototype.getReceivers = function getReceivers() {
      const receivers = origGetReceivers.apply(this, []);
      receivers.forEach(receiver => receiver._pc = this);
      return receivers;
    };
  }
  wrapPeerConnectionEvent(window, 'track', e => {
    e.receiver._pc = e.srcElement;
    return e;
  });
  window.RTCRtpReceiver.prototype.getStats = function getStats() {
    return this._pc.getStats(this.track);
  };
}
function shimRemoveStream(window) {
  if (!window.RTCPeerConnection || 'removeStream' in window.RTCPeerConnection.prototype) {
    return;
  }
  window.RTCPeerConnection.prototype.removeStream = function removeStream(stream) {
    deprecated('removeStream', 'removeTrack');
    this.getSenders().forEach(sender => {
      if (sender.track && stream.getTracks().includes(sender.track)) {
        this.removeTrack(sender);
      }
    });
  };
}
function shimRTCDataChannel(window) {
  // rename DataChannel to RTCDataChannel (native fix in FF60):
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1173851
  if (window.DataChannel && !window.RTCDataChannel) {
    window.RTCDataChannel = window.DataChannel;
  }
}
function shimAddTransceiver(window) {
  // https://github.com/webrtcHacks/adapter/issues/998#issuecomment-516921647
  // Firefox ignores the init sendEncodings options passed to addTransceiver
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1396918
  if (!(typeof window === 'object' && window.RTCPeerConnection)) {
    return;
  }
  const origAddTransceiver = window.RTCPeerConnection.prototype.addTransceiver;
  if (origAddTransceiver) {
    window.RTCPeerConnection.prototype.addTransceiver = function addTransceiver() {
      this.setParametersPromises = [];
      // WebIDL input coercion and validation
      let sendEncodings = arguments[1] && arguments[1].sendEncodings;
      if (sendEncodings === undefined) {
        sendEncodings = [];
      }
      sendEncodings = [...sendEncodings];
      const shouldPerformCheck = sendEncodings.length > 0;
      if (shouldPerformCheck) {
        // If sendEncodings params are provided, validate grammar
        sendEncodings.forEach(encodingParam => {
          if ('rid' in encodingParam) {
            const ridRegex = /^[a-z0-9]{0,16}$/i;
            if (!ridRegex.test(encodingParam.rid)) {
              throw new TypeError('Invalid RID value provided.');
            }
          }
          if ('scaleResolutionDownBy' in encodingParam) {
            if (!(parseFloat(encodingParam.scaleResolutionDownBy) >= 1.0)) {
              throw new RangeError('scale_resolution_down_by must be >= 1.0');
            }
          }
          if ('maxFramerate' in encodingParam) {
            if (!(parseFloat(encodingParam.maxFramerate) >= 0)) {
              throw new RangeError('max_framerate must be >= 0.0');
            }
          }
        });
      }
      const transceiver = origAddTransceiver.apply(this, arguments);
      if (shouldPerformCheck) {
        // Check if the init options were applied. If not we do this in an
        // asynchronous way and save the promise reference in a global object.
        // This is an ugly hack, but at the same time is way more robust than
        // checking the sender parameters before and after the createOffer
        // Also note that after the createoffer we are not 100% sure that
        // the params were asynchronously applied so we might miss the
        // opportunity to recreate offer.
        const {
          sender
        } = transceiver;
        const params = sender.getParameters();
        if (!('encodings' in params) ||
        // Avoid being fooled by patched getParameters() below.
        params.encodings.length === 1 && Object.keys(params.encodings[0]).length === 0) {
          params.encodings = sendEncodings;
          sender.sendEncodings = sendEncodings;
          this.setParametersPromises.push(sender.setParameters(params).then(() => {
            delete sender.sendEncodings;
          }).catch(() => {
            delete sender.sendEncodings;
          }));
        }
      }
      return transceiver;
    };
  }
}
function shimGetParameters(window) {
  if (!(typeof window === 'object' && window.RTCRtpSender)) {
    return;
  }
  const origGetParameters = window.RTCRtpSender.prototype.getParameters;
  if (origGetParameters) {
    window.RTCRtpSender.prototype.getParameters = function getParameters() {
      const params = origGetParameters.apply(this, arguments);
      if (!('encodings' in params)) {
        params.encodings = [].concat(this.sendEncodings || [{}]);
      }
      return params;
    };
  }
}
function shimCreateOffer(window) {
  // https://github.com/webrtcHacks/adapter/issues/998#issuecomment-516921647
  // Firefox ignores the init sendEncodings options passed to addTransceiver
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1396918
  if (!(typeof window === 'object' && window.RTCPeerConnection)) {
    return;
  }
  const origCreateOffer = window.RTCPeerConnection.prototype.createOffer;
  window.RTCPeerConnection.prototype.createOffer = function createOffer() {
    if (this.setParametersPromises && this.setParametersPromises.length) {
      return Promise.all(this.setParametersPromises).then(() => {
        return origCreateOffer.apply(this, arguments);
      }).finally(() => {
        this.setParametersPromises = [];
      });
    }
    return origCreateOffer.apply(this, arguments);
  };
}
function shimCreateAnswer(window) {
  // https://github.com/webrtcHacks/adapter/issues/998#issuecomment-516921647
  // Firefox ignores the init sendEncodings options passed to addTransceiver
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1396918
  if (!(typeof window === 'object' && window.RTCPeerConnection)) {
    return;
  }
  const origCreateAnswer = window.RTCPeerConnection.prototype.createAnswer;
  window.RTCPeerConnection.prototype.createAnswer = function createAnswer() {
    if (this.setParametersPromises && this.setParametersPromises.length) {
      return Promise.all(this.setParametersPromises).then(() => {
        return origCreateAnswer.apply(this, arguments);
      }).finally(() => {
        this.setParametersPromises = [];
      });
    }
    return origCreateAnswer.apply(this, arguments);
  };
}

var firefoxShim = /*#__PURE__*/Object.freeze({
	__proto__: null,
	shimAddTransceiver: shimAddTransceiver,
	shimCreateAnswer: shimCreateAnswer,
	shimCreateOffer: shimCreateOffer,
	shimGetDisplayMedia: shimGetDisplayMedia,
	shimGetParameters: shimGetParameters,
	shimGetUserMedia: shimGetUserMedia$1,
	shimOnTrack: shimOnTrack,
	shimPeerConnection: shimPeerConnection,
	shimRTCDataChannel: shimRTCDataChannel,
	shimReceiverGetStats: shimReceiverGetStats,
	shimRemoveStream: shimRemoveStream,
	shimSenderGetStats: shimSenderGetStats
});

/*
 *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
function shimLocalStreamsAPI(window) {
  if (typeof window !== 'object' || !window.RTCPeerConnection) {
    return;
  }
  if (!('getLocalStreams' in window.RTCPeerConnection.prototype)) {
    window.RTCPeerConnection.prototype.getLocalStreams = function getLocalStreams() {
      if (!this._localStreams) {
        this._localStreams = [];
      }
      return this._localStreams;
    };
  }
  if (!('addStream' in window.RTCPeerConnection.prototype)) {
    const _addTrack = window.RTCPeerConnection.prototype.addTrack;
    window.RTCPeerConnection.prototype.addStream = function addStream(stream) {
      if (!this._localStreams) {
        this._localStreams = [];
      }
      if (!this._localStreams.includes(stream)) {
        this._localStreams.push(stream);
      }
      // Try to emulate Chrome's behaviour of adding in audio-video order.
      // Safari orders by track id.
      stream.getAudioTracks().forEach(track => _addTrack.call(this, track, stream));
      stream.getVideoTracks().forEach(track => _addTrack.call(this, track, stream));
    };
    window.RTCPeerConnection.prototype.addTrack = function addTrack(track) {
      for (var _len = arguments.length, streams = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        streams[_key - 1] = arguments[_key];
      }
      if (streams) {
        streams.forEach(stream => {
          if (!this._localStreams) {
            this._localStreams = [stream];
          } else if (!this._localStreams.includes(stream)) {
            this._localStreams.push(stream);
          }
        });
      }
      return _addTrack.apply(this, arguments);
    };
  }
  if (!('removeStream' in window.RTCPeerConnection.prototype)) {
    window.RTCPeerConnection.prototype.removeStream = function removeStream(stream) {
      if (!this._localStreams) {
        this._localStreams = [];
      }
      const index = this._localStreams.indexOf(stream);
      if (index === -1) {
        return;
      }
      this._localStreams.splice(index, 1);
      const tracks = stream.getTracks();
      this.getSenders().forEach(sender => {
        if (tracks.includes(sender.track)) {
          this.removeTrack(sender);
        }
      });
    };
  }
}
function shimRemoteStreamsAPI(window) {
  if (typeof window !== 'object' || !window.RTCPeerConnection) {
    return;
  }
  if (!('getRemoteStreams' in window.RTCPeerConnection.prototype)) {
    window.RTCPeerConnection.prototype.getRemoteStreams = function getRemoteStreams() {
      return this._remoteStreams ? this._remoteStreams : [];
    };
  }
  if (!('onaddstream' in window.RTCPeerConnection.prototype)) {
    Object.defineProperty(window.RTCPeerConnection.prototype, 'onaddstream', {
      get() {
        return this._onaddstream;
      },
      set(f) {
        if (this._onaddstream) {
          this.removeEventListener('addstream', this._onaddstream);
          this.removeEventListener('track', this._onaddstreampoly);
        }
        this.addEventListener('addstream', this._onaddstream = f);
        this.addEventListener('track', this._onaddstreampoly = e => {
          e.streams.forEach(stream => {
            if (!this._remoteStreams) {
              this._remoteStreams = [];
            }
            if (this._remoteStreams.includes(stream)) {
              return;
            }
            this._remoteStreams.push(stream);
            const event = new Event('addstream');
            event.stream = stream;
            this.dispatchEvent(event);
          });
        });
      }
    });
    const origSetRemoteDescription = window.RTCPeerConnection.prototype.setRemoteDescription;
    window.RTCPeerConnection.prototype.setRemoteDescription = function setRemoteDescription() {
      const pc = this;
      if (!this._onaddstreampoly) {
        this.addEventListener('track', this._onaddstreampoly = function (e) {
          e.streams.forEach(stream => {
            if (!pc._remoteStreams) {
              pc._remoteStreams = [];
            }
            if (pc._remoteStreams.indexOf(stream) >= 0) {
              return;
            }
            pc._remoteStreams.push(stream);
            const event = new Event('addstream');
            event.stream = stream;
            pc.dispatchEvent(event);
          });
        });
      }
      return origSetRemoteDescription.apply(pc, arguments);
    };
  }
}
function shimCallbacksAPI(window) {
  if (typeof window !== 'object' || !window.RTCPeerConnection) {
    return;
  }
  const prototype = window.RTCPeerConnection.prototype;
  const origCreateOffer = prototype.createOffer;
  const origCreateAnswer = prototype.createAnswer;
  const setLocalDescription = prototype.setLocalDescription;
  const setRemoteDescription = prototype.setRemoteDescription;
  const addIceCandidate = prototype.addIceCandidate;
  prototype.createOffer = function createOffer(successCallback, failureCallback) {
    const options = arguments.length >= 2 ? arguments[2] : arguments[0];
    const promise = origCreateOffer.apply(this, [options]);
    if (!failureCallback) {
      return promise;
    }
    promise.then(successCallback, failureCallback);
    return Promise.resolve();
  };
  prototype.createAnswer = function createAnswer(successCallback, failureCallback) {
    const options = arguments.length >= 2 ? arguments[2] : arguments[0];
    const promise = origCreateAnswer.apply(this, [options]);
    if (!failureCallback) {
      return promise;
    }
    promise.then(successCallback, failureCallback);
    return Promise.resolve();
  };
  let withCallback = function (description, successCallback, failureCallback) {
    const promise = setLocalDescription.apply(this, [description]);
    if (!failureCallback) {
      return promise;
    }
    promise.then(successCallback, failureCallback);
    return Promise.resolve();
  };
  prototype.setLocalDescription = withCallback;
  withCallback = function (description, successCallback, failureCallback) {
    const promise = setRemoteDescription.apply(this, [description]);
    if (!failureCallback) {
      return promise;
    }
    promise.then(successCallback, failureCallback);
    return Promise.resolve();
  };
  prototype.setRemoteDescription = withCallback;
  withCallback = function (candidate, successCallback, failureCallback) {
    const promise = addIceCandidate.apply(this, [candidate]);
    if (!failureCallback) {
      return promise;
    }
    promise.then(successCallback, failureCallback);
    return Promise.resolve();
  };
  prototype.addIceCandidate = withCallback;
}
function shimGetUserMedia(window) {
  const navigator = window && window.navigator;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    // shim not needed in Safari 12.1
    const mediaDevices = navigator.mediaDevices;
    const _getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    navigator.mediaDevices.getUserMedia = constraints => {
      return _getUserMedia(shimConstraints(constraints));
    };
  }
  if (!navigator.getUserMedia && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.getUserMedia = function getUserMedia(constraints, cb, errcb) {
      navigator.mediaDevices.getUserMedia(constraints).then(cb, errcb);
    }.bind(navigator);
  }
}
function shimConstraints(constraints) {
  if (constraints && constraints.video !== undefined) {
    return Object.assign({}, constraints, {
      video: compactObject(constraints.video)
    });
  }
  return constraints;
}
function shimRTCIceServerUrls(window) {
  if (!window.RTCPeerConnection) {
    return;
  }
  // migrate from non-spec RTCIceServer.url to RTCIceServer.urls
  const OrigPeerConnection = window.RTCPeerConnection;
  window.RTCPeerConnection = function RTCPeerConnection(pcConfig, pcConstraints) {
    if (pcConfig && pcConfig.iceServers) {
      const newIceServers = [];
      for (let i = 0; i < pcConfig.iceServers.length; i++) {
        let server = pcConfig.iceServers[i];
        if (server.urls === undefined && server.url) {
          deprecated('RTCIceServer.url', 'RTCIceServer.urls');
          server = JSON.parse(JSON.stringify(server));
          server.urls = server.url;
          delete server.url;
          newIceServers.push(server);
        } else {
          newIceServers.push(pcConfig.iceServers[i]);
        }
      }
      pcConfig.iceServers = newIceServers;
    }
    return new OrigPeerConnection(pcConfig, pcConstraints);
  };
  window.RTCPeerConnection.prototype = OrigPeerConnection.prototype;
  // wrap static methods. Currently just generateCertificate.
  if ('generateCertificate' in OrigPeerConnection) {
    Object.defineProperty(window.RTCPeerConnection, 'generateCertificate', {
      get() {
        return OrigPeerConnection.generateCertificate;
      }
    });
  }
}
function shimTrackEventTransceiver(window) {
  // Add event.transceiver member over deprecated event.receiver
  if (typeof window === 'object' && window.RTCTrackEvent && 'receiver' in window.RTCTrackEvent.prototype && !('transceiver' in window.RTCTrackEvent.prototype)) {
    Object.defineProperty(window.RTCTrackEvent.prototype, 'transceiver', {
      get() {
        return {
          receiver: this.receiver
        };
      }
    });
  }
}
function shimCreateOfferLegacy(window) {
  const origCreateOffer = window.RTCPeerConnection.prototype.createOffer;
  window.RTCPeerConnection.prototype.createOffer = function createOffer(offerOptions) {
    if (offerOptions) {
      if (typeof offerOptions.offerToReceiveAudio !== 'undefined') {
        // support bit values
        offerOptions.offerToReceiveAudio = !!offerOptions.offerToReceiveAudio;
      }
      const audioTransceiver = this.getTransceivers().find(transceiver => transceiver.receiver.track.kind === 'audio');
      if (offerOptions.offerToReceiveAudio === false && audioTransceiver) {
        if (audioTransceiver.direction === 'sendrecv') {
          if (audioTransceiver.setDirection) {
            audioTransceiver.setDirection('sendonly');
          } else {
            audioTransceiver.direction = 'sendonly';
          }
        } else if (audioTransceiver.direction === 'recvonly') {
          if (audioTransceiver.setDirection) {
            audioTransceiver.setDirection('inactive');
          } else {
            audioTransceiver.direction = 'inactive';
          }
        }
      } else if (offerOptions.offerToReceiveAudio === true && !audioTransceiver) {
        this.addTransceiver('audio', {
          direction: 'recvonly'
        });
      }
      if (typeof offerOptions.offerToReceiveVideo !== 'undefined') {
        // support bit values
        offerOptions.offerToReceiveVideo = !!offerOptions.offerToReceiveVideo;
      }
      const videoTransceiver = this.getTransceivers().find(transceiver => transceiver.receiver.track.kind === 'video');
      if (offerOptions.offerToReceiveVideo === false && videoTransceiver) {
        if (videoTransceiver.direction === 'sendrecv') {
          if (videoTransceiver.setDirection) {
            videoTransceiver.setDirection('sendonly');
          } else {
            videoTransceiver.direction = 'sendonly';
          }
        } else if (videoTransceiver.direction === 'recvonly') {
          if (videoTransceiver.setDirection) {
            videoTransceiver.setDirection('inactive');
          } else {
            videoTransceiver.direction = 'inactive';
          }
        }
      } else if (offerOptions.offerToReceiveVideo === true && !videoTransceiver) {
        this.addTransceiver('video', {
          direction: 'recvonly'
        });
      }
    }
    return origCreateOffer.apply(this, arguments);
  };
}
function shimAudioContext(window) {
  if (typeof window !== 'object' || window.AudioContext) {
    return;
  }
  window.AudioContext = window.webkitAudioContext;
}

var safariShim = /*#__PURE__*/Object.freeze({
	__proto__: null,
	shimAudioContext: shimAudioContext,
	shimCallbacksAPI: shimCallbacksAPI,
	shimConstraints: shimConstraints,
	shimCreateOfferLegacy: shimCreateOfferLegacy,
	shimGetUserMedia: shimGetUserMedia,
	shimLocalStreamsAPI: shimLocalStreamsAPI,
	shimRTCIceServerUrls: shimRTCIceServerUrls,
	shimRemoteStreamsAPI: shimRemoteStreamsAPI,
	shimTrackEventTransceiver: shimTrackEventTransceiver
});

var sdp$1 = {exports: {}};

/* eslint-env node */
(function (module) {

  // SDP helpers.
  const SDPUtils = {};

  // Generate an alphanumeric identifier for cname or mids.
  // TODO: use UUIDs instead? https://gist.github.com/jed/982883
  SDPUtils.generateIdentifier = function () {
    return Math.random().toString(36).substring(2, 12);
  };

  // The RTCP CNAME used by all peerconnections from the same JS.
  SDPUtils.localCName = SDPUtils.generateIdentifier();

  // Splits SDP into lines, dealing with both CRLF and LF.
  SDPUtils.splitLines = function (blob) {
    return blob.trim().split('\n').map(line => line.trim());
  };
  // Splits SDP into sessionpart and mediasections. Ensures CRLF.
  SDPUtils.splitSections = function (blob) {
    const parts = blob.split('\nm=');
    return parts.map((part, index) => (index > 0 ? 'm=' + part : part).trim() + '\r\n');
  };

  // Returns the session description.
  SDPUtils.getDescription = function (blob) {
    const sections = SDPUtils.splitSections(blob);
    return sections && sections[0];
  };

  // Returns the individual media sections.
  SDPUtils.getMediaSections = function (blob) {
    const sections = SDPUtils.splitSections(blob);
    sections.shift();
    return sections;
  };

  // Returns lines that start with a certain prefix.
  SDPUtils.matchPrefix = function (blob, prefix) {
    return SDPUtils.splitLines(blob).filter(line => line.indexOf(prefix) === 0);
  };

  // Parses an ICE candidate line. Sample input:
  // candidate:702786350 2 udp 41819902 8.8.8.8 60769 typ relay raddr 8.8.8.8
  // rport 55996"
  // Input can be prefixed with a=.
  SDPUtils.parseCandidate = function (line) {
    let parts;
    // Parse both variants.
    if (line.indexOf('a=candidate:') === 0) {
      parts = line.substring(12).split(' ');
    } else {
      parts = line.substring(10).split(' ');
    }
    const candidate = {
      foundation: parts[0],
      component: {
        1: 'rtp',
        2: 'rtcp'
      }[parts[1]] || parts[1],
      protocol: parts[2].toLowerCase(),
      priority: parseInt(parts[3], 10),
      ip: parts[4],
      address: parts[4],
      // address is an alias for ip.
      port: parseInt(parts[5], 10),
      // skip parts[6] == 'typ'
      type: parts[7]
    };
    for (let i = 8; i < parts.length; i += 2) {
      switch (parts[i]) {
        case 'raddr':
          candidate.relatedAddress = parts[i + 1];
          break;
        case 'rport':
          candidate.relatedPort = parseInt(parts[i + 1], 10);
          break;
        case 'tcptype':
          candidate.tcpType = parts[i + 1];
          break;
        case 'ufrag':
          candidate.ufrag = parts[i + 1]; // for backward compatibility.
          candidate.usernameFragment = parts[i + 1];
          break;
        default:
          // extension handling, in particular ufrag. Don't overwrite.
          if (candidate[parts[i]] === undefined) {
            candidate[parts[i]] = parts[i + 1];
          }
          break;
      }
    }
    return candidate;
  };

  // Translates a candidate object into SDP candidate attribute.
  // This does not include the a= prefix!
  SDPUtils.writeCandidate = function (candidate) {
    const sdp = [];
    sdp.push(candidate.foundation);
    const component = candidate.component;
    if (component === 'rtp') {
      sdp.push(1);
    } else if (component === 'rtcp') {
      sdp.push(2);
    } else {
      sdp.push(component);
    }
    sdp.push(candidate.protocol.toUpperCase());
    sdp.push(candidate.priority);
    sdp.push(candidate.address || candidate.ip);
    sdp.push(candidate.port);
    const type = candidate.type;
    sdp.push('typ');
    sdp.push(type);
    if (type !== 'host' && candidate.relatedAddress && candidate.relatedPort) {
      sdp.push('raddr');
      sdp.push(candidate.relatedAddress);
      sdp.push('rport');
      sdp.push(candidate.relatedPort);
    }
    if (candidate.tcpType && candidate.protocol.toLowerCase() === 'tcp') {
      sdp.push('tcptype');
      sdp.push(candidate.tcpType);
    }
    if (candidate.usernameFragment || candidate.ufrag) {
      sdp.push('ufrag');
      sdp.push(candidate.usernameFragment || candidate.ufrag);
    }
    return 'candidate:' + sdp.join(' ');
  };

  // Parses an ice-options line, returns an array of option tags.
  // Sample input:
  // a=ice-options:foo bar
  SDPUtils.parseIceOptions = function (line) {
    return line.substring(14).split(' ');
  };

  // Parses a rtpmap line, returns RTCRtpCoddecParameters. Sample input:
  // a=rtpmap:111 opus/48000/2
  SDPUtils.parseRtpMap = function (line) {
    let parts = line.substring(9).split(' ');
    const parsed = {
      payloadType: parseInt(parts.shift(), 10) // was: id
    };

    parts = parts[0].split('/');
    parsed.name = parts[0];
    parsed.clockRate = parseInt(parts[1], 10); // was: clockrate
    parsed.channels = parts.length === 3 ? parseInt(parts[2], 10) : 1;
    // legacy alias, got renamed back to channels in ORTC.
    parsed.numChannels = parsed.channels;
    return parsed;
  };

  // Generates a rtpmap line from RTCRtpCodecCapability or
  // RTCRtpCodecParameters.
  SDPUtils.writeRtpMap = function (codec) {
    let pt = codec.payloadType;
    if (codec.preferredPayloadType !== undefined) {
      pt = codec.preferredPayloadType;
    }
    const channels = codec.channels || codec.numChannels || 1;
    return 'a=rtpmap:' + pt + ' ' + codec.name + '/' + codec.clockRate + (channels !== 1 ? '/' + channels : '') + '\r\n';
  };

  // Parses a extmap line (headerextension from RFC 5285). Sample input:
  // a=extmap:2 urn:ietf:params:rtp-hdrext:toffset
  // a=extmap:2/sendonly urn:ietf:params:rtp-hdrext:toffset
  SDPUtils.parseExtmap = function (line) {
    const parts = line.substring(9).split(' ');
    return {
      id: parseInt(parts[0], 10),
      direction: parts[0].indexOf('/') > 0 ? parts[0].split('/')[1] : 'sendrecv',
      uri: parts[1],
      attributes: parts.slice(2).join(' ')
    };
  };

  // Generates an extmap line from RTCRtpHeaderExtensionParameters or
  // RTCRtpHeaderExtension.
  SDPUtils.writeExtmap = function (headerExtension) {
    return 'a=extmap:' + (headerExtension.id || headerExtension.preferredId) + (headerExtension.direction && headerExtension.direction !== 'sendrecv' ? '/' + headerExtension.direction : '') + ' ' + headerExtension.uri + (headerExtension.attributes ? ' ' + headerExtension.attributes : '') + '\r\n';
  };

  // Parses a fmtp line, returns dictionary. Sample input:
  // a=fmtp:96 vbr=on;cng=on
  // Also deals with vbr=on; cng=on
  SDPUtils.parseFmtp = function (line) {
    const parsed = {};
    let kv;
    const parts = line.substring(line.indexOf(' ') + 1).split(';');
    for (let j = 0; j < parts.length; j++) {
      kv = parts[j].trim().split('=');
      parsed[kv[0].trim()] = kv[1];
    }
    return parsed;
  };

  // Generates a fmtp line from RTCRtpCodecCapability or RTCRtpCodecParameters.
  SDPUtils.writeFmtp = function (codec) {
    let line = '';
    let pt = codec.payloadType;
    if (codec.preferredPayloadType !== undefined) {
      pt = codec.preferredPayloadType;
    }
    if (codec.parameters && Object.keys(codec.parameters).length) {
      const params = [];
      Object.keys(codec.parameters).forEach(param => {
        if (codec.parameters[param] !== undefined) {
          params.push(param + '=' + codec.parameters[param]);
        } else {
          params.push(param);
        }
      });
      line += 'a=fmtp:' + pt + ' ' + params.join(';') + '\r\n';
    }
    return line;
  };

  // Parses a rtcp-fb line, returns RTCPRtcpFeedback object. Sample input:
  // a=rtcp-fb:98 nack rpsi
  SDPUtils.parseRtcpFb = function (line) {
    const parts = line.substring(line.indexOf(' ') + 1).split(' ');
    return {
      type: parts.shift(),
      parameter: parts.join(' ')
    };
  };

  // Generate a=rtcp-fb lines from RTCRtpCodecCapability or RTCRtpCodecParameters.
  SDPUtils.writeRtcpFb = function (codec) {
    let lines = '';
    let pt = codec.payloadType;
    if (codec.preferredPayloadType !== undefined) {
      pt = codec.preferredPayloadType;
    }
    if (codec.rtcpFeedback && codec.rtcpFeedback.length) {
      // FIXME: special handling for trr-int?
      codec.rtcpFeedback.forEach(fb => {
        lines += 'a=rtcp-fb:' + pt + ' ' + fb.type + (fb.parameter && fb.parameter.length ? ' ' + fb.parameter : '') + '\r\n';
      });
    }
    return lines;
  };

  // Parses a RFC 5576 ssrc media attribute. Sample input:
  // a=ssrc:3735928559 cname:something
  SDPUtils.parseSsrcMedia = function (line) {
    const sp = line.indexOf(' ');
    const parts = {
      ssrc: parseInt(line.substring(7, sp), 10)
    };
    const colon = line.indexOf(':', sp);
    if (colon > -1) {
      parts.attribute = line.substring(sp + 1, colon);
      parts.value = line.substring(colon + 1);
    } else {
      parts.attribute = line.substring(sp + 1);
    }
    return parts;
  };

  // Parse a ssrc-group line (see RFC 5576). Sample input:
  // a=ssrc-group:semantics 12 34
  SDPUtils.parseSsrcGroup = function (line) {
    const parts = line.substring(13).split(' ');
    return {
      semantics: parts.shift(),
      ssrcs: parts.map(ssrc => parseInt(ssrc, 10))
    };
  };

  // Extracts the MID (RFC 5888) from a media section.
  // Returns the MID or undefined if no mid line was found.
  SDPUtils.getMid = function (mediaSection) {
    const mid = SDPUtils.matchPrefix(mediaSection, 'a=mid:')[0];
    if (mid) {
      return mid.substring(6);
    }
  };

  // Parses a fingerprint line for DTLS-SRTP.
  SDPUtils.parseFingerprint = function (line) {
    const parts = line.substring(14).split(' ');
    return {
      algorithm: parts[0].toLowerCase(),
      // algorithm is case-sensitive in Edge.
      value: parts[1].toUpperCase() // the definition is upper-case in RFC 4572.
    };
  };

  // Extracts DTLS parameters from SDP media section or sessionpart.
  // FIXME: for consistency with other functions this should only
  //   get the fingerprint line as input. See also getIceParameters.
  SDPUtils.getDtlsParameters = function (mediaSection, sessionpart) {
    const lines = SDPUtils.matchPrefix(mediaSection + sessionpart, 'a=fingerprint:');
    // Note: a=setup line is ignored since we use the 'auto' role in Edge.
    return {
      role: 'auto',
      fingerprints: lines.map(SDPUtils.parseFingerprint)
    };
  };

  // Serializes DTLS parameters to SDP.
  SDPUtils.writeDtlsParameters = function (params, setupType) {
    let sdp = 'a=setup:' + setupType + '\r\n';
    params.fingerprints.forEach(fp => {
      sdp += 'a=fingerprint:' + fp.algorithm + ' ' + fp.value + '\r\n';
    });
    return sdp;
  };

  // Parses a=crypto lines into
  //   https://rawgit.com/aboba/edgertc/master/msortc-rs4.html#dictionary-rtcsrtpsdesparameters-members
  SDPUtils.parseCryptoLine = function (line) {
    const parts = line.substring(9).split(' ');
    return {
      tag: parseInt(parts[0], 10),
      cryptoSuite: parts[1],
      keyParams: parts[2],
      sessionParams: parts.slice(3)
    };
  };
  SDPUtils.writeCryptoLine = function (parameters) {
    return 'a=crypto:' + parameters.tag + ' ' + parameters.cryptoSuite + ' ' + (typeof parameters.keyParams === 'object' ? SDPUtils.writeCryptoKeyParams(parameters.keyParams) : parameters.keyParams) + (parameters.sessionParams ? ' ' + parameters.sessionParams.join(' ') : '') + '\r\n';
  };

  // Parses the crypto key parameters into
  //   https://rawgit.com/aboba/edgertc/master/msortc-rs4.html#rtcsrtpkeyparam*
  SDPUtils.parseCryptoKeyParams = function (keyParams) {
    if (keyParams.indexOf('inline:') !== 0) {
      return null;
    }
    const parts = keyParams.substring(7).split('|');
    return {
      keyMethod: 'inline',
      keySalt: parts[0],
      lifeTime: parts[1],
      mkiValue: parts[2] ? parts[2].split(':')[0] : undefined,
      mkiLength: parts[2] ? parts[2].split(':')[1] : undefined
    };
  };
  SDPUtils.writeCryptoKeyParams = function (keyParams) {
    return keyParams.keyMethod + ':' + keyParams.keySalt + (keyParams.lifeTime ? '|' + keyParams.lifeTime : '') + (keyParams.mkiValue && keyParams.mkiLength ? '|' + keyParams.mkiValue + ':' + keyParams.mkiLength : '');
  };

  // Extracts all SDES parameters.
  SDPUtils.getCryptoParameters = function (mediaSection, sessionpart) {
    const lines = SDPUtils.matchPrefix(mediaSection + sessionpart, 'a=crypto:');
    return lines.map(SDPUtils.parseCryptoLine);
  };

  // Parses ICE information from SDP media section or sessionpart.
  // FIXME: for consistency with other functions this should only
  //   get the ice-ufrag and ice-pwd lines as input.
  SDPUtils.getIceParameters = function (mediaSection, sessionpart) {
    const ufrag = SDPUtils.matchPrefix(mediaSection + sessionpart, 'a=ice-ufrag:')[0];
    const pwd = SDPUtils.matchPrefix(mediaSection + sessionpart, 'a=ice-pwd:')[0];
    if (!(ufrag && pwd)) {
      return null;
    }
    return {
      usernameFragment: ufrag.substring(12),
      password: pwd.substring(10)
    };
  };

  // Serializes ICE parameters to SDP.
  SDPUtils.writeIceParameters = function (params) {
    let sdp = 'a=ice-ufrag:' + params.usernameFragment + '\r\n' + 'a=ice-pwd:' + params.password + '\r\n';
    if (params.iceLite) {
      sdp += 'a=ice-lite\r\n';
    }
    return sdp;
  };

  // Parses the SDP media section and returns RTCRtpParameters.
  SDPUtils.parseRtpParameters = function (mediaSection) {
    const description = {
      codecs: [],
      headerExtensions: [],
      fecMechanisms: [],
      rtcp: []
    };
    const lines = SDPUtils.splitLines(mediaSection);
    const mline = lines[0].split(' ');
    description.profile = mline[2];
    for (let i = 3; i < mline.length; i++) {
      // find all codecs from mline[3..]
      const pt = mline[i];
      const rtpmapline = SDPUtils.matchPrefix(mediaSection, 'a=rtpmap:' + pt + ' ')[0];
      if (rtpmapline) {
        const codec = SDPUtils.parseRtpMap(rtpmapline);
        const fmtps = SDPUtils.matchPrefix(mediaSection, 'a=fmtp:' + pt + ' ');
        // Only the first a=fmtp:<pt> is considered.
        codec.parameters = fmtps.length ? SDPUtils.parseFmtp(fmtps[0]) : {};
        codec.rtcpFeedback = SDPUtils.matchPrefix(mediaSection, 'a=rtcp-fb:' + pt + ' ').map(SDPUtils.parseRtcpFb);
        description.codecs.push(codec);
        // parse FEC mechanisms from rtpmap lines.
        switch (codec.name.toUpperCase()) {
          case 'RED':
          case 'ULPFEC':
            description.fecMechanisms.push(codec.name.toUpperCase());
            break;
        }
      }
    }
    SDPUtils.matchPrefix(mediaSection, 'a=extmap:').forEach(line => {
      description.headerExtensions.push(SDPUtils.parseExtmap(line));
    });
    const wildcardRtcpFb = SDPUtils.matchPrefix(mediaSection, 'a=rtcp-fb:* ').map(SDPUtils.parseRtcpFb);
    description.codecs.forEach(codec => {
      wildcardRtcpFb.forEach(fb => {
        const duplicate = codec.rtcpFeedback.find(existingFeedback => {
          return existingFeedback.type === fb.type && existingFeedback.parameter === fb.parameter;
        });
        if (!duplicate) {
          codec.rtcpFeedback.push(fb);
        }
      });
    });
    // FIXME: parse rtcp.
    return description;
  };

  // Generates parts of the SDP media section describing the capabilities /
  // parameters.
  SDPUtils.writeRtpDescription = function (kind, caps) {
    let sdp = '';

    // Build the mline.
    sdp += 'm=' + kind + ' ';
    sdp += caps.codecs.length > 0 ? '9' : '0'; // reject if no codecs.
    sdp += ' ' + (caps.profile || 'UDP/TLS/RTP/SAVPF') + ' ';
    sdp += caps.codecs.map(codec => {
      if (codec.preferredPayloadType !== undefined) {
        return codec.preferredPayloadType;
      }
      return codec.payloadType;
    }).join(' ') + '\r\n';
    sdp += 'c=IN IP4 0.0.0.0\r\n';
    sdp += 'a=rtcp:9 IN IP4 0.0.0.0\r\n';

    // Add a=rtpmap lines for each codec. Also fmtp and rtcp-fb.
    caps.codecs.forEach(codec => {
      sdp += SDPUtils.writeRtpMap(codec);
      sdp += SDPUtils.writeFmtp(codec);
      sdp += SDPUtils.writeRtcpFb(codec);
    });
    let maxptime = 0;
    caps.codecs.forEach(codec => {
      if (codec.maxptime > maxptime) {
        maxptime = codec.maxptime;
      }
    });
    if (maxptime > 0) {
      sdp += 'a=maxptime:' + maxptime + '\r\n';
    }
    if (caps.headerExtensions) {
      caps.headerExtensions.forEach(extension => {
        sdp += SDPUtils.writeExtmap(extension);
      });
    }
    // FIXME: write fecMechanisms.
    return sdp;
  };

  // Parses the SDP media section and returns an array of
  // RTCRtpEncodingParameters.
  SDPUtils.parseRtpEncodingParameters = function (mediaSection) {
    const encodingParameters = [];
    const description = SDPUtils.parseRtpParameters(mediaSection);
    const hasRed = description.fecMechanisms.indexOf('RED') !== -1;
    const hasUlpfec = description.fecMechanisms.indexOf('ULPFEC') !== -1;

    // filter a=ssrc:... cname:, ignore PlanB-msid
    const ssrcs = SDPUtils.matchPrefix(mediaSection, 'a=ssrc:').map(line => SDPUtils.parseSsrcMedia(line)).filter(parts => parts.attribute === 'cname');
    const primarySsrc = ssrcs.length > 0 && ssrcs[0].ssrc;
    let secondarySsrc;
    const flows = SDPUtils.matchPrefix(mediaSection, 'a=ssrc-group:FID').map(line => {
      const parts = line.substring(17).split(' ');
      return parts.map(part => parseInt(part, 10));
    });
    if (flows.length > 0 && flows[0].length > 1 && flows[0][0] === primarySsrc) {
      secondarySsrc = flows[0][1];
    }
    description.codecs.forEach(codec => {
      if (codec.name.toUpperCase() === 'RTX' && codec.parameters.apt) {
        let encParam = {
          ssrc: primarySsrc,
          codecPayloadType: parseInt(codec.parameters.apt, 10)
        };
        if (primarySsrc && secondarySsrc) {
          encParam.rtx = {
            ssrc: secondarySsrc
          };
        }
        encodingParameters.push(encParam);
        if (hasRed) {
          encParam = JSON.parse(JSON.stringify(encParam));
          encParam.fec = {
            ssrc: primarySsrc,
            mechanism: hasUlpfec ? 'red+ulpfec' : 'red'
          };
          encodingParameters.push(encParam);
        }
      }
    });
    if (encodingParameters.length === 0 && primarySsrc) {
      encodingParameters.push({
        ssrc: primarySsrc
      });
    }

    // we support both b=AS and b=TIAS but interpret AS as TIAS.
    let bandwidth = SDPUtils.matchPrefix(mediaSection, 'b=');
    if (bandwidth.length) {
      if (bandwidth[0].indexOf('b=TIAS:') === 0) {
        bandwidth = parseInt(bandwidth[0].substring(7), 10);
      } else if (bandwidth[0].indexOf('b=AS:') === 0) {
        // use formula from JSEP to convert b=AS to TIAS value.
        bandwidth = parseInt(bandwidth[0].substring(5), 10) * 1000 * 0.95 - 50 * 40 * 8;
      } else {
        bandwidth = undefined;
      }
      encodingParameters.forEach(params => {
        params.maxBitrate = bandwidth;
      });
    }
    return encodingParameters;
  };

  // parses http://draft.ortc.org/#rtcrtcpparameters*
  SDPUtils.parseRtcpParameters = function (mediaSection) {
    const rtcpParameters = {};

    // Gets the first SSRC. Note that with RTX there might be multiple
    // SSRCs.
    const remoteSsrc = SDPUtils.matchPrefix(mediaSection, 'a=ssrc:').map(line => SDPUtils.parseSsrcMedia(line)).filter(obj => obj.attribute === 'cname')[0];
    if (remoteSsrc) {
      rtcpParameters.cname = remoteSsrc.value;
      rtcpParameters.ssrc = remoteSsrc.ssrc;
    }

    // Edge uses the compound attribute instead of reducedSize
    // compound is !reducedSize
    const rsize = SDPUtils.matchPrefix(mediaSection, 'a=rtcp-rsize');
    rtcpParameters.reducedSize = rsize.length > 0;
    rtcpParameters.compound = rsize.length === 0;

    // parses the rtcp-mux attrіbute.
    // Note that Edge does not support unmuxed RTCP.
    const mux = SDPUtils.matchPrefix(mediaSection, 'a=rtcp-mux');
    rtcpParameters.mux = mux.length > 0;
    return rtcpParameters;
  };
  SDPUtils.writeRtcpParameters = function (rtcpParameters) {
    let sdp = '';
    if (rtcpParameters.reducedSize) {
      sdp += 'a=rtcp-rsize\r\n';
    }
    if (rtcpParameters.mux) {
      sdp += 'a=rtcp-mux\r\n';
    }
    if (rtcpParameters.ssrc !== undefined && rtcpParameters.cname) {
      sdp += 'a=ssrc:' + rtcpParameters.ssrc + ' cname:' + rtcpParameters.cname + '\r\n';
    }
    return sdp;
  };

  // parses either a=msid: or a=ssrc:... msid lines and returns
  // the id of the MediaStream and MediaStreamTrack.
  SDPUtils.parseMsid = function (mediaSection) {
    let parts;
    const spec = SDPUtils.matchPrefix(mediaSection, 'a=msid:');
    if (spec.length === 1) {
      parts = spec[0].substring(7).split(' ');
      return {
        stream: parts[0],
        track: parts[1]
      };
    }
    const planB = SDPUtils.matchPrefix(mediaSection, 'a=ssrc:').map(line => SDPUtils.parseSsrcMedia(line)).filter(msidParts => msidParts.attribute === 'msid');
    if (planB.length > 0) {
      parts = planB[0].value.split(' ');
      return {
        stream: parts[0],
        track: parts[1]
      };
    }
  };

  // SCTP
  // parses draft-ietf-mmusic-sctp-sdp-26 first and falls back
  // to draft-ietf-mmusic-sctp-sdp-05
  SDPUtils.parseSctpDescription = function (mediaSection) {
    const mline = SDPUtils.parseMLine(mediaSection);
    const maxSizeLine = SDPUtils.matchPrefix(mediaSection, 'a=max-message-size:');
    let maxMessageSize;
    if (maxSizeLine.length > 0) {
      maxMessageSize = parseInt(maxSizeLine[0].substring(19), 10);
    }
    if (isNaN(maxMessageSize)) {
      maxMessageSize = 65536;
    }
    const sctpPort = SDPUtils.matchPrefix(mediaSection, 'a=sctp-port:');
    if (sctpPort.length > 0) {
      return {
        port: parseInt(sctpPort[0].substring(12), 10),
        protocol: mline.fmt,
        maxMessageSize
      };
    }
    const sctpMapLines = SDPUtils.matchPrefix(mediaSection, 'a=sctpmap:');
    if (sctpMapLines.length > 0) {
      const parts = sctpMapLines[0].substring(10).split(' ');
      return {
        port: parseInt(parts[0], 10),
        protocol: parts[1],
        maxMessageSize
      };
    }
  };

  // SCTP
  // outputs the draft-ietf-mmusic-sctp-sdp-26 version that all browsers
  // support by now receiving in this format, unless we originally parsed
  // as the draft-ietf-mmusic-sctp-sdp-05 format (indicated by the m-line
  // protocol of DTLS/SCTP -- without UDP/ or TCP/)
  SDPUtils.writeSctpDescription = function (media, sctp) {
    let output = [];
    if (media.protocol !== 'DTLS/SCTP') {
      output = ['m=' + media.kind + ' 9 ' + media.protocol + ' ' + sctp.protocol + '\r\n', 'c=IN IP4 0.0.0.0\r\n', 'a=sctp-port:' + sctp.port + '\r\n'];
    } else {
      output = ['m=' + media.kind + ' 9 ' + media.protocol + ' ' + sctp.port + '\r\n', 'c=IN IP4 0.0.0.0\r\n', 'a=sctpmap:' + sctp.port + ' ' + sctp.protocol + ' 65535\r\n'];
    }
    if (sctp.maxMessageSize !== undefined) {
      output.push('a=max-message-size:' + sctp.maxMessageSize + '\r\n');
    }
    return output.join('');
  };

  // Generate a session ID for SDP.
  // https://tools.ietf.org/html/draft-ietf-rtcweb-jsep-20#section-5.2.1
  // recommends using a cryptographically random +ve 64-bit value
  // but right now this should be acceptable and within the right range
  SDPUtils.generateSessionId = function () {
    return Math.random().toString().substr(2, 22);
  };

  // Write boiler plate for start of SDP
  // sessId argument is optional - if not supplied it will
  // be generated randomly
  // sessVersion is optional and defaults to 2
  // sessUser is optional and defaults to 'thisisadapterortc'
  SDPUtils.writeSessionBoilerplate = function (sessId, sessVer, sessUser) {
    let sessionId;
    const version = sessVer !== undefined ? sessVer : 2;
    if (sessId) {
      sessionId = sessId;
    } else {
      sessionId = SDPUtils.generateSessionId();
    }
    const user = sessUser || 'thisisadapterortc';
    // FIXME: sess-id should be an NTP timestamp.
    return 'v=0\r\n' + 'o=' + user + ' ' + sessionId + ' ' + version + ' IN IP4 127.0.0.1\r\n' + 's=-\r\n' + 't=0 0\r\n';
  };

  // Gets the direction from the mediaSection or the sessionpart.
  SDPUtils.getDirection = function (mediaSection, sessionpart) {
    // Look for sendrecv, sendonly, recvonly, inactive, default to sendrecv.
    const lines = SDPUtils.splitLines(mediaSection);
    for (let i = 0; i < lines.length; i++) {
      switch (lines[i]) {
        case 'a=sendrecv':
        case 'a=sendonly':
        case 'a=recvonly':
        case 'a=inactive':
          return lines[i].substring(2);
        // FIXME: What should happen here?
      }
    }

    if (sessionpart) {
      return SDPUtils.getDirection(sessionpart);
    }
    return 'sendrecv';
  };
  SDPUtils.getKind = function (mediaSection) {
    const lines = SDPUtils.splitLines(mediaSection);
    const mline = lines[0].split(' ');
    return mline[0].substring(2);
  };
  SDPUtils.isRejected = function (mediaSection) {
    return mediaSection.split(' ', 2)[1] === '0';
  };
  SDPUtils.parseMLine = function (mediaSection) {
    const lines = SDPUtils.splitLines(mediaSection);
    const parts = lines[0].substring(2).split(' ');
    return {
      kind: parts[0],
      port: parseInt(parts[1], 10),
      protocol: parts[2],
      fmt: parts.slice(3).join(' ')
    };
  };
  SDPUtils.parseOLine = function (mediaSection) {
    const line = SDPUtils.matchPrefix(mediaSection, 'o=')[0];
    const parts = line.substring(2).split(' ');
    return {
      username: parts[0],
      sessionId: parts[1],
      sessionVersion: parseInt(parts[2], 10),
      netType: parts[3],
      addressType: parts[4],
      address: parts[5]
    };
  };

  // a very naive interpretation of a valid SDP.
  SDPUtils.isValidSDP = function (blob) {
    if (typeof blob !== 'string' || blob.length === 0) {
      return false;
    }
    const lines = SDPUtils.splitLines(blob);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length < 2 || lines[i].charAt(1) !== '=') {
        return false;
      }
      // TODO: check the modifier a bit more.
    }

    return true;
  };

  // Expose public methods.
  {
    module.exports = SDPUtils;
  }
})(sdp$1);
var sdpExports = sdp$1.exports;
var SDPUtils = /*@__PURE__*/getDefaultExportFromCjs(sdpExports);

var sdp = /*#__PURE__*/_mergeNamespaces({
	__proto__: null,
	default: SDPUtils
}, [sdpExports]);

/*
 *  Copyright (c) 2017 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* eslint-env node */
function shimRTCIceCandidate(window) {
  // foundation is arbitrarily chosen as an indicator for full support for
  // https://w3c.github.io/webrtc-pc/#rtcicecandidate-interface
  if (!window.RTCIceCandidate || window.RTCIceCandidate && 'foundation' in window.RTCIceCandidate.prototype) {
    return;
  }
  const NativeRTCIceCandidate = window.RTCIceCandidate;
  window.RTCIceCandidate = function RTCIceCandidate(args) {
    // Remove the a= which shouldn't be part of the candidate string.
    if (typeof args === 'object' && args.candidate && args.candidate.indexOf('a=') === 0) {
      args = JSON.parse(JSON.stringify(args));
      args.candidate = args.candidate.substring(2);
    }
    if (args.candidate && args.candidate.length) {
      // Augment the native candidate with the parsed fields.
      const nativeCandidate = new NativeRTCIceCandidate(args);
      const parsedCandidate = SDPUtils.parseCandidate(args.candidate);
      for (const key in parsedCandidate) {
        if (!(key in nativeCandidate)) {
          Object.defineProperty(nativeCandidate, key, {
            value: parsedCandidate[key]
          });
        }
      }

      // Override serializer to not serialize the extra attributes.
      nativeCandidate.toJSON = function toJSON() {
        return {
          candidate: nativeCandidate.candidate,
          sdpMid: nativeCandidate.sdpMid,
          sdpMLineIndex: nativeCandidate.sdpMLineIndex,
          usernameFragment: nativeCandidate.usernameFragment
        };
      };
      return nativeCandidate;
    }
    return new NativeRTCIceCandidate(args);
  };
  window.RTCIceCandidate.prototype = NativeRTCIceCandidate.prototype;

  // Hook up the augmented candidate in onicecandidate and
  // addEventListener('icecandidate', ...)
  wrapPeerConnectionEvent(window, 'icecandidate', e => {
    if (e.candidate) {
      Object.defineProperty(e, 'candidate', {
        value: new window.RTCIceCandidate(e.candidate),
        writable: 'false'
      });
    }
    return e;
  });
}
function shimRTCIceCandidateRelayProtocol(window) {
  if (!window.RTCIceCandidate || window.RTCIceCandidate && 'relayProtocol' in window.RTCIceCandidate.prototype) {
    return;
  }

  // Hook up the augmented candidate in onicecandidate and
  // addEventListener('icecandidate', ...)
  wrapPeerConnectionEvent(window, 'icecandidate', e => {
    if (e.candidate) {
      const parsedCandidate = SDPUtils.parseCandidate(e.candidate.candidate);
      if (parsedCandidate.type === 'relay') {
        // This is a libwebrtc-specific mapping of local type preference
        // to relayProtocol.
        e.candidate.relayProtocol = {
          0: 'tls',
          1: 'tcp',
          2: 'udp'
        }[parsedCandidate.priority >> 24];
      }
    }
    return e;
  });
}
function shimMaxMessageSize(window, browserDetails) {
  if (!window.RTCPeerConnection) {
    return;
  }
  if (!('sctp' in window.RTCPeerConnection.prototype)) {
    Object.defineProperty(window.RTCPeerConnection.prototype, 'sctp', {
      get() {
        return typeof this._sctp === 'undefined' ? null : this._sctp;
      }
    });
  }
  const sctpInDescription = function (description) {
    if (!description || !description.sdp) {
      return false;
    }
    const sections = SDPUtils.splitSections(description.sdp);
    sections.shift();
    return sections.some(mediaSection => {
      const mLine = SDPUtils.parseMLine(mediaSection);
      return mLine && mLine.kind === 'application' && mLine.protocol.indexOf('SCTP') !== -1;
    });
  };
  const getRemoteFirefoxVersion = function (description) {
    // TODO: Is there a better solution for detecting Firefox?
    const match = description.sdp.match(/mozilla...THIS_IS_SDPARTA-(\d+)/);
    if (match === null || match.length < 2) {
      return -1;
    }
    const version = parseInt(match[1], 10);
    // Test for NaN (yes, this is ugly)
    return version !== version ? -1 : version;
  };
  const getCanSendMaxMessageSize = function (remoteIsFirefox) {
    // Every implementation we know can send at least 64 KiB.
    // Note: Although Chrome is technically able to send up to 256 KiB, the
    //       data does not reach the other peer reliably.
    //       See: https://bugs.chromium.org/p/webrtc/issues/detail?id=8419
    let canSendMaxMessageSize = 65536;
    if (browserDetails.browser === 'firefox') {
      if (browserDetails.version < 57) {
        if (remoteIsFirefox === -1) {
          // FF < 57 will send in 16 KiB chunks using the deprecated PPID
          // fragmentation.
          canSendMaxMessageSize = 16384;
        } else {
          // However, other FF (and RAWRTC) can reassemble PPID-fragmented
          // messages. Thus, supporting ~2 GiB when sending.
          canSendMaxMessageSize = 2147483637;
        }
      } else if (browserDetails.version < 60) {
        // Currently, all FF >= 57 will reset the remote maximum message size
        // to the default value when a data channel is created at a later
        // stage. :(
        // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1426831
        canSendMaxMessageSize = browserDetails.version === 57 ? 65535 : 65536;
      } else {
        // FF >= 60 supports sending ~2 GiB
        canSendMaxMessageSize = 2147483637;
      }
    }
    return canSendMaxMessageSize;
  };
  const getMaxMessageSize = function (description, remoteIsFirefox) {
    // Note: 65536 bytes is the default value from the SDP spec. Also,
    //       every implementation we know supports receiving 65536 bytes.
    let maxMessageSize = 65536;

    // FF 57 has a slightly incorrect default remote max message size, so
    // we need to adjust it here to avoid a failure when sending.
    // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1425697
    if (browserDetails.browser === 'firefox' && browserDetails.version === 57) {
      maxMessageSize = 65535;
    }
    const match = SDPUtils.matchPrefix(description.sdp, 'a=max-message-size:');
    if (match.length > 0) {
      maxMessageSize = parseInt(match[0].substring(19), 10);
    } else if (browserDetails.browser === 'firefox' && remoteIsFirefox !== -1) {
      // If the maximum message size is not present in the remote SDP and
      // both local and remote are Firefox, the remote peer can receive
      // ~2 GiB.
      maxMessageSize = 2147483637;
    }
    return maxMessageSize;
  };
  const origSetRemoteDescription = window.RTCPeerConnection.prototype.setRemoteDescription;
  window.RTCPeerConnection.prototype.setRemoteDescription = function setRemoteDescription() {
    this._sctp = null;
    // Chrome decided to not expose .sctp in plan-b mode.
    // As usual, adapter.js has to do an 'ugly worakaround'
    // to cover up the mess.
    if (browserDetails.browser === 'chrome' && browserDetails.version >= 76) {
      const {
        sdpSemantics
      } = this.getConfiguration();
      if (sdpSemantics === 'plan-b') {
        Object.defineProperty(this, 'sctp', {
          get() {
            return typeof this._sctp === 'undefined' ? null : this._sctp;
          },
          enumerable: true,
          configurable: true
        });
      }
    }
    if (sctpInDescription(arguments[0])) {
      // Check if the remote is FF.
      const isFirefox = getRemoteFirefoxVersion(arguments[0]);

      // Get the maximum message size the local peer is capable of sending
      const canSendMMS = getCanSendMaxMessageSize(isFirefox);

      // Get the maximum message size of the remote peer.
      const remoteMMS = getMaxMessageSize(arguments[0], isFirefox);

      // Determine final maximum message size
      let maxMessageSize;
      if (canSendMMS === 0 && remoteMMS === 0) {
        maxMessageSize = Number.POSITIVE_INFINITY;
      } else if (canSendMMS === 0 || remoteMMS === 0) {
        maxMessageSize = Math.max(canSendMMS, remoteMMS);
      } else {
        maxMessageSize = Math.min(canSendMMS, remoteMMS);
      }

      // Create a dummy RTCSctpTransport object and the 'maxMessageSize'
      // attribute.
      const sctp = {};
      Object.defineProperty(sctp, 'maxMessageSize', {
        get() {
          return maxMessageSize;
        }
      });
      this._sctp = sctp;
    }
    return origSetRemoteDescription.apply(this, arguments);
  };
}
function shimSendThrowTypeError(window) {
  if (!(window.RTCPeerConnection && 'createDataChannel' in window.RTCPeerConnection.prototype)) {
    return;
  }

  // Note: Although Firefox >= 57 has a native implementation, the maximum
  //       message size can be reset for all data channels at a later stage.
  //       See: https://bugzilla.mozilla.org/show_bug.cgi?id=1426831

  function wrapDcSend(dc, pc) {
    const origDataChannelSend = dc.send;
    dc.send = function send() {
      const data = arguments[0];
      const length = data.length || data.size || data.byteLength;
      if (dc.readyState === 'open' && pc.sctp && length > pc.sctp.maxMessageSize) {
        throw new TypeError('Message too large (can send a maximum of ' + pc.sctp.maxMessageSize + ' bytes)');
      }
      return origDataChannelSend.apply(dc, arguments);
    };
  }
  const origCreateDataChannel = window.RTCPeerConnection.prototype.createDataChannel;
  window.RTCPeerConnection.prototype.createDataChannel = function createDataChannel() {
    const dataChannel = origCreateDataChannel.apply(this, arguments);
    wrapDcSend(dataChannel, this);
    return dataChannel;
  };
  wrapPeerConnectionEvent(window, 'datachannel', e => {
    wrapDcSend(e.channel, e.target);
    return e;
  });
}

/* shims RTCConnectionState by pretending it is the same as iceConnectionState.
 * See https://bugs.chromium.org/p/webrtc/issues/detail?id=6145#c12
 * for why this is a valid hack in Chrome. In Firefox it is slightly incorrect
 * since DTLS failures would be hidden. See
 * https://bugzilla.mozilla.org/show_bug.cgi?id=1265827
 * for the Firefox tracking bug.
 */
function shimConnectionState(window) {
  if (!window.RTCPeerConnection || 'connectionState' in window.RTCPeerConnection.prototype) {
    return;
  }
  const proto = window.RTCPeerConnection.prototype;
  Object.defineProperty(proto, 'connectionState', {
    get() {
      return {
        completed: 'connected',
        checking: 'connecting'
      }[this.iceConnectionState] || this.iceConnectionState;
    },
    enumerable: true,
    configurable: true
  });
  Object.defineProperty(proto, 'onconnectionstatechange', {
    get() {
      return this._onconnectionstatechange || null;
    },
    set(cb) {
      if (this._onconnectionstatechange) {
        this.removeEventListener('connectionstatechange', this._onconnectionstatechange);
        delete this._onconnectionstatechange;
      }
      if (cb) {
        this.addEventListener('connectionstatechange', this._onconnectionstatechange = cb);
      }
    },
    enumerable: true,
    configurable: true
  });
  ['setLocalDescription', 'setRemoteDescription'].forEach(method => {
    const origMethod = proto[method];
    proto[method] = function () {
      if (!this._connectionstatechangepoly) {
        this._connectionstatechangepoly = e => {
          const pc = e.target;
          if (pc._lastConnectionState !== pc.connectionState) {
            pc._lastConnectionState = pc.connectionState;
            const newEvent = new Event('connectionstatechange', e);
            pc.dispatchEvent(newEvent);
          }
          return e;
        };
        this.addEventListener('iceconnectionstatechange', this._connectionstatechangepoly);
      }
      return origMethod.apply(this, arguments);
    };
  });
}
function removeExtmapAllowMixed(window, browserDetails) {
  /* remove a=extmap-allow-mixed for webrtc.org < M71 */
  if (!window.RTCPeerConnection) {
    return;
  }
  if (browserDetails.browser === 'chrome' && browserDetails.version >= 71) {
    return;
  }
  if (browserDetails.browser === 'safari' && browserDetails.version >= 605) {
    return;
  }
  const nativeSRD = window.RTCPeerConnection.prototype.setRemoteDescription;
  window.RTCPeerConnection.prototype.setRemoteDescription = function setRemoteDescription(desc) {
    if (desc && desc.sdp && desc.sdp.indexOf('\na=extmap-allow-mixed') !== -1) {
      const sdp = desc.sdp.split('\n').filter(line => {
        return line.trim() !== 'a=extmap-allow-mixed';
      }).join('\n');
      // Safari enforces read-only-ness of RTCSessionDescription fields.
      if (window.RTCSessionDescription && desc instanceof window.RTCSessionDescription) {
        arguments[0] = new window.RTCSessionDescription({
          type: desc.type,
          sdp
        });
      } else {
        desc.sdp = sdp;
      }
    }
    return nativeSRD.apply(this, arguments);
  };
}
function shimAddIceCandidateNullOrEmpty(window, browserDetails) {
  // Support for addIceCandidate(null or undefined)
  // as well as addIceCandidate({candidate: "", ...})
  // https://bugs.chromium.org/p/chromium/issues/detail?id=978582
  // Note: must be called before other polyfills which change the signature.
  if (!(window.RTCPeerConnection && window.RTCPeerConnection.prototype)) {
    return;
  }
  const nativeAddIceCandidate = window.RTCPeerConnection.prototype.addIceCandidate;
  if (!nativeAddIceCandidate || nativeAddIceCandidate.length === 0) {
    return;
  }
  window.RTCPeerConnection.prototype.addIceCandidate = function addIceCandidate() {
    if (!arguments[0]) {
      if (arguments[1]) {
        arguments[1].apply(null);
      }
      return Promise.resolve();
    }
    // Firefox 68+ emits and processes {candidate: "", ...}, ignore
    // in older versions.
    // Native support for ignoring exists for Chrome M77+.
    // Safari ignores as well, exact version unknown but works in the same
    // version that also ignores addIceCandidate(null).
    if ((browserDetails.browser === 'chrome' && browserDetails.version < 78 || browserDetails.browser === 'firefox' && browserDetails.version < 68 || browserDetails.browser === 'safari') && arguments[0] && arguments[0].candidate === '') {
      return Promise.resolve();
    }
    return nativeAddIceCandidate.apply(this, arguments);
  };
}

// Note: Make sure to call this ahead of APIs that modify
// setLocalDescription.length
function shimParameterlessSetLocalDescription(window, browserDetails) {
  if (!(window.RTCPeerConnection && window.RTCPeerConnection.prototype)) {
    return;
  }
  const nativeSetLocalDescription = window.RTCPeerConnection.prototype.setLocalDescription;
  if (!nativeSetLocalDescription || nativeSetLocalDescription.length === 0) {
    return;
  }
  window.RTCPeerConnection.prototype.setLocalDescription = function setLocalDescription() {
    let desc = arguments[0] || {};
    if (typeof desc !== 'object' || desc.type && desc.sdp) {
      return nativeSetLocalDescription.apply(this, arguments);
    }
    // The remaining steps should technically happen when SLD comes off the
    // RTCPeerConnection's operations chain (not ahead of going on it), but
    // this is too difficult to shim. Instead, this shim only covers the
    // common case where the operations chain is empty. This is imperfect, but
    // should cover many cases. Rationale: Even if we can't reduce the glare
    // window to zero on imperfect implementations, there's value in tapping
    // into the perfect negotiation pattern that several browsers support.
    desc = {
      type: desc.type,
      sdp: desc.sdp
    };
    if (!desc.type) {
      switch (this.signalingState) {
        case 'stable':
        case 'have-local-offer':
        case 'have-remote-pranswer':
          desc.type = 'offer';
          break;
        default:
          desc.type = 'answer';
          break;
      }
    }
    if (desc.sdp || desc.type !== 'offer' && desc.type !== 'answer') {
      return nativeSetLocalDescription.apply(this, [desc]);
    }
    const func = desc.type === 'offer' ? this.createOffer : this.createAnswer;
    return func.apply(this).then(d => nativeSetLocalDescription.apply(this, [d]));
  };
}

var commonShim = /*#__PURE__*/Object.freeze({
	__proto__: null,
	removeExtmapAllowMixed: removeExtmapAllowMixed,
	shimAddIceCandidateNullOrEmpty: shimAddIceCandidateNullOrEmpty,
	shimConnectionState: shimConnectionState,
	shimMaxMessageSize: shimMaxMessageSize,
	shimParameterlessSetLocalDescription: shimParameterlessSetLocalDescription,
	shimRTCIceCandidate: shimRTCIceCandidate,
	shimRTCIceCandidateRelayProtocol: shimRTCIceCandidateRelayProtocol,
	shimSendThrowTypeError: shimSendThrowTypeError
});

/*
 *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

// Shimming starts here.
function adapterFactory() {
  let {
    window
  } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
    shimChrome: true,
    shimFirefox: true,
    shimSafari: true
  };
  // Utils.
  const logging = log;
  const browserDetails = detectBrowser(window);
  const adapter = {
    browserDetails,
    commonShim,
    extractVersion: extractVersion,
    disableLog: disableLog,
    disableWarnings: disableWarnings,
    // Expose sdp as a convenience. For production apps include directly.
    sdp
  };

  // Shim browser if found.
  switch (browserDetails.browser) {
    case 'chrome':
      if (!chromeShim || !shimPeerConnection$1 || !options.shimChrome) {
        logging('Chrome shim is not included in this adapter release.');
        return adapter;
      }
      if (browserDetails.version === null) {
        logging('Chrome shim can not determine version, not shimming.');
        return adapter;
      }
      logging('adapter.js shimming chrome.');
      // Export to the adapter global object visible in the browser.
      adapter.browserShim = chromeShim;

      // Must be called before shimPeerConnection.
      shimAddIceCandidateNullOrEmpty(window, browserDetails);
      shimParameterlessSetLocalDescription(window);
      shimGetUserMedia$2(window, browserDetails);
      shimMediaStream(window);
      shimPeerConnection$1(window, browserDetails);
      shimOnTrack$1(window);
      shimAddTrackRemoveTrack(window, browserDetails);
      shimGetSendersWithDtmf(window);
      shimGetStats(window);
      shimSenderReceiverGetStats(window);
      fixNegotiationNeeded(window, browserDetails);
      shimRTCIceCandidate(window);
      shimRTCIceCandidateRelayProtocol(window);
      shimConnectionState(window);
      shimMaxMessageSize(window, browserDetails);
      shimSendThrowTypeError(window);
      removeExtmapAllowMixed(window, browserDetails);
      break;
    case 'firefox':
      if (!firefoxShim || !shimPeerConnection || !options.shimFirefox) {
        logging('Firefox shim is not included in this adapter release.');
        return adapter;
      }
      logging('adapter.js shimming firefox.');
      // Export to the adapter global object visible in the browser.
      adapter.browserShim = firefoxShim;

      // Must be called before shimPeerConnection.
      shimAddIceCandidateNullOrEmpty(window, browserDetails);
      shimParameterlessSetLocalDescription(window);
      shimGetUserMedia$1(window, browserDetails);
      shimPeerConnection(window, browserDetails);
      shimOnTrack(window);
      shimRemoveStream(window);
      shimSenderGetStats(window);
      shimReceiverGetStats(window);
      shimRTCDataChannel(window);
      shimAddTransceiver(window);
      shimGetParameters(window);
      shimCreateOffer(window);
      shimCreateAnswer(window);
      shimRTCIceCandidate(window);
      shimConnectionState(window);
      shimMaxMessageSize(window, browserDetails);
      shimSendThrowTypeError(window);
      break;
    case 'safari':
      if (!safariShim || !options.shimSafari) {
        logging('Safari shim is not included in this adapter release.');
        return adapter;
      }
      logging('adapter.js shimming safari.');
      // Export to the adapter global object visible in the browser.
      adapter.browserShim = safariShim;

      // Must be called before shimCallbackAPI.
      shimAddIceCandidateNullOrEmpty(window, browserDetails);
      shimParameterlessSetLocalDescription(window);
      shimRTCIceServerUrls(window);
      shimCreateOfferLegacy(window);
      shimCallbacksAPI(window);
      shimLocalStreamsAPI(window);
      shimRemoteStreamsAPI(window);
      shimTrackEventTransceiver(window);
      shimGetUserMedia(window);
      shimAudioContext(window);
      shimRTCIceCandidate(window);
      shimRTCIceCandidateRelayProtocol(window);
      shimMaxMessageSize(window, browserDetails);
      shimSendThrowTypeError(window);
      removeExtmapAllowMixed(window, browserDetails);
      break;
    default:
      logging('Unsupported browser!');
      break;
  }
  return adapter;
}

/*
 *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* eslint-env node */

adapterFactory({
  window: typeof window === 'undefined' ? undefined : window
});

// Copyright 2023 LiveKit, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * @generated from enum livekit.SignalTarget
 */
var SignalTarget;
(function (SignalTarget) {
  /**
   * @generated from enum value: PUBLISHER = 0;
   */
  SignalTarget[SignalTarget["PUBLISHER"] = 0] = "PUBLISHER";
  /**
   * @generated from enum value: SUBSCRIBER = 1;
   */
  SignalTarget[SignalTarget["SUBSCRIBER"] = 1] = "SUBSCRIBER";
})(SignalTarget || (SignalTarget = {}));
// Retrieve enum metadata with: proto3.getEnumType(SignalTarget)
proto3.util.setEnumType(SignalTarget, "livekit.SignalTarget", [{
  no: 0,
  name: "PUBLISHER"
}, {
  no: 1,
  name: "SUBSCRIBER"
}]);
/**
 * @generated from enum livekit.StreamState
 */
var StreamState;
(function (StreamState) {
  /**
   * @generated from enum value: ACTIVE = 0;
   */
  StreamState[StreamState["ACTIVE"] = 0] = "ACTIVE";
  /**
   * @generated from enum value: PAUSED = 1;
   */
  StreamState[StreamState["PAUSED"] = 1] = "PAUSED";
})(StreamState || (StreamState = {}));
// Retrieve enum metadata with: proto3.getEnumType(StreamState)
proto3.util.setEnumType(StreamState, "livekit.StreamState", [{
  no: 0,
  name: "ACTIVE"
}, {
  no: 1,
  name: "PAUSED"
}]);
/**
 * @generated from enum livekit.CandidateProtocol
 */
var CandidateProtocol;
(function (CandidateProtocol) {
  /**
   * @generated from enum value: UDP = 0;
   */
  CandidateProtocol[CandidateProtocol["UDP"] = 0] = "UDP";
  /**
   * @generated from enum value: TCP = 1;
   */
  CandidateProtocol[CandidateProtocol["TCP"] = 1] = "TCP";
  /**
   * @generated from enum value: TLS = 2;
   */
  CandidateProtocol[CandidateProtocol["TLS"] = 2] = "TLS";
})(CandidateProtocol || (CandidateProtocol = {}));
// Retrieve enum metadata with: proto3.getEnumType(CandidateProtocol)
proto3.util.setEnumType(CandidateProtocol, "livekit.CandidateProtocol", [{
  no: 0,
  name: "UDP"
}, {
  no: 1,
  name: "TCP"
}, {
  no: 2,
  name: "TLS"
}]);
/**
 * @generated from message livekit.SignalRequest
 */
class SignalRequest extends Message {
  constructor(data) {
    super();
    /**
     * @generated from oneof livekit.SignalRequest.message
     */
    this.message = {
      case: undefined
    };
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SignalRequest().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SignalRequest().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SignalRequest().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SignalRequest, a, b);
  }
}
SignalRequest.runtime = proto3;
SignalRequest.typeName = "livekit.SignalRequest";
SignalRequest.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "offer",
  kind: "message",
  T: SessionDescription,
  oneof: "message"
}, {
  no: 2,
  name: "answer",
  kind: "message",
  T: SessionDescription,
  oneof: "message"
}, {
  no: 3,
  name: "trickle",
  kind: "message",
  T: TrickleRequest,
  oneof: "message"
}, {
  no: 4,
  name: "add_track",
  kind: "message",
  T: AddTrackRequest,
  oneof: "message"
}, {
  no: 5,
  name: "mute",
  kind: "message",
  T: MuteTrackRequest,
  oneof: "message"
}, {
  no: 6,
  name: "subscription",
  kind: "message",
  T: UpdateSubscription,
  oneof: "message"
}, {
  no: 7,
  name: "track_setting",
  kind: "message",
  T: UpdateTrackSettings,
  oneof: "message"
}, {
  no: 8,
  name: "leave",
  kind: "message",
  T: LeaveRequest,
  oneof: "message"
}, {
  no: 10,
  name: "update_layers",
  kind: "message",
  T: UpdateVideoLayers,
  oneof: "message"
}, {
  no: 11,
  name: "subscription_permission",
  kind: "message",
  T: SubscriptionPermission,
  oneof: "message"
}, {
  no: 12,
  name: "sync_state",
  kind: "message",
  T: SyncState,
  oneof: "message"
}, {
  no: 13,
  name: "simulate",
  kind: "message",
  T: SimulateScenario,
  oneof: "message"
}, {
  no: 14,
  name: "ping",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */,
  oneof: "message"
}, {
  no: 15,
  name: "update_metadata",
  kind: "message",
  T: UpdateParticipantMetadata,
  oneof: "message"
}, {
  no: 16,
  name: "ping_req",
  kind: "message",
  T: Ping,
  oneof: "message"
}]);
/**
 * @generated from message livekit.SignalResponse
 */
class SignalResponse extends Message {
  constructor(data) {
    super();
    /**
     * @generated from oneof livekit.SignalResponse.message
     */
    this.message = {
      case: undefined
    };
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SignalResponse().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SignalResponse().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SignalResponse().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SignalResponse, a, b);
  }
}
SignalResponse.runtime = proto3;
SignalResponse.typeName = "livekit.SignalResponse";
SignalResponse.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "join",
  kind: "message",
  T: JoinResponse,
  oneof: "message"
}, {
  no: 2,
  name: "answer",
  kind: "message",
  T: SessionDescription,
  oneof: "message"
}, {
  no: 3,
  name: "offer",
  kind: "message",
  T: SessionDescription,
  oneof: "message"
}, {
  no: 4,
  name: "trickle",
  kind: "message",
  T: TrickleRequest,
  oneof: "message"
}, {
  no: 5,
  name: "update",
  kind: "message",
  T: ParticipantUpdate,
  oneof: "message"
}, {
  no: 6,
  name: "track_published",
  kind: "message",
  T: TrackPublishedResponse,
  oneof: "message"
}, {
  no: 8,
  name: "leave",
  kind: "message",
  T: LeaveRequest,
  oneof: "message"
}, {
  no: 9,
  name: "mute",
  kind: "message",
  T: MuteTrackRequest,
  oneof: "message"
}, {
  no: 10,
  name: "speakers_changed",
  kind: "message",
  T: SpeakersChanged,
  oneof: "message"
}, {
  no: 11,
  name: "room_update",
  kind: "message",
  T: RoomUpdate,
  oneof: "message"
}, {
  no: 12,
  name: "connection_quality",
  kind: "message",
  T: ConnectionQualityUpdate,
  oneof: "message"
}, {
  no: 13,
  name: "stream_state_update",
  kind: "message",
  T: StreamStateUpdate,
  oneof: "message"
}, {
  no: 14,
  name: "subscribed_quality_update",
  kind: "message",
  T: SubscribedQualityUpdate,
  oneof: "message"
}, {
  no: 15,
  name: "subscription_permission_update",
  kind: "message",
  T: SubscriptionPermissionUpdate,
  oneof: "message"
}, {
  no: 16,
  name: "refresh_token",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */,
  oneof: "message"
}, {
  no: 17,
  name: "track_unpublished",
  kind: "message",
  T: TrackUnpublishedResponse,
  oneof: "message"
}, {
  no: 18,
  name: "pong",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */,
  oneof: "message"
}, {
  no: 19,
  name: "reconnect",
  kind: "message",
  T: ReconnectResponse,
  oneof: "message"
}, {
  no: 20,
  name: "pong_resp",
  kind: "message",
  T: Pong,
  oneof: "message"
}, {
  no: 21,
  name: "subscription_response",
  kind: "message",
  T: SubscriptionResponse,
  oneof: "message"
}]);
/**
 * @generated from message livekit.SimulcastCodec
 */
class SimulcastCodec extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string codec = 1;
     */
    this.codec = "";
    /**
     * @generated from field: string cid = 2;
     */
    this.cid = "";
    /**
     * @generated from field: bool enable_simulcast_layers = 3;
     */
    this.enableSimulcastLayers = false;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SimulcastCodec().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SimulcastCodec().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SimulcastCodec().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SimulcastCodec, a, b);
  }
}
SimulcastCodec.runtime = proto3;
SimulcastCodec.typeName = "livekit.SimulcastCodec";
SimulcastCodec.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "codec",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "cid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 3,
  name: "enable_simulcast_layers",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}]);
/**
 * @generated from message livekit.AddTrackRequest
 */
class AddTrackRequest extends Message {
  constructor(data) {
    super();
    /**
     * client ID of track, to match it when RTC track is received
     *
     * @generated from field: string cid = 1;
     */
    this.cid = "";
    /**
     * @generated from field: string name = 2;
     */
    this.name = "";
    /**
     * @generated from field: livekit.TrackType type = 3;
     */
    this.type = TrackType.AUDIO;
    /**
     * to be deprecated in favor of layers
     *
     * @generated from field: uint32 width = 4;
     */
    this.width = 0;
    /**
     * @generated from field: uint32 height = 5;
     */
    this.height = 0;
    /**
     * true to add track and initialize to muted
     *
     * @generated from field: bool muted = 6;
     */
    this.muted = false;
    /**
     * true if DTX (Discontinuous Transmission) is disabled for audio
     *
     * @generated from field: bool disable_dtx = 7;
     */
    this.disableDtx = false;
    /**
     * @generated from field: livekit.TrackSource source = 8;
     */
    this.source = TrackSource.UNKNOWN;
    /**
     * @generated from field: repeated livekit.VideoLayer layers = 9;
     */
    this.layers = [];
    /**
     * @generated from field: repeated livekit.SimulcastCodec simulcast_codecs = 10;
     */
    this.simulcastCodecs = [];
    /**
     * server ID of track, publish new codec to exist track
     *
     * @generated from field: string sid = 11;
     */
    this.sid = "";
    /**
     * @generated from field: bool stereo = 12;
     */
    this.stereo = false;
    /**
     * true if RED (Redundant Encoding) is disabled for audio
     *
     * @generated from field: bool disable_red = 13;
     */
    this.disableRed = false;
    /**
     * @generated from field: livekit.Encryption.Type encryption = 14;
     */
    this.encryption = Encryption_Type.NONE;
    /**
     * which stream the track belongs to, used to group tracks together.
     * if not specified, server will infer it from track source to bundle camera/microphone, screenshare/audio together
     *
     * @generated from field: string stream = 15;
     */
    this.stream = "";
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new AddTrackRequest().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new AddTrackRequest().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new AddTrackRequest().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(AddTrackRequest, a, b);
  }
}
AddTrackRequest.runtime = proto3;
AddTrackRequest.typeName = "livekit.AddTrackRequest";
AddTrackRequest.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "cid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "name",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 3,
  name: "type",
  kind: "enum",
  T: proto3.getEnumType(TrackType)
}, {
  no: 4,
  name: "width",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 5,
  name: "height",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 6,
  name: "muted",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 7,
  name: "disable_dtx",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 8,
  name: "source",
  kind: "enum",
  T: proto3.getEnumType(TrackSource)
}, {
  no: 9,
  name: "layers",
  kind: "message",
  T: VideoLayer,
  repeated: true
}, {
  no: 10,
  name: "simulcast_codecs",
  kind: "message",
  T: SimulcastCodec,
  repeated: true
}, {
  no: 11,
  name: "sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 12,
  name: "stereo",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 13,
  name: "disable_red",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 14,
  name: "encryption",
  kind: "enum",
  T: proto3.getEnumType(Encryption_Type)
}, {
  no: 15,
  name: "stream",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}]);
/**
 * @generated from message livekit.TrickleRequest
 */
class TrickleRequest extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string candidateInit = 1;
     */
    this.candidateInit = "";
    /**
     * @generated from field: livekit.SignalTarget target = 2;
     */
    this.target = SignalTarget.PUBLISHER;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new TrickleRequest().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new TrickleRequest().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new TrickleRequest().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(TrickleRequest, a, b);
  }
}
TrickleRequest.runtime = proto3;
TrickleRequest.typeName = "livekit.TrickleRequest";
TrickleRequest.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "candidateInit",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "target",
  kind: "enum",
  T: proto3.getEnumType(SignalTarget)
}]);
/**
 * @generated from message livekit.MuteTrackRequest
 */
class MuteTrackRequest extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string sid = 1;
     */
    this.sid = "";
    /**
     * @generated from field: bool muted = 2;
     */
    this.muted = false;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new MuteTrackRequest().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new MuteTrackRequest().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new MuteTrackRequest().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(MuteTrackRequest, a, b);
  }
}
MuteTrackRequest.runtime = proto3;
MuteTrackRequest.typeName = "livekit.MuteTrackRequest";
MuteTrackRequest.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "muted",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}]);
/**
 * @generated from message livekit.JoinResponse
 */
class JoinResponse extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated livekit.ParticipantInfo other_participants = 3;
     */
    this.otherParticipants = [];
    /**
     * deprecated. use server_info.version instead.
     *
     * @generated from field: string server_version = 4;
     */
    this.serverVersion = "";
    /**
     * @generated from field: repeated livekit.ICEServer ice_servers = 5;
     */
    this.iceServers = [];
    /**
     * use subscriber as the primary PeerConnection
     *
     * @generated from field: bool subscriber_primary = 6;
     */
    this.subscriberPrimary = false;
    /**
     * when the current server isn't available, return alternate url to retry connection
     * when this is set, the other fields will be largely empty
     *
     * @generated from field: string alternative_url = 7;
     */
    this.alternativeUrl = "";
    /**
     * deprecated. use server_info.region instead.
     *
     * @generated from field: string server_region = 9;
     */
    this.serverRegion = "";
    /**
     * @generated from field: int32 ping_timeout = 10;
     */
    this.pingTimeout = 0;
    /**
     * @generated from field: int32 ping_interval = 11;
     */
    this.pingInterval = 0;
    /**
     * Server-Injected-Frame byte trailer, used to identify unencrypted frames when e2ee is enabled
     *
     * @generated from field: bytes sif_trailer = 13;
     */
    this.sifTrailer = new Uint8Array(0);
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new JoinResponse().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new JoinResponse().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new JoinResponse().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(JoinResponse, a, b);
  }
}
JoinResponse.runtime = proto3;
JoinResponse.typeName = "livekit.JoinResponse";
JoinResponse.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "room",
  kind: "message",
  T: Room$1
}, {
  no: 2,
  name: "participant",
  kind: "message",
  T: ParticipantInfo
}, {
  no: 3,
  name: "other_participants",
  kind: "message",
  T: ParticipantInfo,
  repeated: true
}, {
  no: 4,
  name: "server_version",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 5,
  name: "ice_servers",
  kind: "message",
  T: ICEServer,
  repeated: true
}, {
  no: 6,
  name: "subscriber_primary",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 7,
  name: "alternative_url",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 8,
  name: "client_configuration",
  kind: "message",
  T: ClientConfiguration
}, {
  no: 9,
  name: "server_region",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 10,
  name: "ping_timeout",
  kind: "scalar",
  T: 5 /* ScalarType.INT32 */
}, {
  no: 11,
  name: "ping_interval",
  kind: "scalar",
  T: 5 /* ScalarType.INT32 */
}, {
  no: 12,
  name: "server_info",
  kind: "message",
  T: ServerInfo
}, {
  no: 13,
  name: "sif_trailer",
  kind: "scalar",
  T: 12 /* ScalarType.BYTES */
}]);
/**
 * @generated from message livekit.ReconnectResponse
 */
class ReconnectResponse extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated livekit.ICEServer ice_servers = 1;
     */
    this.iceServers = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ReconnectResponse().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ReconnectResponse().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ReconnectResponse().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ReconnectResponse, a, b);
  }
}
ReconnectResponse.runtime = proto3;
ReconnectResponse.typeName = "livekit.ReconnectResponse";
ReconnectResponse.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "ice_servers",
  kind: "message",
  T: ICEServer,
  repeated: true
}, {
  no: 2,
  name: "client_configuration",
  kind: "message",
  T: ClientConfiguration
}]);
/**
 * @generated from message livekit.TrackPublishedResponse
 */
class TrackPublishedResponse extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string cid = 1;
     */
    this.cid = "";
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new TrackPublishedResponse().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new TrackPublishedResponse().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new TrackPublishedResponse().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(TrackPublishedResponse, a, b);
  }
}
TrackPublishedResponse.runtime = proto3;
TrackPublishedResponse.typeName = "livekit.TrackPublishedResponse";
TrackPublishedResponse.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "cid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "track",
  kind: "message",
  T: TrackInfo
}]);
/**
 * @generated from message livekit.TrackUnpublishedResponse
 */
class TrackUnpublishedResponse extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string track_sid = 1;
     */
    this.trackSid = "";
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new TrackUnpublishedResponse().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new TrackUnpublishedResponse().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new TrackUnpublishedResponse().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(TrackUnpublishedResponse, a, b);
  }
}
TrackUnpublishedResponse.runtime = proto3;
TrackUnpublishedResponse.typeName = "livekit.TrackUnpublishedResponse";
TrackUnpublishedResponse.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "track_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}]);
/**
 * @generated from message livekit.SessionDescription
 */
class SessionDescription extends Message {
  constructor(data) {
    super();
    /**
     * "answer" | "offer" | "pranswer" | "rollback"
     *
     * @generated from field: string type = 1;
     */
    this.type = "";
    /**
     * @generated from field: string sdp = 2;
     */
    this.sdp = "";
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SessionDescription().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SessionDescription().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SessionDescription().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SessionDescription, a, b);
  }
}
SessionDescription.runtime = proto3;
SessionDescription.typeName = "livekit.SessionDescription";
SessionDescription.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "type",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "sdp",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}]);
/**
 * @generated from message livekit.ParticipantUpdate
 */
class ParticipantUpdate extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated livekit.ParticipantInfo participants = 1;
     */
    this.participants = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ParticipantUpdate().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ParticipantUpdate().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ParticipantUpdate().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ParticipantUpdate, a, b);
  }
}
ParticipantUpdate.runtime = proto3;
ParticipantUpdate.typeName = "livekit.ParticipantUpdate";
ParticipantUpdate.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "participants",
  kind: "message",
  T: ParticipantInfo,
  repeated: true
}]);
/**
 * @generated from message livekit.UpdateSubscription
 */
class UpdateSubscription extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated string track_sids = 1;
     */
    this.trackSids = [];
    /**
     * @generated from field: bool subscribe = 2;
     */
    this.subscribe = false;
    /**
     * @generated from field: repeated livekit.ParticipantTracks participant_tracks = 3;
     */
    this.participantTracks = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new UpdateSubscription().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new UpdateSubscription().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new UpdateSubscription().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(UpdateSubscription, a, b);
  }
}
UpdateSubscription.runtime = proto3;
UpdateSubscription.typeName = "livekit.UpdateSubscription";
UpdateSubscription.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "track_sids",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */,
  repeated: true
}, {
  no: 2,
  name: "subscribe",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 3,
  name: "participant_tracks",
  kind: "message",
  T: ParticipantTracks,
  repeated: true
}]);
/**
 * @generated from message livekit.UpdateTrackSettings
 */
class UpdateTrackSettings extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated string track_sids = 1;
     */
    this.trackSids = [];
    /**
     * when true, the track is placed in a paused state, with no new data returned
     *
     * @generated from field: bool disabled = 3;
     */
    this.disabled = false;
    /**
     * deprecated in favor of width & height
     *
     * @generated from field: livekit.VideoQuality quality = 4;
     */
    this.quality = VideoQuality.LOW;
    /**
     * for video, width to receive
     *
     * @generated from field: uint32 width = 5;
     */
    this.width = 0;
    /**
     * for video, height to receive
     *
     * @generated from field: uint32 height = 6;
     */
    this.height = 0;
    /**
     * @generated from field: uint32 fps = 7;
     */
    this.fps = 0;
    /**
     * subscription priority. 1 being the highest (0 is unset)
     * when unset, server sill assign priority based on the order of subscription
     * server will use priority in the following ways:
     * 1. when subscribed tracks exceed per-participant subscription limit, server will
     *    pause the lowest priority tracks
     * 2. when the network is congested, server will assign available bandwidth to
     *    higher priority tracks first. lowest priority tracks can be paused
     *
     * @generated from field: uint32 priority = 8;
     */
    this.priority = 0;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new UpdateTrackSettings().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new UpdateTrackSettings().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new UpdateTrackSettings().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(UpdateTrackSettings, a, b);
  }
}
UpdateTrackSettings.runtime = proto3;
UpdateTrackSettings.typeName = "livekit.UpdateTrackSettings";
UpdateTrackSettings.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "track_sids",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */,
  repeated: true
}, {
  no: 3,
  name: "disabled",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 4,
  name: "quality",
  kind: "enum",
  T: proto3.getEnumType(VideoQuality)
}, {
  no: 5,
  name: "width",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 6,
  name: "height",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 7,
  name: "fps",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 8,
  name: "priority",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}]);
/**
 * @generated from message livekit.LeaveRequest
 */
class LeaveRequest extends Message {
  constructor(data) {
    super();
    /**
     * sent when server initiates the disconnect due to server-restart
     * indicates clients should attempt full-reconnect sequence
     *
     * @generated from field: bool can_reconnect = 1;
     */
    this.canReconnect = false;
    /**
     * @generated from field: livekit.DisconnectReason reason = 2;
     */
    this.reason = DisconnectReason.UNKNOWN_REASON;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new LeaveRequest().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new LeaveRequest().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new LeaveRequest().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(LeaveRequest, a, b);
  }
}
LeaveRequest.runtime = proto3;
LeaveRequest.typeName = "livekit.LeaveRequest";
LeaveRequest.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "can_reconnect",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 2,
  name: "reason",
  kind: "enum",
  T: proto3.getEnumType(DisconnectReason)
}]);
/**
 * message to indicate published video track dimensions are changing
 *
 * @generated from message livekit.UpdateVideoLayers
 */
class UpdateVideoLayers extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string track_sid = 1;
     */
    this.trackSid = "";
    /**
     * @generated from field: repeated livekit.VideoLayer layers = 2;
     */
    this.layers = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new UpdateVideoLayers().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new UpdateVideoLayers().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new UpdateVideoLayers().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(UpdateVideoLayers, a, b);
  }
}
UpdateVideoLayers.runtime = proto3;
UpdateVideoLayers.typeName = "livekit.UpdateVideoLayers";
UpdateVideoLayers.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "track_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "layers",
  kind: "message",
  T: VideoLayer,
  repeated: true
}]);
/**
 * @generated from message livekit.UpdateParticipantMetadata
 */
class UpdateParticipantMetadata extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string metadata = 1;
     */
    this.metadata = "";
    /**
     * @generated from field: string name = 2;
     */
    this.name = "";
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new UpdateParticipantMetadata().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new UpdateParticipantMetadata().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new UpdateParticipantMetadata().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(UpdateParticipantMetadata, a, b);
  }
}
UpdateParticipantMetadata.runtime = proto3;
UpdateParticipantMetadata.typeName = "livekit.UpdateParticipantMetadata";
UpdateParticipantMetadata.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "metadata",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "name",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}]);
/**
 * @generated from message livekit.ICEServer
 */
class ICEServer extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated string urls = 1;
     */
    this.urls = [];
    /**
     * @generated from field: string username = 2;
     */
    this.username = "";
    /**
     * @generated from field: string credential = 3;
     */
    this.credential = "";
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ICEServer().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ICEServer().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ICEServer().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ICEServer, a, b);
  }
}
ICEServer.runtime = proto3;
ICEServer.typeName = "livekit.ICEServer";
ICEServer.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "urls",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */,
  repeated: true
}, {
  no: 2,
  name: "username",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 3,
  name: "credential",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}]);
/**
 * @generated from message livekit.SpeakersChanged
 */
class SpeakersChanged extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated livekit.SpeakerInfo speakers = 1;
     */
    this.speakers = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SpeakersChanged().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SpeakersChanged().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SpeakersChanged().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SpeakersChanged, a, b);
  }
}
SpeakersChanged.runtime = proto3;
SpeakersChanged.typeName = "livekit.SpeakersChanged";
SpeakersChanged.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "speakers",
  kind: "message",
  T: SpeakerInfo,
  repeated: true
}]);
/**
 * @generated from message livekit.RoomUpdate
 */
class RoomUpdate extends Message {
  constructor(data) {
    super();
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new RoomUpdate().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new RoomUpdate().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new RoomUpdate().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(RoomUpdate, a, b);
  }
}
RoomUpdate.runtime = proto3;
RoomUpdate.typeName = "livekit.RoomUpdate";
RoomUpdate.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "room",
  kind: "message",
  T: Room$1
}]);
/**
 * @generated from message livekit.ConnectionQualityInfo
 */
class ConnectionQualityInfo extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string participant_sid = 1;
     */
    this.participantSid = "";
    /**
     * @generated from field: livekit.ConnectionQuality quality = 2;
     */
    this.quality = ConnectionQuality$1.POOR;
    /**
     * @generated from field: float score = 3;
     */
    this.score = 0;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ConnectionQualityInfo().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ConnectionQualityInfo().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ConnectionQualityInfo().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ConnectionQualityInfo, a, b);
  }
}
ConnectionQualityInfo.runtime = proto3;
ConnectionQualityInfo.typeName = "livekit.ConnectionQualityInfo";
ConnectionQualityInfo.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "participant_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "quality",
  kind: "enum",
  T: proto3.getEnumType(ConnectionQuality$1)
}, {
  no: 3,
  name: "score",
  kind: "scalar",
  T: 2 /* ScalarType.FLOAT */
}]);
/**
 * @generated from message livekit.ConnectionQualityUpdate
 */
class ConnectionQualityUpdate extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated livekit.ConnectionQualityInfo updates = 1;
     */
    this.updates = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new ConnectionQualityUpdate().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new ConnectionQualityUpdate().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new ConnectionQualityUpdate().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(ConnectionQualityUpdate, a, b);
  }
}
ConnectionQualityUpdate.runtime = proto3;
ConnectionQualityUpdate.typeName = "livekit.ConnectionQualityUpdate";
ConnectionQualityUpdate.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "updates",
  kind: "message",
  T: ConnectionQualityInfo,
  repeated: true
}]);
/**
 * @generated from message livekit.StreamStateInfo
 */
class StreamStateInfo extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string participant_sid = 1;
     */
    this.participantSid = "";
    /**
     * @generated from field: string track_sid = 2;
     */
    this.trackSid = "";
    /**
     * @generated from field: livekit.StreamState state = 3;
     */
    this.state = StreamState.ACTIVE;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new StreamStateInfo().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new StreamStateInfo().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new StreamStateInfo().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(StreamStateInfo, a, b);
  }
}
StreamStateInfo.runtime = proto3;
StreamStateInfo.typeName = "livekit.StreamStateInfo";
StreamStateInfo.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "participant_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "track_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 3,
  name: "state",
  kind: "enum",
  T: proto3.getEnumType(StreamState)
}]);
/**
 * @generated from message livekit.StreamStateUpdate
 */
class StreamStateUpdate extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated livekit.StreamStateInfo stream_states = 1;
     */
    this.streamStates = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new StreamStateUpdate().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new StreamStateUpdate().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new StreamStateUpdate().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(StreamStateUpdate, a, b);
  }
}
StreamStateUpdate.runtime = proto3;
StreamStateUpdate.typeName = "livekit.StreamStateUpdate";
StreamStateUpdate.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "stream_states",
  kind: "message",
  T: StreamStateInfo,
  repeated: true
}]);
/**
 * @generated from message livekit.SubscribedQuality
 */
class SubscribedQuality extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: livekit.VideoQuality quality = 1;
     */
    this.quality = VideoQuality.LOW;
    /**
     * @generated from field: bool enabled = 2;
     */
    this.enabled = false;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SubscribedQuality().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SubscribedQuality().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SubscribedQuality().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SubscribedQuality, a, b);
  }
}
SubscribedQuality.runtime = proto3;
SubscribedQuality.typeName = "livekit.SubscribedQuality";
SubscribedQuality.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "quality",
  kind: "enum",
  T: proto3.getEnumType(VideoQuality)
}, {
  no: 2,
  name: "enabled",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}]);
/**
 * @generated from message livekit.SubscribedCodec
 */
class SubscribedCodec extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string codec = 1;
     */
    this.codec = "";
    /**
     * @generated from field: repeated livekit.SubscribedQuality qualities = 2;
     */
    this.qualities = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SubscribedCodec().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SubscribedCodec().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SubscribedCodec().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SubscribedCodec, a, b);
  }
}
SubscribedCodec.runtime = proto3;
SubscribedCodec.typeName = "livekit.SubscribedCodec";
SubscribedCodec.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "codec",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "qualities",
  kind: "message",
  T: SubscribedQuality,
  repeated: true
}]);
/**
 * @generated from message livekit.SubscribedQualityUpdate
 */
class SubscribedQualityUpdate extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string track_sid = 1;
     */
    this.trackSid = "";
    /**
     * @generated from field: repeated livekit.SubscribedQuality subscribed_qualities = 2;
     */
    this.subscribedQualities = [];
    /**
     * @generated from field: repeated livekit.SubscribedCodec subscribed_codecs = 3;
     */
    this.subscribedCodecs = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SubscribedQualityUpdate().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SubscribedQualityUpdate().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SubscribedQualityUpdate().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SubscribedQualityUpdate, a, b);
  }
}
SubscribedQualityUpdate.runtime = proto3;
SubscribedQualityUpdate.typeName = "livekit.SubscribedQualityUpdate";
SubscribedQualityUpdate.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "track_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "subscribed_qualities",
  kind: "message",
  T: SubscribedQuality,
  repeated: true
}, {
  no: 3,
  name: "subscribed_codecs",
  kind: "message",
  T: SubscribedCodec,
  repeated: true
}]);
/**
 * @generated from message livekit.TrackPermission
 */
class TrackPermission extends Message {
  constructor(data) {
    super();
    /**
     * permission could be granted either by participant sid or identity
     *
     * @generated from field: string participant_sid = 1;
     */
    this.participantSid = "";
    /**
     * @generated from field: bool all_tracks = 2;
     */
    this.allTracks = false;
    /**
     * @generated from field: repeated string track_sids = 3;
     */
    this.trackSids = [];
    /**
     * @generated from field: string participant_identity = 4;
     */
    this.participantIdentity = "";
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new TrackPermission().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new TrackPermission().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new TrackPermission().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(TrackPermission, a, b);
  }
}
TrackPermission.runtime = proto3;
TrackPermission.typeName = "livekit.TrackPermission";
TrackPermission.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "participant_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "all_tracks",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 3,
  name: "track_sids",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */,
  repeated: true
}, {
  no: 4,
  name: "participant_identity",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}]);
/**
 * @generated from message livekit.SubscriptionPermission
 */
class SubscriptionPermission extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: bool all_participants = 1;
     */
    this.allParticipants = false;
    /**
     * @generated from field: repeated livekit.TrackPermission track_permissions = 2;
     */
    this.trackPermissions = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SubscriptionPermission().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SubscriptionPermission().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SubscriptionPermission().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SubscriptionPermission, a, b);
  }
}
SubscriptionPermission.runtime = proto3;
SubscriptionPermission.typeName = "livekit.SubscriptionPermission";
SubscriptionPermission.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "all_participants",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}, {
  no: 2,
  name: "track_permissions",
  kind: "message",
  T: TrackPermission,
  repeated: true
}]);
/**
 * @generated from message livekit.SubscriptionPermissionUpdate
 */
class SubscriptionPermissionUpdate extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string participant_sid = 1;
     */
    this.participantSid = "";
    /**
     * @generated from field: string track_sid = 2;
     */
    this.trackSid = "";
    /**
     * @generated from field: bool allowed = 3;
     */
    this.allowed = false;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SubscriptionPermissionUpdate().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SubscriptionPermissionUpdate().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SubscriptionPermissionUpdate().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SubscriptionPermissionUpdate, a, b);
  }
}
SubscriptionPermissionUpdate.runtime = proto3;
SubscriptionPermissionUpdate.typeName = "livekit.SubscriptionPermissionUpdate";
SubscriptionPermissionUpdate.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "participant_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "track_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 3,
  name: "allowed",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */
}]);
/**
 * @generated from message livekit.SyncState
 */
class SyncState extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated livekit.TrackPublishedResponse publish_tracks = 3;
     */
    this.publishTracks = [];
    /**
     * @generated from field: repeated livekit.DataChannelInfo data_channels = 4;
     */
    this.dataChannels = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SyncState().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SyncState().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SyncState().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SyncState, a, b);
  }
}
SyncState.runtime = proto3;
SyncState.typeName = "livekit.SyncState";
SyncState.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "answer",
  kind: "message",
  T: SessionDescription
}, {
  no: 2,
  name: "subscription",
  kind: "message",
  T: UpdateSubscription
}, {
  no: 3,
  name: "publish_tracks",
  kind: "message",
  T: TrackPublishedResponse,
  repeated: true
}, {
  no: 4,
  name: "data_channels",
  kind: "message",
  T: DataChannelInfo,
  repeated: true
}, {
  no: 5,
  name: "offer",
  kind: "message",
  T: SessionDescription
}]);
/**
 * @generated from message livekit.DataChannelInfo
 */
class DataChannelInfo extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string label = 1;
     */
    this.label = "";
    /**
     * @generated from field: uint32 id = 2;
     */
    this.id = 0;
    /**
     * @generated from field: livekit.SignalTarget target = 3;
     */
    this.target = SignalTarget.PUBLISHER;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new DataChannelInfo().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new DataChannelInfo().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new DataChannelInfo().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(DataChannelInfo, a, b);
  }
}
DataChannelInfo.runtime = proto3;
DataChannelInfo.typeName = "livekit.DataChannelInfo";
DataChannelInfo.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "label",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "id",
  kind: "scalar",
  T: 13 /* ScalarType.UINT32 */
}, {
  no: 3,
  name: "target",
  kind: "enum",
  T: proto3.getEnumType(SignalTarget)
}]);
/**
 * @generated from message livekit.SimulateScenario
 */
class SimulateScenario extends Message {
  constructor(data) {
    super();
    /**
     * @generated from oneof livekit.SimulateScenario.scenario
     */
    this.scenario = {
      case: undefined
    };
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SimulateScenario().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SimulateScenario().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SimulateScenario().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SimulateScenario, a, b);
  }
}
SimulateScenario.runtime = proto3;
SimulateScenario.typeName = "livekit.SimulateScenario";
SimulateScenario.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "speaker_update",
  kind: "scalar",
  T: 5 /* ScalarType.INT32 */,
  oneof: "scenario"
}, {
  no: 2,
  name: "node_failure",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */,
  oneof: "scenario"
}, {
  no: 3,
  name: "migration",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */,
  oneof: "scenario"
}, {
  no: 4,
  name: "server_leave",
  kind: "scalar",
  T: 8 /* ScalarType.BOOL */,
  oneof: "scenario"
}, {
  no: 5,
  name: "switch_candidate_protocol",
  kind: "enum",
  T: proto3.getEnumType(CandidateProtocol),
  oneof: "scenario"
}, {
  no: 6,
  name: "subscriber_bandwidth",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */,
  oneof: "scenario"
}]);
/**
 * @generated from message livekit.Ping
 */
class Ping extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: int64 timestamp = 1;
     */
    this.timestamp = protoInt64.zero;
    /**
     * rtt in milliseconds calculated by client
     *
     * @generated from field: int64 rtt = 2;
     */
    this.rtt = protoInt64.zero;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new Ping().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new Ping().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new Ping().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(Ping, a, b);
  }
}
Ping.runtime = proto3;
Ping.typeName = "livekit.Ping";
Ping.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "timestamp",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */
}, {
  no: 2,
  name: "rtt",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */
}]);
/**
 * @generated from message livekit.Pong
 */
class Pong extends Message {
  constructor(data) {
    super();
    /**
     * timestamp field of last received ping request
     *
     * @generated from field: int64 last_ping_timestamp = 1;
     */
    this.lastPingTimestamp = protoInt64.zero;
    /**
     * @generated from field: int64 timestamp = 2;
     */
    this.timestamp = protoInt64.zero;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new Pong().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new Pong().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new Pong().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(Pong, a, b);
  }
}
Pong.runtime = proto3;
Pong.typeName = "livekit.Pong";
Pong.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "last_ping_timestamp",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */
}, {
  no: 2,
  name: "timestamp",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */
}]);
/**
 * @generated from message livekit.RegionSettings
 */
class RegionSettings extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: repeated livekit.RegionInfo regions = 1;
     */
    this.regions = [];
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new RegionSettings().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new RegionSettings().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new RegionSettings().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(RegionSettings, a, b);
  }
}
RegionSettings.runtime = proto3;
RegionSettings.typeName = "livekit.RegionSettings";
RegionSettings.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "regions",
  kind: "message",
  T: RegionInfo,
  repeated: true
}]);
/**
 * @generated from message livekit.RegionInfo
 */
class RegionInfo extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string region = 1;
     */
    this.region = "";
    /**
     * @generated from field: string url = 2;
     */
    this.url = "";
    /**
     * @generated from field: int64 distance = 3;
     */
    this.distance = protoInt64.zero;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new RegionInfo().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new RegionInfo().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new RegionInfo().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(RegionInfo, a, b);
  }
}
RegionInfo.runtime = proto3;
RegionInfo.typeName = "livekit.RegionInfo";
RegionInfo.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "region",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "url",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 3,
  name: "distance",
  kind: "scalar",
  T: 3 /* ScalarType.INT64 */
}]);
/**
 * @generated from message livekit.SubscriptionResponse
 */
class SubscriptionResponse extends Message {
  constructor(data) {
    super();
    /**
     * @generated from field: string track_sid = 1;
     */
    this.trackSid = "";
    /**
     * @generated from field: livekit.SubscriptionError err = 2;
     */
    this.err = SubscriptionError.SE_UNKNOWN;
    proto3.util.initPartial(data, this);
  }
  static fromBinary(bytes, options) {
    return new SubscriptionResponse().fromBinary(bytes, options);
  }
  static fromJson(jsonValue, options) {
    return new SubscriptionResponse().fromJson(jsonValue, options);
  }
  static fromJsonString(jsonString, options) {
    return new SubscriptionResponse().fromJsonString(jsonString, options);
  }
  static equals(a, b) {
    return proto3.util.equals(SubscriptionResponse, a, b);
  }
}
SubscriptionResponse.runtime = proto3;
SubscriptionResponse.typeName = "livekit.SubscriptionResponse";
SubscriptionResponse.fields = proto3.util.newFieldList(() => [{
  no: 1,
  name: "track_sid",
  kind: "scalar",
  T: 9 /* ScalarType.STRING */
}, {
  no: 2,
  name: "err",
  kind: "enum",
  T: proto3.getEnumType(SubscriptionError)
}]);

class LivekitError extends Error {
  constructor(code, message) {
    super(message || 'an error has occured');
    this.code = code;
  }
}
class ConnectionError extends LivekitError {
  constructor(message, reason, status) {
    super(1, message);
    this.status = status;
    this.reason = reason;
  }
}
class DeviceUnsupportedError extends LivekitError {
  constructor(message) {
    super(21, message !== null && message !== void 0 ? message : 'device is unsupported');
  }
}
class TrackInvalidError extends LivekitError {
  constructor(message) {
    super(20, message !== null && message !== void 0 ? message : 'track is invalid');
  }
}
class UnsupportedServer extends LivekitError {
  constructor(message) {
    super(10, message !== null && message !== void 0 ? message : 'unsupported server');
  }
}
class UnexpectedConnectionState extends LivekitError {
  constructor(message) {
    super(12, message !== null && message !== void 0 ? message : 'unexpected connection state');
  }
}
class NegotiationError extends LivekitError {
  constructor(message) {
    super(13, message !== null && message !== void 0 ? message : 'unable to negotiate');
  }
}
class PublishDataError extends LivekitError {
  constructor(message) {
    super(13, message !== null && message !== void 0 ? message : 'unable to publish data');
  }
}
var MediaDeviceFailure;
(function (MediaDeviceFailure) {
  // user rejected permissions
  MediaDeviceFailure["PermissionDenied"] = "PermissionDenied";
  // device is not available
  MediaDeviceFailure["NotFound"] = "NotFound";
  // device is in use. On Windows, only a single tab may get access to a device at a time.
  MediaDeviceFailure["DeviceInUse"] = "DeviceInUse";
  MediaDeviceFailure["Other"] = "Other";
})(MediaDeviceFailure || (MediaDeviceFailure = {}));
(function (MediaDeviceFailure) {
  function getFailure(error) {
    if (error && 'name' in error) {
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return MediaDeviceFailure.NotFound;
      }
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return MediaDeviceFailure.PermissionDenied;
      }
      if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        return MediaDeviceFailure.DeviceInUse;
      }
      return MediaDeviceFailure.Other;
    }
  }
  MediaDeviceFailure.getFailure = getFailure;
})(MediaDeviceFailure || (MediaDeviceFailure = {}));

/**
 * Timers that can be overridden with platform specific implementations
 * that ensure that they are fired. These should be used when it is critical
 * that the timer fires on time.
 */
class CriticalTimers {}
// eslint-disable-next-line @typescript-eslint/no-implied-eval
CriticalTimers.setTimeout = function () {
  return setTimeout(...arguments);
};
// eslint-disable-next-line @typescript-eslint/no-implied-eval
CriticalTimers.setInterval = function () {
  return setInterval(...arguments);
};
CriticalTimers.clearTimeout = function () {
  return clearTimeout(...arguments);
};
CriticalTimers.clearInterval = function () {
  return clearInterval(...arguments);
};

// tiny, simplified version of https://github.com/lancedikson/bowser/blob/master/src/parser-browsers.js
// reduced to only differentiate Chrome(ium) based browsers / Firefox / Safari
const commonVersionIdentifier = /version\/(\d+(\.?_?\d+)+)/i;
let browserDetails;
/**
 * @internal
 */
function getBrowser(userAgent) {
  let force = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
  if (typeof userAgent === 'undefined' && typeof navigator === 'undefined') {
    return;
  }
  const ua = (userAgent !== null && userAgent !== void 0 ? userAgent : navigator.userAgent).toLowerCase();
  if (browserDetails === undefined || force) {
    const browser = browsersList.find(_ref => {
      let {
        test
      } = _ref;
      return test.test(ua);
    });
    browserDetails = browser === null || browser === void 0 ? void 0 : browser.describe(ua);
  }
  return browserDetails;
}
const browsersList = [{
  test: /firefox|iceweasel|fxios/i,
  describe(ua) {
    const browser = {
      name: 'Firefox',
      version: getMatch(/(?:firefox|iceweasel|fxios)[\s/](\d+(\.?_?\d+)+)/i, ua),
      os: ua.toLowerCase().includes('fxios') ? 'iOS' : undefined
    };
    return browser;
  }
}, {
  test: /chrom|crios|crmo/i,
  describe(ua) {
    const browser = {
      name: 'Chrome',
      version: getMatch(/(?:chrome|chromium|crios|crmo)\/(\d+(\.?_?\d+)+)/i, ua),
      os: ua.toLowerCase().includes('crios') ? 'iOS' : undefined
    };
    return browser;
  }
}, /* Safari */
{
  test: /safari|applewebkit/i,
  describe(ua) {
    const browser = {
      name: 'Safari',
      version: getMatch(commonVersionIdentifier, ua),
      os: ua.includes('mobile/') ? 'iOS' : 'macOS'
    };
    return browser;
  }
}];
function getMatch(exp, ua) {
  let id = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;
  const match = ua.match(exp);
  return match && match.length >= id && match[id] || '';
}

var version$1 = "1.13.2";

const version = version$1;
const protocolVersion = 9;

class VideoPreset {
  constructor(width, height, maxBitrate, maxFramerate, priority) {
    this.width = width;
    this.height = height;
    this.encoding = {
      maxBitrate,
      maxFramerate,
      priority
    };
  }
  get resolution() {
    return {
      width: this.width,
      height: this.height,
      frameRate: this.encoding.maxFramerate,
      aspectRatio: this.width / this.height
    };
  }
}
const backupCodecs = ['vp8', 'h264'];
const videoCodecs = ['vp8', 'h264', 'vp9', 'av1'];
function isBackupCodec(codec) {
  return !!backupCodecs.find(backup => backup === codec);
}
function isCodecEqual(c1, c2) {
  return (c1 === null || c1 === void 0 ? void 0 : c1.toLowerCase().replace(/audio\/|video\//y, '')) === (c2 === null || c2 === void 0 ? void 0 : c2.toLowerCase().replace(/audio\/|video\//y, ''));
}
var AudioPresets;
(function (AudioPresets) {
  AudioPresets.telephone = {
    maxBitrate: 12000
  };
  AudioPresets.speech = {
    maxBitrate: 20000
  };
  AudioPresets.music = {
    maxBitrate: 32000
  };
  AudioPresets.musicStereo = {
    maxBitrate: 48000
  };
  AudioPresets.musicHighQuality = {
    maxBitrate: 64000
  };
  AudioPresets.musicHighQualityStereo = {
    maxBitrate: 96000
  };
})(AudioPresets || (AudioPresets = {}));
/**
 * Sane presets for video resolution/encoding
 */
const VideoPresets = {
  h90: new VideoPreset(160, 90, 90000, 20),
  h180: new VideoPreset(320, 180, 160000, 20),
  h216: new VideoPreset(384, 216, 180000, 20),
  h360: new VideoPreset(640, 360, 450000, 20),
  h540: new VideoPreset(960, 540, 800000, 25),
  h720: new VideoPreset(1280, 720, 1700000, 30),
  h1080: new VideoPreset(1920, 1080, 3000000, 30),
  h1440: new VideoPreset(2560, 1440, 5000000, 30),
  h2160: new VideoPreset(3840, 2160, 8000000, 30)
};
/**
 * Four by three presets
 */
const VideoPresets43 = {
  h120: new VideoPreset(160, 120, 70000, 20),
  h180: new VideoPreset(240, 180, 125000, 20),
  h240: new VideoPreset(320, 240, 140000, 20),
  h360: new VideoPreset(480, 360, 225000, 20),
  h480: new VideoPreset(640, 480, 500000, 20),
  h540: new VideoPreset(720, 540, 600000, 25),
  h720: new VideoPreset(960, 720, 1300000, 30),
  h1080: new VideoPreset(1440, 1080, 2300000, 30),
  h1440: new VideoPreset(1920, 1440, 3800000, 30)
};
const ScreenSharePresets = {
  h360fps3: new VideoPreset(640, 360, 200000, 3, 'medium'),
  h720fps5: new VideoPreset(1280, 720, 400000, 5, 'medium'),
  h720fps15: new VideoPreset(1280, 720, 1500000, 15, 'medium'),
  h720fps30: new VideoPreset(1280, 720, 2000000, 30, 'medium'),
  h1080fps15: new VideoPreset(1920, 1080, 2500000, 15, 'medium'),
  h1080fps30: new VideoPreset(1920, 1080, 4000000, 30, 'medium')
};

/**
 * Events are the primary way LiveKit notifies your application of changes.
 *
 * The following are events emitted by [[Room]], listen to room events like
 *
 * ```typescript
 * room.on(RoomEvent.TrackPublished, (track, publication, participant) => {})
 * ```
 */
var RoomEvent;
(function (RoomEvent) {
  /**
   * When the connection to the server has been established
   */
  RoomEvent["Connected"] = "connected";
  /**
   * When the connection to the server has been interrupted and it's attempting
   * to reconnect.
   */
  RoomEvent["Reconnecting"] = "reconnecting";
  /**
   * Fires when a reconnection has been successful.
   */
  RoomEvent["Reconnected"] = "reconnected";
  /**
   * When disconnected from room. This fires when room.disconnect() is called or
   * when an unrecoverable connection issue had occured
   */
  RoomEvent["Disconnected"] = "disconnected";
  /**
   * Whenever the connection state of the room changes
   *
   * args: ([[ConnectionState]])
   */
  RoomEvent["ConnectionStateChanged"] = "connectionStateChanged";
  /**
   * @deprecated StateChanged has been renamed to ConnectionStateChanged
   */
  RoomEvent["StateChanged"] = "connectionStateChanged";
  /**
   * When input or output devices on the machine have changed.
   */
  RoomEvent["MediaDevicesChanged"] = "mediaDevicesChanged";
  /**
   * When a [[RemoteParticipant]] joins *after* the local
   * participant. It will not emit events for participants that are already
   * in the room
   *
   * args: ([[RemoteParticipant]])
   */
  RoomEvent["ParticipantConnected"] = "participantConnected";
  /**
   * When a [[RemoteParticipant]] leaves *after* the local
   * participant has joined.
   *
   * args: ([[RemoteParticipant]])
   */
  RoomEvent["ParticipantDisconnected"] = "participantDisconnected";
  /**
   * When a new track is published to room *after* the local
   * participant has joined. It will not fire for tracks that are already published.
   *
   * A track published doesn't mean the participant has subscribed to it. It's
   * simply reflecting the state of the room.
   *
   * args: ([[RemoteTrackPublication]], [[RemoteParticipant]])
   */
  RoomEvent["TrackPublished"] = "trackPublished";
  /**
   * The [[LocalParticipant]] has subscribed to a new track. This event will **always**
   * fire as long as new tracks are ready for use.
   *
   * args: ([[RemoteTrack]], [[RemoteTrackPublication]], [[RemoteParticipant]])
   */
  RoomEvent["TrackSubscribed"] = "trackSubscribed";
  /**
   * Could not subscribe to a track
   *
   * args: (track sid, [[RemoteParticipant]])
   */
  RoomEvent["TrackSubscriptionFailed"] = "trackSubscriptionFailed";
  /**
   * A [[RemoteParticipant]] has unpublished a track
   *
   * args: ([[RemoteTrackPublication]], [[RemoteParticipant]])
   */
  RoomEvent["TrackUnpublished"] = "trackUnpublished";
  /**
   * A subscribed track is no longer available. Clients should listen to this
   * event and ensure they detach tracks.
   *
   * args: ([[Track]], [[RemoteTrackPublication]], [[RemoteParticipant]])
   */
  RoomEvent["TrackUnsubscribed"] = "trackUnsubscribed";
  /**
   * A track that was muted, fires on both [[RemoteParticipant]]s and [[LocalParticipant]]
   *
   * args: ([[TrackPublication]], [[Participant]])
   */
  RoomEvent["TrackMuted"] = "trackMuted";
  /**
   * A track that was unmuted, fires on both [[RemoteParticipant]]s and [[LocalParticipant]]
   *
   * args: ([[TrackPublication]], [[Participant]])
   */
  RoomEvent["TrackUnmuted"] = "trackUnmuted";
  /**
   * A local track was published successfully. This event is helpful to know
   * when to update your local UI with the newly published track.
   *
   * args: ([[LocalTrackPublication]], [[LocalParticipant]])
   */
  RoomEvent["LocalTrackPublished"] = "localTrackPublished";
  /**
   * A local track was unpublished. This event is helpful to know when to remove
   * the local track from your UI.
   *
   * When a user stops sharing their screen by pressing "End" on the browser UI,
   * this event will also fire.
   *
   * args: ([[LocalTrackPublication]], [[LocalParticipant]])
   */
  RoomEvent["LocalTrackUnpublished"] = "localTrackUnpublished";
  /**
   * When a local audio track is published the SDK checks whether there is complete silence
   * on that track and emits the LocalAudioSilenceDetected event in that case.
   * This allows for applications to show UI informing users that they might have to
   * reset their audio hardware or check for proper device connectivity.
   */
  RoomEvent["LocalAudioSilenceDetected"] = "localAudioSilenceDetected";
  /**
   * Active speakers changed. List of speakers are ordered by their audio level.
   * loudest speakers first. This will include the LocalParticipant too.
   *
   * Speaker updates are sent only to the publishing participant and their subscribers.
   *
   * args: (Array<[[Participant]]>)
   */
  RoomEvent["ActiveSpeakersChanged"] = "activeSpeakersChanged";
  /**
   * Participant metadata is a simple way for app-specific state to be pushed to
   * all users.
   * When RoomService.UpdateParticipantMetadata is called to change a participant's
   * state, *all*  participants in the room will fire this event.
   *
   * args: (prevMetadata: string, [[Participant]])
   *
   */
  RoomEvent["ParticipantMetadataChanged"] = "participantMetadataChanged";
  /**
   * Participant's display name changed
   *
   * args: (name: string, [[Participant]])
   *
   */
  RoomEvent["ParticipantNameChanged"] = "participantNameChanged";
  /**
   * Room metadata is a simple way for app-specific state to be pushed to
   * all users.
   * When RoomService.UpdateRoomMetadata is called to change a room's state,
   * *all*  participants in the room will fire this event.
   *
   * args: (string)
   */
  RoomEvent["RoomMetadataChanged"] = "roomMetadataChanged";
  /**
   * Data received from another participant.
   * Data packets provides the ability to use LiveKit to send/receive arbitrary payloads.
   * All participants in the room will receive the messages sent to the room.
   *
   * args: (payload: Uint8Array, participant: [[Participant]], kind: [[DataPacket_Kind]], topic?: string)
   */
  RoomEvent["DataReceived"] = "dataReceived";
  /**
   * Connection quality was changed for a Participant. It'll receive updates
   * from the local participant, as well as any [[RemoteParticipant]]s that we are
   * subscribed to.
   *
   * args: (connectionQuality: [[ConnectionQuality]], participant: [[Participant]])
   */
  RoomEvent["ConnectionQualityChanged"] = "connectionQualityChanged";
  /**
   * StreamState indicates if a subscribed (remote) track has been paused by the SFU
   * (typically this happens because of subscriber's bandwidth constraints)
   *
   * When bandwidth conditions allow, the track will be resumed automatically.
   * TrackStreamStateChanged will also be emitted when that happens.
   *
   * args: (pub: [[RemoteTrackPublication]], streamState: [[Track.StreamState]],
   *        participant: [[RemoteParticipant]])
   */
  RoomEvent["TrackStreamStateChanged"] = "trackStreamStateChanged";
  /**
   * One of subscribed tracks have changed its permissions for the current
   * participant. If permission was revoked, then the track will no longer
   * be subscribed. If permission was granted, a TrackSubscribed event will
   * be emitted.
   *
   * args: (pub: [[RemoteTrackPublication]],
   *        status: [[TrackPublication.SubscriptionStatus]],
   *        participant: [[RemoteParticipant]])
   */
  RoomEvent["TrackSubscriptionPermissionChanged"] = "trackSubscriptionPermissionChanged";
  /**
   * One of subscribed tracks have changed its status for the current
   * participant.
   *
   * args: (pub: [[RemoteTrackPublication]],
   *        status: [[TrackPublication.SubscriptionStatus]],
   *        participant: [[RemoteParticipant]])
   */
  RoomEvent["TrackSubscriptionStatusChanged"] = "trackSubscriptionStatusChanged";
  /**
   * LiveKit will attempt to autoplay all audio tracks when you attach them to
   * audio elements. However, if that fails, we'll notify you via AudioPlaybackStatusChanged.
   * `Room.canPlayAudio` will indicate if audio playback is permitted.
   */
  RoomEvent["AudioPlaybackStatusChanged"] = "audioPlaybackChanged";
  /**
   * When we have encountered an error while attempting to create a track.
   * The errors take place in getUserMedia().
   * Use MediaDeviceFailure.getFailure(error) to get the reason of failure.
   * [[LocalParticipant.lastCameraError]] and [[LocalParticipant.lastMicrophoneError]]
   * will indicate if it had an error while creating the audio or video track respectively.
   *
   * args: (error: Error)
   */
  RoomEvent["MediaDevicesError"] = "mediaDevicesError";
  /**
   * A participant's permission has changed. Currently only fired on LocalParticipant.
   * args: (prevPermissions: [[ParticipantPermission]], participant: [[Participant]])
   */
  RoomEvent["ParticipantPermissionsChanged"] = "participantPermissionsChanged";
  /**
   * Signal connected, can publish tracks.
   */
  RoomEvent["SignalConnected"] = "signalConnected";
  /**
   * Recording of a room has started/stopped. Room.isRecording will be updated too.
   * args: (isRecording: boolean)
   */
  RoomEvent["RecordingStatusChanged"] = "recordingStatusChanged";
  RoomEvent["ParticipantEncryptionStatusChanged"] = "participantEncryptionStatusChanged";
  RoomEvent["EncryptionError"] = "encryptionError";
  /**
   * Emits whenever the current buffer status of a data channel changes
   * args: (isLow: boolean, kind: [[DataPacket_Kind]])
   */
  RoomEvent["DCBufferStatusChanged"] = "dcBufferStatusChanged";
  /**
   * Triggered by a call to room.switchActiveDevice
   * args: (kind: MediaDeviceKind, deviceId: string)
   */
  RoomEvent["ActiveDeviceChanged"] = "activeDeviceChanged";
})(RoomEvent || (RoomEvent = {}));
var ParticipantEvent;
(function (ParticipantEvent) {
  /**
   * When a new track is published to room *after* the local
   * participant has joined. It will not fire for tracks that are already published.
   *
   * A track published doesn't mean the participant has subscribed to it. It's
   * simply reflecting the state of the room.
   *
   * args: ([[RemoteTrackPublication]])
   */
  ParticipantEvent["TrackPublished"] = "trackPublished";
  /**
   * Successfully subscribed to the [[RemoteParticipant]]'s track.
   * This event will **always** fire as long as new tracks are ready for use.
   *
   * args: ([[RemoteTrack]], [[RemoteTrackPublication]])
   */
  ParticipantEvent["TrackSubscribed"] = "trackSubscribed";
  /**
   * Could not subscribe to a track
   *
   * args: (track sid)
   */
  ParticipantEvent["TrackSubscriptionFailed"] = "trackSubscriptionFailed";
  /**
   * A [[RemoteParticipant]] has unpublished a track
   *
   * args: ([[RemoteTrackPublication]])
   */
  ParticipantEvent["TrackUnpublished"] = "trackUnpublished";
  /**
   * A subscribed track is no longer available. Clients should listen to this
   * event and ensure they detach tracks.
   *
   * args: ([[RemoteTrack]], [[RemoteTrackPublication]])
   */
  ParticipantEvent["TrackUnsubscribed"] = "trackUnsubscribed";
  /**
   * A track that was muted, fires on both [[RemoteParticipant]]s and [[LocalParticipant]]
   *
   * args: ([[TrackPublication]])
   */
  ParticipantEvent["TrackMuted"] = "trackMuted";
  /**
   * A track that was unmuted, fires on both [[RemoteParticipant]]s and [[LocalParticipant]]
   *
   * args: ([[TrackPublication]])
   */
  ParticipantEvent["TrackUnmuted"] = "trackUnmuted";
  /**
   * A local track was published successfully. This event is helpful to know
   * when to update your local UI with the newly published track.
   *
   * args: ([[LocalTrackPublication]])
   */
  ParticipantEvent["LocalTrackPublished"] = "localTrackPublished";
  /**
   * A local track was unpublished. This event is helpful to know when to remove
   * the local track from your UI.
   *
   * When a user stops sharing their screen by pressing "End" on the browser UI,
   * this event will also fire.
   *
   * args: ([[LocalTrackPublication]])
   */
  ParticipantEvent["LocalTrackUnpublished"] = "localTrackUnpublished";
  /**
   * Participant metadata is a simple way for app-specific state to be pushed to
   * all users.
   * When RoomService.UpdateParticipantMetadata is called to change a participant's
   * state, *all*  participants in the room will fire this event.
   * To access the current metadata, see [[Participant.metadata]].
   *
   * args: (prevMetadata: string)
   *
   */
  ParticipantEvent["ParticipantMetadataChanged"] = "participantMetadataChanged";
  /**
   * Participant's display name changed
   *
   * args: (name: string, [[Participant]])
   *
   */
  ParticipantEvent["ParticipantNameChanged"] = "participantNameChanged";
  /**
   * Data received from this participant as sender.
   * Data packets provides the ability to use LiveKit to send/receive arbitrary payloads.
   * All participants in the room will receive the messages sent to the room.
   *
   * args: (payload: Uint8Array, kind: [[DataPacket_Kind]])
   */
  ParticipantEvent["DataReceived"] = "dataReceived";
  /**
   * Has speaking status changed for the current participant
   *
   * args: (speaking: boolean)
   */
  ParticipantEvent["IsSpeakingChanged"] = "isSpeakingChanged";
  /**
   * Connection quality was changed for a Participant. It'll receive updates
   * from the local participant, as well as any [[RemoteParticipant]]s that we are
   * subscribed to.
   *
   * args: (connectionQuality: [[ConnectionQuality]])
   */
  ParticipantEvent["ConnectionQualityChanged"] = "connectionQualityChanged";
  /**
   * StreamState indicates if a subscribed track has been paused by the SFU
   * (typically this happens because of subscriber's bandwidth constraints)
   *
   * When bandwidth conditions allow, the track will be resumed automatically.
   * TrackStreamStateChanged will also be emitted when that happens.
   *
   * args: (pub: [[RemoteTrackPublication]], streamState: [[Track.StreamState]])
   */
  ParticipantEvent["TrackStreamStateChanged"] = "trackStreamStateChanged";
  /**
   * One of subscribed tracks have changed its permissions for the current
   * participant. If permission was revoked, then the track will no longer
   * be subscribed. If permission was granted, a TrackSubscribed event will
   * be emitted.
   *
   * args: (pub: [[RemoteTrackPublication]],
   *        status: [[TrackPublication.SubscriptionStatus]])
   */
  ParticipantEvent["TrackSubscriptionPermissionChanged"] = "trackSubscriptionPermissionChanged";
  /**
   * One of the remote participants publications has changed its subscription status.
   *
   */
  ParticipantEvent["TrackSubscriptionStatusChanged"] = "trackSubscriptionStatusChanged";
  // fired only on LocalParticipant
  /** @internal */
  ParticipantEvent["MediaDevicesError"] = "mediaDevicesError";
  /**
   * A participant's permission has changed. Currently only fired on LocalParticipant.
   * args: (prevPermissions: [[ParticipantPermission]])
   */
  ParticipantEvent["ParticipantPermissionsChanged"] = "participantPermissionsChanged";
  /** @internal */
  ParticipantEvent["PCTrackAdded"] = "pcTrackAdded";
})(ParticipantEvent || (ParticipantEvent = {}));
/** @internal */
var EngineEvent;
(function (EngineEvent) {
  EngineEvent["TransportsCreated"] = "transportsCreated";
  EngineEvent["Connected"] = "connected";
  EngineEvent["Disconnected"] = "disconnected";
  EngineEvent["Resuming"] = "resuming";
  EngineEvent["Resumed"] = "resumed";
  EngineEvent["Restarting"] = "restarting";
  EngineEvent["Restarted"] = "restarted";
  EngineEvent["SignalResumed"] = "signalResumed";
  EngineEvent["SignalRestarted"] = "signalRestarted";
  EngineEvent["Closing"] = "closing";
  EngineEvent["MediaTrackAdded"] = "mediaTrackAdded";
  EngineEvent["ActiveSpeakersUpdate"] = "activeSpeakersUpdate";
  EngineEvent["DataPacketReceived"] = "dataPacketReceived";
  EngineEvent["RTPVideoMapUpdate"] = "rtpVideoMapUpdate";
  EngineEvent["DCBufferStatusChanged"] = "dcBufferStatusChanged";
  EngineEvent["ParticipantUpdate"] = "participantUpdate";
  EngineEvent["RoomUpdate"] = "roomUpdate";
  EngineEvent["SpeakersChanged"] = "speakersChanged";
  EngineEvent["StreamStateChanged"] = "streamStateChanged";
  EngineEvent["ConnectionQualityUpdate"] = "connectionQualityUpdate";
  EngineEvent["SubscriptionError"] = "subscriptionError";
  EngineEvent["SubscriptionPermissionUpdate"] = "subscriptionPermissionUpdate";
})(EngineEvent || (EngineEvent = {}));
var TrackEvent;
(function (TrackEvent) {
  TrackEvent["Message"] = "message";
  TrackEvent["Muted"] = "muted";
  TrackEvent["Unmuted"] = "unmuted";
  /**
   * Only fires on LocalTracks
   */
  TrackEvent["Restarted"] = "restarted";
  TrackEvent["Ended"] = "ended";
  TrackEvent["Subscribed"] = "subscribed";
  TrackEvent["Unsubscribed"] = "unsubscribed";
  /** @internal */
  TrackEvent["UpdateSettings"] = "updateSettings";
  /** @internal */
  TrackEvent["UpdateSubscription"] = "updateSubscription";
  /** @internal */
  TrackEvent["AudioPlaybackStarted"] = "audioPlaybackStarted";
  /** @internal */
  TrackEvent["AudioPlaybackFailed"] = "audioPlaybackFailed";
  /**
   * @internal
   * Only fires on LocalAudioTrack instances
   */
  TrackEvent["AudioSilenceDetected"] = "audioSilenceDetected";
  /** @internal */
  TrackEvent["VisibilityChanged"] = "visibilityChanged";
  /** @internal */
  TrackEvent["VideoDimensionsChanged"] = "videoDimensionsChanged";
  /** @internal */
  TrackEvent["ElementAttached"] = "elementAttached";
  /** @internal */
  TrackEvent["ElementDetached"] = "elementDetached";
  /**
   * @internal
   * Only fires on LocalTracks
   */
  TrackEvent["UpstreamPaused"] = "upstreamPaused";
  /**
   * @internal
   * Only fires on LocalTracks
   */
  TrackEvent["UpstreamResumed"] = "upstreamResumed";
  /**
   * @internal
   * Fires on RemoteTrackPublication
   */
  TrackEvent["SubscriptionPermissionChanged"] = "subscriptionPermissionChanged";
  /**
   * Fires on RemoteTrackPublication
   */
  TrackEvent["SubscriptionStatusChanged"] = "subscriptionStatusChanged";
  /**
   * Fires on RemoteTrackPublication
   */
  TrackEvent["SubscriptionFailed"] = "subscriptionFailed";
})(TrackEvent || (TrackEvent = {}));

const BACKGROUND_REACTION_DELAY = 5000;
// keep old audio elements when detached, we would re-use them since on iOS
// Safari tracks which audio elements have been "blessed" by the user.
const recycledElements = [];
class Track extends eventsExports.EventEmitter {
  constructor(mediaTrack, kind) {
    super();
    this.attachedElements = [];
    this.isMuted = false;
    /**
     * indicates current state of stream, it'll indicate `paused` if the track
     * has been paused by congestion controller
     */
    this.streamState = Track.StreamState.Active;
    this.isInBackground = false;
    this._currentBitrate = 0;
    this.appVisibilityChangedListener = () => {
      if (this.backgroundTimeout) {
        clearTimeout(this.backgroundTimeout);
      }
      // delay app visibility update if it goes to hidden
      // update immediately if it comes back to focus
      if (document.visibilityState === 'hidden') {
        this.backgroundTimeout = setTimeout(() => this.handleAppVisibilityChanged(), BACKGROUND_REACTION_DELAY);
      } else {
        this.handleAppVisibilityChanged();
      }
    };
    this.setMaxListeners(100);
    this.kind = kind;
    this._mediaStreamTrack = mediaTrack;
    this._mediaStreamID = mediaTrack.id;
    this.source = Track.Source.Unknown;
  }
  /** current receive bits per second */
  get currentBitrate() {
    return this._currentBitrate;
  }
  get mediaStreamTrack() {
    return this._mediaStreamTrack;
  }
  /**
   * @internal
   * used for keep mediaStream's first id, since it's id might change
   * if we disable/enable a track
   */
  get mediaStreamID() {
    return this._mediaStreamID;
  }
  attach(element) {
    let elementType = 'audio';
    if (this.kind === Track.Kind.Video) {
      elementType = 'video';
    }
    if (this.attachedElements.length === 0 && Track.Kind.Video) {
      this.addAppVisibilityListener();
    }
    if (!element) {
      if (elementType === 'audio') {
        recycledElements.forEach(e => {
          if (e.parentElement === null && !element) {
            element = e;
          }
        });
        if (element) {
          // remove it from pool
          recycledElements.splice(recycledElements.indexOf(element), 1);
        }
      }
      if (!element) {
        element = document.createElement(elementType);
      }
    }
    if (!this.attachedElements.includes(element)) {
      this.attachedElements.push(element);
    }
    // even if we believe it's already attached to the element, it's possible
    // the element's srcObject was set to something else out of band.
    // we'll want to re-attach it in that case
    attachToElement(this.mediaStreamTrack, element);
    // handle auto playback failures
    const allMediaStreamTracks = element.srcObject.getTracks();
    if (allMediaStreamTracks.some(tr => tr.kind === 'audio')) {
      // manually play audio to detect audio playback status
      element.play().then(() => {
        this.emit(TrackEvent.AudioPlaybackStarted);
      }).catch(e => {
        if (e.name === 'NotAllowedError') {
          this.emit(TrackEvent.AudioPlaybackFailed, e);
        } else {
          livekitLogger.warn('could not playback audio', e);
        }
        // If audio playback isn't allowed make sure we still play back the video
        if (element && allMediaStreamTracks.some(tr => tr.kind === 'video') && e.name === 'NotAllowedError') {
          element.muted = true;
          element.play().catch(() => {
            // catch for Safari, exceeded options at this point to automatically play the media element
          });
        }
      });
    }
    this.emit(TrackEvent.ElementAttached, element);
    return element;
  }
  detach(element) {
    try {
      // detach from a single element
      if (element) {
        detachTrack(this.mediaStreamTrack, element);
        const idx = this.attachedElements.indexOf(element);
        if (idx >= 0) {
          this.attachedElements.splice(idx, 1);
          this.recycleElement(element);
          this.emit(TrackEvent.ElementDetached, element);
        }
        return element;
      }
      const detached = [];
      this.attachedElements.forEach(elm => {
        detachTrack(this.mediaStreamTrack, elm);
        detached.push(elm);
        this.recycleElement(elm);
        this.emit(TrackEvent.ElementDetached, elm);
      });
      // remove all tracks
      this.attachedElements = [];
      return detached;
    } finally {
      if (this.attachedElements.length === 0) {
        this.removeAppVisibilityListener();
      }
    }
  }
  stop() {
    this.stopMonitor();
    this._mediaStreamTrack.stop();
  }
  enable() {
    this._mediaStreamTrack.enabled = true;
  }
  disable() {
    this._mediaStreamTrack.enabled = false;
  }
  /* @internal */
  stopMonitor() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
  }
  recycleElement(element) {
    if (element instanceof HTMLAudioElement) {
      // we only need to re-use a single element
      let shouldCache = true;
      element.pause();
      recycledElements.forEach(e => {
        if (!e.parentElement) {
          shouldCache = false;
        }
      });
      if (shouldCache) {
        recycledElements.push(element);
      }
    }
  }
  handleAppVisibilityChanged() {
    return __awaiter(this, void 0, void 0, function* () {
      this.isInBackground = document.visibilityState === 'hidden';
    });
  }
  addAppVisibilityListener() {
    if (isWeb()) {
      this.isInBackground = document.visibilityState === 'hidden';
      document.addEventListener('visibilitychange', this.appVisibilityChangedListener);
    } else {
      this.isInBackground = false;
    }
  }
  removeAppVisibilityListener() {
    if (isWeb()) {
      document.removeEventListener('visibilitychange', this.appVisibilityChangedListener);
    }
  }
}
/** @internal */
function attachToElement(track, element) {
  let mediaStream;
  if (element.srcObject instanceof MediaStream) {
    mediaStream = element.srcObject;
  } else {
    mediaStream = new MediaStream();
  }
  // check if track matches existing track
  let existingTracks;
  if (track.kind === 'audio') {
    existingTracks = mediaStream.getAudioTracks();
  } else {
    existingTracks = mediaStream.getVideoTracks();
  }
  if (!existingTracks.includes(track)) {
    existingTracks.forEach(et => {
      mediaStream.removeTrack(et);
    });
    mediaStream.addTrack(track);
  }
  element.autoplay = true;
  // In case there are no audio tracks present on the mediastream, we set the element as muted to ensure autoplay works
  element.muted = mediaStream.getAudioTracks().length === 0;
  if (element instanceof HTMLVideoElement) {
    element.playsInline = true;
  }
  // avoid flicker
  if (element.srcObject !== mediaStream) {
    element.srcObject = mediaStream;
    if ((isSafari() || isFireFox()) && element instanceof HTMLVideoElement) {
      // Firefox also has a timing issue where video doesn't actually get attached unless
      // performed out-of-band
      // Safari 15 has a bug where in certain layouts, video element renders
      // black until the page is resized or other changes take place.
      // Resetting the src triggers it to render.
      // https://developer.apple.com/forums/thread/690523
      setTimeout(() => {
        element.srcObject = mediaStream;
        // Safari 15 sometimes fails to start a video
        // when the window is backgrounded before the first frame is drawn
        // manually calling play here seems to fix that
        element.play().catch(() => {
          /* do nothing */
        });
      }, 0);
    }
  }
}
/** @internal */
function detachTrack(track, element) {
  if (element.srcObject instanceof MediaStream) {
    const mediaStream = element.srcObject;
    mediaStream.removeTrack(track);
    if (mediaStream.getTracks().length > 0) {
      element.srcObject = mediaStream;
    } else {
      element.srcObject = null;
    }
  }
}
(function (Track) {
  let Kind;
  (function (Kind) {
    Kind["Audio"] = "audio";
    Kind["Video"] = "video";
    Kind["Unknown"] = "unknown";
  })(Kind = Track.Kind || (Track.Kind = {}));
  let Source;
  (function (Source) {
    Source["Camera"] = "camera";
    Source["Microphone"] = "microphone";
    Source["ScreenShare"] = "screen_share";
    Source["ScreenShareAudio"] = "screen_share_audio";
    Source["Unknown"] = "unknown";
  })(Source = Track.Source || (Track.Source = {}));
  let StreamState$1;
  (function (StreamState) {
    StreamState["Active"] = "active";
    StreamState["Paused"] = "paused";
    StreamState["Unknown"] = "unknown";
  })(StreamState$1 = Track.StreamState || (Track.StreamState = {}));
  /** @internal */
  function kindToProto(k) {
    switch (k) {
      case Kind.Audio:
        return TrackType.AUDIO;
      case Kind.Video:
        return TrackType.VIDEO;
      default:
        // FIXME this was UNRECOGNIZED before
        return TrackType.DATA;
    }
  }
  Track.kindToProto = kindToProto;
  /** @internal */
  function kindFromProto(t) {
    switch (t) {
      case TrackType.AUDIO:
        return Kind.Audio;
      case TrackType.VIDEO:
        return Kind.Video;
      default:
        return Kind.Unknown;
    }
  }
  Track.kindFromProto = kindFromProto;
  /** @internal */
  function sourceToProto(s) {
    switch (s) {
      case Source.Camera:
        return TrackSource.CAMERA;
      case Source.Microphone:
        return TrackSource.MICROPHONE;
      case Source.ScreenShare:
        return TrackSource.SCREEN_SHARE;
      case Source.ScreenShareAudio:
        return TrackSource.SCREEN_SHARE_AUDIO;
      default:
        return TrackSource.UNKNOWN;
    }
  }
  Track.sourceToProto = sourceToProto;
  /** @internal */
  function sourceFromProto(s) {
    switch (s) {
      case TrackSource.CAMERA:
        return Source.Camera;
      case TrackSource.MICROPHONE:
        return Source.Microphone;
      case TrackSource.SCREEN_SHARE:
        return Source.ScreenShare;
      case TrackSource.SCREEN_SHARE_AUDIO:
        return Source.ScreenShareAudio;
      default:
        return Source.Unknown;
    }
  }
  Track.sourceFromProto = sourceFromProto;
  /** @internal */
  function streamStateFromProto(s) {
    switch (s) {
      case StreamState.ACTIVE:
        return StreamState$1.Active;
      case StreamState.PAUSED:
        return StreamState$1.Paused;
      default:
        return StreamState$1.Unknown;
    }
  }
  Track.streamStateFromProto = streamStateFromProto;
})(Track || (Track = {}));

function mergeDefaultOptions(options, audioDefaults, videoDefaults) {
  const opts = Object.assign({}, options);
  if (opts.audio === true) opts.audio = {};
  if (opts.video === true) opts.video = {};
  // use defaults
  if (opts.audio) {
    mergeObjectWithoutOverwriting(opts.audio, audioDefaults);
  }
  if (opts.video) {
    mergeObjectWithoutOverwriting(opts.video, videoDefaults);
  }
  return opts;
}
function mergeObjectWithoutOverwriting(mainObject, objectToMerge) {
  Object.keys(objectToMerge).forEach(key => {
    if (mainObject[key] === undefined) mainObject[key] = objectToMerge[key];
  });
  return mainObject;
}
function constraintsForOptions(options) {
  const constraints = {};
  if (options.video) {
    // default video options
    if (typeof options.video === 'object') {
      const videoOptions = {};
      const target = videoOptions;
      const source = options.video;
      Object.keys(source).forEach(key => {
        switch (key) {
          case 'resolution':
            // flatten VideoResolution fields
            mergeObjectWithoutOverwriting(target, source.resolution);
            break;
          default:
            target[key] = source[key];
        }
      });
      constraints.video = videoOptions;
    } else {
      constraints.video = options.video;
    }
  } else {
    constraints.video = false;
  }
  if (options.audio) {
    if (typeof options.audio === 'object') {
      constraints.audio = options.audio;
    } else {
      constraints.audio = true;
    }
  } else {
    constraints.audio = false;
  }
  return constraints;
}
/**
 * This function detects silence on a given [[Track]] instance.
 * Returns true if the track seems to be entirely silent.
 */
function detectSilence(track) {
  let timeOffset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 200;
  return __awaiter(this, void 0, void 0, function* () {
    const ctx = getNewAudioContext();
    if (ctx) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const source = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
      source.connect(analyser);
      yield sleep(timeOffset);
      analyser.getByteTimeDomainData(dataArray);
      const someNoise = dataArray.some(sample => sample !== 128 && sample !== 0);
      ctx.close();
      return !someNoise;
    }
    return false;
  });
}
/**
 * @internal
 */
function getNewAudioContext() {
  const AudioContext =
  // @ts-ignore
  typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (AudioContext) {
    return new AudioContext({
      latencyHint: 'interactive'
    });
  }
}
/**
 * @internal
 */
function sourceToKind(source) {
  if (source === Track.Source.Microphone) {
    return 'audioinput';
  } else if (source === Track.Source.Camera) {
    return 'videoinput';
  } else {
    return undefined;
  }
}
/**
 * @internal
 */
function screenCaptureToDisplayMediaStreamOptions(options) {
  var _a, _b;
  let videoConstraints = (_a = options.video) !== null && _a !== void 0 ? _a : true;
  if (options.resolution) {
    videoConstraints = typeof videoConstraints === 'boolean' ? {} : videoConstraints;
    if (isSafari()) {
      videoConstraints = Object.assign(Object.assign({}, videoConstraints), {
        width: {
          max: options.resolution.width
        },
        height: {
          max: options.resolution.height
        },
        frameRate: options.resolution.frameRate
      });
    } else {
      videoConstraints = Object.assign(Object.assign({}, videoConstraints), {
        width: {
          ideal: options.resolution.width
        },
        height: {
          ideal: options.resolution.height
        },
        frameRate: options.resolution.frameRate
      });
    }
  }
  return {
    audio: (_b = options.audio) !== null && _b !== void 0 ? _b : false,
    video: videoConstraints,
    // @ts-expect-error support for experimental display media features
    controller: options.controller,
    selfBrowserSurface: options.selfBrowserSurface,
    surfaceSwitching: options.surfaceSwitching,
    systemAudio: options.systemAudio
  };
}

const separator = '|';
const ddExtensionURI = 'https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension';
function unpackStreamId(packed) {
  const parts = packed.split(separator);
  if (parts.length > 1) {
    return [parts[0], packed.substr(parts[0].length + 1)];
  }
  return [packed, ''];
}
function sleep(duration) {
  return __awaiter(this, void 0, void 0, function* () {
    return new Promise(resolve => setTimeout(resolve, duration));
  });
}
/** @internal */
function supportsTransceiver() {
  return 'addTransceiver' in RTCPeerConnection.prototype;
}
/** @internal */
function supportsAddTrack() {
  return 'addTrack' in RTCPeerConnection.prototype;
}
function supportsAdaptiveStream() {
  return typeof ResizeObserver !== undefined && typeof IntersectionObserver !== undefined;
}
function supportsDynacast() {
  return supportsTransceiver();
}
function supportsAV1() {
  if (!('getCapabilities' in RTCRtpSender)) {
    return false;
  }
  const capabilities = RTCRtpSender.getCapabilities('video');
  let hasAV1 = false;
  if (capabilities) {
    for (const codec of capabilities.codecs) {
      if (codec.mimeType === 'video/AV1') {
        hasAV1 = true;
        break;
      }
    }
  }
  return hasAV1;
}
function supportsVP9() {
  if (!('getCapabilities' in RTCRtpSender)) {
    // technically speaking FireFox supports VP9, but SVC publishing is broken
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1633876
    return false;
  }
  const capabilities = RTCRtpSender.getCapabilities('video');
  let hasVP9 = false;
  if (capabilities) {
    for (const codec of capabilities.codecs) {
      if (codec.mimeType === 'video/VP9') {
        hasVP9 = true;
        break;
      }
    }
  }
  return hasVP9;
}
function isSVCCodec(codec) {
  return codec === 'av1' || codec === 'vp9';
}
function supportsSetSinkId(elm) {
  if (!document) {
    return false;
  }
  if (!elm) {
    elm = document.createElement('audio');
  }
  return 'setSinkId' in elm;
}
const setCodecPreferencesVersions = {
  Chrome: '100',
  Safari: '15',
  Firefox: '100'
};
function supportsSetCodecPreferences(transceiver) {
  if (!isWeb()) {
    return false;
  }
  if (!('setCodecPreferences' in transceiver)) {
    return false;
  }
  const browser = getBrowser();
  if (!(browser === null || browser === void 0 ? void 0 : browser.name) || !browser.version) {
    // version is required
    return false;
  }
  const v = setCodecPreferencesVersions[browser.name];
  if (v) {
    return compareVersions(browser.version, v) >= 0;
  }
  return false;
}
function isBrowserSupported() {
  return supportsTransceiver() || supportsAddTrack();
}
function isFireFox() {
  var _a;
  return ((_a = getBrowser()) === null || _a === void 0 ? void 0 : _a.name) === 'Firefox';
}
function isChromiumBased() {
  var _a;
  return ((_a = getBrowser()) === null || _a === void 0 ? void 0 : _a.name) === 'Chrome';
}
function isSafari() {
  var _a;
  return ((_a = getBrowser()) === null || _a === void 0 ? void 0 : _a.name) === 'Safari';
}
function isMobile() {
  if (!isWeb()) return false;
  return /Tablet|iPad|Mobile|Android|BlackBerry/.test(navigator.userAgent);
}
function isWeb() {
  return typeof document !== 'undefined';
}
function isReactNative() {
  // navigator.product is deprecated on browsers, but will be set appropriately for react-native.
  return navigator.product == 'ReactNative';
}
function isCloud(serverUrl) {
  return serverUrl.hostname.endsWith('.livekit.cloud') || serverUrl.hostname.endsWith('.livekit.run');
}
function getLKReactNativeInfo() {
  // global defined only for ReactNative.
  // @ts-ignore
  if (global && global.LiveKitReactNativeGlobal) {
    // @ts-ignore
    return global.LiveKitReactNativeGlobal;
  }
  return undefined;
}
function getReactNativeOs() {
  if (!isReactNative()) {
    return undefined;
  }
  let info = getLKReactNativeInfo();
  if (info) {
    return info.platform;
  }
  return undefined;
}
function getDevicePixelRatio() {
  if (isWeb()) {
    return window.devicePixelRatio;
  }
  if (isReactNative()) {
    let info = getLKReactNativeInfo();
    if (info) {
      return info.devicePixelRatio;
    }
  }
  return 1;
}
function compareVersions(v1, v2) {
  const parts1 = v1.split('.');
  const parts2 = v2.split('.');
  const k = Math.min(parts1.length, parts2.length);
  for (let i = 0; i < k; ++i) {
    const p1 = parseInt(parts1[i], 10);
    const p2 = parseInt(parts2[i], 10);
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
    if (i === k - 1 && p1 === p2) return 0;
  }
  if (v1 === '' && v2 !== '') {
    return -1;
  } else if (v2 === '') {
    return 1;
  }
  return parts1.length == parts2.length ? 0 : parts1.length < parts2.length ? -1 : 1;
}
function roDispatchCallback(entries) {
  for (const entry of entries) {
    entry.target.handleResize(entry);
  }
}
function ioDispatchCallback(entries) {
  for (const entry of entries) {
    entry.target.handleVisibilityChanged(entry);
  }
}
let resizeObserver = null;
const getResizeObserver = () => {
  if (!resizeObserver) resizeObserver = new ResizeObserver(roDispatchCallback);
  return resizeObserver;
};
let intersectionObserver = null;
const getIntersectionObserver = () => {
  if (!intersectionObserver) {
    intersectionObserver = new IntersectionObserver(ioDispatchCallback, {
      root: null,
      rootMargin: '0px'
    });
  }
  return intersectionObserver;
};
function getClientInfo() {
  var _a;
  const info = new ClientInfo({
    sdk: ClientInfo_SDK.JS,
    protocol: protocolVersion,
    version
  });
  if (isReactNative()) {
    info.os = (_a = getReactNativeOs()) !== null && _a !== void 0 ? _a : '';
  }
  return info;
}
let emptyVideoStreamTrack;
function getEmptyVideoStreamTrack() {
  if (!emptyVideoStreamTrack) {
    emptyVideoStreamTrack = createDummyVideoStreamTrack();
  }
  return emptyVideoStreamTrack.clone();
}
function createDummyVideoStreamTrack() {
  let width = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 16;
  let height = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 16;
  let enabled = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
  let paintContent = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
  const canvas = document.createElement('canvas');
  // the canvas size is set to 16 by default, because electron apps seem to fail with smaller values
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx === null || ctx === void 0 ? void 0 : ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (paintContent && ctx) {
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 50, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = 'grey';
    ctx.fill();
  }
  // @ts-ignore
  const dummyStream = canvas.captureStream();
  const [dummyTrack] = dummyStream.getTracks();
  if (!dummyTrack) {
    throw Error('Could not get empty media stream video track');
  }
  dummyTrack.enabled = enabled;
  return dummyTrack;
}
let emptyAudioStreamTrack;
function getEmptyAudioStreamTrack() {
  if (!emptyAudioStreamTrack) {
    // implementation adapted from https://blog.mozilla.org/webrtc/warm-up-with-replacetrack/
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, 0);
    const dst = ctx.createMediaStreamDestination();
    oscillator.connect(gain);
    gain.connect(dst);
    oscillator.start();
    [emptyAudioStreamTrack] = dst.stream.getAudioTracks();
    if (!emptyAudioStreamTrack) {
      throw Error('Could not get empty media stream audio track');
    }
    emptyAudioStreamTrack.enabled = false;
  }
  return emptyAudioStreamTrack.clone();
}
class Future {
  constructor(futureBase, onFinally) {
    this.onFinally = onFinally;
    this.promise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
      this.resolve = resolve;
      this.reject = reject;
      if (futureBase) {
        yield futureBase(resolve, reject);
      }
    })).finally(() => {
      var _a;
      return (_a = this.onFinally) === null || _a === void 0 ? void 0 : _a.call(this);
    });
  }
}
/**
 * Creates and returns an analyser web audio node that is attached to the provided track.
 * Additionally returns a convenience method `calculateVolume` to perform instant volume readings on that track.
 * Call the returned `cleanup` function to close the audioContext that has been created for the instance of this helper
 */
function createAudioAnalyser(track, options) {
  const opts = Object.assign({
    cloneTrack: false,
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    minDecibels: -100,
    maxDecibels: -80
  }, options);
  const audioContext = getNewAudioContext();
  if (!audioContext) {
    throw new Error('Audio Context not supported on this browser');
  }
  const streamTrack = opts.cloneTrack ? track.mediaStreamTrack.clone() : track.mediaStreamTrack;
  const mediaStreamSource = audioContext.createMediaStreamSource(new MediaStream([streamTrack]));
  const analyser = audioContext.createAnalyser();
  analyser.minDecibels = opts.minDecibels;
  analyser.maxDecibels = opts.maxDecibels;
  analyser.fftSize = opts.fftSize;
  analyser.smoothingTimeConstant = opts.smoothingTimeConstant;
  mediaStreamSource.connect(analyser);
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  /**
   * Calculates the current volume of the track in the range from 0 to 1
   */
  const calculateVolume = () => {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (const amplitude of dataArray) {
      sum += Math.pow(amplitude / 255, 2);
    }
    const volume = Math.sqrt(sum / dataArray.length);
    return volume;
  };
  const cleanup = () => {
    audioContext.close();
    if (opts.cloneTrack) {
      streamTrack.stop();
    }
  };
  return {
    calculateVolume,
    analyser,
    cleanup
  };
}
class Mutex {
  constructor() {
    this._locking = Promise.resolve();
    this._locks = 0;
  }
  isLocked() {
    return this._locks > 0;
  }
  lock() {
    this._locks += 1;
    let unlockNext;
    const willLock = new Promise(resolve => unlockNext = () => {
      this._locks -= 1;
      resolve();
    });
    const willUnlock = this._locking.then(() => unlockNext);
    this._locking = this._locking.then(() => willLock);
    return willUnlock;
  }
}
function isVideoCodec(maybeCodec) {
  return videoCodecs.includes(maybeCodec);
}
function unwrapConstraint(constraint) {
  if (typeof constraint === 'string') {
    return constraint;
  }
  if (Array.isArray(constraint)) {
    return constraint[0];
  }
  if (constraint.exact) {
    if (Array.isArray(constraint.exact)) {
      return constraint.exact[0];
    }
    return constraint.exact;
  }
  if (constraint.ideal) {
    if (Array.isArray(constraint.ideal)) {
      return constraint.ideal[0];
    }
    return constraint.ideal;
  }
  throw Error('could not unwrap constraint');
}
function toWebsocketUrl(url) {
  if (url.startsWith('http')) {
    return url.replace(/^(http)/, 'ws');
  }
  return url;
}
function toHttpUrl(url) {
  if (url.startsWith('ws')) {
    return url.replace(/^(ws)/, 'http');
  }
  return url;
}

var QueueTaskStatus;
(function (QueueTaskStatus) {
  QueueTaskStatus[QueueTaskStatus["WAITING"] = 0] = "WAITING";
  QueueTaskStatus[QueueTaskStatus["RUNNING"] = 1] = "RUNNING";
  QueueTaskStatus[QueueTaskStatus["COMPLETED"] = 2] = "COMPLETED";
})(QueueTaskStatus || (QueueTaskStatus = {}));
class AsyncQueue {
  constructor() {
    this.pendingTasks = new Map();
    this.taskMutex = new Mutex();
    this.nextTaskIndex = 0;
  }
  run(task) {
    return __awaiter(this, void 0, void 0, function* () {
      const taskInfo = {
        id: this.nextTaskIndex++,
        enqueuedAt: Date.now(),
        status: QueueTaskStatus.WAITING
      };
      this.pendingTasks.set(taskInfo.id, taskInfo);
      const unlock = yield this.taskMutex.lock();
      try {
        taskInfo.executedAt = Date.now();
        taskInfo.status = QueueTaskStatus.RUNNING;
        return yield task();
      } finally {
        taskInfo.status = QueueTaskStatus.COMPLETED;
        this.pendingTasks.delete(taskInfo.id);
        unlock();
      }
    });
  }
  flush() {
    return __awaiter(this, void 0, void 0, function* () {
      return this.run(() => __awaiter(this, void 0, void 0, function* () {}));
    });
  }
  snapshot() {
    return Array.from(this.pendingTasks.values());
  }
}

const passThroughQueueSignals = ['syncState', 'trickle', 'offer', 'answer', 'simulate', 'leave'];
function canPassThroughQueue(req) {
  const canPass = passThroughQueueSignals.indexOf(req.case) >= 0;
  livekitLogger.trace('request allowed to bypass queue:', {
    canPass,
    req
  });
  return canPass;
}
/** @internal */
class SignalClient {
  constructor() {
    let useJSON = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
    /** signal rtt in milliseconds */
    this.rtt = 0;
    /** @internal */
    this.resetCallbacks = () => {
      this.onAnswer = undefined;
      this.onLeave = undefined;
      this.onLocalTrackPublished = undefined;
      this.onLocalTrackUnpublished = undefined;
      this.onNegotiateRequested = undefined;
      this.onOffer = undefined;
      this.onRemoteMuteChanged = undefined;
      this.onSubscribedQualityUpdate = undefined;
      this.onTokenRefresh = undefined;
      this.onTrickle = undefined;
      this.onClose = undefined;
    };
    this.isConnected = false;
    this.isReconnecting = false;
    this.useJSON = useJSON;
    this.requestQueue = new AsyncQueue();
    this.queuedRequests = [];
    this.closingLock = new Mutex();
  }
  join(url, token, opts, abortSignal) {
    return __awaiter(this, void 0, void 0, function* () {
      // during a full reconnect, we'd want to start the sequence even if currently
      // connected
      this.isConnected = false;
      this.options = opts;
      const res = yield this.connect(url, token, opts, abortSignal);
      return res;
    });
  }
  reconnect(url, token, sid, reason) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.options) {
        livekitLogger.warn('attempted to reconnect without signal options being set, ignoring');
        return;
      }
      this.isReconnecting = true;
      // clear ping interval and restart it once reconnected
      this.clearPingInterval();
      const res = yield this.connect(url, token, Object.assign(Object.assign({}, this.options), {
        reconnect: true,
        sid,
        reconnectReason: reason
      }));
      return res;
    });
  }
  connect(url, token, opts, abortSignal) {
    this.connectOptions = opts;
    url = toWebsocketUrl(url);
    // strip trailing slash
    url = url.replace(/\/$/, '');
    url += '/rtc';
    const clientInfo = getClientInfo();
    const params = createConnectionParams(token, clientInfo, opts);
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
      const abortHandler = () => __awaiter(this, void 0, void 0, function* () {
        this.close();
        clearTimeout(wsTimeout);
        reject(new ConnectionError('room connection has been cancelled (signal)'));
      });
      const wsTimeout = setTimeout(() => {
        this.close();
        reject(new ConnectionError('room connection has timed out (signal)'));
      }, opts.websocketTimeout);
      if (abortSignal === null || abortSignal === void 0 ? void 0 : abortSignal.aborted) {
        abortHandler();
      }
      abortSignal === null || abortSignal === void 0 ? void 0 : abortSignal.addEventListener('abort', abortHandler);
      livekitLogger.debug("connecting to ".concat(url + params));
      if (this.ws) {
        yield this.close();
      }
      this.ws = new WebSocket(url + params);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = () => {
        clearTimeout(wsTimeout);
      };
      this.ws.onerror = ev => __awaiter(this, void 0, void 0, function* () {
        if (!this.isConnected) {
          clearTimeout(wsTimeout);
          try {
            const resp = yield fetch("http".concat(url.substring(2), "/validate").concat(params));
            if (resp.status.toFixed(0).startsWith('4')) {
              const msg = yield resp.text();
              reject(new ConnectionError(msg, 0 /* ConnectionErrorReason.NotAllowed */, resp.status));
            } else {
              reject(new ConnectionError('Internal error', 2 /* ConnectionErrorReason.InternalError */, resp.status));
            }
          } catch (e) {
            reject(new ConnectionError('server was not reachable', 1 /* ConnectionErrorReason.ServerUnreachable */));
          }

          return;
        }
        // other errors, handle
        this.handleWSError(ev);
      });
      this.ws.onmessage = ev => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        // not considered connected until JoinResponse is received
        let resp;
        if (typeof ev.data === 'string') {
          const json = JSON.parse(ev.data);
          resp = SignalResponse.fromJson(json);
        } else if (ev.data instanceof ArrayBuffer) {
          resp = SignalResponse.fromBinary(new Uint8Array(ev.data));
        } else {
          livekitLogger.error("could not decode websocket message: ".concat(typeof ev.data));
          return;
        }
        if (!this.isConnected) {
          let shouldProcessMessage = false;
          // handle join message only
          if (((_a = resp.message) === null || _a === void 0 ? void 0 : _a.case) === 'join') {
            this.isConnected = true;
            abortSignal === null || abortSignal === void 0 ? void 0 : abortSignal.removeEventListener('abort', abortHandler);
            this.pingTimeoutDuration = resp.message.value.pingTimeout;
            this.pingIntervalDuration = resp.message.value.pingInterval;
            if (this.pingTimeoutDuration && this.pingTimeoutDuration > 0) {
              livekitLogger.debug('ping config', {
                timeout: this.pingTimeoutDuration,
                interval: this.pingIntervalDuration
              });
              this.startPingInterval();
            }
            resolve(resp.message.value);
          } else if (opts.reconnect) {
            // in reconnecting, any message received means signal reconnected
            this.isConnected = true;
            abortSignal === null || abortSignal === void 0 ? void 0 : abortSignal.removeEventListener('abort', abortHandler);
            this.startPingInterval();
            if (((_b = resp.message) === null || _b === void 0 ? void 0 : _b.case) === 'reconnect') {
              resolve((_c = resp.message) === null || _c === void 0 ? void 0 : _c.value);
            } else {
              resolve();
              shouldProcessMessage = true;
            }
          } else if (!opts.reconnect) {
            // non-reconnect case, should receive join response first
            reject(new ConnectionError("did not receive join response, got ".concat((_d = resp.message) === null || _d === void 0 ? void 0 : _d.case, " instead")));
          }
          if (!shouldProcessMessage) {
            return;
          }
        }
        if (this.signalLatency) {
          yield sleep(this.signalLatency);
        }
        this.handleSignalResponse(resp);
      });
      this.ws.onclose = ev => {
        livekitLogger.warn("websocket closed", {
          ev
        });
        this.handleOnClose(ev.reason);
      };
    }));
  }
  close() {
    return __awaiter(this, void 0, void 0, function* () {
      const unlock = yield this.closingLock.lock();
      try {
        this.isConnected = false;
        if (this.ws) {
          this.ws.onmessage = null;
          this.ws.onopen = null;
          this.ws.onclose = null;
          // calling `ws.close()` only starts the closing handshake (CLOSING state), prefer to wait until state is actually CLOSED
          const closePromise = new Promise(resolve => {
            if (this.ws) {
              this.ws.onclose = () => {
                resolve();
              };
            } else {
              resolve();
            }
          });
          if (this.ws.readyState < this.ws.CLOSING) {
            this.ws.close();
            // 250ms grace period for ws to close gracefully
            yield Promise.race([closePromise, sleep(250)]);
          }
          this.ws = undefined;
        }
      } finally {
        this.clearPingInterval();
        unlock();
      }
    });
  }
  // initial offer after joining
  sendOffer(offer) {
    livekitLogger.debug('sending offer', offer);
    this.sendRequest({
      case: 'offer',
      value: toProtoSessionDescription(offer)
    });
  }
  // answer a server-initiated offer
  sendAnswer(answer) {
    livekitLogger.debug('sending answer');
    return this.sendRequest({
      case: 'answer',
      value: toProtoSessionDescription(answer)
    });
  }
  sendIceCandidate(candidate, target) {
    livekitLogger.trace('sending ice candidate', candidate);
    return this.sendRequest({
      case: 'trickle',
      value: new TrickleRequest({
        candidateInit: JSON.stringify(candidate),
        target
      })
    });
  }
  sendMuteTrack(trackSid, muted) {
    return this.sendRequest({
      case: 'mute',
      value: new MuteTrackRequest({
        sid: trackSid,
        muted
      })
    });
  }
  sendAddTrack(req) {
    return this.sendRequest({
      case: 'addTrack',
      value: req
    });
  }
  sendUpdateLocalMetadata(metadata, name) {
    return this.sendRequest({
      case: 'updateMetadata',
      value: new UpdateParticipantMetadata({
        metadata,
        name
      })
    });
  }
  sendUpdateTrackSettings(settings) {
    this.sendRequest({
      case: 'trackSetting',
      value: settings
    });
  }
  sendUpdateSubscription(sub) {
    return this.sendRequest({
      case: 'subscription',
      value: sub
    });
  }
  sendSyncState(sync) {
    return this.sendRequest({
      case: 'syncState',
      value: sync
    });
  }
  sendUpdateVideoLayers(trackSid, layers) {
    return this.sendRequest({
      case: 'updateLayers',
      value: new UpdateVideoLayers({
        trackSid,
        layers
      })
    });
  }
  sendUpdateSubscriptionPermissions(allParticipants, trackPermissions) {
    return this.sendRequest({
      case: 'subscriptionPermission',
      value: new SubscriptionPermission({
        allParticipants,
        trackPermissions
      })
    });
  }
  sendSimulateScenario(scenario) {
    return this.sendRequest({
      case: 'simulate',
      value: scenario
    });
  }
  sendPing() {
    /** send both of ping and pingReq for compatibility to old and new server */
    return Promise.all([this.sendRequest({
      case: 'ping',
      value: protoInt64.parse(Date.now())
    }), this.sendRequest({
      case: 'pingReq',
      value: new Ping({
        timestamp: protoInt64.parse(Date.now()),
        rtt: protoInt64.parse(this.rtt)
      })
    })]);
  }
  sendLeave() {
    return this.sendRequest({
      case: 'leave',
      value: new LeaveRequest({
        canReconnect: false,
        reason: DisconnectReason.CLIENT_INITIATED
      })
    });
  }
  sendRequest(message) {
    let fromQueue = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
    return __awaiter(this, void 0, void 0, function* () {
      // capture all requests while reconnecting and put them in a queue
      // unless the request originates from the queue, then don't enqueue again
      const canQueue = !fromQueue && !canPassThroughQueue(message);
      if (canQueue && this.isReconnecting) {
        this.queuedRequests.push(() => __awaiter(this, void 0, void 0, function* () {
          yield this.sendRequest(message, true);
        }));
        return;
      }
      // make sure previously queued requests are being sent first
      if (!fromQueue) {
        yield this.requestQueue.flush();
      }
      if (this.signalLatency) {
        yield sleep(this.signalLatency);
      }
      if (!this.ws || this.ws.readyState !== this.ws.OPEN) {
        livekitLogger.error("cannot send signal request before connected, type: ".concat(message === null || message === void 0 ? void 0 : message.case));
        return;
      }
      const req = new SignalRequest({
        message
      });
      try {
        if (this.useJSON) {
          this.ws.send(req.toJsonString());
        } else {
          this.ws.send(req.toBinary());
        }
      } catch (e) {
        livekitLogger.error('error sending signal message', {
          error: e
        });
      }
    });
  }
  handleSignalResponse(res) {
    var _a, _b;
    const msg = res.message;
    if (msg == undefined) {
      livekitLogger.debug('received unsupported message');
      return;
    }
    if (msg.case === 'answer') {
      const sd = fromProtoSessionDescription(msg.value);
      if (this.onAnswer) {
        this.onAnswer(sd);
      }
    } else if (msg.case === 'offer') {
      const sd = fromProtoSessionDescription(msg.value);
      if (this.onOffer) {
        this.onOffer(sd);
      }
    } else if (msg.case === 'trickle') {
      const candidate = JSON.parse(msg.value.candidateInit);
      if (this.onTrickle) {
        this.onTrickle(candidate, msg.value.target);
      }
    } else if (msg.case === 'update') {
      if (this.onParticipantUpdate) {
        this.onParticipantUpdate((_a = msg.value.participants) !== null && _a !== void 0 ? _a : []);
      }
    } else if (msg.case === 'trackPublished') {
      if (this.onLocalTrackPublished) {
        this.onLocalTrackPublished(msg.value);
      }
    } else if (msg.case === 'speakersChanged') {
      if (this.onSpeakersChanged) {
        this.onSpeakersChanged((_b = msg.value.speakers) !== null && _b !== void 0 ? _b : []);
      }
    } else if (msg.case === 'leave') {
      if (this.onLeave) {
        this.onLeave(msg.value);
      }
    } else if (msg.case === 'mute') {
      if (this.onRemoteMuteChanged) {
        this.onRemoteMuteChanged(msg.value.sid, msg.value.muted);
      }
    } else if (msg.case === 'roomUpdate') {
      if (this.onRoomUpdate && msg.value.room) {
        this.onRoomUpdate(msg.value.room);
      }
    } else if (msg.case === 'connectionQuality') {
      if (this.onConnectionQuality) {
        this.onConnectionQuality(msg.value);
      }
    } else if (msg.case === 'streamStateUpdate') {
      if (this.onStreamStateUpdate) {
        this.onStreamStateUpdate(msg.value);
      }
    } else if (msg.case === 'subscribedQualityUpdate') {
      if (this.onSubscribedQualityUpdate) {
        this.onSubscribedQualityUpdate(msg.value);
      }
    } else if (msg.case === 'subscriptionPermissionUpdate') {
      if (this.onSubscriptionPermissionUpdate) {
        this.onSubscriptionPermissionUpdate(msg.value);
      }
    } else if (msg.case === 'refreshToken') {
      if (this.onTokenRefresh) {
        this.onTokenRefresh(msg.value);
      }
    } else if (msg.case === 'trackUnpublished') {
      if (this.onLocalTrackUnpublished) {
        this.onLocalTrackUnpublished(msg.value);
      }
    } else if (msg.case === 'subscriptionResponse') {
      if (this.onSubscriptionError) {
        this.onSubscriptionError(msg.value);
      }
    } else if (msg.case === 'pong') {
      this.resetPingTimeout();
    } else if (msg.case === 'pongResp') {
      this.rtt = Date.now() - Number.parseInt(msg.value.lastPingTimestamp.toString());
      this.resetPingTimeout();
    } else {
      livekitLogger.debug('unsupported message', msg);
    }
  }
  setReconnected() {
    while (this.queuedRequests.length > 0) {
      const req = this.queuedRequests.shift();
      if (req) {
        this.requestQueue.run(req);
      }
    }
    this.isReconnecting = false;
  }
  handleOnClose(reason) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.isConnected) return;
      const onCloseCallback = this.onClose;
      yield this.close();
      livekitLogger.debug("websocket connection closed: ".concat(reason));
      if (onCloseCallback) {
        onCloseCallback(reason);
      }
    });
  }
  handleWSError(ev) {
    livekitLogger.error('websocket error', ev);
  }
  /**
   * Resets the ping timeout and starts a new timeout.
   * Call this after receiving a pong message
   */
  resetPingTimeout() {
    this.clearPingTimeout();
    if (!this.pingTimeoutDuration) {
      livekitLogger.warn('ping timeout duration not set');
      return;
    }
    this.pingTimeout = CriticalTimers.setTimeout(() => {
      livekitLogger.warn("ping timeout triggered. last pong received at: ".concat(new Date(Date.now() - this.pingTimeoutDuration * 1000).toUTCString()));
      this.handleOnClose('ping timeout');
    }, this.pingTimeoutDuration * 1000);
  }
  /**
   * Clears ping timeout (does not start a new timeout)
   */
  clearPingTimeout() {
    if (this.pingTimeout) {
      CriticalTimers.clearTimeout(this.pingTimeout);
    }
  }
  startPingInterval() {
    this.clearPingInterval();
    this.resetPingTimeout();
    if (!this.pingIntervalDuration) {
      livekitLogger.warn('ping interval duration not set');
      return;
    }
    livekitLogger.debug('start ping interval');
    this.pingInterval = CriticalTimers.setInterval(() => {
      this.sendPing();
    }, this.pingIntervalDuration * 1000);
  }
  clearPingInterval() {
    livekitLogger.debug('clearing ping interval');
    this.clearPingTimeout();
    if (this.pingInterval) {
      CriticalTimers.clearInterval(this.pingInterval);
    }
  }
}
function fromProtoSessionDescription(sd) {
  const rsd = {
    type: 'offer',
    sdp: sd.sdp
  };
  switch (sd.type) {
    case 'answer':
    case 'offer':
    case 'pranswer':
    case 'rollback':
      rsd.type = sd.type;
      break;
  }
  return rsd;
}
function toProtoSessionDescription(rsd) {
  const sd = new SessionDescription({
    sdp: rsd.sdp,
    type: rsd.type
  });
  return sd;
}
function createConnectionParams(token, info, opts) {
  var _a;
  const params = new URLSearchParams();
  params.set('access_token', token);
  // opts
  if (opts.reconnect) {
    params.set('reconnect', '1');
    if (opts.sid) {
      params.set('sid', opts.sid);
    }
  }
  params.set('auto_subscribe', opts.autoSubscribe ? '1' : '0');
  // ClientInfo
  params.set('sdk', isReactNative() ? 'reactnative' : 'js');
  params.set('version', info.version);
  params.set('protocol', info.protocol.toString());
  if (info.deviceModel) {
    params.set('device_model', info.deviceModel);
  }
  if (info.os) {
    params.set('os', info.os);
  }
  if (info.osVersion) {
    params.set('os_version', info.osVersion);
  }
  if (info.browser) {
    params.set('browser', info.browser);
  }
  if (info.browserVersion) {
    params.set('browser_version', info.browserVersion);
  }
  if (opts.publishOnly !== undefined) {
    params.set('publish', opts.publishOnly);
  }
  if (opts.adaptiveStream) {
    params.set('adaptive_stream', '1');
  }
  if (opts.reconnectReason) {
    params.set('reconnect_reason', opts.reconnectReason.toString());
  }
  // @ts-ignore
  if ((_a = navigator.connection) === null || _a === void 0 ? void 0 : _a.type) {
    // @ts-ignore
    params.set('network', navigator.connection.type);
  }
  return "?".concat(params.toString());
}

const ENCRYPTION_ALGORITHM = 'AES-GCM';
// How many consecutive frames can fail decrypting before a particular key gets marked as invalid
const DECRYPTION_FAILURE_TOLERANCE = 10;
// flag set to indicate that e2ee has been setup for sender/receiver;
const E2EE_FLAG = 'lk_e2ee';
const SALT = 'LKFrameEncryptionKey';
const KEY_PROVIDER_DEFAULTS = {
  sharedKey: false,
  ratchetSalt: SALT,
  ratchetWindowSize: 8,
  failureTolerance: DECRYPTION_FAILURE_TOLERANCE
};

var KeyProviderEvent;
(function (KeyProviderEvent) {
  KeyProviderEvent["SetKey"] = "setKey";
  KeyProviderEvent["RatchetRequest"] = "ratchetRequest";
  KeyProviderEvent["KeyRatcheted"] = "keyRatcheted";
})(KeyProviderEvent || (KeyProviderEvent = {}));
var KeyHandlerEvent;
(function (KeyHandlerEvent) {
  KeyHandlerEvent["KeyRatcheted"] = "keyRatcheted";
})(KeyHandlerEvent || (KeyHandlerEvent = {}));
var EncryptionEvent;
(function (EncryptionEvent) {
  EncryptionEvent["ParticipantEncryptionStatusChanged"] = "participantEncryptionStatusChanged";
  EncryptionEvent["EncryptionError"] = "encryptionError";
})(EncryptionEvent || (EncryptionEvent = {}));
var CryptorEvent;
(function (CryptorEvent) {
  CryptorEvent["Error"] = "cryptorError";
})(CryptorEvent || (CryptorEvent = {}));

function isE2EESupported() {
  return isInsertableStreamSupported() || isScriptTransformSupported();
}
function isScriptTransformSupported() {
  // @ts-ignore
  return typeof window.RTCRtpScriptTransform !== 'undefined';
}
function isInsertableStreamSupported() {
  return typeof window.RTCRtpSender !== 'undefined' &&
  // @ts-ignore
  typeof window.RTCRtpSender.prototype.createEncodedStreams !== 'undefined';
}
function isVideoFrame(frame) {
  return 'type' in frame;
}
function importKey(keyBytes) {
  let algorithm = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
    name: ENCRYPTION_ALGORITHM
  };
  let usage = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'encrypt';
  return __awaiter(this, void 0, void 0, function* () {
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
    return crypto.subtle.importKey('raw', keyBytes, algorithm, false, usage === 'derive' ? ['deriveBits', 'deriveKey'] : ['encrypt', 'decrypt']);
  });
}
function createKeyMaterialFromString(password) {
  return __awaiter(this, void 0, void 0, function* () {
    let enc = new TextEncoder();
    const keyMaterial = yield crypto.subtle.importKey('raw', enc.encode(password), {
      name: 'PBKDF2'
    }, false, ['deriveBits', 'deriveKey']);
    return keyMaterial;
  });
}
function createKeyMaterialFromBuffer(cryptoBuffer) {
  return __awaiter(this, void 0, void 0, function* () {
    const keyMaterial = yield crypto.subtle.importKey('raw', cryptoBuffer, 'HKDF', false, ['deriveBits', 'deriveKey']);
    return keyMaterial;
  });
}
function getAlgoOptions(algorithmName, salt) {
  const textEncoder = new TextEncoder();
  const encodedSalt = textEncoder.encode(salt);
  switch (algorithmName) {
    case 'HKDF':
      return {
        name: 'HKDF',
        salt: encodedSalt,
        hash: 'SHA-256',
        info: new ArrayBuffer(128)
      };
    case 'PBKDF2':
      {
        return {
          name: 'PBKDF2',
          salt: encodedSalt,
          hash: 'SHA-256',
          iterations: 100000
        };
      }
    default:
      throw new Error("algorithm ".concat(algorithmName, " is currently unsupported"));
  }
}
/**
 * Derives a set of keys from the master key.
 * See https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.1
 */
function deriveKeys(material, salt) {
  return __awaiter(this, void 0, void 0, function* () {
    const algorithmOptions = getAlgoOptions(material.algorithm.name, salt);
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#HKDF
    // https://developer.mozilla.org/en-US/docs/Web/API/HkdfParams
    const encryptionKey = yield crypto.subtle.deriveKey(algorithmOptions, material, {
      name: ENCRYPTION_ALGORITHM,
      length: 128
    }, false, ['encrypt', 'decrypt']);
    return {
      material,
      encryptionKey
    };
  });
}
function createE2EEKey() {
  return window.crypto.getRandomValues(new Uint8Array(32));
}
function mimeTypeToVideoCodecString(mimeType) {
  const codec = mimeType.split('/')[1].toLowerCase();
  if (!videoCodecs.includes(codec)) {
    throw Error("Video codec not supported: ".concat(codec));
  }
  return codec;
}
/**
 * Ratchets a key. See
 * https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1
 */
function ratchet(material, salt) {
  return __awaiter(this, void 0, void 0, function* () {
    const algorithmOptions = getAlgoOptions(material.algorithm.name, salt);
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits
    return crypto.subtle.deriveBits(algorithmOptions, material, 256);
  });
}

/**
 * @experimental
 */
class BaseKeyProvider extends eventsExports.EventEmitter {
  constructor() {
    let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    super();
    /**
     * callback being invoked after a ratchet request has been performed on a participant
     * that surfaces the new key material.
     * @param material
     * @param keyIndex
     */
    this.onKeyRatcheted = (material, keyIndex) => {
      livekitLogger.debug('key ratcheted event received', {
        material,
        keyIndex
      });
    };
    this.keyInfoMap = new Map();
    this.options = Object.assign(Object.assign({}, KEY_PROVIDER_DEFAULTS), options);
    this.on(KeyProviderEvent.KeyRatcheted, this.onKeyRatcheted);
  }
  /**
   * callback to invoke once a key has been set for a participant
   * @param key
   * @param participantIdentity
   * @param keyIndex
   */
  onSetEncryptionKey(key, participantIdentity, keyIndex) {
    const keyInfo = {
      key,
      participantIdentity,
      keyIndex
    };
    this.keyInfoMap.set("".concat(participantIdentity !== null && participantIdentity !== void 0 ? participantIdentity : 'shared', "-").concat(keyIndex !== null && keyIndex !== void 0 ? keyIndex : 0), keyInfo);
    this.emit(KeyProviderEvent.SetKey, keyInfo);
  }
  getKeys() {
    return Array.from(this.keyInfoMap.values());
  }
  getOptions() {
    return this.options;
  }
  ratchetKey(participantIdentity, keyIndex) {
    this.emit(KeyProviderEvent.RatchetRequest, participantIdentity, keyIndex);
  }
}
/**
 * A basic KeyProvider implementation intended for a single shared
 * passphrase between all participants
 * @experimental
 */
class ExternalE2EEKeyProvider extends BaseKeyProvider {
  constructor() {
    let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    const opts = Object.assign(Object.assign({}, options), {
      sharedKey: true,
      // for a shared key provider failing to decrypt for a specific participant
      // should not mark the key as invalid, so we accept wrong keys forever
      // and won't try to auto-ratchet
      ratchetWindowSize: 0,
      failureTolerance: -1
    });
    super(opts);
  }
  /**
   * Accepts a passphrase that's used to create the crypto keys.
   * When passing in a string, PBKDF2 is used.
   * When passing in an Array buffer of cryptographically random numbers, HKDF is being used. (recommended)
   * @param key
   */
  setKey(key) {
    return __awaiter(this, void 0, void 0, function* () {
      const derivedKey = typeof key === 'string' ? yield createKeyMaterialFromString(key) : yield createKeyMaterialFromBuffer(key);
      this.onSetEncryptionKey(derivedKey);
    });
  }
}

function r(r, e, n) {
  var i, t, o;
  void 0 === e && (e = 50), void 0 === n && (n = {});
  var a = null != (i = n.isImmediate) && i,
    u = null != (t = n.callback) && t,
    c = n.maxWait,
    v = Date.now(),
    l = [];
  function f() {
    if (void 0 !== c) {
      var r = Date.now() - v;
      if (r + e >= c) return c - r;
    }
    return e;
  }
  var d = function () {
    var e = [].slice.call(arguments),
      n = this;
    return new Promise(function (i, t) {
      var c = a && void 0 === o;
      if (void 0 !== o && clearTimeout(o), o = setTimeout(function () {
        if (o = void 0, v = Date.now(), !a) {
          var i = r.apply(n, e);
          u && u(i), l.forEach(function (r) {
            return (0, r.resolve)(i);
          }), l = [];
        }
      }, f()), c) {
        var d = r.apply(n, e);
        return u && u(d), i(d);
      }
      l.push({
        resolve: i,
        reject: t
      });
    });
  };
  return d.cancel = function (r) {
    void 0 !== o && clearTimeout(o), l.forEach(function (e) {
      return (0, e.reject)(r);
    }), l = [];
  }, d;
}

const defaultId = 'default';
class DeviceManager {
  static getInstance() {
    if (this.instance === undefined) {
      this.instance = new DeviceManager();
    }
    return this.instance;
  }
  getDevices(kind) {
    let requestPermissions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      if (((_a = DeviceManager.userMediaPromiseMap) === null || _a === void 0 ? void 0 : _a.size) > 0) {
        livekitLogger.debug('awaiting getUserMedia promise');
        try {
          if (kind) {
            yield DeviceManager.userMediaPromiseMap.get(kind);
          } else {
            yield Promise.all(DeviceManager.userMediaPromiseMap.values());
          }
        } catch (e) {
          livekitLogger.warn('error waiting for media permissons');
        }
      }
      let devices = yield navigator.mediaDevices.enumerateDevices();
      if (requestPermissions &&
      // for safari we need to skip this check, as otherwise it will re-acquire user media and fail on iOS https://bugs.webkit.org/show_bug.cgi?id=179363
      !(isSafari() && this.hasDeviceInUse(kind))) {
        const isDummyDeviceOrEmpty = devices.length === 0 || devices.some(device => {
          const noLabel = device.label === '';
          const isRelevant = kind ? device.kind === kind : true;
          return noLabel && isRelevant;
        });
        if (isDummyDeviceOrEmpty) {
          const permissionsToAcquire = {
            video: kind !== 'audioinput' && kind !== 'audiooutput',
            audio: kind !== 'videoinput'
          };
          const stream = yield navigator.mediaDevices.getUserMedia(permissionsToAcquire);
          devices = yield navigator.mediaDevices.enumerateDevices();
          stream.getTracks().forEach(track => {
            track.stop();
          });
        }
      }
      if (kind) {
        devices = devices.filter(device => device.kind === kind);
      }
      return devices;
    });
  }
  normalizeDeviceId(kind, deviceId, groupId) {
    return __awaiter(this, void 0, void 0, function* () {
      if (deviceId !== defaultId) {
        return deviceId;
      }
      // resolve actual device id if it's 'default': Chrome returns it when no
      // device has been chosen
      const devices = yield this.getDevices(kind);
      const device = devices.find(d => d.groupId === groupId && d.deviceId !== defaultId);
      return device === null || device === void 0 ? void 0 : device.deviceId;
    });
  }
  hasDeviceInUse(kind) {
    return kind ? DeviceManager.userMediaPromiseMap.has(kind) : DeviceManager.userMediaPromiseMap.size > 0;
  }
}
DeviceManager.mediaDeviceKinds = ['audioinput', 'audiooutput', 'videoinput'];
DeviceManager.userMediaPromiseMap = new Map();

const defaultDimensionsTimeout = 1000;
class LocalTrack extends Track {
  get constraints() {
    return this._constraints;
  }
  /**
   *
   * @param mediaTrack
   * @param kind
   * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
   * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
   */
  constructor(mediaTrack, kind, constraints) {
    let userProvidedTrack = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
    super(mediaTrack, kind);
    this._isUpstreamPaused = false;
    this.handleTrackMuteEvent = () => this.debouncedTrackMuteHandler().catch(() => livekitLogger.debug('track mute bounce got cancelled by an unmute event'));
    this.debouncedTrackMuteHandler = r(() => __awaiter(this, void 0, void 0, function* () {
      yield this.pauseUpstream();
    }), 5000);
    this.handleTrackUnmuteEvent = () => __awaiter(this, void 0, void 0, function* () {
      this.debouncedTrackMuteHandler.cancel('unmute');
      yield this.resumeUpstream();
    });
    this.handleEnded = () => {
      if (this.isInBackground) {
        this.reacquireTrack = true;
      }
      this._mediaStreamTrack.removeEventListener('mute', this.handleTrackMuteEvent);
      this._mediaStreamTrack.removeEventListener('unmute', this.handleTrackUnmuteEvent);
      this.emit(TrackEvent.Ended, this);
    };
    this.reacquireTrack = false;
    this.providedByUser = userProvidedTrack;
    this.muteLock = new Mutex();
    this.pauseUpstreamLock = new Mutex();
    this.processorLock = new Mutex();
    this.setMediaStreamTrack(mediaTrack, true);
    // added to satisfy TS compiler, constraints are synced with MediaStreamTrack
    this._constraints = mediaTrack.getConstraints();
    if (constraints) {
      this._constraints = constraints;
    }
  }
  get id() {
    return this._mediaStreamTrack.id;
  }
  get dimensions() {
    if (this.kind !== Track.Kind.Video) {
      return undefined;
    }
    const {
      width,
      height
    } = this._mediaStreamTrack.getSettings();
    if (width && height) {
      return {
        width,
        height
      };
    }
    return undefined;
  }
  get isUpstreamPaused() {
    return this._isUpstreamPaused;
  }
  get isUserProvided() {
    return this.providedByUser;
  }
  get mediaStreamTrack() {
    var _a, _b;
    return (_b = (_a = this.processor) === null || _a === void 0 ? void 0 : _a.processedTrack) !== null && _b !== void 0 ? _b : this._mediaStreamTrack;
  }
  setMediaStreamTrack(newTrack, force) {
    return __awaiter(this, void 0, void 0, function* () {
      if (newTrack === this._mediaStreamTrack && !force) {
        return;
      }
      if (this._mediaStreamTrack) {
        // detach
        this.attachedElements.forEach(el => {
          detachTrack(this._mediaStreamTrack, el);
        });
        this._mediaStreamTrack.removeEventListener('ended', this.handleEnded);
        this._mediaStreamTrack.removeEventListener('mute', this.handleTrackMuteEvent);
        this._mediaStreamTrack.removeEventListener('unmute', this.handleTrackUnmuteEvent);
        if (!this.providedByUser && this._mediaStreamTrack !== newTrack) {
          this._mediaStreamTrack.stop();
        }
      }
      this.mediaStream = new MediaStream([newTrack]);
      if (newTrack) {
        newTrack.addEventListener('ended', this.handleEnded);
        // when underlying track emits mute, it indicates that the device is unable
        // to produce media. In this case we'll need to signal with remote that
        // the track is "muted"
        // note this is different from LocalTrack.mute because we do not want to
        // touch MediaStreamTrack.enabled
        newTrack.addEventListener('mute', this.handleTrackMuteEvent);
        newTrack.addEventListener('unmute', this.handleTrackUnmuteEvent);
        this._constraints = newTrack.getConstraints();
      }
      let processedTrack;
      if (this.processor && newTrack && this.processorElement) {
        livekitLogger.debug('restarting processor');
        if (this.kind === 'unknown') {
          throw TypeError('cannot set processor on track of unknown kind');
        }
        attachToElement(newTrack, this.processorElement);
        yield this.processor.restart({
          track: newTrack,
          kind: this.kind,
          element: this.processorElement
        });
        processedTrack = this.processor.processedTrack;
      }
      if (this.sender) {
        yield this.sender.replaceTrack(processedTrack !== null && processedTrack !== void 0 ? processedTrack : newTrack);
      }
      this._mediaStreamTrack = newTrack;
      if (newTrack) {
        // sync muted state with the enabled state of the newly provided track
        this._mediaStreamTrack.enabled = !this.isMuted;
        // when a valid track is replace, we'd want to start producing
        yield this.resumeUpstream();
        this.attachedElements.forEach(el => {
          attachToElement(processedTrack !== null && processedTrack !== void 0 ? processedTrack : newTrack, el);
        });
      }
    });
  }
  waitForDimensions() {
    let timeout = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : defaultDimensionsTimeout;
    return __awaiter(this, void 0, void 0, function* () {
      if (this.kind === Track.Kind.Audio) {
        throw new Error('cannot get dimensions for audio tracks');
      }
      const started = Date.now();
      while (Date.now() - started < timeout) {
        const dims = this.dimensions;
        if (dims) {
          return dims;
        }
        yield sleep(50);
      }
      throw new TrackInvalidError('unable to get track dimensions after timeout');
    });
  }
  /**
   * @returns DeviceID of the device that is currently being used for this track
   */
  getDeviceId() {
    return __awaiter(this, void 0, void 0, function* () {
      // screen share doesn't have a usable device id
      if (this.source === Track.Source.ScreenShare) {
        return;
      }
      const {
        deviceId,
        groupId
      } = this._mediaStreamTrack.getSettings();
      const kind = this.kind === Track.Kind.Audio ? 'audioinput' : 'videoinput';
      return DeviceManager.getInstance().normalizeDeviceId(kind, deviceId, groupId);
    });
  }
  mute() {
    return __awaiter(this, void 0, void 0, function* () {
      this.setTrackMuted(true);
      return this;
    });
  }
  unmute() {
    return __awaiter(this, void 0, void 0, function* () {
      this.setTrackMuted(false);
      return this;
    });
  }
  replaceTrack(track) {
    let userProvidedTrack = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.sender) {
        throw new TrackInvalidError('unable to replace an unpublished track');
      }
      livekitLogger.debug('replace MediaStreamTrack');
      yield this.setMediaStreamTrack(track);
      // this must be synced *after* setting mediaStreamTrack above, since it relies
      // on the previous state in order to cleanup
      this.providedByUser = userProvidedTrack;
      if (this.processor) {
        yield this.stopProcessor();
      }
      return this;
    });
  }
  restart(constraints) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!constraints) {
        constraints = this._constraints;
      }
      livekitLogger.debug('restarting track with constraints', constraints);
      const streamConstraints = {
        audio: false,
        video: false
      };
      if (this.kind === Track.Kind.Video) {
        streamConstraints.video = constraints;
      } else {
        streamConstraints.audio = constraints;
      }
      // these steps are duplicated from setMediaStreamTrack because we must stop
      // the previous tracks before new tracks can be acquired
      this.attachedElements.forEach(el => {
        detachTrack(this.mediaStreamTrack, el);
      });
      this._mediaStreamTrack.removeEventListener('ended', this.handleEnded);
      // on Safari, the old audio track must be stopped before attempting to acquire
      // the new track, otherwise the new track will stop with
      // 'A MediaStreamTrack ended due to a capture failure`
      this._mediaStreamTrack.stop();
      // create new track and attach
      const mediaStream = yield navigator.mediaDevices.getUserMedia(streamConstraints);
      const newTrack = mediaStream.getTracks()[0];
      newTrack.addEventListener('ended', this.handleEnded);
      livekitLogger.debug('re-acquired MediaStreamTrack');
      yield this.setMediaStreamTrack(newTrack);
      this._constraints = constraints;
      this.emit(TrackEvent.Restarted, this);
      return this;
    });
  }
  setTrackMuted(muted) {
    livekitLogger.debug("setting ".concat(this.kind, " track ").concat(muted ? 'muted' : 'unmuted'));
    if (this.isMuted === muted && this._mediaStreamTrack.enabled !== muted) {
      return;
    }
    this.isMuted = muted;
    this._mediaStreamTrack.enabled = !muted;
    this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
  }
  get needsReAcquisition() {
    return this._mediaStreamTrack.readyState !== 'live' || this._mediaStreamTrack.muted || !this._mediaStreamTrack.enabled || this.reacquireTrack;
  }
  handleAppVisibilityChanged() {
    const _super = Object.create(null, {
      handleAppVisibilityChanged: {
        get: () => super.handleAppVisibilityChanged
      }
    });
    return __awaiter(this, void 0, void 0, function* () {
      yield _super.handleAppVisibilityChanged.call(this);
      if (!isMobile()) return;
      livekitLogger.debug("visibility changed, is in Background: ".concat(this.isInBackground));
      if (!this.isInBackground && this.needsReAcquisition && !this.isUserProvided && !this.isMuted) {
        livekitLogger.debug("track needs to be reacquired, restarting ".concat(this.source));
        yield this.restart();
        this.reacquireTrack = false;
      }
    });
  }
  stop() {
    var _a;
    super.stop();
    this._mediaStreamTrack.removeEventListener('ended', this.handleEnded);
    this._mediaStreamTrack.removeEventListener('mute', this.handleTrackMuteEvent);
    this._mediaStreamTrack.removeEventListener('unmute', this.handleTrackUnmuteEvent);
    (_a = this.processor) === null || _a === void 0 ? void 0 : _a.destroy();
    this.processor = undefined;
  }
  /**
   * pauses publishing to the server without disabling the local MediaStreamTrack
   * this is used to display a user's own video locally while pausing publishing to
   * the server.
   * this API is unsupported on Safari < 12 due to a bug
   **/
  pauseUpstream() {
    return __awaiter(this, void 0, void 0, function* () {
      const unlock = yield this.pauseUpstreamLock.lock();
      try {
        if (this._isUpstreamPaused === true) {
          return;
        }
        if (!this.sender) {
          livekitLogger.warn('unable to pause upstream for an unpublished track');
          return;
        }
        this._isUpstreamPaused = true;
        this.emit(TrackEvent.UpstreamPaused, this);
        const browser = getBrowser();
        if ((browser === null || browser === void 0 ? void 0 : browser.name) === 'Safari' && compareVersions(browser.version, '12.0') < 0) {
          // https://bugs.webkit.org/show_bug.cgi?id=184911
          throw new DeviceUnsupportedError('pauseUpstream is not supported on Safari < 12.');
        }
        yield this.sender.replaceTrack(null);
      } finally {
        unlock();
      }
    });
  }
  resumeUpstream() {
    return __awaiter(this, void 0, void 0, function* () {
      const unlock = yield this.pauseUpstreamLock.lock();
      try {
        if (this._isUpstreamPaused === false) {
          return;
        }
        if (!this.sender) {
          livekitLogger.warn('unable to resume upstream for an unpublished track');
          return;
        }
        this._isUpstreamPaused = false;
        this.emit(TrackEvent.UpstreamResumed, this);
        // this operation is noop if mediastreamtrack is already being sent
        yield this.sender.replaceTrack(this._mediaStreamTrack);
      } finally {
        unlock();
      }
    });
  }
  /**
   * Sets a processor on this track.
   * See https://github.com/livekit/track-processors-js for example usage
   *
   * @experimental
   *
   * @param processor
   * @param showProcessedStreamLocally
   * @returns
   */
  setProcessor(processor) {
    let showProcessedStreamLocally = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      const unlock = yield this.processorLock.lock();
      try {
        livekitLogger.debug('setting up processor');
        if (this.processor) {
          yield this.stopProcessor();
        }
        if (this.kind === 'unknown') {
          throw TypeError('cannot set processor on track of unknown kind');
        }
        this.processorElement = (_a = this.processorElement) !== null && _a !== void 0 ? _a : document.createElement(this.kind);
        this.processorElement.muted = true;
        attachToElement(this._mediaStreamTrack, this.processorElement);
        this.processorElement.play().catch(error => livekitLogger.error('failed to play processor element', {
          error
        }));
        const processorOptions = {
          kind: this.kind,
          track: this._mediaStreamTrack,
          element: this.processorElement
        };
        yield processor.init(processorOptions);
        this.processor = processor;
        if (this.processor.processedTrack) {
          for (const el of this.attachedElements) {
            if (el !== this.processorElement && showProcessedStreamLocally) {
              detachTrack(this._mediaStreamTrack, el);
              attachToElement(this.processor.processedTrack, el);
            }
          }
          yield (_b = this.sender) === null || _b === void 0 ? void 0 : _b.replaceTrack(this.processor.processedTrack);
        }
      } finally {
        unlock();
      }
    });
  }
  getProcessor() {
    return this.processor;
  }
  /**
   * Stops the track processor
   * See https://github.com/livekit/track-processors-js for example usage
   *
   * @experimental
   * @returns
   */
  stopProcessor() {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.processor) return;
      livekitLogger.debug('stopping processor');
      (_a = this.processor.processedTrack) === null || _a === void 0 ? void 0 : _a.stop();
      yield this.processor.destroy();
      this.processor = undefined;
      (_b = this.processorElement) === null || _b === void 0 ? void 0 : _b.remove();
      this.processorElement = undefined;
      yield this.restart();
    });
  }
}

/**
 * @experimental
 */
class E2EEManager extends eventsExports.EventEmitter {
  constructor(options) {
    super();
    this.onWorkerMessage = ev => {
      var _a, _b;
      const {
        kind,
        data
      } = ev.data;
      switch (kind) {
        case 'error':
          livekitLogger.error(data.error.message);
          this.emit(EncryptionEvent.EncryptionError, data.error);
          break;
        case 'initAck':
          if (data.enabled) {
            this.keyProvider.getKeys().forEach(keyInfo => {
              this.postKey(keyInfo);
            });
          }
          break;
        case 'enable':
          if (this.encryptionEnabled !== data.enabled && data.participantIdentity === ((_a = this.room) === null || _a === void 0 ? void 0 : _a.localParticipant.identity)) {
            this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, data.enabled, this.room.localParticipant);
            this.encryptionEnabled = data.enabled;
          } else if (data.participantIdentity) {
            const participant = (_b = this.room) === null || _b === void 0 ? void 0 : _b.getParticipantByIdentity(data.participantIdentity);
            if (!participant) {
              throw TypeError("couldn't set encryption status, participant not found".concat(data.participantIdentity));
            }
            this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, data.enabled, participant);
          }
          if (this.encryptionEnabled) {
            this.keyProvider.getKeys().forEach(keyInfo => {
              this.postKey(keyInfo);
            });
          }
          break;
        case 'ratchetKey':
          this.keyProvider.emit(KeyProviderEvent.KeyRatcheted, data.material, data.keyIndex);
          break;
      }
    };
    this.onWorkerError = ev => {
      livekitLogger.error('e2ee worker encountered an error:', {
        error: ev.error
      });
      this.emit(EncryptionEvent.EncryptionError, ev.error);
    };
    this.keyProvider = options.keyProvider;
    this.worker = options.worker;
    this.encryptionEnabled = false;
  }
  /**
   * @internal
   */
  setup(room) {
    if (!isE2EESupported()) {
      throw new DeviceUnsupportedError('tried to setup end-to-end encryption on an unsupported browser');
    }
    livekitLogger.info('setting up e2ee');
    if (room !== this.room) {
      this.room = room;
      this.setupEventListeners(room, this.keyProvider);
      // this.worker = new Worker('');
      const msg = {
        kind: 'init',
        data: {
          keyProviderOptions: this.keyProvider.getOptions()
        }
      };
      if (this.worker) {
        livekitLogger.info("initializing worker", {
          worker: this.worker
        });
        this.worker.onmessage = this.onWorkerMessage;
        this.worker.onerror = this.onWorkerError;
        this.worker.postMessage(msg);
      }
    }
  }
  /**
   * @internal
   */
  setParticipantCryptorEnabled(enabled, participantIdentity) {
    livekitLogger.debug("set e2ee to ".concat(enabled, " for participant ").concat(participantIdentity));
    this.postEnable(enabled, participantIdentity);
  }
  /**
   * @internal
   */
  setSifTrailer(trailer) {
    if (!trailer || trailer.length === 0) {
      livekitLogger.warn("ignoring server sent trailer as it's empty");
    } else {
      this.postSifTrailer(trailer);
    }
  }
  setupEngine(engine) {
    engine.on(EngineEvent.RTPVideoMapUpdate, rtpMap => {
      this.postRTPMap(rtpMap);
    });
  }
  setupEventListeners(room, keyProvider) {
    room.on(RoomEvent.TrackPublished, (pub, participant) => this.setParticipantCryptorEnabled(pub.trackInfo.encryption !== Encryption_Type.NONE, participant.identity));
    room.on(RoomEvent.ConnectionStateChanged, state => {
      if (state === ConnectionState.Connected) {
        room.participants.forEach(participant => {
          participant.tracks.forEach(pub => {
            this.setParticipantCryptorEnabled(pub.trackInfo.encryption !== Encryption_Type.NONE, participant.identity);
          });
        });
      }
    }).on(RoomEvent.TrackUnsubscribed, (track, _, participant) => {
      var _a;
      const msg = {
        kind: 'removeTransform',
        data: {
          participantIdentity: participant.identity,
          trackId: track.mediaStreamID
        }
      };
      (_a = this.worker) === null || _a === void 0 ? void 0 : _a.postMessage(msg);
    }).on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      this.setupE2EEReceiver(track, participant.identity, pub.trackInfo);
    }).on(RoomEvent.SignalConnected, () => {
      if (!this.room) {
        throw new TypeError("expected room to be present on signal connect");
      }
      this.setParticipantCryptorEnabled(this.room.localParticipant.isE2EEEnabled, this.room.localParticipant.identity);
      keyProvider.getKeys().forEach(keyInfo => {
        this.postKey(keyInfo);
      });
    });
    room.localParticipant.on(ParticipantEvent.LocalTrackPublished, publication => __awaiter(this, void 0, void 0, function* () {
      this.setupE2EESender(publication.track, publication.track.sender);
    }));
    keyProvider.on(KeyProviderEvent.SetKey, keyInfo => this.postKey(keyInfo)).on(KeyProviderEvent.RatchetRequest, (participantId, keyIndex) => this.postRatchetRequest(participantId, keyIndex));
  }
  postRatchetRequest(participantIdentity, keyIndex) {
    if (!this.worker) {
      throw Error('could not ratchet key, worker is missing');
    }
    const msg = {
      kind: 'ratchetRequest',
      data: {
        participantIdentity: participantIdentity,
        keyIndex
      }
    };
    this.worker.postMessage(msg);
  }
  postKey(_ref) {
    let {
      key,
      participantIdentity,
      keyIndex
    } = _ref;
    var _a;
    if (!this.worker) {
      throw Error('could not set key, worker is missing');
    }
    const msg = {
      kind: 'setKey',
      data: {
        participantIdentity: participantIdentity,
        isPublisher: participantIdentity === ((_a = this.room) === null || _a === void 0 ? void 0 : _a.localParticipant.identity),
        key,
        keyIndex
      }
    };
    this.worker.postMessage(msg);
  }
  postEnable(enabled, participantIdentity) {
    if (this.worker) {
      const enableMsg = {
        kind: 'enable',
        data: {
          enabled,
          participantIdentity
        }
      };
      this.worker.postMessage(enableMsg);
    } else {
      throw new ReferenceError('failed to enable e2ee, worker is not ready');
    }
  }
  postRTPMap(map) {
    var _a;
    if (!this.worker) {
      throw TypeError('could not post rtp map, worker is missing');
    }
    if (!((_a = this.room) === null || _a === void 0 ? void 0 : _a.localParticipant.identity)) {
      throw TypeError('could not post rtp map, local participant identity is missing');
    }
    const msg = {
      kind: 'setRTPMap',
      data: {
        map,
        participantIdentity: this.room.localParticipant.identity
      }
    };
    this.worker.postMessage(msg);
  }
  postSifTrailer(trailer) {
    if (!this.worker) {
      throw Error('could not post SIF trailer, worker is missing');
    }
    const msg = {
      kind: 'setSifTrailer',
      data: {
        trailer
      }
    };
    this.worker.postMessage(msg);
  }
  setupE2EEReceiver(track, remoteId, trackInfo) {
    if (!track.receiver) {
      return;
    }
    if (!(trackInfo === null || trackInfo === void 0 ? void 0 : trackInfo.mimeType) || trackInfo.mimeType === '') {
      throw new TypeError('MimeType missing from trackInfo, cannot set up E2EE cryptor');
    }
    this.handleReceiver(track.receiver, track.mediaStreamID, remoteId, track.kind === 'video' ? mimeTypeToVideoCodecString(trackInfo.mimeType) : undefined);
  }
  setupE2EESender(track, sender) {
    if (!(track instanceof LocalTrack) || !sender) {
      if (!sender) livekitLogger.warn('early return because sender is not ready');
      return;
    }
    this.handleSender(sender, track.mediaStreamID, undefined);
  }
  /**
   * Handles the given {@code RTCRtpReceiver} by creating a {@code TransformStream} which will inject
   * a frame decoder.
   *
   */
  handleReceiver(receiver, trackId, participantIdentity, codec) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.worker) {
        return;
      }
      if (isScriptTransformSupported()) {
        const options = {
          kind: 'decode',
          participantIdentity,
          trackId,
          codec
        };
        // @ts-ignore
        receiver.transform = new RTCRtpScriptTransform(this.worker, options);
      } else {
        if (E2EE_FLAG in receiver && codec) {
          // only update codec
          const msg = {
            kind: 'updateCodec',
            data: {
              trackId,
              codec,
              participantIdentity: participantIdentity
            }
          };
          this.worker.postMessage(msg);
          return;
        }
        // @ts-ignore
        let writable = receiver.writableStream;
        // @ts-ignore
        let readable = receiver.readableStream;
        if (!writable || !readable) {
          // @ts-ignore
          const receiverStreams = receiver.createEncodedStreams();
          // @ts-ignore
          receiver.writableStream = receiverStreams.writable;
          writable = receiverStreams.writable;
          // @ts-ignore
          receiver.readableStream = receiverStreams.readable;
          readable = receiverStreams.readable;
        }
        const msg = {
          kind: 'decode',
          data: {
            readableStream: readable,
            writableStream: writable,
            trackId: trackId,
            codec,
            participantIdentity: participantIdentity
          }
        };
        this.worker.postMessage(msg, [readable, writable]);
      }
      // @ts-ignore
      receiver[E2EE_FLAG] = true;
    });
  }
  /**
   * Handles the given {@code RTCRtpSender} by creating a {@code TransformStream} which will inject
   * a frame encoder.
   *
   */
  handleSender(sender, trackId, codec) {
    var _a;
    if (E2EE_FLAG in sender || !this.worker) {
      return;
    }
    if (!((_a = this.room) === null || _a === void 0 ? void 0 : _a.localParticipant.identity) || this.room.localParticipant.identity === '') {
      throw TypeError('local identity needs to be known in order to set up encrypted sender');
    }
    if (isScriptTransformSupported()) {
      livekitLogger.info('initialize script transform');
      const options = {
        kind: 'encode',
        participantIdentity: this.room.localParticipant.identity,
        trackId,
        codec
      };
      // @ts-ignore
      sender.transform = new RTCRtpScriptTransform(this.worker, options);
    } else {
      livekitLogger.info('initialize encoded streams');
      // @ts-ignore
      const senderStreams = sender.createEncodedStreams();
      const msg = {
        kind: 'encode',
        data: {
          readableStream: senderStreams.readable,
          writableStream: senderStreams.writable,
          codec,
          trackId,
          participantIdentity: this.room.localParticipant.identity
        }
      };
      this.worker.postMessage(msg, [senderStreams.readable, senderStreams.writable]);
    }
    // @ts-ignore
    sender[E2EE_FLAG] = true;
  }
}

var parser$1 = {};

var grammar$2 = {exports: {}};

var grammar$1 = grammar$2.exports = {
  v: [{
    name: 'version',
    reg: /^(\d*)$/
  }],
  o: [{
    // o=- 20518 0 IN IP4 203.0.113.1
    // NB: sessionId will be a String in most cases because it is huge
    name: 'origin',
    reg: /^(\S*) (\d*) (\d*) (\S*) IP(\d) (\S*)/,
    names: ['username', 'sessionId', 'sessionVersion', 'netType', 'ipVer', 'address'],
    format: '%s %s %d %s IP%d %s'
  }],
  // default parsing of these only (though some of these feel outdated)
  s: [{
    name: 'name'
  }],
  i: [{
    name: 'description'
  }],
  u: [{
    name: 'uri'
  }],
  e: [{
    name: 'email'
  }],
  p: [{
    name: 'phone'
  }],
  z: [{
    name: 'timezones'
  }],
  // TODO: this one can actually be parsed properly...
  r: [{
    name: 'repeats'
  }],
  // TODO: this one can also be parsed properly
  // k: [{}], // outdated thing ignored
  t: [{
    // t=0 0
    name: 'timing',
    reg: /^(\d*) (\d*)/,
    names: ['start', 'stop'],
    format: '%d %d'
  }],
  c: [{
    // c=IN IP4 10.47.197.26
    name: 'connection',
    reg: /^IN IP(\d) (\S*)/,
    names: ['version', 'ip'],
    format: 'IN IP%d %s'
  }],
  b: [{
    // b=AS:4000
    push: 'bandwidth',
    reg: /^(TIAS|AS|CT|RR|RS):(\d*)/,
    names: ['type', 'limit'],
    format: '%s:%s'
  }],
  m: [{
    // m=video 51744 RTP/AVP 126 97 98 34 31
    // NB: special - pushes to session
    // TODO: rtp/fmtp should be filtered by the payloads found here?
    reg: /^(\w*) (\d*) ([\w/]*)(?: (.*))?/,
    names: ['type', 'port', 'protocol', 'payloads'],
    format: '%s %d %s %s'
  }],
  a: [{
    // a=rtpmap:110 opus/48000/2
    push: 'rtp',
    reg: /^rtpmap:(\d*) ([\w\-.]*)(?:\s*\/(\d*)(?:\s*\/(\S*))?)?/,
    names: ['payload', 'codec', 'rate', 'encoding'],
    format: function (o) {
      return o.encoding ? 'rtpmap:%d %s/%s/%s' : o.rate ? 'rtpmap:%d %s/%s' : 'rtpmap:%d %s';
    }
  }, {
    // a=fmtp:108 profile-level-id=24;object=23;bitrate=64000
    // a=fmtp:111 minptime=10; useinbandfec=1
    push: 'fmtp',
    reg: /^fmtp:(\d*) ([\S| ]*)/,
    names: ['payload', 'config'],
    format: 'fmtp:%d %s'
  }, {
    // a=control:streamid=0
    name: 'control',
    reg: /^control:(.*)/,
    format: 'control:%s'
  }, {
    // a=rtcp:65179 IN IP4 193.84.77.194
    name: 'rtcp',
    reg: /^rtcp:(\d*)(?: (\S*) IP(\d) (\S*))?/,
    names: ['port', 'netType', 'ipVer', 'address'],
    format: function (o) {
      return o.address != null ? 'rtcp:%d %s IP%d %s' : 'rtcp:%d';
    }
  }, {
    // a=rtcp-fb:98 trr-int 100
    push: 'rtcpFbTrrInt',
    reg: /^rtcp-fb:(\*|\d*) trr-int (\d*)/,
    names: ['payload', 'value'],
    format: 'rtcp-fb:%s trr-int %d'
  }, {
    // a=rtcp-fb:98 nack rpsi
    push: 'rtcpFb',
    reg: /^rtcp-fb:(\*|\d*) ([\w-_]*)(?: ([\w-_]*))?/,
    names: ['payload', 'type', 'subtype'],
    format: function (o) {
      return o.subtype != null ? 'rtcp-fb:%s %s %s' : 'rtcp-fb:%s %s';
    }
  }, {
    // a=extmap:2 urn:ietf:params:rtp-hdrext:toffset
    // a=extmap:1/recvonly URI-gps-string
    // a=extmap:3 urn:ietf:params:rtp-hdrext:encrypt urn:ietf:params:rtp-hdrext:smpte-tc 25@600/24
    push: 'ext',
    reg: /^extmap:(\d+)(?:\/(\w+))?(?: (urn:ietf:params:rtp-hdrext:encrypt))? (\S*)(?: (\S*))?/,
    names: ['value', 'direction', 'encrypt-uri', 'uri', 'config'],
    format: function (o) {
      return 'extmap:%d' + (o.direction ? '/%s' : '%v') + (o['encrypt-uri'] ? ' %s' : '%v') + ' %s' + (o.config ? ' %s' : '');
    }
  }, {
    // a=extmap-allow-mixed
    name: 'extmapAllowMixed',
    reg: /^(extmap-allow-mixed)/
  }, {
    // a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:PS1uQCVeeCFCanVmcjkpPywjNWhcYD0mXXtxaVBR|2^20|1:32
    push: 'crypto',
    reg: /^crypto:(\d*) ([\w_]*) (\S*)(?: (\S*))?/,
    names: ['id', 'suite', 'config', 'sessionConfig'],
    format: function (o) {
      return o.sessionConfig != null ? 'crypto:%d %s %s %s' : 'crypto:%d %s %s';
    }
  }, {
    // a=setup:actpass
    name: 'setup',
    reg: /^setup:(\w*)/,
    format: 'setup:%s'
  }, {
    // a=connection:new
    name: 'connectionType',
    reg: /^connection:(new|existing)/,
    format: 'connection:%s'
  }, {
    // a=mid:1
    name: 'mid',
    reg: /^mid:([^\s]*)/,
    format: 'mid:%s'
  }, {
    // a=msid:0c8b064d-d807-43b4-b434-f92a889d8587 98178685-d409-46e0-8e16-7ef0db0db64a
    name: 'msid',
    reg: /^msid:(.*)/,
    format: 'msid:%s'
  }, {
    // a=ptime:20
    name: 'ptime',
    reg: /^ptime:(\d*(?:\.\d*)*)/,
    format: 'ptime:%d'
  }, {
    // a=maxptime:60
    name: 'maxptime',
    reg: /^maxptime:(\d*(?:\.\d*)*)/,
    format: 'maxptime:%d'
  }, {
    // a=sendrecv
    name: 'direction',
    reg: /^(sendrecv|recvonly|sendonly|inactive)/
  }, {
    // a=ice-lite
    name: 'icelite',
    reg: /^(ice-lite)/
  }, {
    // a=ice-ufrag:F7gI
    name: 'iceUfrag',
    reg: /^ice-ufrag:(\S*)/,
    format: 'ice-ufrag:%s'
  }, {
    // a=ice-pwd:x9cml/YzichV2+XlhiMu8g
    name: 'icePwd',
    reg: /^ice-pwd:(\S*)/,
    format: 'ice-pwd:%s'
  }, {
    // a=fingerprint:SHA-1 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33
    name: 'fingerprint',
    reg: /^fingerprint:(\S*) (\S*)/,
    names: ['type', 'hash'],
    format: 'fingerprint:%s %s'
  }, {
    // a=candidate:0 1 UDP 2113667327 203.0.113.1 54400 typ host
    // a=candidate:1162875081 1 udp 2113937151 192.168.34.75 60017 typ host generation 0 network-id 3 network-cost 10
    // a=candidate:3289912957 2 udp 1845501695 193.84.77.194 60017 typ srflx raddr 192.168.34.75 rport 60017 generation 0 network-id 3 network-cost 10
    // a=candidate:229815620 1 tcp 1518280447 192.168.150.19 60017 typ host tcptype active generation 0 network-id 3 network-cost 10
    // a=candidate:3289912957 2 tcp 1845501695 193.84.77.194 60017 typ srflx raddr 192.168.34.75 rport 60017 tcptype passive generation 0 network-id 3 network-cost 10
    push: 'candidates',
    reg: /^candidate:(\S*) (\d*) (\S*) (\d*) (\S*) (\d*) typ (\S*)(?: raddr (\S*) rport (\d*))?(?: tcptype (\S*))?(?: generation (\d*))?(?: network-id (\d*))?(?: network-cost (\d*))?/,
    names: ['foundation', 'component', 'transport', 'priority', 'ip', 'port', 'type', 'raddr', 'rport', 'tcptype', 'generation', 'network-id', 'network-cost'],
    format: function (o) {
      var str = 'candidate:%s %d %s %d %s %d typ %s';
      str += o.raddr != null ? ' raddr %s rport %d' : '%v%v';

      // NB: candidate has three optional chunks, so %void middles one if it's missing
      str += o.tcptype != null ? ' tcptype %s' : '%v';
      if (o.generation != null) {
        str += ' generation %d';
      }
      str += o['network-id'] != null ? ' network-id %d' : '%v';
      str += o['network-cost'] != null ? ' network-cost %d' : '%v';
      return str;
    }
  }, {
    // a=end-of-candidates (keep after the candidates line for readability)
    name: 'endOfCandidates',
    reg: /^(end-of-candidates)/
  }, {
    // a=remote-candidates:1 203.0.113.1 54400 2 203.0.113.1 54401 ...
    name: 'remoteCandidates',
    reg: /^remote-candidates:(.*)/,
    format: 'remote-candidates:%s'
  }, {
    // a=ice-options:google-ice
    name: 'iceOptions',
    reg: /^ice-options:(\S*)/,
    format: 'ice-options:%s'
  }, {
    // a=ssrc:2566107569 cname:t9YU8M1UxTF8Y1A1
    push: 'ssrcs',
    reg: /^ssrc:(\d*) ([\w_-]*)(?::(.*))?/,
    names: ['id', 'attribute', 'value'],
    format: function (o) {
      var str = 'ssrc:%d';
      if (o.attribute != null) {
        str += ' %s';
        if (o.value != null) {
          str += ':%s';
        }
      }
      return str;
    }
  }, {
    // a=ssrc-group:FEC 1 2
    // a=ssrc-group:FEC-FR 3004364195 1080772241
    push: 'ssrcGroups',
    // token-char = %x21 / %x23-27 / %x2A-2B / %x2D-2E / %x30-39 / %x41-5A / %x5E-7E
    reg: /^ssrc-group:([\x21\x23\x24\x25\x26\x27\x2A\x2B\x2D\x2E\w]*) (.*)/,
    names: ['semantics', 'ssrcs'],
    format: 'ssrc-group:%s %s'
  }, {
    // a=msid-semantic: WMS Jvlam5X3SX1OP6pn20zWogvaKJz5Hjf9OnlV
    name: 'msidSemantic',
    reg: /^msid-semantic:\s?(\w*) (\S*)/,
    names: ['semantic', 'token'],
    format: 'msid-semantic: %s %s' // space after ':' is not accidental
  }, {
    // a=group:BUNDLE audio video
    push: 'groups',
    reg: /^group:(\w*) (.*)/,
    names: ['type', 'mids'],
    format: 'group:%s %s'
  }, {
    // a=rtcp-mux
    name: 'rtcpMux',
    reg: /^(rtcp-mux)/
  }, {
    // a=rtcp-rsize
    name: 'rtcpRsize',
    reg: /^(rtcp-rsize)/
  }, {
    // a=sctpmap:5000 webrtc-datachannel 1024
    name: 'sctpmap',
    reg: /^sctpmap:([\w_/]*) (\S*)(?: (\S*))?/,
    names: ['sctpmapNumber', 'app', 'maxMessageSize'],
    format: function (o) {
      return o.maxMessageSize != null ? 'sctpmap:%s %s %s' : 'sctpmap:%s %s';
    }
  }, {
    // a=x-google-flag:conference
    name: 'xGoogleFlag',
    reg: /^x-google-flag:([^\s]*)/,
    format: 'x-google-flag:%s'
  }, {
    // a=rid:1 send max-width=1280;max-height=720;max-fps=30;depend=0
    push: 'rids',
    reg: /^rid:([\d\w]+) (\w+)(?: ([\S| ]*))?/,
    names: ['id', 'direction', 'params'],
    format: function (o) {
      return o.params ? 'rid:%s %s %s' : 'rid:%s %s';
    }
  }, {
    // a=imageattr:97 send [x=800,y=640,sar=1.1,q=0.6] [x=480,y=320] recv [x=330,y=250]
    // a=imageattr:* send [x=800,y=640] recv *
    // a=imageattr:100 recv [x=320,y=240]
    push: 'imageattrs',
    reg: new RegExp(
    // a=imageattr:97
    '^imageattr:(\\d+|\\*)' +
    // send [x=800,y=640,sar=1.1,q=0.6] [x=480,y=320]
    '[\\s\\t]+(send|recv)[\\s\\t]+(\\*|\\[\\S+\\](?:[\\s\\t]+\\[\\S+\\])*)' +
    // recv [x=330,y=250]
    '(?:[\\s\\t]+(recv|send)[\\s\\t]+(\\*|\\[\\S+\\](?:[\\s\\t]+\\[\\S+\\])*))?'),
    names: ['pt', 'dir1', 'attrs1', 'dir2', 'attrs2'],
    format: function (o) {
      return 'imageattr:%s %s %s' + (o.dir2 ? ' %s %s' : '');
    }
  }, {
    // a=simulcast:send 1,2,3;~4,~5 recv 6;~7,~8
    // a=simulcast:recv 1;4,5 send 6;7
    name: 'simulcast',
    reg: new RegExp(
    // a=simulcast:
    '^simulcast:' +
    // send 1,2,3;~4,~5
    '(send|recv) ([a-zA-Z0-9\\-_~;,]+)' +
    // space + recv 6;~7,~8
    '(?:\\s?(send|recv) ([a-zA-Z0-9\\-_~;,]+))?' +
    // end
    '$'),
    names: ['dir1', 'list1', 'dir2', 'list2'],
    format: function (o) {
      return 'simulcast:%s %s' + (o.dir2 ? ' %s %s' : '');
    }
  }, {
    // old simulcast draft 03 (implemented by Firefox)
    //   https://tools.ietf.org/html/draft-ietf-mmusic-sdp-simulcast-03
    // a=simulcast: recv pt=97;98 send pt=97
    // a=simulcast: send rid=5;6;7 paused=6,7
    name: 'simulcast_03',
    reg: /^simulcast:[\s\t]+([\S+\s\t]+)$/,
    names: ['value'],
    format: 'simulcast: %s'
  }, {
    // a=framerate:25
    // a=framerate:29.97
    name: 'framerate',
    reg: /^framerate:(\d+(?:$|\.\d+))/,
    format: 'framerate:%s'
  }, {
    // RFC4570
    // a=source-filter: incl IN IP4 239.5.2.31 10.1.15.5
    name: 'sourceFilter',
    reg: /^source-filter: *(excl|incl) (\S*) (IP4|IP6|\*) (\S*) (.*)/,
    names: ['filterMode', 'netType', 'addressTypes', 'destAddress', 'srcList'],
    format: 'source-filter: %s %s %s %s %s'
  }, {
    // a=bundle-only
    name: 'bundleOnly',
    reg: /^(bundle-only)/
  }, {
    // a=label:1
    name: 'label',
    reg: /^label:(.+)/,
    format: 'label:%s'
  }, {
    // RFC version 26 for SCTP over DTLS
    // https://tools.ietf.org/html/draft-ietf-mmusic-sctp-sdp-26#section-5
    name: 'sctpPort',
    reg: /^sctp-port:(\d+)$/,
    format: 'sctp-port:%s'
  }, {
    // RFC version 26 for SCTP over DTLS
    // https://tools.ietf.org/html/draft-ietf-mmusic-sctp-sdp-26#section-6
    name: 'maxMessageSize',
    reg: /^max-message-size:(\d+)$/,
    format: 'max-message-size:%s'
  }, {
    // RFC7273
    // a=ts-refclk:ptp=IEEE1588-2008:39-A7-94-FF-FE-07-CB-D0:37
    push: 'tsRefClocks',
    reg: /^ts-refclk:([^\s=]*)(?:=(\S*))?/,
    names: ['clksrc', 'clksrcExt'],
    format: function (o) {
      return 'ts-refclk:%s' + (o.clksrcExt != null ? '=%s' : '');
    }
  }, {
    // RFC7273
    // a=mediaclk:direct=963214424
    name: 'mediaClk',
    reg: /^mediaclk:(?:id=(\S*))? *([^\s=]*)(?:=(\S*))?(?: *rate=(\d+)\/(\d+))?/,
    names: ['id', 'mediaClockName', 'mediaClockValue', 'rateNumerator', 'rateDenominator'],
    format: function (o) {
      var str = 'mediaclk:';
      str += o.id != null ? 'id=%s %s' : '%v%s';
      str += o.mediaClockValue != null ? '=%s' : '';
      str += o.rateNumerator != null ? ' rate=%s' : '';
      str += o.rateDenominator != null ? '/%s' : '';
      return str;
    }
  }, {
    // a=keywds:keywords
    name: 'keywords',
    reg: /^keywds:(.+)$/,
    format: 'keywds:%s'
  }, {
    // a=content:main
    name: 'content',
    reg: /^content:(.+)/,
    format: 'content:%s'
  },
  // BFCP https://tools.ietf.org/html/rfc4583
  {
    // a=floorctrl:c-s
    name: 'bfcpFloorCtrl',
    reg: /^floorctrl:(c-only|s-only|c-s)/,
    format: 'floorctrl:%s'
  }, {
    // a=confid:1
    name: 'bfcpConfId',
    reg: /^confid:(\d+)/,
    format: 'confid:%s'
  }, {
    // a=userid:1
    name: 'bfcpUserId',
    reg: /^userid:(\d+)/,
    format: 'userid:%s'
  }, {
    // a=floorid:1
    name: 'bfcpFloorId',
    reg: /^floorid:(.+) (?:m-stream|mstrm):(.+)/,
    names: ['id', 'mStream'],
    format: 'floorid:%s mstrm:%s'
  }, {
    // any a= that we don't understand is kept verbatim on media.invalid
    push: 'invalid',
    names: ['value']
  }]
};

// set sensible defaults to avoid polluting the grammar with boring details
Object.keys(grammar$1).forEach(function (key) {
  var objs = grammar$1[key];
  objs.forEach(function (obj) {
    if (!obj.reg) {
      obj.reg = /(.*)/;
    }
    if (!obj.format) {
      obj.format = '%s';
    }
  });
});
var grammarExports = grammar$2.exports;

(function (exports) {
  var toIntIfInt = function (v) {
    return String(Number(v)) === v ? Number(v) : v;
  };
  var attachProperties = function (match, location, names, rawName) {
    if (rawName && !names) {
      location[rawName] = toIntIfInt(match[1]);
    } else {
      for (var i = 0; i < names.length; i += 1) {
        if (match[i + 1] != null) {
          location[names[i]] = toIntIfInt(match[i + 1]);
        }
      }
    }
  };
  var parseReg = function (obj, location, content) {
    var needsBlank = obj.name && obj.names;
    if (obj.push && !location[obj.push]) {
      location[obj.push] = [];
    } else if (needsBlank && !location[obj.name]) {
      location[obj.name] = {};
    }
    var keyLocation = obj.push ? {} :
    // blank object that will be pushed
    needsBlank ? location[obj.name] : location; // otherwise, named location or root

    attachProperties(content.match(obj.reg), keyLocation, obj.names, obj.name);
    if (obj.push) {
      location[obj.push].push(keyLocation);
    }
  };
  var grammar = grammarExports;
  var validLine = RegExp.prototype.test.bind(/^([a-z])=(.*)/);
  exports.parse = function (sdp) {
    var session = {},
      media = [],
      location = session; // points at where properties go under (one of the above)

    // parse lines we understand
    sdp.split(/(\r\n|\r|\n)/).filter(validLine).forEach(function (l) {
      var type = l[0];
      var content = l.slice(2);
      if (type === 'm') {
        media.push({
          rtp: [],
          fmtp: []
        });
        location = media[media.length - 1]; // point at latest media line
      }

      for (var j = 0; j < (grammar[type] || []).length; j += 1) {
        var obj = grammar[type][j];
        if (obj.reg.test(content)) {
          return parseReg(obj, location, content);
        }
      }
    });
    session.media = media; // link it up
    return session;
  };
  var paramReducer = function (acc, expr) {
    var s = expr.split(/=(.+)/, 2);
    if (s.length === 2) {
      acc[s[0]] = toIntIfInt(s[1]);
    } else if (s.length === 1 && expr.length > 1) {
      acc[s[0]] = undefined;
    }
    return acc;
  };
  exports.parseParams = function (str) {
    return str.split(/;\s?/).reduce(paramReducer, {});
  };

  // For backward compatibility - alias will be removed in 3.0.0
  exports.parseFmtpConfig = exports.parseParams;
  exports.parsePayloads = function (str) {
    return str.toString().split(' ').map(Number);
  };
  exports.parseRemoteCandidates = function (str) {
    var candidates = [];
    var parts = str.split(' ').map(toIntIfInt);
    for (var i = 0; i < parts.length; i += 3) {
      candidates.push({
        component: parts[i],
        ip: parts[i + 1],
        port: parts[i + 2]
      });
    }
    return candidates;
  };
  exports.parseImageAttributes = function (str) {
    return str.split(' ').map(function (item) {
      return item.substring(1, item.length - 1).split(',').reduce(paramReducer, {});
    });
  };
  exports.parseSimulcastStreamList = function (str) {
    return str.split(';').map(function (stream) {
      return stream.split(',').map(function (format) {
        var scid,
          paused = false;
        if (format[0] !== '~') {
          scid = toIntIfInt(format);
        } else {
          scid = toIntIfInt(format.substring(1, format.length));
          paused = true;
        }
        return {
          scid: scid,
          paused: paused
        };
      });
    });
  };
})(parser$1);

var grammar = grammarExports;

// customized util.format - discards excess arguments and can void middle ones
var formatRegExp = /%[sdv%]/g;
var format = function (formatStr) {
  var i = 1;
  var args = arguments;
  var len = args.length;
  return formatStr.replace(formatRegExp, function (x) {
    if (i >= len) {
      return x; // missing argument
    }

    var arg = args[i];
    i += 1;
    switch (x) {
      case '%%':
        return '%';
      case '%s':
        return String(arg);
      case '%d':
        return Number(arg);
      case '%v':
        return '';
    }
  });
  // NB: we discard excess arguments - they are typically undefined from makeLine
};

var makeLine = function (type, obj, location) {
  var str = obj.format instanceof Function ? obj.format(obj.push ? location : location[obj.name]) : obj.format;
  var args = [type + '=' + str];
  if (obj.names) {
    for (var i = 0; i < obj.names.length; i += 1) {
      var n = obj.names[i];
      if (obj.name) {
        args.push(location[obj.name][n]);
      } else {
        // for mLine and push attributes
        args.push(location[obj.names[i]]);
      }
    }
  } else {
    args.push(location[obj.name]);
  }
  return format.apply(null, args);
};

// RFC specified order
// TODO: extend this with all the rest
var defaultOuterOrder = ['v', 'o', 's', 'i', 'u', 'e', 'p', 'c', 'b', 't', 'r', 'z', 'a'];
var defaultInnerOrder = ['i', 'c', 'b', 'a'];
var writer$1 = function (session, opts) {
  opts = opts || {};
  // ensure certain properties exist
  if (session.version == null) {
    session.version = 0; // 'v=0' must be there (only defined version atm)
  }

  if (session.name == null) {
    session.name = ' '; // 's= ' must be there if no meaningful name set
  }

  session.media.forEach(function (mLine) {
    if (mLine.payloads == null) {
      mLine.payloads = '';
    }
  });
  var outerOrder = opts.outerOrder || defaultOuterOrder;
  var innerOrder = opts.innerOrder || defaultInnerOrder;
  var sdp = [];

  // loop through outerOrder for matching properties on session
  outerOrder.forEach(function (type) {
    grammar[type].forEach(function (obj) {
      if (obj.name in session && session[obj.name] != null) {
        sdp.push(makeLine(type, obj, session));
      } else if (obj.push in session && session[obj.push] != null) {
        session[obj.push].forEach(function (el) {
          sdp.push(makeLine(type, obj, el));
        });
      }
    });
  });

  // then for each media line, follow the innerOrder
  session.media.forEach(function (mLine) {
    sdp.push(makeLine('m', grammar.m[0], mLine));
    innerOrder.forEach(function (type) {
      grammar[type].forEach(function (obj) {
        if (obj.name in mLine && mLine[obj.name] != null) {
          sdp.push(makeLine(type, obj, mLine));
        } else if (obj.push in mLine && mLine[obj.push] != null) {
          mLine[obj.push].forEach(function (el) {
            sdp.push(makeLine(type, obj, el));
          });
        }
      });
    });
  });
  return sdp.join('\r\n') + '\r\n';
};

var parser = parser$1;
var writer = writer$1;
var write = writer;
var parse = parser.parse;
parser.parseParams;
parser.parseFmtpConfig; // Alias of parseParams().
parser.parsePayloads;
parser.parseRemoteCandidates;
parser.parseImageAttributes;
parser.parseSimulcastStreamList;

/* The svc codec (av1/vp9) would use a very low bitrate at the begining and
increase slowly by the bandwidth estimator until it reach the target bitrate. The
process commonly cost more than 10 seconds cause subscriber will get blur video at
the first few seconds. So we use a 70% of target bitrate here as the start bitrate to
eliminate this issue.
*/
const startBitrateForSVC = 0.7;
const PCEvents = {
  NegotiationStarted: 'negotiationStarted',
  NegotiationComplete: 'negotiationComplete',
  RTPVideoPayloadTypes: 'rtpVideoPayloadTypes'
};
/** @internal */
class PCTransport extends eventsExports.EventEmitter {
  get pc() {
    if (this._pc) return this._pc;
    throw new UnexpectedConnectionState('Expected peer connection to be available');
  }
  constructor(config) {
    let mediaConstraints = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    super();
    this.pendingCandidates = [];
    this.restartingIce = false;
    this.renegotiate = false;
    this.trackBitrates = [];
    this.remoteStereoMids = [];
    this.remoteNackMids = [];
    // debounced negotiate interface
    this.negotiate = r(onError => {
      this.emit(PCEvents.NegotiationStarted);
      try {
        this.createAndSendOffer();
      } catch (e) {
        if (onError) {
          onError(e);
        } else {
          throw e;
        }
      }
    }, 100);
    this._pc = isChromiumBased() ?
    // @ts-expect-error chrome allows additional media constraints to be passed into the RTCPeerConnection constructor
    new RTCPeerConnection(config, mediaConstraints) : new RTCPeerConnection(config);
  }
  get isICEConnected() {
    return this._pc !== null && (this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed');
  }
  addIceCandidate(candidate) {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.pc.remoteDescription && !this.restartingIce) {
        return this.pc.addIceCandidate(candidate);
      }
      this.pendingCandidates.push(candidate);
    });
  }
  setRemoteDescription(sd) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      let mungedSDP = undefined;
      if (sd.type === 'offer') {
        let {
          stereoMids,
          nackMids
        } = extractStereoAndNackAudioFromOffer(sd);
        this.remoteStereoMids = stereoMids;
        this.remoteNackMids = nackMids;
      } else if (sd.type === 'answer') {
        const sdpParsed = parse((_a = sd.sdp) !== null && _a !== void 0 ? _a : '');
        sdpParsed.media.forEach(media => {
          if (media.type === 'audio') {
            // mung sdp for opus bitrate settings
            this.trackBitrates.some(trackbr => {
              if (!trackbr.transceiver || media.mid != trackbr.transceiver.mid) {
                return false;
              }
              let codecPayload = 0;
              media.rtp.some(rtp => {
                if (rtp.codec.toUpperCase() === trackbr.codec.toUpperCase()) {
                  codecPayload = rtp.payload;
                  return true;
                }
                return false;
              });
              if (codecPayload === 0) {
                return true;
              }
              let fmtpFound = false;
              for (const fmtp of media.fmtp) {
                if (fmtp.payload === codecPayload) {
                  fmtp.config = fmtp.config.split(';').filter(attr => !attr.includes('maxaveragebitrate')).join(';');
                  if (trackbr.maxbr > 0) {
                    fmtp.config += ";maxaveragebitrate=".concat(trackbr.maxbr * 1000);
                  }
                  fmtpFound = true;
                  break;
                }
              }
              if (!fmtpFound) {
                if (trackbr.maxbr > 0) {
                  media.fmtp.push({
                    payload: codecPayload,
                    config: "maxaveragebitrate=".concat(trackbr.maxbr * 1000)
                  });
                }
              }
              return true;
            });
          }
        });
        mungedSDP = write(sdpParsed);
      }
      yield this.setMungedSDP(sd, mungedSDP, true);
      this.pendingCandidates.forEach(candidate => {
        this.pc.addIceCandidate(candidate);
      });
      this.pendingCandidates = [];
      this.restartingIce = false;
      if (this.renegotiate) {
        this.renegotiate = false;
        this.createAndSendOffer();
      } else if (sd.type === 'answer') {
        this.emit(PCEvents.NegotiationComplete);
        if (sd.sdp) {
          const sdpParsed = parse(sd.sdp);
          sdpParsed.media.forEach(media => {
            if (media.type === 'video') {
              this.emit(PCEvents.RTPVideoPayloadTypes, media.rtp);
            }
          });
        }
      }
    });
  }
  createAndSendOffer(options) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      if (this.onOffer === undefined) {
        return;
      }
      if (options === null || options === void 0 ? void 0 : options.iceRestart) {
        livekitLogger.debug('restarting ICE');
        this.restartingIce = true;
      }
      if (this._pc && this._pc.signalingState === 'have-local-offer') {
        // we're waiting for the peer to accept our offer, so we'll just wait
        // the only exception to this is when ICE restart is needed
        const currentSD = this.pc.remoteDescription;
        if ((options === null || options === void 0 ? void 0 : options.iceRestart) && currentSD) {
          // TODO: handle when ICE restart is needed but we don't have a remote description
          // the best thing to do is to recreate the peerconnection
          yield this.pc.setRemoteDescription(currentSD);
        } else {
          this.renegotiate = true;
          return;
        }
      } else if (!this._pc || this._pc.signalingState === 'closed') {
        livekitLogger.warn('could not createOffer with closed peer connection');
        return;
      }
      // actually negotiate
      livekitLogger.debug('starting to negotiate');
      const offer = yield this.pc.createOffer(options);
      const sdpParsed = parse((_a = offer.sdp) !== null && _a !== void 0 ? _a : '');
      sdpParsed.media.forEach(media => {
        if (media.type === 'audio') {
          ensureAudioNackAndStereo(media, [], []);
        } else if (media.type === 'video') {
          ensureVideoDDExtensionForSVC(media);
          // mung sdp for codec bitrate setting that can't apply by sendEncoding
          this.trackBitrates.some(trackbr => {
            if (!media.msid || !trackbr.cid || !media.msid.includes(trackbr.cid)) {
              return false;
            }
            let codecPayload = 0;
            media.rtp.some(rtp => {
              if (rtp.codec.toUpperCase() === trackbr.codec.toUpperCase()) {
                codecPayload = rtp.payload;
                return true;
              }
              return false;
            });
            if (codecPayload === 0) {
              return true;
            }
            let fmtpFound = false;
            for (const fmtp of media.fmtp) {
              if (fmtp.payload === codecPayload) {
                if (!fmtp.config.includes('x-google-start-bitrate')) {
                  fmtp.config += ";x-google-start-bitrate=".concat(trackbr.maxbr * startBitrateForSVC);
                }
                if (!fmtp.config.includes('x-google-max-bitrate')) {
                  fmtp.config += ";x-google-max-bitrate=".concat(trackbr.maxbr);
                }
                fmtpFound = true;
                break;
              }
            }
            if (!fmtpFound) {
              media.fmtp.push({
                payload: codecPayload,
                config: "x-google-start-bitrate=".concat(trackbr.maxbr * startBitrateForSVC, ";x-google-max-bitrate=").concat(trackbr.maxbr)
              });
            }
            return true;
          });
        }
      });
      yield this.setMungedSDP(offer, write(sdpParsed));
      this.onOffer(offer);
    });
  }
  createAndSetAnswer() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      const answer = yield this.pc.createAnswer();
      const sdpParsed = parse((_a = answer.sdp) !== null && _a !== void 0 ? _a : '');
      sdpParsed.media.forEach(media => {
        if (media.type === 'audio') {
          ensureAudioNackAndStereo(media, this.remoteStereoMids, this.remoteNackMids);
        }
      });
      yield this.setMungedSDP(answer, write(sdpParsed));
      return answer;
    });
  }
  setTrackCodecBitrate(info) {
    this.trackBitrates.push(info);
  }
  close() {
    if (!this._pc) {
      return;
    }
    this._pc.close();
    this._pc.onconnectionstatechange = null;
    this._pc.oniceconnectionstatechange = null;
    this._pc.onicegatheringstatechange = null;
    this._pc.ondatachannel = null;
    this._pc.onnegotiationneeded = null;
    this._pc.onsignalingstatechange = null;
    this._pc.onicecandidate = null;
    this._pc.ondatachannel = null;
    this._pc.ontrack = null;
    this._pc.onconnectionstatechange = null;
    this._pc.oniceconnectionstatechange = null;
    this._pc = null;
  }
  setMungedSDP(sd, munged, remote) {
    return __awaiter(this, void 0, void 0, function* () {
      if (munged) {
        const originalSdp = sd.sdp;
        sd.sdp = munged;
        try {
          livekitLogger.debug("setting munged ".concat(remote ? 'remote' : 'local', " description"));
          if (remote) {
            yield this.pc.setRemoteDescription(sd);
          } else {
            yield this.pc.setLocalDescription(sd);
          }
          return;
        } catch (e) {
          livekitLogger.warn("not able to set ".concat(sd.type, ", falling back to unmodified sdp"), {
            error: e,
            sdp: munged
          });
          sd.sdp = originalSdp;
        }
      }
      try {
        if (remote) {
          yield this.pc.setRemoteDescription(sd);
        } else {
          yield this.pc.setLocalDescription(sd);
        }
      } catch (e) {
        // this error cannot always be caught.
        // If the local description has a setCodecPreferences error, this error will be uncaught
        let msg = 'unknown error';
        if (e instanceof Error) {
          msg = e.message;
        } else if (typeof e === 'string') {
          msg = e;
        }
        const fields = {
          error: msg,
          sdp: sd.sdp
        };
        if (!remote && this.pc.remoteDescription) {
          fields.remoteSdp = this.pc.remoteDescription;
        }
        livekitLogger.error("unable to set ".concat(sd.type), fields);
        throw new NegotiationError(msg);
      }
    });
  }
}
function ensureAudioNackAndStereo(media, stereoMids, nackMids) {
  // found opus codec to add nack fb
  let opusPayload = 0;
  media.rtp.some(rtp => {
    if (rtp.codec === 'opus') {
      opusPayload = rtp.payload;
      return true;
    }
    return false;
  });
  // add nack rtcpfb if not exist
  if (opusPayload > 0) {
    if (!media.rtcpFb) {
      media.rtcpFb = [];
    }
    if (nackMids.includes(media.mid) && !media.rtcpFb.some(fb => fb.payload === opusPayload && fb.type === 'nack')) {
      media.rtcpFb.push({
        payload: opusPayload,
        type: 'nack'
      });
    }
    if (stereoMids.includes(media.mid)) {
      media.fmtp.some(fmtp => {
        if (fmtp.payload === opusPayload) {
          if (!fmtp.config.includes('stereo=1')) {
            fmtp.config += ';stereo=1';
          }
          return true;
        }
        return false;
      });
    }
  }
}
function ensureVideoDDExtensionForSVC(media) {
  var _a, _b, _c, _d;
  const codec = (_b = (_a = media.rtp[0]) === null || _a === void 0 ? void 0 : _a.codec) === null || _b === void 0 ? void 0 : _b.toLowerCase();
  if (!isSVCCodec(codec)) {
    return;
  }
  let maxID = 0;
  const ddFound = (_c = media.ext) === null || _c === void 0 ? void 0 : _c.some(ext => {
    if (ext.uri === ddExtensionURI) {
      return true;
    }
    if (ext.value > maxID) {
      maxID = ext.value;
    }
    return false;
  });
  if (!ddFound) {
    (_d = media.ext) === null || _d === void 0 ? void 0 : _d.push({
      value: maxID + 1,
      uri: ddExtensionURI
    });
  }
}
function extractStereoAndNackAudioFromOffer(offer) {
  var _a;
  const stereoMids = [];
  const nackMids = [];
  const sdpParsed = parse((_a = offer.sdp) !== null && _a !== void 0 ? _a : '');
  let opusPayload = 0;
  sdpParsed.media.forEach(media => {
    var _a;
    if (media.type === 'audio') {
      media.rtp.some(rtp => {
        if (rtp.codec === 'opus') {
          opusPayload = rtp.payload;
          return true;
        }
        return false;
      });
      if ((_a = media.rtcpFb) === null || _a === void 0 ? void 0 : _a.some(fb => fb.payload === opusPayload && fb.type === 'nack')) {
        nackMids.push(media.mid);
      }
      media.fmtp.some(fmtp => {
        if (fmtp.payload === opusPayload) {
          if (fmtp.config.includes('sprop-stereo=1')) {
            stereoMids.push(media.mid);
          }
          return true;
        }
        return false;
      });
    }
  });
  return {
    stereoMids,
    nackMids
  };
}

const publishDefaults = {
  /**
   * @deprecated
   */
  audioBitrate: AudioPresets.music.maxBitrate,
  audioPreset: AudioPresets.music,
  dtx: true,
  red: true,
  forceStereo: false,
  simulcast: true,
  screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
  stopMicTrackOnMute: false,
  videoCodec: 'vp8',
  backupCodec: false
};
const audioDefaults = {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true
};
const videoDefaults = {
  resolution: VideoPresets.h720.resolution
};
const roomOptionDefaults = {
  adaptiveStream: false,
  dynacast: false,
  stopLocalTrackOnUnpublish: true,
  reconnectPolicy: new DefaultReconnectPolicy(),
  disconnectOnPageLeave: true,
  expWebAudioMix: false
};
const roomConnectOptionDefaults = {
  autoSubscribe: true,
  maxRetries: 1,
  peerConnectionTimeout: 15000,
  websocketTimeout: 15000
};

const lossyDataChannel = '_lossy';
const reliableDataChannel = '_reliable';
const minReconnectWait = 2 * 1000;
const leaveReconnect = 'leave-reconnect';
var PCState;
(function (PCState) {
  PCState[PCState["New"] = 0] = "New";
  PCState[PCState["Connected"] = 1] = "Connected";
  PCState[PCState["Disconnected"] = 2] = "Disconnected";
  PCState[PCState["Reconnecting"] = 3] = "Reconnecting";
  PCState[PCState["Closed"] = 4] = "Closed";
})(PCState || (PCState = {}));
/** @internal */
class RTCEngine extends eventsExports.EventEmitter {
  get isClosed() {
    return this._isClosed;
  }
  constructor(options) {
    super();
    this.options = options;
    this.rtcConfig = {};
    this.peerConnectionTimeout = roomConnectOptionDefaults.peerConnectionTimeout;
    this.fullReconnectOnNext = false;
    this.subscriberPrimary = false;
    this.pcState = PCState.New;
    this._isClosed = true;
    this.pendingTrackResolvers = {};
    // true if publisher connection has already been established.
    // this is helpful to know if we need to restart ICE on the publisher connection
    this.hasPublished = false;
    this.reconnectAttempts = 0;
    this.reconnectStart = 0;
    this.attemptingReconnect = false;
    /** keeps track of how often an initial join connection has been tried */
    this.joinAttempts = 0;
    /** specifies how often an initial join connection is allowed to retry */
    this.maxJoinAttempts = 1;
    this.shouldFailNext = false;
    this.handleDataChannel = _ref => {
      let {
        channel
      } = _ref;
      return __awaiter(this, void 0, void 0, function* () {
        if (!channel) {
          return;
        }
        if (channel.label === reliableDataChannel) {
          this.reliableDCSub = channel;
        } else if (channel.label === lossyDataChannel) {
          this.lossyDCSub = channel;
        } else {
          return;
        }
        livekitLogger.debug("on data channel ".concat(channel.id, ", ").concat(channel.label));
        channel.onmessage = this.handleDataMessage;
      });
    };
    this.handleDataMessage = message => __awaiter(this, void 0, void 0, function* () {
      var _a, _b;
      // make sure to respect incoming data message order by processing message events one after the other
      const unlock = yield this.dataProcessLock.lock();
      try {
        // decode
        let buffer;
        if (message.data instanceof ArrayBuffer) {
          buffer = message.data;
        } else if (message.data instanceof Blob) {
          buffer = yield message.data.arrayBuffer();
        } else {
          livekitLogger.error('unsupported data type', message.data);
          return;
        }
        const dp = DataPacket.fromBinary(new Uint8Array(buffer));
        if (((_a = dp.value) === null || _a === void 0 ? void 0 : _a.case) === 'speaker') {
          // dispatch speaker updates
          this.emit(EngineEvent.ActiveSpeakersUpdate, dp.value.value.speakers);
        } else if (((_b = dp.value) === null || _b === void 0 ? void 0 : _b.case) === 'user') {
          this.emit(EngineEvent.DataPacketReceived, dp.value.value, dp.kind);
        }
      } finally {
        unlock();
      }
    });
    this.handleDataError = event => {
      const channel = event.currentTarget;
      const channelKind = channel.maxRetransmits === 0 ? 'lossy' : 'reliable';
      if (event instanceof ErrorEvent && event.error) {
        const {
          error
        } = event.error;
        livekitLogger.error("DataChannel error on ".concat(channelKind, ": ").concat(event.message), error);
      } else {
        livekitLogger.error("Unknown DataChannel error on ".concat(channelKind), event);
      }
    };
    this.handleBufferedAmountLow = event => {
      const channel = event.currentTarget;
      const channelKind = channel.maxRetransmits === 0 ? DataPacket_Kind.LOSSY : DataPacket_Kind.RELIABLE;
      this.updateAndEmitDCBufferStatus(channelKind);
    };
    // websocket reconnect behavior. if websocket is interrupted, and the PeerConnection
    // continues to work, we can reconnect to websocket to continue the session
    // after a number of retries, we'll close and give up permanently
    this.handleDisconnect = (connection, disconnectReason) => {
      if (this._isClosed) {
        return;
      }
      livekitLogger.warn("".concat(connection, " disconnected"));
      if (this.reconnectAttempts === 0) {
        // only reset start time on the first try
        this.reconnectStart = Date.now();
      }
      const disconnect = duration => {
        livekitLogger.warn("could not recover connection after ".concat(this.reconnectAttempts, " attempts, ").concat(duration, "ms. giving up"));
        this.emit(EngineEvent.Disconnected);
        this.close();
      };
      const duration = Date.now() - this.reconnectStart;
      let delay = this.getNextRetryDelay({
        elapsedMs: duration,
        retryCount: this.reconnectAttempts
      });
      if (delay === null) {
        disconnect(duration);
        return;
      }
      if (connection === leaveReconnect) {
        delay = 0;
      }
      livekitLogger.debug("reconnecting in ".concat(delay, "ms"));
      this.clearReconnectTimeout();
      if (this.token && this.regionUrlProvider) {
        // token may have been refreshed, we do not want to recreate the regionUrlProvider
        // since the current engine may have inherited a regional url
        this.regionUrlProvider.updateToken(this.token);
      }
      this.reconnectTimeout = CriticalTimers.setTimeout(() => this.attemptReconnect(disconnectReason), delay);
    };
    this.waitForRestarted = () => {
      return new Promise((resolve, reject) => {
        if (this.pcState === PCState.Connected) {
          resolve();
        }
        const onRestarted = () => {
          this.off(EngineEvent.Disconnected, onDisconnected);
          resolve();
        };
        const onDisconnected = () => {
          this.off(EngineEvent.Restarted, onRestarted);
          reject();
        };
        this.once(EngineEvent.Restarted, onRestarted);
        this.once(EngineEvent.Disconnected, onDisconnected);
      });
    };
    this.updateAndEmitDCBufferStatus = kind => {
      const status = this.isBufferStatusLow(kind);
      if (typeof status !== 'undefined' && status !== this.dcBufferStatus.get(kind)) {
        this.dcBufferStatus.set(kind, status);
        this.emit(EngineEvent.DCBufferStatusChanged, status, kind);
      }
    };
    this.isBufferStatusLow = kind => {
      const dc = this.dataChannelForKind(kind);
      if (dc) {
        return dc.bufferedAmount <= dc.bufferedAmountLowThreshold;
      }
    };
    this.handleBrowserOnLine = () => {
      // in case the engine is currently reconnecting, attempt a reconnect immediately after the browser state has changed to 'onLine'
      if (this.client.isReconnecting) {
        this.clearReconnectTimeout();
        this.attemptReconnect(ReconnectReason.RR_SIGNAL_DISCONNECTED);
      }
    };
    this.client = new SignalClient();
    this.client.signalLatency = this.options.expSignalLatency;
    this.reconnectPolicy = this.options.reconnectPolicy;
    this.registerOnLineListener();
    this.closingLock = new Mutex();
    this.dataProcessLock = new Mutex();
    this.dcBufferStatus = new Map([[DataPacket_Kind.LOSSY, true], [DataPacket_Kind.RELIABLE, true]]);
    this.client.onParticipantUpdate = updates => this.emit(EngineEvent.ParticipantUpdate, updates);
    this.client.onConnectionQuality = update => this.emit(EngineEvent.ConnectionQualityUpdate, update);
    this.client.onRoomUpdate = update => this.emit(EngineEvent.RoomUpdate, update);
    this.client.onSubscriptionError = resp => this.emit(EngineEvent.SubscriptionError, resp);
    this.client.onSubscriptionPermissionUpdate = update => this.emit(EngineEvent.SubscriptionPermissionUpdate, update);
    this.client.onSpeakersChanged = update => this.emit(EngineEvent.SpeakersChanged, update);
    this.client.onStreamStateUpdate = update => this.emit(EngineEvent.StreamStateChanged, update);
  }
  join(url, token, opts, abortSignal) {
    return __awaiter(this, void 0, void 0, function* () {
      this.url = url;
      this.token = token;
      this.signalOpts = opts;
      this.maxJoinAttempts = opts.maxRetries;
      try {
        this.joinAttempts += 1;
        this.setupSignalClientCallbacks();
        const joinResponse = yield this.client.join(url, token, opts, abortSignal);
        this._isClosed = false;
        this.latestJoinResponse = joinResponse;
        this.subscriberPrimary = joinResponse.subscriberPrimary;
        if (!this.publisher) {
          this.configure(joinResponse);
        }
        // create offer
        if (!this.subscriberPrimary) {
          this.negotiate();
        }
        this.clientConfiguration = joinResponse.clientConfiguration;
        return joinResponse;
      } catch (e) {
        if (e instanceof ConnectionError) {
          if (e.reason === 1 /* ConnectionErrorReason.ServerUnreachable */) {
            livekitLogger.warn("Couldn't connect to server, attempt ".concat(this.joinAttempts, " of ").concat(this.maxJoinAttempts));
            if (this.joinAttempts < this.maxJoinAttempts) {
              return this.join(url, token, opts, abortSignal);
            }
          }
        }
        throw e;
      }
    });
  }
  close() {
    return __awaiter(this, void 0, void 0, function* () {
      const unlock = yield this.closingLock.lock();
      if (this.isClosed) {
        unlock();
        return;
      }
      try {
        this._isClosed = true;
        this.emit(EngineEvent.Closing);
        this.removeAllListeners();
        this.deregisterOnLineListener();
        this.clearPendingReconnect();
        yield this.cleanupPeerConnections();
        yield this.cleanupClient();
      } finally {
        unlock();
      }
    });
  }
  cleanupPeerConnections() {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.publisher && this.publisher.pc.signalingState !== 'closed') {
        this.publisher.pc.getSenders().forEach(sender => {
          var _a, _b;
          try {
            // TODO: react-native-webrtc doesn't have removeTrack yet.
            if ((_a = this.publisher) === null || _a === void 0 ? void 0 : _a.pc.removeTrack) {
              (_b = this.publisher) === null || _b === void 0 ? void 0 : _b.pc.removeTrack(sender);
            }
          } catch (e) {
            livekitLogger.warn('could not removeTrack', {
              error: e
            });
          }
        });
      }
      if (this.publisher) {
        this.publisher.close();
        this.publisher = undefined;
      }
      if (this.subscriber) {
        this.subscriber.close();
        this.subscriber = undefined;
      }
      this.primaryPC = undefined;
      const dcCleanup = dc => {
        if (!dc) return;
        dc.close();
        dc.onbufferedamountlow = null;
        dc.onclose = null;
        dc.onclosing = null;
        dc.onerror = null;
        dc.onmessage = null;
        dc.onopen = null;
      };
      dcCleanup(this.lossyDC);
      dcCleanup(this.lossyDCSub);
      dcCleanup(this.reliableDC);
      dcCleanup(this.reliableDCSub);
      this.lossyDC = undefined;
      this.lossyDCSub = undefined;
      this.reliableDC = undefined;
      this.reliableDCSub = undefined;
    });
  }
  cleanupClient() {
    return __awaiter(this, void 0, void 0, function* () {
      yield this.client.close();
      this.client.resetCallbacks();
    });
  }
  addTrack(req) {
    if (this.pendingTrackResolvers[req.cid]) {
      throw new TrackInvalidError('a track with the same ID has already been published');
    }
    return new Promise((resolve, reject) => {
      const publicationTimeout = setTimeout(() => {
        delete this.pendingTrackResolvers[req.cid];
        reject(new ConnectionError('publication of local track timed out, no response from server'));
      }, 10000);
      this.pendingTrackResolvers[req.cid] = {
        resolve: info => {
          clearTimeout(publicationTimeout);
          resolve(info);
        },
        reject: () => {
          clearTimeout(publicationTimeout);
          reject(new Error('Cancelled publication by calling unpublish'));
        }
      };
      this.client.sendAddTrack(req);
    });
  }
  /**
   * Removes sender from PeerConnection, returning true if it was removed successfully
   * and a negotiation is necessary
   * @param sender
   * @returns
   */
  removeTrack(sender) {
    var _a;
    if (sender.track && this.pendingTrackResolvers[sender.track.id]) {
      const {
        reject
      } = this.pendingTrackResolvers[sender.track.id];
      if (reject) {
        reject();
      }
      delete this.pendingTrackResolvers[sender.track.id];
    }
    try {
      (_a = this.publisher) === null || _a === void 0 ? void 0 : _a.pc.removeTrack(sender);
      return true;
    } catch (e) {
      livekitLogger.warn('failed to remove track', {
        error: e,
        method: 'removeTrack'
      });
    }
    return false;
  }
  updateMuteStatus(trackSid, muted) {
    this.client.sendMuteTrack(trackSid, muted);
  }
  get dataSubscriberReadyState() {
    var _a;
    return (_a = this.reliableDCSub) === null || _a === void 0 ? void 0 : _a.readyState;
  }
  getConnectedServerAddress() {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.primaryPC === undefined) {
        return undefined;
      }
      return getConnectedAddress(this.primaryPC);
    });
  }
  /* @internal */
  setRegionUrlProvider(provider) {
    this.regionUrlProvider = provider;
  }
  configure(joinResponse) {
    var _a, _b;
    // already configured
    if (this.publisher || this.subscriber) {
      return;
    }
    this.participantSid = (_a = joinResponse.participant) === null || _a === void 0 ? void 0 : _a.sid;
    const rtcConfig = this.makeRTCConfiguration(joinResponse);
    if ((_b = this.signalOpts) === null || _b === void 0 ? void 0 : _b.e2eeEnabled) {
      livekitLogger.debug('E2EE - setting up transports with insertable streams');
      //  this makes sure that no data is sent before the transforms are ready
      // @ts-ignore
      rtcConfig.encodedInsertableStreams = true;
    }
    const googConstraints = {
      optional: [{
        googDscp: true
      }]
    };
    this.publisher = new PCTransport(rtcConfig, googConstraints);
    this.subscriber = new PCTransport(rtcConfig);
    this.emit(EngineEvent.TransportsCreated, this.publisher, this.subscriber);
    this.publisher.pc.onicecandidate = ev => {
      if (!ev.candidate) return;
      livekitLogger.trace('adding ICE candidate for peer', ev.candidate);
      this.client.sendIceCandidate(ev.candidate, SignalTarget.PUBLISHER);
    };
    this.subscriber.pc.onicecandidate = ev => {
      if (!ev.candidate) return;
      this.client.sendIceCandidate(ev.candidate, SignalTarget.SUBSCRIBER);
    };
    this.publisher.onOffer = offer => {
      this.client.sendOffer(offer);
    };
    let primaryPC = this.publisher.pc;
    let secondaryPC = this.subscriber.pc;
    let subscriberPrimary = joinResponse.subscriberPrimary;
    if (subscriberPrimary) {
      primaryPC = this.subscriber.pc;
      secondaryPC = this.publisher.pc;
      // in subscriber primary mode, server side opens sub data channels.
      this.subscriber.pc.ondatachannel = this.handleDataChannel;
    }
    this.primaryPC = primaryPC;
    primaryPC.onconnectionstatechange = () => __awaiter(this, void 0, void 0, function* () {
      livekitLogger.debug("primary PC state changed ".concat(primaryPC.connectionState));
      if (primaryPC.connectionState === 'connected') {
        const shouldEmit = this.pcState === PCState.New;
        this.pcState = PCState.Connected;
        if (shouldEmit) {
          this.emit(EngineEvent.Connected, joinResponse);
        }
      } else if (primaryPC.connectionState === 'failed') {
        // on Safari, PeerConnection will switch to 'disconnected' during renegotiation
        if (this.pcState === PCState.Connected) {
          this.pcState = PCState.Disconnected;
          this.handleDisconnect('primary peerconnection', subscriberPrimary ? ReconnectReason.RR_SUBSCRIBER_FAILED : ReconnectReason.RR_PUBLISHER_FAILED);
        }
      }
    });
    secondaryPC.onconnectionstatechange = () => __awaiter(this, void 0, void 0, function* () {
      livekitLogger.debug("secondary PC state changed ".concat(secondaryPC.connectionState));
      // also reconnect if secondary peerconnection fails
      if (secondaryPC.connectionState === 'failed') {
        this.handleDisconnect('secondary peerconnection', subscriberPrimary ? ReconnectReason.RR_PUBLISHER_FAILED : ReconnectReason.RR_SUBSCRIBER_FAILED);
      }
    });
    this.subscriber.pc.ontrack = ev => {
      this.emit(EngineEvent.MediaTrackAdded, ev.track, ev.streams[0], ev.receiver);
    };
    this.createDataChannels();
  }
  setupSignalClientCallbacks() {
    // configure signaling client
    this.client.onAnswer = sd => __awaiter(this, void 0, void 0, function* () {
      if (!this.publisher) {
        return;
      }
      livekitLogger.debug('received server answer', {
        RTCSdpType: sd.type,
        signalingState: this.publisher.pc.signalingState.toString()
      });
      yield this.publisher.setRemoteDescription(sd);
    });
    // add candidate on trickle
    this.client.onTrickle = (candidate, target) => {
      if (!this.publisher || !this.subscriber) {
        return;
      }
      livekitLogger.trace('got ICE candidate from peer', {
        candidate,
        target
      });
      if (target === SignalTarget.PUBLISHER) {
        this.publisher.addIceCandidate(candidate);
      } else {
        this.subscriber.addIceCandidate(candidate);
      }
    };
    // when server creates an offer for the client
    this.client.onOffer = sd => __awaiter(this, void 0, void 0, function* () {
      if (!this.subscriber) {
        return;
      }
      livekitLogger.debug('received server offer', {
        RTCSdpType: sd.type,
        signalingState: this.subscriber.pc.signalingState.toString()
      });
      yield this.subscriber.setRemoteDescription(sd);
      // answer the offer
      const answer = yield this.subscriber.createAndSetAnswer();
      this.client.sendAnswer(answer);
    });
    this.client.onLocalTrackPublished = res => {
      livekitLogger.debug('received trackPublishedResponse', res);
      if (!this.pendingTrackResolvers[res.cid]) {
        livekitLogger.error("missing track resolver for ".concat(res.cid));
        return;
      }
      const {
        resolve
      } = this.pendingTrackResolvers[res.cid];
      delete this.pendingTrackResolvers[res.cid];
      resolve(res.track);
    };
    this.client.onTokenRefresh = token => {
      // this.token = token;
    };
    this.client.onClose = () => {
      this.handleDisconnect('signal', ReconnectReason.RR_SIGNAL_DISCONNECTED);
    };
    this.client.onLeave = leave => {
      if (leave === null || leave === void 0 ? void 0 : leave.canReconnect) {
        this.fullReconnectOnNext = true;
        this.primaryPC = undefined;
        // reconnect immediately instead of waiting for next attempt
        this.handleDisconnect(leaveReconnect);
      } else {
        this.emit(EngineEvent.Disconnected, leave === null || leave === void 0 ? void 0 : leave.reason);
        this.close();
      }
      livekitLogger.trace('leave request', {
        leave
      });
    };
  }
  makeRTCConfiguration(serverResponse) {
    const rtcConfig = Object.assign({}, this.rtcConfig);
    // update ICE servers before creating PeerConnection
    if (serverResponse.iceServers && !rtcConfig.iceServers) {
      const rtcIceServers = [];
      serverResponse.iceServers.forEach(iceServer => {
        const rtcIceServer = {
          urls: iceServer.urls
        };
        if (iceServer.username) rtcIceServer.username = iceServer.username;
        if (iceServer.credential) {
          rtcIceServer.credential = iceServer.credential;
        }
        rtcIceServers.push(rtcIceServer);
      });
      rtcConfig.iceServers = rtcIceServers;
    }
    if (serverResponse.clientConfiguration && serverResponse.clientConfiguration.forceRelay === ClientConfigSetting.ENABLED) {
      rtcConfig.iceTransportPolicy = 'relay';
    }
    // @ts-ignore
    rtcConfig.sdpSemantics = 'unified-plan';
    // @ts-ignore
    rtcConfig.continualGatheringPolicy = 'gather_continually';
    return rtcConfig;
  }
  createDataChannels() {
    if (!this.publisher) {
      return;
    }
    // clear old data channel callbacks if recreate
    if (this.lossyDC) {
      this.lossyDC.onmessage = null;
      this.lossyDC.onerror = null;
    }
    if (this.reliableDC) {
      this.reliableDC.onmessage = null;
      this.reliableDC.onerror = null;
    }
    // create data channels
    this.lossyDC = this.publisher.pc.createDataChannel(lossyDataChannel, {
      // will drop older packets that arrive
      ordered: true,
      maxRetransmits: 0
    });
    this.reliableDC = this.publisher.pc.createDataChannel(reliableDataChannel, {
      ordered: true
    });
    // also handle messages over the pub channel, for backwards compatibility
    this.lossyDC.onmessage = this.handleDataMessage;
    this.reliableDC.onmessage = this.handleDataMessage;
    // handle datachannel errors
    this.lossyDC.onerror = this.handleDataError;
    this.reliableDC.onerror = this.handleDataError;
    // set up dc buffer threshold, set to 64kB (otherwise 0 by default)
    this.lossyDC.bufferedAmountLowThreshold = 65535;
    this.reliableDC.bufferedAmountLowThreshold = 65535;
    // handle buffer amount low events
    this.lossyDC.onbufferedamountlow = this.handleBufferedAmountLow;
    this.reliableDC.onbufferedamountlow = this.handleBufferedAmountLow;
  }
  setPreferredCodec(transceiver, kind, videoCodec) {
    if (!('getCapabilities' in RTCRtpSender)) {
      return;
    }
    const cap = RTCRtpSender.getCapabilities(kind);
    if (!cap) return;
    livekitLogger.debug('get capabilities', cap);
    const matched = [];
    const partialMatched = [];
    const unmatched = [];
    cap.codecs.forEach(c => {
      const codec = c.mimeType.toLowerCase();
      if (codec === 'audio/opus') {
        matched.push(c);
        return;
      }
      const matchesVideoCodec = codec === "video/".concat(videoCodec);
      if (!matchesVideoCodec) {
        unmatched.push(c);
        return;
      }
      // for h264 codecs that have sdpFmtpLine available, use only if the
      // profile-level-id is 42e01f for cross-browser compatibility
      if (videoCodec === 'h264') {
        if (c.sdpFmtpLine && c.sdpFmtpLine.includes('profile-level-id=42e01f')) {
          matched.push(c);
        } else {
          partialMatched.push(c);
        }
        return;
      }
      matched.push(c);
    });
    if (supportsSetCodecPreferences(transceiver)) {
      transceiver.setCodecPreferences(matched.concat(partialMatched, unmatched));
    }
  }
  createSender(track, opts, encodings) {
    return __awaiter(this, void 0, void 0, function* () {
      if (supportsTransceiver()) {
        const sender = yield this.createTransceiverRTCRtpSender(track, opts, encodings);
        return sender;
      }
      if (supportsAddTrack()) {
        livekitLogger.warn('using add-track fallback');
        const sender = yield this.createRTCRtpSender(track.mediaStreamTrack);
        return sender;
      }
      throw new UnexpectedConnectionState('Required webRTC APIs not supported on this device');
    });
  }
  createSimulcastSender(track, simulcastTrack, opts, encodings) {
    return __awaiter(this, void 0, void 0, function* () {
      // store RTCRtpSender
      if (supportsTransceiver()) {
        return this.createSimulcastTransceiverSender(track, simulcastTrack, opts, encodings);
      }
      if (supportsAddTrack()) {
        livekitLogger.debug('using add-track fallback');
        return this.createRTCRtpSender(track.mediaStreamTrack);
      }
      throw new UnexpectedConnectionState('Cannot stream on this device');
    });
  }
  createTransceiverRTCRtpSender(track, opts, encodings) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.publisher) {
        throw new UnexpectedConnectionState('publisher is closed');
      }
      const streams = [];
      if (track.mediaStream) {
        streams.push(track.mediaStream);
      }
      const transceiverInit = {
        direction: 'sendonly',
        streams
      };
      if (encodings) {
        transceiverInit.sendEncodings = encodings;
      }
      // addTransceiver for react-native is async. web is synchronous, but await won't effect it.
      const transceiver = yield this.publisher.pc.addTransceiver(track.mediaStreamTrack, transceiverInit);
      if (track.kind === Track.Kind.Video && opts.videoCodec) {
        this.setPreferredCodec(transceiver, track.kind, opts.videoCodec);
        track.codec = opts.videoCodec;
      }
      return transceiver.sender;
    });
  }
  createSimulcastTransceiverSender(track, simulcastTrack, opts, encodings) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.publisher) {
        throw new UnexpectedConnectionState('publisher is closed');
      }
      const transceiverInit = {
        direction: 'sendonly'
      };
      if (encodings) {
        transceiverInit.sendEncodings = encodings;
      }
      // addTransceiver for react-native is async. web is synchronous, but await won't effect it.
      const transceiver = yield this.publisher.pc.addTransceiver(simulcastTrack.mediaStreamTrack, transceiverInit);
      if (!opts.videoCodec) {
        return;
      }
      this.setPreferredCodec(transceiver, track.kind, opts.videoCodec);
      track.setSimulcastTrackSender(opts.videoCodec, transceiver.sender);
      return transceiver.sender;
    });
  }
  createRTCRtpSender(track) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.publisher) {
        throw new UnexpectedConnectionState('publisher is closed');
      }
      return this.publisher.pc.addTrack(track);
    });
  }
  attemptReconnect(reason) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
      if (this._isClosed) {
        return;
      }
      // guard for attempting reconnection multiple times while one attempt is still not finished
      if (this.attemptingReconnect) {
        return;
      }
      if (((_a = this.clientConfiguration) === null || _a === void 0 ? void 0 : _a.resumeConnection) === ClientConfigSetting.DISABLED ||
      // signaling state could change to closed due to hardware sleep
      // those connections cannot be resumed
      ((_c = (_b = this.primaryPC) === null || _b === void 0 ? void 0 : _b.signalingState) !== null && _c !== void 0 ? _c : 'closed') === 'closed') {
        this.fullReconnectOnNext = true;
      }
      try {
        this.attemptingReconnect = true;
        if (this.fullReconnectOnNext) {
          yield this.restartConnection();
        } else {
          yield this.resumeConnection(reason);
        }
        this.clearPendingReconnect();
        this.fullReconnectOnNext = false;
      } catch (e) {
        this.reconnectAttempts += 1;
        let recoverable = true;
        if (e instanceof UnexpectedConnectionState) {
          livekitLogger.debug('received unrecoverable error', {
            error: e
          });
          // unrecoverable
          recoverable = false;
        } else if (!(e instanceof SignalReconnectError)) {
          // cannot resume
          this.fullReconnectOnNext = true;
        }
        if (recoverable) {
          this.handleDisconnect('reconnect', ReconnectReason.RR_UNKNOWN);
        } else {
          livekitLogger.info("could not recover connection after ".concat(this.reconnectAttempts, " attempts, ").concat(Date.now() - this.reconnectStart, "ms. giving up"));
          this.emit(EngineEvent.Disconnected);
          yield this.close();
        }
      } finally {
        this.attemptingReconnect = false;
      }
    });
  }
  getNextRetryDelay(context) {
    try {
      return this.reconnectPolicy.nextRetryDelayInMs(context);
    } catch (e) {
      livekitLogger.warn('encountered error in reconnect policy', {
        error: e
      });
    }
    // error in user code with provided reconnect policy, stop reconnecting
    return null;
  }
  restartConnection(regionUrl) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
      try {
        if (!this.url || !this.token) {
          // permanent failure, don't attempt reconnection
          throw new UnexpectedConnectionState('could not reconnect, url or token not saved');
        }
        livekitLogger.info("reconnecting, attempt: ".concat(this.reconnectAttempts));
        this.emit(EngineEvent.Restarting);
        if (this.client.isConnected) {
          yield this.client.sendLeave();
        }
        yield this.cleanupPeerConnections();
        yield this.cleanupClient();
        let joinResponse;
        try {
          if (!this.signalOpts) {
            livekitLogger.warn('attempted connection restart, without signal options present');
            throw new SignalReconnectError();
          }
          // in case a regionUrl is passed, the region URL takes precedence
          joinResponse = yield this.join(regionUrl !== null && regionUrl !== void 0 ? regionUrl : this.url, this.token, this.signalOpts);
        } catch (e) {
          if (e instanceof ConnectionError && e.reason === 0 /* ConnectionErrorReason.NotAllowed */) {
            throw new UnexpectedConnectionState('could not reconnect, token might be expired');
          }
          throw new SignalReconnectError();
        }
        if (this.shouldFailNext) {
          this.shouldFailNext = false;
          throw new Error('simulated failure');
        }
        this.client.setReconnected();
        this.emit(EngineEvent.SignalRestarted, joinResponse);
        yield this.waitForPCReconnected();
        (_a = this.regionUrlProvider) === null || _a === void 0 ? void 0 : _a.resetAttempts();
        // reconnect success
        this.emit(EngineEvent.Restarted);
      } catch (error) {
        const nextRegionUrl = yield (_b = this.regionUrlProvider) === null || _b === void 0 ? void 0 : _b.getNextBestRegionUrl();
        if (nextRegionUrl) {
          yield this.restartConnection(nextRegionUrl);
          return;
        } else {
          // no more regions to try (or we're not on cloud)
          (_c = this.regionUrlProvider) === null || _c === void 0 ? void 0 : _c.resetAttempts();
          throw error;
        }
      }
    });
  }
  resumeConnection(reason) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.url || !this.token) {
        // permanent failure, don't attempt reconnection
        throw new UnexpectedConnectionState('could not reconnect, url or token not saved');
      }
      // trigger publisher reconnect
      if (!this.publisher || !this.subscriber) {
        throw new UnexpectedConnectionState('publisher and subscriber connections unset');
      }
      livekitLogger.info("resuming signal connection, attempt ".concat(this.reconnectAttempts));
      this.emit(EngineEvent.Resuming);
      try {
        this.setupSignalClientCallbacks();
        const res = yield this.client.reconnect(this.url, this.token, this.participantSid, reason);
        if (res) {
          const rtcConfig = this.makeRTCConfiguration(res);
          this.publisher.pc.setConfiguration(rtcConfig);
          this.subscriber.pc.setConfiguration(rtcConfig);
        }
      } catch (e) {
        let message = '';
        if (e instanceof Error) {
          message = e.message;
        }
        if (e instanceof ConnectionError && e.reason === 0 /* ConnectionErrorReason.NotAllowed */) {
          throw new UnexpectedConnectionState('could not reconnect, token might be expired');
        }
        throw new SignalReconnectError(message);
      }
      this.emit(EngineEvent.SignalResumed);
      if (this.shouldFailNext) {
        this.shouldFailNext = false;
        throw new Error('simulated failure');
      }
      this.subscriber.restartingIce = true;
      // only restart publisher if it's needed
      if (this.hasPublished) {
        yield this.publisher.createAndSendOffer({
          iceRestart: true
        });
      }
      yield this.waitForPCReconnected();
      this.client.setReconnected();
      // recreate publish datachannel if it's id is null
      // (for safari https://bugs.webkit.org/show_bug.cgi?id=184688)
      if (((_a = this.reliableDC) === null || _a === void 0 ? void 0 : _a.readyState) === 'open' && this.reliableDC.id === null) {
        this.createDataChannels();
      }
      // resume success
      this.emit(EngineEvent.Resumed);
    });
  }
  waitForPCInitialConnection(timeout, abortController) {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.pcState === PCState.Connected) {
        return;
      }
      if (this.pcState !== PCState.New) {
        throw new UnexpectedConnectionState('Expected peer connection to be new on initial connection');
      }
      return new Promise((resolve, reject) => {
        const abortHandler = () => {
          livekitLogger.warn('closing engine');
          CriticalTimers.clearTimeout(connectTimeout);
          reject(new ConnectionError('room connection has been cancelled', 3 /* ConnectionErrorReason.Cancelled */));
        };

        if (abortController === null || abortController === void 0 ? void 0 : abortController.signal.aborted) {
          abortHandler();
        }
        abortController === null || abortController === void 0 ? void 0 : abortController.signal.addEventListener('abort', abortHandler);
        const onConnected = () => {
          CriticalTimers.clearTimeout(connectTimeout);
          abortController === null || abortController === void 0 ? void 0 : abortController.signal.removeEventListener('abort', abortHandler);
          resolve();
        };
        const connectTimeout = CriticalTimers.setTimeout(() => {
          this.off(EngineEvent.Connected, onConnected);
          reject(new ConnectionError('could not establish pc connection'));
        }, timeout !== null && timeout !== void 0 ? timeout : this.peerConnectionTimeout);
        this.once(EngineEvent.Connected, onConnected);
      });
    });
  }
  waitForPCReconnected() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      const startTime = Date.now();
      let now = startTime;
      this.pcState = PCState.Reconnecting;
      livekitLogger.debug('waiting for peer connection to reconnect');
      while (now - startTime < this.peerConnectionTimeout) {
        if (this.primaryPC === undefined) {
          // we can abort early, connection is hosed
          break;
        } else if (
        // on Safari, we don't get a connectionstatechanged event during ICE restart
        // this means we'd have to check its status manually and update address
        // manually
        now - startTime > minReconnectWait && ((_a = this.primaryPC) === null || _a === void 0 ? void 0 : _a.connectionState) === 'connected') {
          this.pcState = PCState.Connected;
        }
        if (this.pcState === PCState.Connected) {
          return;
        }
        yield sleep(100);
        now = Date.now();
      }
      // have not reconnected, throw
      throw new ConnectionError('could not establish PC connection');
    });
  }
  /* @internal */
  sendDataPacket(packet, kind) {
    return __awaiter(this, void 0, void 0, function* () {
      const msg = packet.toBinary();
      // make sure we do have a data connection
      yield this.ensurePublisherConnected(kind);
      const dc = this.dataChannelForKind(kind);
      if (dc) {
        dc.send(msg);
      }
      this.updateAndEmitDCBufferStatus(kind);
    });
  }
  /**
   * @internal
   */
  ensureDataTransportConnected(kind) {
    let subscriber = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.subscriberPrimary;
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
      const transport = subscriber ? this.subscriber : this.publisher;
      const transportName = subscriber ? 'Subscriber' : 'Publisher';
      if (!transport) {
        throw new ConnectionError("".concat(transportName, " connection not set"));
      }
      if (!subscriber && !((_a = this.publisher) === null || _a === void 0 ? void 0 : _a.isICEConnected) && ((_b = this.publisher) === null || _b === void 0 ? void 0 : _b.pc.iceConnectionState) !== 'checking') {
        // start negotiation
        this.negotiate();
      }
      const targetChannel = this.dataChannelForKind(kind, subscriber);
      if ((targetChannel === null || targetChannel === void 0 ? void 0 : targetChannel.readyState) === 'open') {
        return;
      }
      // wait until ICE connected
      const endTime = new Date().getTime() + this.peerConnectionTimeout;
      while (new Date().getTime() < endTime) {
        if (transport.isICEConnected && ((_c = this.dataChannelForKind(kind, subscriber)) === null || _c === void 0 ? void 0 : _c.readyState) === 'open') {
          return;
        }
        yield sleep(50);
      }
      throw new ConnectionError("could not establish ".concat(transportName, " connection, state: ").concat(transport.pc.iceConnectionState));
    });
  }
  ensurePublisherConnected(kind) {
    return __awaiter(this, void 0, void 0, function* () {
      yield this.ensureDataTransportConnected(kind, false);
    });
  }
  /* @internal */
  verifyTransport() {
    // primary connection
    if (!this.primaryPC) {
      return false;
    }
    if (this.primaryPC.connectionState === 'closed' || this.primaryPC.connectionState === 'failed') {
      return false;
    }
    // also verify publisher connection if it's needed or different
    if (this.hasPublished && this.subscriberPrimary) {
      if (!this.publisher) {
        return false;
      }
      if (this.publisher.pc.connectionState === 'closed' || this.publisher.pc.connectionState === 'failed') {
        return false;
      }
    }
    // ensure signal is connected
    if (!this.client.ws || this.client.ws.readyState === WebSocket.CLOSED) {
      return false;
    }
    return true;
  }
  /** @internal */
  negotiate() {
    // observe signal state
    return new Promise((resolve, reject) => {
      if (!this.publisher) {
        reject(new NegotiationError('publisher is not defined'));
        return;
      }
      this.hasPublished = true;
      const handleClosed = () => {
        livekitLogger.debug('engine disconnected while negotiation was ongoing');
        cleanup();
        resolve();
        return;
      };
      if (this.isClosed) {
        reject('cannot negotiate on closed engine');
      }
      this.on(EngineEvent.Closing, handleClosed);
      const negotiationTimeout = setTimeout(() => {
        reject('negotiation timed out');
        this.handleDisconnect('negotiation', ReconnectReason.RR_SIGNAL_DISCONNECTED);
      }, this.peerConnectionTimeout);
      const cleanup = () => {
        clearTimeout(negotiationTimeout);
        this.off(EngineEvent.Closing, handleClosed);
      };
      this.publisher.once(PCEvents.NegotiationStarted, () => {
        var _a;
        (_a = this.publisher) === null || _a === void 0 ? void 0 : _a.once(PCEvents.NegotiationComplete, () => {
          cleanup();
          resolve();
        });
      });
      this.publisher.once(PCEvents.RTPVideoPayloadTypes, rtpTypes => {
        const rtpMap = new Map();
        rtpTypes.forEach(rtp => {
          const codec = rtp.codec.toLowerCase();
          if (isVideoCodec(codec)) {
            rtpMap.set(rtp.payload, codec);
          }
        });
        this.emit(EngineEvent.RTPVideoMapUpdate, rtpMap);
      });
      this.publisher.negotiate(e => {
        cleanup();
        reject(e);
        if (e instanceof NegotiationError) {
          this.fullReconnectOnNext = true;
        }
        this.handleDisconnect('negotiation', ReconnectReason.RR_UNKNOWN);
      });
    });
  }
  dataChannelForKind(kind, sub) {
    if (!sub) {
      if (kind === DataPacket_Kind.LOSSY) {
        return this.lossyDC;
      }
      if (kind === DataPacket_Kind.RELIABLE) {
        return this.reliableDC;
      }
    } else {
      if (kind === DataPacket_Kind.LOSSY) {
        return this.lossyDCSub;
      }
      if (kind === DataPacket_Kind.RELIABLE) {
        return this.reliableDCSub;
      }
    }
  }
  /* @internal */
  failNext() {
    // debugging method to fail the next reconnect/resume attempt
    this.shouldFailNext = true;
  }
  clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      CriticalTimers.clearTimeout(this.reconnectTimeout);
    }
  }
  clearPendingReconnect() {
    this.clearReconnectTimeout();
    this.reconnectAttempts = 0;
  }
  registerOnLineListener() {
    if (isWeb()) {
      window.addEventListener('online', this.handleBrowserOnLine);
    }
  }
  deregisterOnLineListener() {
    if (isWeb()) {
      window.removeEventListener('online', this.handleBrowserOnLine);
    }
  }
}
function getConnectedAddress(pc) {
  var _a;
  return __awaiter(this, void 0, void 0, function* () {
    let selectedCandidatePairId = '';
    const candidatePairs = new Map();
    // id -> candidate ip
    const candidates = new Map();
    const stats = yield pc.getStats();
    stats.forEach(v => {
      switch (v.type) {
        case 'transport':
          selectedCandidatePairId = v.selectedCandidatePairId;
          break;
        case 'candidate-pair':
          if (selectedCandidatePairId === '' && v.selected) {
            selectedCandidatePairId = v.id;
          }
          candidatePairs.set(v.id, v);
          break;
        case 'remote-candidate':
          candidates.set(v.id, "".concat(v.address, ":").concat(v.port));
          break;
      }
    });
    if (selectedCandidatePairId === '') {
      return undefined;
    }
    const selectedID = (_a = candidatePairs.get(selectedCandidatePairId)) === null || _a === void 0 ? void 0 : _a.remoteCandidateId;
    if (selectedID === undefined) {
      return undefined;
    }
    return candidates.get(selectedID);
  });
}
class SignalReconnectError extends Error {}

class RegionUrlProvider {
  constructor(url, token) {
    this.lastUpdateAt = 0;
    this.settingsCacheTime = 3000;
    this.attemptedRegions = [];
    this.serverUrl = new URL(url);
    this.token = token;
  }
  updateToken(token) {
    this.token = token;
  }
  isCloud() {
    return isCloud(this.serverUrl);
  }
  getServerUrl() {
    return this.serverUrl;
  }
  getNextBestRegionUrl(abortSignal) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.isCloud()) {
        throw Error('region availability is only supported for LiveKit Cloud domains');
      }
      if (!this.regionSettings || Date.now() - this.lastUpdateAt > this.settingsCacheTime) {
        this.regionSettings = yield this.fetchRegionSettings(abortSignal);
      }
      const regionsLeft = this.regionSettings.regions.filter(region => !this.attemptedRegions.find(attempted => attempted.url === region.url));
      if (regionsLeft.length > 0) {
        const nextRegion = regionsLeft[0];
        this.attemptedRegions.push(nextRegion);
        livekitLogger.debug("next region: ".concat(nextRegion.region));
        return nextRegion.url;
      } else {
        return null;
      }
    });
  }
  resetAttempts() {
    this.attemptedRegions = [];
  }
  /* @internal */
  fetchRegionSettings(signal) {
    return __awaiter(this, void 0, void 0, function* () {
      const regionSettingsResponse = yield fetch("".concat(getCloudConfigUrl(this.serverUrl), "/regions"), {
        headers: {
          authorization: "Bearer ".concat(this.token)
        },
        signal
      });
      if (regionSettingsResponse.ok) {
        const regionSettings = yield regionSettingsResponse.json();
        this.lastUpdateAt = Date.now();
        return regionSettings;
      } else {
        throw new ConnectionError("Could not fetch region settings: ".concat(regionSettingsResponse.statusText), regionSettingsResponse.status === 401 ? 0 /* ConnectionErrorReason.NotAllowed */ : undefined, regionSettingsResponse.status);
      }
    });
  }
}
function getCloudConfigUrl(serverUrl) {
  return "".concat(serverUrl.protocol.replace('ws', 'http'), "//").concat(serverUrl.host, "/settings");
}

const monitorFrequency = 2000;
function computeBitrate(currentStats, prevStats) {
  if (!prevStats) {
    return 0;
  }
  let bytesNow;
  let bytesPrev;
  if ('bytesReceived' in currentStats) {
    bytesNow = currentStats.bytesReceived;
    bytesPrev = prevStats.bytesReceived;
  } else if ('bytesSent' in currentStats) {
    bytesNow = currentStats.bytesSent;
    bytesPrev = prevStats.bytesSent;
  }
  if (bytesNow === undefined || bytesPrev === undefined || currentStats.timestamp === undefined || prevStats.timestamp === undefined) {
    return 0;
  }
  return (bytesNow - bytesPrev) * 8 * 1000 / (currentStats.timestamp - prevStats.timestamp);
}

class LocalAudioTrack extends LocalTrack {
  /**
   *
   * @param mediaTrack
   * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
   * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
   */
  constructor(mediaTrack, constraints) {
    let userProvidedTrack = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
    let audioContext = arguments.length > 3 ? arguments[3] : undefined;
    super(mediaTrack, Track.Kind.Audio, constraints, userProvidedTrack);
    /** @internal */
    this.stopOnMute = false;
    this.monitorSender = () => __awaiter(this, void 0, void 0, function* () {
      if (!this.sender) {
        this._currentBitrate = 0;
        return;
      }
      let stats;
      try {
        stats = yield this.getSenderStats();
      } catch (e) {
        livekitLogger.error('could not get audio sender stats', {
          error: e
        });
        return;
      }
      if (stats && this.prevStats) {
        this._currentBitrate = computeBitrate(stats, this.prevStats);
      }
      this.prevStats = stats;
    });
    this.audioContext = audioContext;
    this.checkForSilence();
  }
  setDeviceId(deviceId) {
    return __awaiter(this, void 0, void 0, function* () {
      if (this._constraints.deviceId === deviceId) {
        return true;
      }
      this._constraints.deviceId = deviceId;
      if (!this.isMuted) {
        yield this.restartTrack();
      }
      return this.isMuted || unwrapConstraint(deviceId) === this.mediaStreamTrack.getSettings().deviceId;
    });
  }
  mute() {
    const _super = Object.create(null, {
      mute: {
        get: () => super.mute
      }
    });
    return __awaiter(this, void 0, void 0, function* () {
      const unlock = yield this.muteLock.lock();
      try {
        // disabled special handling as it will cause BT headsets to switch communication modes
        if (this.source === Track.Source.Microphone && this.stopOnMute && !this.isUserProvided) {
          livekitLogger.debug('stopping mic track');
          // also stop the track, so that microphone indicator is turned off
          this._mediaStreamTrack.stop();
        }
        yield _super.mute.call(this);
        return this;
      } finally {
        unlock();
      }
    });
  }
  unmute() {
    const _super = Object.create(null, {
      unmute: {
        get: () => super.unmute
      }
    });
    return __awaiter(this, void 0, void 0, function* () {
      const unlock = yield this.muteLock.lock();
      try {
        const deviceHasChanged = this._constraints.deviceId && this._mediaStreamTrack.getSettings().deviceId !== unwrapConstraint(this._constraints.deviceId);
        if (this.source === Track.Source.Microphone && (this.stopOnMute || this._mediaStreamTrack.readyState === 'ended' || deviceHasChanged) && !this.isUserProvided) {
          livekitLogger.debug('reacquiring mic track');
          yield this.restartTrack();
        }
        yield _super.unmute.call(this);
        return this;
      } finally {
        unlock();
      }
    });
  }
  restartTrack(options) {
    return __awaiter(this, void 0, void 0, function* () {
      let constraints;
      if (options) {
        const streamConstraints = constraintsForOptions({
          audio: options
        });
        if (typeof streamConstraints.audio !== 'boolean') {
          constraints = streamConstraints.audio;
        }
      }
      yield this.restart(constraints);
    });
  }
  restart(constraints) {
    const _super = Object.create(null, {
      restart: {
        get: () => super.restart
      }
    });
    return __awaiter(this, void 0, void 0, function* () {
      const track = yield _super.restart.call(this, constraints);
      this.checkForSilence();
      return track;
    });
  }
  /* @internal */
  startMonitor() {
    if (!isWeb()) {
      return;
    }
    if (this.monitorInterval) {
      return;
    }
    this.monitorInterval = setInterval(() => {
      this.monitorSender();
    }, monitorFrequency);
  }
  setProcessor(processor) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      const unlock = yield this.processorLock.lock();
      try {
        if (!this.audioContext) {
          throw Error('Audio context needs to be set on LocalAudioTrack in order to enable processors');
        }
        if (this.processor) {
          yield this.stopProcessor();
        }
        if (this.kind === 'unknown') {
          throw TypeError('cannot set processor on track of unknown kind');
        }
        const processorOptions = {
          kind: this.kind,
          track: this._mediaStreamTrack,
          audioContext: this.audioContext
        };
        livekitLogger.debug("setting up audio processor ".concat(processor.name));
        yield processor.init(processorOptions);
        this.processor = processor;
        if (this.processor.processedTrack) {
          yield (_a = this.sender) === null || _a === void 0 ? void 0 : _a.replaceTrack(this.processor.processedTrack);
        }
      } finally {
        unlock();
      }
    });
  }
  /**
   * @internal
   * @experimental
   */
  setAudioContext(audioContext) {
    this.audioContext = audioContext;
  }
  getSenderStats() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      if (!((_a = this.sender) === null || _a === void 0 ? void 0 : _a.getStats)) {
        return undefined;
      }
      const stats = yield this.sender.getStats();
      let audioStats;
      stats.forEach(v => {
        if (v.type === 'outbound-rtp') {
          audioStats = {
            type: 'audio',
            streamId: v.id,
            packetsSent: v.packetsSent,
            packetsLost: v.packetsLost,
            bytesSent: v.bytesSent,
            timestamp: v.timestamp,
            roundTripTime: v.roundTripTime,
            jitter: v.jitter
          };
        }
      });
      return audioStats;
    });
  }
  checkForSilence() {
    return __awaiter(this, void 0, void 0, function* () {
      const trackIsSilent = yield detectSilence(this);
      if (trackIsSilent) {
        if (!this.isMuted) {
          livekitLogger.warn('silence detected on local audio track');
        }
        this.emit(TrackEvent.AudioSilenceDetected);
      }
      return trackIsSilent;
    });
  }
}

/** @internal */
function mediaTrackToLocalTrack(mediaStreamTrack, constraints) {
  switch (mediaStreamTrack.kind) {
    case 'audio':
      return new LocalAudioTrack(mediaStreamTrack, constraints, false);
    case 'video':
      return new LocalVideoTrack(mediaStreamTrack, constraints, false);
    default:
      throw new TrackInvalidError("unsupported track type: ".concat(mediaStreamTrack.kind));
  }
}
/* @internal */
const presets169 = Object.values(VideoPresets);
/* @internal */
const presets43 = Object.values(VideoPresets43);
/* @internal */
const presetsScreenShare = Object.values(ScreenSharePresets);
/* @internal */
const defaultSimulcastPresets169 = [VideoPresets.h180, VideoPresets.h360];
/* @internal */
const defaultSimulcastPresets43 = [VideoPresets43.h180, VideoPresets43.h360];
/* @internal */
const computeDefaultScreenShareSimulcastPresets = fromPreset => {
  const layers = [{
    scaleResolutionDownBy: 2,
    fps: 3
  }];
  return layers.map(t => {
    var _a;
    return new VideoPreset(Math.floor(fromPreset.width / t.scaleResolutionDownBy), Math.floor(fromPreset.height / t.scaleResolutionDownBy), Math.max(150000, Math.floor(fromPreset.encoding.maxBitrate / (Math.pow(t.scaleResolutionDownBy, 2) * (((_a = fromPreset.encoding.maxFramerate) !== null && _a !== void 0 ? _a : 30) / t.fps)))), t.fps, fromPreset.encoding.priority);
  });
};
// /**
//  *
//  * @internal
//  * @experimental
//  */
// const computeDefaultMultiCodecSimulcastEncodings = (width: number, height: number) => {
//   // use vp8 as a default
//   const vp8 = determineAppropriateEncoding(false, width, height);
//   const vp9 = { ...vp8, maxBitrate: vp8.maxBitrate * 0.9 };
//   const h264 = { ...vp8, maxBitrate: vp8.maxBitrate * 1.1 };
//   const av1 = { ...vp8, maxBitrate: vp8.maxBitrate * 0.7 };
//   return {
//     vp8,
//     vp9,
//     h264,
//     av1,
//   };
// };
const videoRids = ['q', 'h', 'f'];
/* @internal */
function computeVideoEncodings(isScreenShare, width, height, options) {
  var _a, _b;
  let videoEncoding = options === null || options === void 0 ? void 0 : options.videoEncoding;
  if (isScreenShare) {
    videoEncoding = options === null || options === void 0 ? void 0 : options.screenShareEncoding;
  }
  const useSimulcast = options === null || options === void 0 ? void 0 : options.simulcast;
  const scalabilityMode = options === null || options === void 0 ? void 0 : options.scalabilityMode;
  const videoCodec = options === null || options === void 0 ? void 0 : options.videoCodec;
  if (!videoEncoding && !useSimulcast && !scalabilityMode || !width || !height) {
    // when we aren't simulcasting or svc, will need to return a single encoding without
    // capping bandwidth. we always require a encoding for dynacast
    return [{}];
  }
  if (!videoEncoding) {
    // find the right encoding based on width/height
    videoEncoding = determineAppropriateEncoding(isScreenShare, width, height, videoCodec);
    livekitLogger.debug('using video encoding', videoEncoding);
  }
  const original = new VideoPreset(width, height, videoEncoding.maxBitrate, videoEncoding.maxFramerate, videoEncoding.priority);
  if (scalabilityMode && isSVCCodec(videoCodec)) {
    livekitLogger.debug("using svc with scalabilityMode ".concat(scalabilityMode));
    const sm = new ScalabilityMode(scalabilityMode);
    const encodings = [];
    if (sm.spatial > 3) {
      throw new Error("unsupported scalabilityMode: ".concat(scalabilityMode));
    }
    for (let i = 0; i < sm.spatial; i += 1) {
      encodings.push({
        rid: videoRids[2 - i],
        maxBitrate: videoEncoding.maxBitrate / Math.pow(3, i),
        /* @ts-ignore */
        maxFramerate: original.encoding.maxFramerate
      });
    }
    /* @ts-ignore */
    encodings[0].scalabilityMode = scalabilityMode;
    livekitLogger.debug('encodings', encodings);
    return encodings;
  }
  if (!useSimulcast) {
    return [videoEncoding];
  }
  let presets = [];
  if (isScreenShare) {
    presets = (_a = sortPresets(options === null || options === void 0 ? void 0 : options.screenShareSimulcastLayers)) !== null && _a !== void 0 ? _a : defaultSimulcastLayers(isScreenShare, original);
  } else {
    presets = (_b = sortPresets(options === null || options === void 0 ? void 0 : options.videoSimulcastLayers)) !== null && _b !== void 0 ? _b : defaultSimulcastLayers(isScreenShare, original);
  }
  let midPreset;
  if (presets.length > 0) {
    const lowPreset = presets[0];
    if (presets.length > 1) {
      [, midPreset] = presets;
    }
    // NOTE:
    //   1. Ordering of these encodings is important. Chrome seems
    //      to use the index into encodings to decide which layer
    //      to disable when CPU constrained.
    //      So encodings should be ordered in increasing spatial
    //      resolution order.
    //   2. ion-sfu translates rids into layers. So, all encodings
    //      should have the base layer `q` and then more added
    //      based on other conditions.
    const size = Math.max(width, height);
    if (size >= 960 && midPreset) {
      return encodingsFromPresets(width, height, [lowPreset, midPreset, original]);
    }
    if (size >= 480) {
      return encodingsFromPresets(width, height, [lowPreset, original]);
    }
  }
  return encodingsFromPresets(width, height, [original]);
}
function computeTrackBackupEncodings(track, videoCodec, opts) {
  var _a, _b, _c, _d;
  if (!opts.backupCodec || opts.backupCodec.codec === opts.videoCodec) {
    // backup codec publishing is disabled
    return;
  }
  if (videoCodec !== opts.backupCodec.codec) {
    livekitLogger.warn('requested a different codec than specified as backup', {
      serverRequested: videoCodec,
      backup: opts.backupCodec.codec
    });
  }
  opts.videoCodec = videoCodec;
  // use backup encoding setting as videoEncoding for backup codec publishing
  opts.videoEncoding = opts.backupCodec.encoding;
  const settings = track.mediaStreamTrack.getSettings();
  const width = (_a = settings.width) !== null && _a !== void 0 ? _a : (_b = track.dimensions) === null || _b === void 0 ? void 0 : _b.width;
  const height = (_c = settings.height) !== null && _c !== void 0 ? _c : (_d = track.dimensions) === null || _d === void 0 ? void 0 : _d.height;
  const encodings = computeVideoEncodings(track.source === Track.Source.ScreenShare, width, height, opts);
  return encodings;
}
/* @internal */
function determineAppropriateEncoding(isScreenShare, width, height, codec) {
  const presets = presetsForResolution(isScreenShare, width, height);
  let {
    encoding
  } = presets[0];
  // handle portrait by swapping dimensions
  const size = Math.max(width, height);
  for (let i = 0; i < presets.length; i += 1) {
    const preset = presets[i];
    encoding = preset.encoding;
    if (preset.width >= size) {
      break;
    }
  }
  // presets are based on the assumption of vp8 as a codec
  // for other codecs we adjust the maxBitrate if no specific videoEncoding has been provided
  // users should override these with ones that are optimized for their use case
  // NOTE: SVC codec bitrates are inclusive of all scalability layers. while
  // bitrate for non-SVC codecs does not include other simulcast layers.
  if (codec) {
    switch (codec) {
      case 'av1':
        encoding = Object.assign({}, encoding);
        encoding.maxBitrate = encoding.maxBitrate * 0.7;
        break;
      case 'vp9':
        encoding = Object.assign({}, encoding);
        encoding.maxBitrate = encoding.maxBitrate * 0.85;
        break;
    }
  }
  return encoding;
}
/* @internal */
function presetsForResolution(isScreenShare, width, height) {
  if (isScreenShare) {
    return presetsScreenShare;
  }
  const aspect = width > height ? width / height : height / width;
  if (Math.abs(aspect - 16.0 / 9) < Math.abs(aspect - 4.0 / 3)) {
    return presets169;
  }
  return presets43;
}
/* @internal */
function defaultSimulcastLayers(isScreenShare, original) {
  if (isScreenShare) {
    return computeDefaultScreenShareSimulcastPresets(original);
  }
  const {
    width,
    height
  } = original;
  const aspect = width > height ? width / height : height / width;
  if (Math.abs(aspect - 16.0 / 9) < Math.abs(aspect - 4.0 / 3)) {
    return defaultSimulcastPresets169;
  }
  return defaultSimulcastPresets43;
}
// presets should be ordered by low, medium, high
function encodingsFromPresets(width, height, presets) {
  const encodings = [];
  presets.forEach((preset, idx) => {
    if (idx >= videoRids.length) {
      return;
    }
    const size = Math.min(width, height);
    const rid = videoRids[idx];
    const encoding = {
      rid,
      scaleResolutionDownBy: Math.max(1, size / Math.min(preset.width, preset.height)),
      maxBitrate: preset.encoding.maxBitrate
    };
    if (preset.encoding.maxFramerate) {
      encoding.maxFramerate = preset.encoding.maxFramerate;
    }
    const canSetPriority = isFireFox() || idx === 0;
    if (preset.encoding.priority && canSetPriority) {
      encoding.priority = preset.encoding.priority;
      encoding.networkPriority = preset.encoding.priority;
    }
    encodings.push(encoding);
  });
  // RN ios simulcast requires all same framerates.
  if (isReactNative() && getReactNativeOs() === 'ios') {
    let topFramerate = undefined;
    encodings.forEach(encoding => {
      if (!topFramerate) {
        topFramerate = encoding.maxFramerate;
      } else if (encoding.maxFramerate && encoding.maxFramerate > topFramerate) {
        topFramerate = encoding.maxFramerate;
      }
    });
    let notifyOnce = true;
    encodings.forEach(encoding => {
      var _a;
      if (encoding.maxFramerate != topFramerate) {
        if (notifyOnce) {
          notifyOnce = false;
          livekitLogger.info("Simulcast on iOS React-Native requires all encodings to share the same framerate.");
        }
        livekitLogger.info("Setting framerate of encoding \"".concat((_a = encoding.rid) !== null && _a !== void 0 ? _a : '', "\" to ").concat(topFramerate));
        encoding.maxFramerate = topFramerate;
      }
    });
  }
  return encodings;
}
/** @internal */
function sortPresets(presets) {
  if (!presets) return;
  return presets.sort((a, b) => {
    const {
      encoding: aEnc
    } = a;
    const {
      encoding: bEnc
    } = b;
    if (aEnc.maxBitrate > bEnc.maxBitrate) {
      return 1;
    }
    if (aEnc.maxBitrate < bEnc.maxBitrate) return -1;
    if (aEnc.maxBitrate === bEnc.maxBitrate && aEnc.maxFramerate && bEnc.maxFramerate) {
      return aEnc.maxFramerate > bEnc.maxFramerate ? 1 : -1;
    }
    return 0;
  });
}
/** @internal */
class ScalabilityMode {
  constructor(scalabilityMode) {
    const results = scalabilityMode.match(/^L(\d)T(\d)(h|_KEY|_KEY_SHIFT){0,1}$/);
    if (!results) {
      throw new Error('invalid scalability mode');
    }
    this.spatial = parseInt(results[1]);
    this.temporal = parseInt(results[2]);
    if (results.length > 3) {
      switch (results[3]) {
        case 'h':
        case '_KEY':
        case '_KEY_SHIFT':
          this.suffix = results[3];
      }
    }
  }
  toString() {
    var _a;
    return "L".concat(this.spatial, "T").concat(this.temporal).concat((_a = this.suffix) !== null && _a !== void 0 ? _a : '');
  }
}

const refreshSubscribedCodecAfterNewCodec = 5000;
class LocalVideoTrack extends LocalTrack {
  /**
   *
   * @param mediaTrack
   * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
   * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
   */
  constructor(mediaTrack, constraints) {
    let userProvidedTrack = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
    super(mediaTrack, Track.Kind.Video, constraints, userProvidedTrack);
    /* @internal */
    this.simulcastCodecs = new Map();
    this.monitorSender = () => __awaiter(this, void 0, void 0, function* () {
      if (!this.sender) {
        this._currentBitrate = 0;
        return;
      }
      let stats;
      try {
        stats = yield this.getSenderStats();
      } catch (e) {
        livekitLogger.error('could not get audio sender stats', {
          error: e
        });
        return;
      }
      const statsMap = new Map(stats.map(s => [s.rid, s]));
      if (this.prevStats) {
        let totalBitrate = 0;
        statsMap.forEach((s, key) => {
          var _a;
          const prev = (_a = this.prevStats) === null || _a === void 0 ? void 0 : _a.get(key);
          totalBitrate += computeBitrate(s, prev);
        });
        this._currentBitrate = totalBitrate;
      }
      this.prevStats = statsMap;
    });
    this.senderLock = new Mutex();
  }
  get isSimulcast() {
    if (this.sender && this.sender.getParameters().encodings.length > 1) {
      return true;
    }
    return false;
  }
  /* @internal */
  startMonitor(signalClient) {
    var _a;
    this.signalClient = signalClient;
    if (!isWeb()) {
      return;
    }
    // save original encodings
    // TODO : merge simulcast tracks stats
    const params = (_a = this.sender) === null || _a === void 0 ? void 0 : _a.getParameters();
    if (params) {
      this.encodings = params.encodings;
    }
    if (this.monitorInterval) {
      return;
    }
    this.monitorInterval = setInterval(() => {
      this.monitorSender();
    }, monitorFrequency);
  }
  stop() {
    this._mediaStreamTrack.getConstraints();
    this.simulcastCodecs.forEach(trackInfo => {
      trackInfo.mediaStreamTrack.stop();
    });
    super.stop();
  }
  pauseUpstream() {
    const _super = Object.create(null, {
      pauseUpstream: {
        get: () => super.pauseUpstream
      }
    });
    var _a, e_1, _b, _c;
    var _d;
    return __awaiter(this, void 0, void 0, function* () {
      yield _super.pauseUpstream.call(this);
      try {
        for (var _e = true, _f = __asyncValues(this.simulcastCodecs.values()), _g; _g = yield _f.next(), _a = _g.done, !_a; _e = true) {
          _c = _g.value;
          _e = false;
          const sc = _c;
          yield (_d = sc.sender) === null || _d === void 0 ? void 0 : _d.replaceTrack(null);
        }
      } catch (e_1_1) {
        e_1 = {
          error: e_1_1
        };
      } finally {
        try {
          if (!_e && !_a && (_b = _f.return)) yield _b.call(_f);
        } finally {
          if (e_1) throw e_1.error;
        }
      }
    });
  }
  resumeUpstream() {
    const _super = Object.create(null, {
      resumeUpstream: {
        get: () => super.resumeUpstream
      }
    });
    var _a, e_2, _b, _c;
    var _d;
    return __awaiter(this, void 0, void 0, function* () {
      yield _super.resumeUpstream.call(this);
      try {
        for (var _e = true, _f = __asyncValues(this.simulcastCodecs.values()), _g; _g = yield _f.next(), _a = _g.done, !_a; _e = true) {
          _c = _g.value;
          _e = false;
          const sc = _c;
          yield (_d = sc.sender) === null || _d === void 0 ? void 0 : _d.replaceTrack(sc.mediaStreamTrack);
        }
      } catch (e_2_1) {
        e_2 = {
          error: e_2_1
        };
      } finally {
        try {
          if (!_e && !_a && (_b = _f.return)) yield _b.call(_f);
        } finally {
          if (e_2) throw e_2.error;
        }
      }
    });
  }
  mute() {
    const _super = Object.create(null, {
      mute: {
        get: () => super.mute
      }
    });
    return __awaiter(this, void 0, void 0, function* () {
      const unlock = yield this.muteLock.lock();
      try {
        if (this.source === Track.Source.Camera && !this.isUserProvided) {
          livekitLogger.debug('stopping camera track');
          // also stop the track, so that camera indicator is turned off
          this._mediaStreamTrack.stop();
        }
        yield _super.mute.call(this);
        return this;
      } finally {
        unlock();
      }
    });
  }
  unmute() {
    const _super = Object.create(null, {
      unmute: {
        get: () => super.unmute
      }
    });
    return __awaiter(this, void 0, void 0, function* () {
      const unlock = yield this.muteLock.lock();
      try {
        if (this.source === Track.Source.Camera && !this.isUserProvided) {
          livekitLogger.debug('reacquiring camera track');
          yield this.restartTrack();
        }
        yield _super.unmute.call(this);
        return this;
      } finally {
        unlock();
      }
    });
  }
  setTrackMuted(muted) {
    super.setTrackMuted(muted);
    for (const sc of this.simulcastCodecs.values()) {
      sc.mediaStreamTrack.enabled = !muted;
    }
  }
  getSenderStats() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      if (!((_a = this.sender) === null || _a === void 0 ? void 0 : _a.getStats)) {
        return [];
      }
      const items = [];
      const stats = yield this.sender.getStats();
      stats.forEach(v => {
        var _a;
        if (v.type === 'outbound-rtp') {
          const vs = {
            type: 'video',
            streamId: v.id,
            frameHeight: v.frameHeight,
            frameWidth: v.frameWidth,
            firCount: v.firCount,
            pliCount: v.pliCount,
            nackCount: v.nackCount,
            packetsSent: v.packetsSent,
            bytesSent: v.bytesSent,
            framesSent: v.framesSent,
            timestamp: v.timestamp,
            rid: (_a = v.rid) !== null && _a !== void 0 ? _a : v.id,
            retransmittedPacketsSent: v.retransmittedPacketsSent,
            qualityLimitationReason: v.qualityLimitationReason,
            qualityLimitationResolutionChanges: v.qualityLimitationResolutionChanges
          };
          // locate the appropriate remote-inbound-rtp item
          const r = stats.get(v.remoteId);
          if (r) {
            vs.jitter = r.jitter;
            vs.packetsLost = r.packetsLost;
            vs.roundTripTime = r.roundTripTime;
          }
          items.push(vs);
        }
      });
      return items;
    });
  }
  setPublishingQuality(maxQuality) {
    const qualities = [];
    for (let q = VideoQuality.LOW; q <= VideoQuality.HIGH; q += 1) {
      qualities.push(new SubscribedQuality({
        quality: q,
        enabled: q <= maxQuality
      }));
    }
    livekitLogger.debug("setting publishing quality. max quality ".concat(maxQuality));
    this.setPublishingLayers(qualities);
  }
  setDeviceId(deviceId) {
    return __awaiter(this, void 0, void 0, function* () {
      if (this._constraints.deviceId === deviceId && this._mediaStreamTrack.getSettings().deviceId === unwrapConstraint(deviceId)) {
        return true;
      }
      this._constraints.deviceId = deviceId;
      // when video is muted, underlying media stream track is stopped and
      // will be restarted later
      if (!this.isMuted) {
        yield this.restartTrack();
      }
      return this.isMuted || unwrapConstraint(deviceId) === this._mediaStreamTrack.getSettings().deviceId;
    });
  }
  restartTrack(options) {
    var _a, e_3, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
      let constraints;
      if (options) {
        const streamConstraints = constraintsForOptions({
          video: options
        });
        if (typeof streamConstraints.video !== 'boolean') {
          constraints = streamConstraints.video;
        }
      }
      yield this.restart(constraints);
      try {
        for (var _d = true, _e = __asyncValues(this.simulcastCodecs.values()), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
          _c = _f.value;
          _d = false;
          const sc = _c;
          if (sc.sender) {
            sc.mediaStreamTrack = this.mediaStreamTrack.clone();
            yield sc.sender.replaceTrack(sc.mediaStreamTrack);
          }
        }
      } catch (e_3_1) {
        e_3 = {
          error: e_3_1
        };
      } finally {
        try {
          if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
        } finally {
          if (e_3) throw e_3.error;
        }
      }
    });
  }
  setProcessor(processor) {
    let showProcessedStreamLocally = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
    const _super = Object.create(null, {
      setProcessor: {
        get: () => super.setProcessor
      }
    });
    var _a, e_4, _b, _c;
    var _d, _e;
    return __awaiter(this, void 0, void 0, function* () {
      yield _super.setProcessor.call(this, processor, showProcessedStreamLocally);
      if ((_d = this.processor) === null || _d === void 0 ? void 0 : _d.processedTrack) {
        try {
          for (var _f = true, _g = __asyncValues(this.simulcastCodecs.values()), _h; _h = yield _g.next(), _a = _h.done, !_a; _f = true) {
            _c = _h.value;
            _f = false;
            const sc = _c;
            yield (_e = sc.sender) === null || _e === void 0 ? void 0 : _e.replaceTrack(this.processor.processedTrack);
          }
        } catch (e_4_1) {
          e_4 = {
            error: e_4_1
          };
        } finally {
          try {
            if (!_f && !_a && (_b = _g.return)) yield _b.call(_g);
          } finally {
            if (e_4) throw e_4.error;
          }
        }
      }
    });
  }
  addSimulcastTrack(codec, encodings) {
    if (this.simulcastCodecs.has(codec)) {
      throw new Error("".concat(codec, " already added"));
    }
    const simulcastCodecInfo = {
      codec,
      mediaStreamTrack: this.mediaStreamTrack.clone(),
      sender: undefined,
      encodings
    };
    this.simulcastCodecs.set(codec, simulcastCodecInfo);
    return simulcastCodecInfo;
  }
  setSimulcastTrackSender(codec, sender) {
    const simulcastCodecInfo = this.simulcastCodecs.get(codec);
    if (!simulcastCodecInfo) {
      return;
    }
    simulcastCodecInfo.sender = sender;
    // browser will reenable disabled codec/layers after new codec has been published,
    // so refresh subscribedCodecs after publish a new codec
    setTimeout(() => {
      if (this.subscribedCodecs) {
        this.setPublishingCodecs(this.subscribedCodecs);
      }
    }, refreshSubscribedCodecAfterNewCodec);
  }
  /**
   * @internal
   * Sets codecs that should be publishing
   */
  setPublishingCodecs(codecs) {
    var _a, codecs_1, codecs_1_1;
    var _b, e_5, _c, _d;
    return __awaiter(this, void 0, void 0, function* () {
      livekitLogger.debug('setting publishing codecs', {
        codecs,
        currentCodec: this.codec
      });
      // only enable simulcast codec for preference codec setted
      if (!this.codec && codecs.length > 0) {
        yield this.setPublishingLayers(codecs[0].qualities);
        return [];
      }
      this.subscribedCodecs = codecs;
      const newCodecs = [];
      try {
        for (_a = true, codecs_1 = __asyncValues(codecs); codecs_1_1 = yield codecs_1.next(), _b = codecs_1_1.done, !_b; _a = true) {
          _d = codecs_1_1.value;
          _a = false;
          const codec = _d;
          if (!this.codec || this.codec === codec.codec) {
            yield this.setPublishingLayers(codec.qualities);
          } else {
            const simulcastCodecInfo = this.simulcastCodecs.get(codec.codec);
            livekitLogger.debug("try setPublishingCodec for ".concat(codec.codec), simulcastCodecInfo);
            if (!simulcastCodecInfo || !simulcastCodecInfo.sender) {
              for (const q of codec.qualities) {
                if (q.enabled) {
                  newCodecs.push(codec.codec);
                  break;
                }
              }
            } else if (simulcastCodecInfo.encodings) {
              livekitLogger.debug("try setPublishingLayersForSender ".concat(codec.codec));
              yield setPublishingLayersForSender(simulcastCodecInfo.sender, simulcastCodecInfo.encodings, codec.qualities, this.senderLock);
            }
          }
        }
      } catch (e_5_1) {
        e_5 = {
          error: e_5_1
        };
      } finally {
        try {
          if (!_a && !_b && (_c = codecs_1.return)) yield _c.call(codecs_1);
        } finally {
          if (e_5) throw e_5.error;
        }
      }
      return newCodecs;
    });
  }
  /**
   * @internal
   * Sets layers that should be publishing
   */
  setPublishingLayers(qualities) {
    return __awaiter(this, void 0, void 0, function* () {
      livekitLogger.debug('setting publishing layers', qualities);
      if (!this.sender || !this.encodings) {
        return;
      }
      yield setPublishingLayersForSender(this.sender, this.encodings, qualities, this.senderLock);
    });
  }
  handleAppVisibilityChanged() {
    const _super = Object.create(null, {
      handleAppVisibilityChanged: {
        get: () => super.handleAppVisibilityChanged
      }
    });
    return __awaiter(this, void 0, void 0, function* () {
      yield _super.handleAppVisibilityChanged.call(this);
      if (!isMobile()) return;
      if (this.isInBackground && this.source === Track.Source.Camera) {
        this._mediaStreamTrack.enabled = false;
      }
    });
  }
}
function setPublishingLayersForSender(sender, senderEncodings, qualities, senderLock) {
  return __awaiter(this, void 0, void 0, function* () {
    const unlock = yield senderLock.lock();
    livekitLogger.debug('setPublishingLayersForSender', {
      sender,
      qualities,
      senderEncodings
    });
    try {
      const params = sender.getParameters();
      const {
        encodings
      } = params;
      if (!encodings) {
        return;
      }
      if (encodings.length !== senderEncodings.length) {
        livekitLogger.warn('cannot set publishing layers, encodings mismatch');
        return;
      }
      let hasChanged = false;
      /* disable closable spatial layer as it has video blur / frozen issue with current server / client
      1. chrome 113: when switching to up layer with scalability Mode change, it will generate a
            low resolution frame and recover very quickly, but noticable
      2. livekit sfu: additional pli request cause video frozen for a few frames, also noticable */
      const closableSpatial = false;
      /* @ts-ignore */
      if (closableSpatial && encodings[0].scalabilityMode) ; else {
        // simulcast dynacast encodings
        encodings.forEach((encoding, idx) => {
          var _a;
          let rid = (_a = encoding.rid) !== null && _a !== void 0 ? _a : '';
          if (rid === '') {
            rid = 'q';
          }
          const quality = videoQualityForRid(rid);
          const subscribedQuality = qualities.find(q => q.quality === quality);
          if (!subscribedQuality) {
            return;
          }
          if (encoding.active !== subscribedQuality.enabled) {
            hasChanged = true;
            encoding.active = subscribedQuality.enabled;
            livekitLogger.debug("setting layer ".concat(subscribedQuality.quality, " to ").concat(encoding.active ? 'enabled' : 'disabled'));
            // FireFox does not support setting encoding.active to false, so we
            // have a workaround of lowering its bitrate and resolution to the min.
            if (isFireFox()) {
              if (subscribedQuality.enabled) {
                encoding.scaleResolutionDownBy = senderEncodings[idx].scaleResolutionDownBy;
                encoding.maxBitrate = senderEncodings[idx].maxBitrate;
                /* @ts-ignore */
                encoding.maxFrameRate = senderEncodings[idx].maxFrameRate;
              } else {
                encoding.scaleResolutionDownBy = 4;
                encoding.maxBitrate = 10;
                /* @ts-ignore */
                encoding.maxFrameRate = 2;
              }
            }
          }
        });
      }
      if (hasChanged) {
        params.encodings = encodings;
        livekitLogger.debug("setting encodings", params.encodings);
        yield sender.setParameters(params);
      }
    } finally {
      unlock();
    }
  });
}
function videoQualityForRid(rid) {
  switch (rid) {
    case 'f':
      return VideoQuality.HIGH;
    case 'h':
      return VideoQuality.MEDIUM;
    case 'q':
      return VideoQuality.LOW;
    default:
      return VideoQuality.HIGH;
  }
}
function videoLayersFromEncodings(width, height, encodings, svc) {
  // default to a single layer, HQ
  if (!encodings) {
    return [new VideoLayer({
      quality: VideoQuality.HIGH,
      width,
      height,
      bitrate: 0,
      ssrc: 0
    })];
  }
  if (svc) {
    // svc layers
    /* @ts-ignore */
    const encodingSM = encodings[0].scalabilityMode;
    const sm = new ScalabilityMode(encodingSM);
    const layers = [];
    for (let i = 0; i < sm.spatial; i += 1) {
      layers.push(new VideoLayer({
        quality: VideoQuality.HIGH - i,
        width: Math.ceil(width / Math.pow(2, i)),
        height: Math.ceil(height / Math.pow(2, i)),
        bitrate: encodings[0].maxBitrate ? Math.ceil(encodings[0].maxBitrate / Math.pow(3, i)) : 0,
        ssrc: 0
      }));
    }
    return layers;
  }
  return encodings.map(encoding => {
    var _a, _b, _c;
    const scale = (_a = encoding.scaleResolutionDownBy) !== null && _a !== void 0 ? _a : 1;
    let quality = videoQualityForRid((_b = encoding.rid) !== null && _b !== void 0 ? _b : '');
    return new VideoLayer({
      quality,
      width: Math.ceil(width / scale),
      height: Math.ceil(height / scale),
      bitrate: (_c = encoding.maxBitrate) !== null && _c !== void 0 ? _c : 0,
      ssrc: 0
    });
  });
}

class RemoteTrack extends Track {
  constructor(mediaTrack, sid, kind, receiver) {
    super(mediaTrack, kind);
    this.sid = sid;
    this.receiver = receiver;
  }
  /** @internal */
  setMuted(muted) {
    if (this.isMuted !== muted) {
      this.isMuted = muted;
      this._mediaStreamTrack.enabled = !muted;
      this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
    }
  }
  /** @internal */
  setMediaStream(stream) {
    // this is needed to determine when the track is finished
    // we send each track down in its own MediaStream, so we can assume the
    // current track is the only one that can be removed.
    this.mediaStream = stream;
    stream.onremovetrack = () => {
      this.receiver = undefined;
      this._currentBitrate = 0;
      this.emit(TrackEvent.Ended, this);
      // CosmosVideo hack for removing leack listeners
      this.stop();
    };
  }
  start() {
    this.startMonitor();
    // use `enabled` of track to enable re-use of transceiver
    super.enable();
  }
  stop() {
    this.stopMonitor();
    // use `enabled` of track to enable re-use of transceiver
    super.disable();
    // CosmosVideo hack for removing leack listeners
    if (isWeb()) {
      document.removeEventListener('visibilitychange', this.appVisibilityChangedListener);
    }
  }
  /* @internal */
  startMonitor() {
    if (!this.monitorInterval) {
      this.monitorInterval = setInterval(() => this.monitorReceiver(), monitorFrequency);
    }
  }
}

class RemoteAudioTrack extends RemoteTrack {
  constructor(mediaTrack, sid, receiver, audioContext, audioOutput) {
    super(mediaTrack, sid, Track.Kind.Audio, receiver);
    this.monitorReceiver = () => __awaiter(this, void 0, void 0, function* () {
      if (!this.receiver) {
        this._currentBitrate = 0;
        return;
      }
      const stats = yield this.getReceiverStats();
      if (stats && this.prevStats && this.receiver) {
        this._currentBitrate = computeBitrate(stats, this.prevStats);
      }
      this.prevStats = stats;
    });
    this.audioContext = audioContext;
    this.webAudioPluginNodes = [];
    if (audioOutput) {
      this.sinkId = audioOutput.deviceId;
    }
  }
  /**
   * sets the volume for all attached audio elements
   */
  setVolume(volume) {
    var _a;
    for (const el of this.attachedElements) {
      if (this.audioContext) {
        (_a = this.gainNode) === null || _a === void 0 ? void 0 : _a.gain.setTargetAtTime(volume, 0, 0.1);
      } else {
        el.volume = volume;
      }
    }
    if (isReactNative()) {
      // @ts-ignore
      this._mediaStreamTrack._setVolume(volume);
    }
    this.elementVolume = volume;
  }
  /**
   * gets the volume of attached audio elements (loudest)
   */
  getVolume() {
    if (this.elementVolume) {
      return this.elementVolume;
    }
    if (isReactNative()) {
      // RN volume value defaults to 1.0 if hasn't been changed.
      return 1.0;
    }
    let highestVolume = 0;
    this.attachedElements.forEach(element => {
      if (element.volume > highestVolume) {
        highestVolume = element.volume;
      }
    });
    return highestVolume;
  }
  /**
   * calls setSinkId on all attached elements, if supported
   * @param deviceId audio output device
   */
  setSinkId(deviceId) {
    return __awaiter(this, void 0, void 0, function* () {
      this.sinkId = deviceId;
      yield Promise.all(this.attachedElements.map(elm => {
        if (!supportsSetSinkId(elm)) {
          return;
        }
        /* @ts-ignore */
        return elm.setSinkId(deviceId);
      }));
    });
  }
  attach(element) {
    const needsNewWebAudioConnection = this.attachedElements.length === 0;
    if (!element) {
      element = super.attach();
    } else {
      super.attach(element);
    }
    if (this.elementVolume) {
      element.volume = this.elementVolume;
    }
    if (this.sinkId && supportsSetSinkId(element)) {
      /* @ts-ignore */
      element.setSinkId(this.sinkId);
    }
    if (this.audioContext && needsNewWebAudioConnection) {
      livekitLogger.debug('using audio context mapping');
      this.connectWebAudio(this.audioContext, element);
      element.volume = 0;
      element.muted = true;
    }
    return element;
  }
  detach(element) {
    let detached;
    if (!element) {
      detached = super.detach();
      this.disconnectWebAudio();
    } else {
      detached = super.detach(element);
      // if there are still any attached elements after detaching, connect webaudio to the first element that's left
      // disconnect webaudio otherwise
      if (this.audioContext) {
        if (this.attachedElements.length > 0) {
          this.connectWebAudio(this.audioContext, this.attachedElements[0]);
        } else {
          this.disconnectWebAudio();
        }
      }
    }
    return detached;
  }
  /**
   * @internal
   * @experimental
   */
  setAudioContext(audioContext) {
    this.audioContext = audioContext;
    if (audioContext && this.attachedElements.length > 0) {
      this.connectWebAudio(audioContext, this.attachedElements[0]);
    } else if (!audioContext) {
      this.disconnectWebAudio();
    }
  }
  /**
   * @internal
   * @experimental
   * @param {AudioNode[]} nodes - An array of WebAudio nodes. These nodes should not be connected to each other when passed, as the sdk will take care of connecting them in the order of the array.
   */
  setWebAudioPlugins(nodes) {
    this.webAudioPluginNodes = nodes;
    if (this.attachedElements.length > 0 && this.audioContext) {
      this.connectWebAudio(this.audioContext, this.attachedElements[0]);
    }
  }
  connectWebAudio(context, element) {
    this.disconnectWebAudio();
    // @ts-ignore attached elements always have a srcObject set
    this.sourceNode = context.createMediaStreamSource(element.srcObject);
    let lastNode = this.sourceNode;
    this.webAudioPluginNodes.forEach(node => {
      lastNode.connect(node);
      lastNode = node;
    });
    this.gainNode = context.createGain();
    lastNode.connect(this.gainNode);
    this.gainNode.connect(context.destination);
    if (this.elementVolume) {
      this.gainNode.gain.setTargetAtTime(this.elementVolume, 0, 0.1);
    }
    // try to resume the context if it isn't running already
    if (context.state !== 'running') {
      context.resume().then(() => {
        if (context.state !== 'running') {
          this.emit(TrackEvent.AudioPlaybackFailed, new Error("Audio Context couldn't be started automatically"));
        }
      }).catch(e => {
        this.emit(TrackEvent.AudioPlaybackFailed, e);
      });
    }
  }
  disconnectWebAudio() {
    var _a, _b;
    (_a = this.gainNode) === null || _a === void 0 ? void 0 : _a.disconnect();
    (_b = this.sourceNode) === null || _b === void 0 ? void 0 : _b.disconnect();
    this.gainNode = undefined;
    this.sourceNode = undefined;
  }
  getReceiverStats() {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.receiver || !this.receiver.getStats) {
        return;
      }
      const stats = yield this.receiver.getStats();
      let receiverStats;
      stats.forEach(v => {
        if (v.type === 'inbound-rtp') {
          receiverStats = {
            type: 'audio',
            timestamp: v.timestamp,
            jitter: v.jitter,
            bytesReceived: v.bytesReceived,
            concealedSamples: v.concealedSamples,
            concealmentEvents: v.concealmentEvents,
            silentConcealedSamples: v.silentConcealedSamples,
            silentConcealmentEvents: v.silentConcealmentEvents,
            totalAudioEnergy: v.totalAudioEnergy,
            totalSamplesDuration: v.totalSamplesDuration
          };
        }
      });
      return receiverStats;
    });
  }
}

const REACTION_DELAY = 100;
class RemoteVideoTrack extends RemoteTrack {
  constructor(mediaTrack, sid, receiver, adaptiveStreamSettings) {
    super(mediaTrack, sid, Track.Kind.Video, receiver);
    this.elementInfos = [];
    this.monitorReceiver = () => __awaiter(this, void 0, void 0, function* () {
      if (!this.receiver) {
        this._currentBitrate = 0;
        return;
      }
      const stats = yield this.getReceiverStats();
      if (stats && this.prevStats && this.receiver) {
        this._currentBitrate = computeBitrate(stats, this.prevStats);
      }
      this.prevStats = stats;
    });
    this.debouncedHandleResize = r(() => {
      this.updateDimensions();
    }, REACTION_DELAY);
    this.adaptiveStreamSettings = adaptiveStreamSettings;
  }
  get isAdaptiveStream() {
    return this.adaptiveStreamSettings !== undefined;
  }
  /**
   * Note: When using adaptiveStream, you need to use remoteVideoTrack.attach() to add the track to a HTMLVideoElement, otherwise your video tracks might never start
   */
  get mediaStreamTrack() {
    return this._mediaStreamTrack;
  }
  /** @internal */
  setMuted(muted) {
    super.setMuted(muted);
    this.attachedElements.forEach(element => {
      // detach or attach
      if (muted) {
        detachTrack(this._mediaStreamTrack, element);
      } else {
        attachToElement(this._mediaStreamTrack, element);
      }
    });
  }
  attach(element) {
    if (!element) {
      element = super.attach();
    } else {
      super.attach(element);
    }
    // It's possible attach is called multiple times on an element. When that's
    // the case, we'd want to avoid adding duplicate elementInfos
    if (this.adaptiveStreamSettings && this.elementInfos.find(info => info.element === element) === undefined) {
      const elementInfo = new HTMLElementInfo(element);
      this.observeElementInfo(elementInfo);
    }
    return element;
  }
  /**
   * Observe an ElementInfo for changes when adaptive streaming.
   * @param elementInfo
   * @internal
   */
  observeElementInfo(elementInfo) {
    if (this.adaptiveStreamSettings && this.elementInfos.find(info => info === elementInfo) === undefined) {
      elementInfo.handleResize = () => {
        this.debouncedHandleResize();
      };
      elementInfo.handleVisibilityChanged = () => {
        this.updateVisibility();
      };
      this.elementInfos.push(elementInfo);
      elementInfo.observe();
      // trigger the first resize update cycle
      // if the tab is backgrounded, the initial resize event does not fire until
      // the tab comes into focus for the first time.
      this.debouncedHandleResize();
      this.updateVisibility();
    } else {
      livekitLogger.warn('visibility resize observer not triggered');
    }
  }
  /**
   * Stop observing an ElementInfo for changes.
   * @param elementInfo
   * @internal
   */
  stopObservingElementInfo(elementInfo) {
    if (!this.isAdaptiveStream) {
      livekitLogger.warn('stopObservingElementInfo ignored');
      return;
    }
    const stopElementInfos = this.elementInfos.filter(info => info === elementInfo);
    for (const info of stopElementInfos) {
      info.stopObserving();
    }
    this.elementInfos = this.elementInfos.filter(info => info !== elementInfo);
    this.updateVisibility();
    this.debouncedHandleResize();
  }
  detach(element) {
    let detachedElements = [];
    if (element) {
      this.stopObservingElement(element);
      return super.detach(element);
    }
    detachedElements = super.detach();
    for (const e of detachedElements) {
      this.stopObservingElement(e);
    }
    return detachedElements;
  }
  /** @internal */
  getDecoderImplementation() {
    var _a;
    return (_a = this.prevStats) === null || _a === void 0 ? void 0 : _a.decoderImplementation;
  }
  getReceiverStats() {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.receiver || !this.receiver.getStats) {
        return;
      }
      const stats = yield this.receiver.getStats();
      let receiverStats;
      stats.forEach(v => {
        if (v.type === 'inbound-rtp') {
          receiverStats = {
            type: 'video',
            framesDecoded: v.framesDecoded,
            framesDropped: v.framesDropped,
            framesReceived: v.framesReceived,
            packetsReceived: v.packetsReceived,
            packetsLost: v.packetsLost,
            frameWidth: v.frameWidth,
            frameHeight: v.frameHeight,
            pliCount: v.pliCount,
            firCount: v.firCount,
            nackCount: v.nackCount,
            jitter: v.jitter,
            timestamp: v.timestamp,
            bytesReceived: v.bytesReceived,
            decoderImplementation: v.decoderImplementation
          };
        }
      });
      return receiverStats;
    });
  }
  stopObservingElement(element) {
    const stopElementInfos = this.elementInfos.filter(info => info.element === element);
    for (const info of stopElementInfos) {
      this.stopObservingElementInfo(info);
    }
  }
  handleAppVisibilityChanged() {
    const _super = Object.create(null, {
      handleAppVisibilityChanged: {
        get: () => super.handleAppVisibilityChanged
      }
    });
    return __awaiter(this, void 0, void 0, function* () {
      yield _super.handleAppVisibilityChanged.call(this);
      if (!this.isAdaptiveStream) return;
      this.updateVisibility();
    });
  }
  updateVisibility() {
    var _a, _b;
    const lastVisibilityChange = this.elementInfos.reduce((prev, info) => Math.max(prev, info.visibilityChangedAt || 0), 0);
    const backgroundPause = ((_b = (_a = this.adaptiveStreamSettings) === null || _a === void 0 ? void 0 : _a.pauseVideoInBackground) !== null && _b !== void 0 ? _b : true // default to true
    ) ? this.isInBackground : false;
    const isPiPMode = this.elementInfos.some(info => info.pictureInPicture);
    const isVisible = this.elementInfos.some(info => info.visible) && !backgroundPause || isPiPMode;
    if (this.lastVisible === isVisible) {
      return;
    }
    if (!isVisible && Date.now() - lastVisibilityChange < REACTION_DELAY) {
      // delay hidden events
      CriticalTimers.setTimeout(() => {
        this.updateVisibility();
      }, REACTION_DELAY);
      return;
    }
    this.lastVisible = isVisible;
    this.emit(TrackEvent.VisibilityChanged, isVisible, this);
  }
  updateDimensions() {
    var _a, _b;
    let maxWidth = 0;
    let maxHeight = 0;
    const pixelDensity = this.getPixelDensity();
    for (const info of this.elementInfos) {
      const currentElementWidth = info.width() * pixelDensity;
      const currentElementHeight = info.height() * pixelDensity;
      if (currentElementWidth + currentElementHeight > maxWidth + maxHeight) {
        maxWidth = currentElementWidth;
        maxHeight = currentElementHeight;
      }
    }
    if (((_a = this.lastDimensions) === null || _a === void 0 ? void 0 : _a.width) === maxWidth && ((_b = this.lastDimensions) === null || _b === void 0 ? void 0 : _b.height) === maxHeight) {
      return;
    }
    this.lastDimensions = {
      width: maxWidth,
      height: maxHeight
    };
    this.emit(TrackEvent.VideoDimensionsChanged, this.lastDimensions, this);
  }
  getPixelDensity() {
    var _a;
    const pixelDensity = (_a = this.adaptiveStreamSettings) === null || _a === void 0 ? void 0 : _a.pixelDensity;
    if (pixelDensity === 'screen') {
      return getDevicePixelRatio();
    } else if (!pixelDensity) {
      // when unset, we'll pick a sane default here.
      // for higher pixel density devices (mobile phones, etc), we'll use 2
      // otherwise it defaults to 1
      const devicePixelRatio = getDevicePixelRatio();
      if (devicePixelRatio > 2) {
        return 2;
      } else {
        return 1;
      }
    }
    return pixelDensity;
  }
}
class HTMLElementInfo {
  get visible() {
    return this.isPiP || this.isIntersecting;
  }
  get pictureInPicture() {
    return this.isPiP;
  }
  constructor(element, visible) {
    this.onVisibilityChanged = entry => {
      var _a;
      const {
        target,
        isIntersecting
      } = entry;
      if (target === this.element) {
        this.isIntersecting = isIntersecting;
        this.visibilityChangedAt = Date.now();
        (_a = this.handleVisibilityChanged) === null || _a === void 0 ? void 0 : _a.call(this);
      }
    };
    this.onEnterPiP = () => {
      var _a;
      this.isPiP = true;
      (_a = this.handleVisibilityChanged) === null || _a === void 0 ? void 0 : _a.call(this);
    };
    this.onLeavePiP = () => {
      var _a;
      this.isPiP = false;
      (_a = this.handleVisibilityChanged) === null || _a === void 0 ? void 0 : _a.call(this);
    };
    this.element = element;
    this.isIntersecting = visible !== null && visible !== void 0 ? visible : isElementInViewport(element);
    this.isPiP = isWeb() && document.pictureInPictureElement === element;
    this.visibilityChangedAt = 0;
  }
  width() {
    return this.element.clientWidth;
  }
  height() {
    return this.element.clientHeight;
  }
  observe() {
    // make sure we update the current visible state once we start to observe
    this.isIntersecting = isElementInViewport(this.element);
    this.isPiP = document.pictureInPictureElement === this.element;
    this.element.handleResize = () => {
      var _a;
      (_a = this.handleResize) === null || _a === void 0 ? void 0 : _a.call(this);
    };
    this.element.handleVisibilityChanged = this.onVisibilityChanged;
    getIntersectionObserver().observe(this.element);
    getResizeObserver().observe(this.element);
    this.element.addEventListener('enterpictureinpicture', this.onEnterPiP);
    this.element.addEventListener('leavepictureinpicture', this.onLeavePiP);
  }
  stopObserving() {
    var _a, _b;
    (_a = getIntersectionObserver()) === null || _a === void 0 ? void 0 : _a.unobserve(this.element);
    (_b = getResizeObserver()) === null || _b === void 0 ? void 0 : _b.unobserve(this.element);
    this.element.removeEventListener('enterpictureinpicture', this.onEnterPiP);
    this.element.removeEventListener('leavepictureinpicture', this.onLeavePiP);
  }
}
// does not account for occlusion by other elements
function isElementInViewport(el) {
  let top = el.offsetTop;
  let left = el.offsetLeft;
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const {
    hidden
  } = el;
  const {
    opacity,
    display
  } = getComputedStyle(el);
  while (el.offsetParent) {
    el = el.offsetParent;
    top += el.offsetTop;
    left += el.offsetLeft;
  }
  return top < window.pageYOffset + window.innerHeight && left < window.pageXOffset + window.innerWidth && top + height > window.pageYOffset && left + width > window.pageXOffset && !hidden && (opacity !== '' ? parseFloat(opacity) > 0 : true) && display !== 'none';
}

class TrackPublication extends eventsExports.EventEmitter {
  constructor(kind, id, name) {
    super();
    this.metadataMuted = false;
    this.encryption = Encryption_Type.NONE;
    this.handleMuted = () => {
      this.emit(TrackEvent.Muted);
    };
    this.handleUnmuted = () => {
      this.emit(TrackEvent.Unmuted);
    };
    this.setMaxListeners(100);
    this.kind = kind;
    this.trackSid = id;
    this.trackName = name;
    this.source = Track.Source.Unknown;
  }
  /** @internal */
  setTrack(track) {
    if (this.track) {
      this.track.off(TrackEvent.Muted, this.handleMuted);
      this.track.off(TrackEvent.Unmuted, this.handleUnmuted);
    }
    this.track = track;
    if (track) {
      // forward events
      track.on(TrackEvent.Muted, this.handleMuted);
      track.on(TrackEvent.Unmuted, this.handleUnmuted);
    }
  }
  get isMuted() {
    return this.metadataMuted;
  }
  get isEnabled() {
    return true;
  }
  get isSubscribed() {
    return this.track !== undefined;
  }
  get isEncrypted() {
    return this.encryption !== Encryption_Type.NONE;
  }
  /**
   * an [AudioTrack] if this publication holds an audio track
   */
  get audioTrack() {
    if (this.track instanceof LocalAudioTrack || this.track instanceof RemoteAudioTrack) {
      return this.track;
    }
  }
  /**
   * an [VideoTrack] if this publication holds a video track
   */
  get videoTrack() {
    if (this.track instanceof LocalVideoTrack || this.track instanceof RemoteVideoTrack) {
      return this.track;
    }
  }
  /** @internal */
  updateInfo(info) {
    this.trackSid = info.sid;
    this.trackName = info.name;
    this.source = Track.sourceFromProto(info.source);
    this.mimeType = info.mimeType;
    if (this.kind === Track.Kind.Video && info.width > 0) {
      this.dimensions = {
        width: info.width,
        height: info.height
      };
      this.simulcasted = info.simulcast;
    }
    this.encryption = info.encryption;
    this.trackInfo = info;
    livekitLogger.debug('update publication info', {
      info
    });
  }
}
(function (TrackPublication) {
  (function (SubscriptionStatus) {
    SubscriptionStatus["Desired"] = "desired";
    SubscriptionStatus["Subscribed"] = "subscribed";
    SubscriptionStatus["Unsubscribed"] = "unsubscribed";
  })(TrackPublication.SubscriptionStatus || (TrackPublication.SubscriptionStatus = {}));
  (function (PermissionStatus) {
    PermissionStatus["Allowed"] = "allowed";
    PermissionStatus["NotAllowed"] = "not_allowed";
  })(TrackPublication.PermissionStatus || (TrackPublication.PermissionStatus = {}));
})(TrackPublication || (TrackPublication = {}));

class LocalTrackPublication extends TrackPublication {
  get isUpstreamPaused() {
    var _a;
    return (_a = this.track) === null || _a === void 0 ? void 0 : _a.isUpstreamPaused;
  }
  constructor(kind, ti, track) {
    super(kind, ti.sid, ti.name);
    this.track = undefined;
    this.handleTrackEnded = () => {
      this.emit(TrackEvent.Ended);
    };
    this.updateInfo(ti);
    this.setTrack(track);
  }
  setTrack(track) {
    if (this.track) {
      this.track.off(TrackEvent.Ended, this.handleTrackEnded);
    }
    super.setTrack(track);
    if (track) {
      track.on(TrackEvent.Ended, this.handleTrackEnded);
    }
  }
  get isMuted() {
    if (this.track) {
      return this.track.isMuted;
    }
    return super.isMuted;
  }
  get audioTrack() {
    return super.audioTrack;
  }
  get videoTrack() {
    return super.videoTrack;
  }
  /**
   * Mute the track associated with this publication
   */
  mute() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      return (_a = this.track) === null || _a === void 0 ? void 0 : _a.mute();
    });
  }
  /**
   * Unmute track associated with this publication
   */
  unmute() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      return (_a = this.track) === null || _a === void 0 ? void 0 : _a.unmute();
    });
  }
  /**
   * Pauses the media stream track associated with this publication from being sent to the server
   * and signals "muted" event to other participants
   * Useful if you want to pause the stream without pausing the local media stream track
   */
  pauseUpstream() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      yield (_a = this.track) === null || _a === void 0 ? void 0 : _a.pauseUpstream();
    });
  }
  /**
   * Resumes sending the media stream track associated with this publication to the server after a call to [[pauseUpstream()]]
   * and signals "unmuted" event to other participants (unless the track is explicitly muted)
   */
  resumeUpstream() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      yield (_a = this.track) === null || _a === void 0 ? void 0 : _a.resumeUpstream();
    });
  }
}

var ConnectionQuality;
(function (ConnectionQuality) {
  ConnectionQuality["Excellent"] = "excellent";
  ConnectionQuality["Good"] = "good";
  ConnectionQuality["Poor"] = "poor";
  ConnectionQuality["Unknown"] = "unknown";
})(ConnectionQuality || (ConnectionQuality = {}));
function qualityFromProto(q) {
  switch (q) {
    case ConnectionQuality$1.EXCELLENT:
      return ConnectionQuality.Excellent;
    case ConnectionQuality$1.GOOD:
      return ConnectionQuality.Good;
    case ConnectionQuality$1.POOR:
      return ConnectionQuality.Poor;
    default:
      return ConnectionQuality.Unknown;
  }
}
class Participant extends eventsExports.EventEmitter {
  get isEncrypted() {
    return this.tracks.size > 0 && Array.from(this.tracks.values()).every(tr => tr.isEncrypted);
  }
  /** @internal */
  constructor(sid, identity, name, metadata) {
    super();
    /** audio level between 0-1.0, 1 being loudest, 0 being softest */
    this.audioLevel = 0;
    /** if participant is currently speaking */
    this.isSpeaking = false;
    this._connectionQuality = ConnectionQuality.Unknown;
    this.setMaxListeners(100);
    this.sid = sid;
    this.identity = identity;
    this.name = name;
    this.metadata = metadata;
    this.audioTracks = new Map();
    this.videoTracks = new Map();
    this.tracks = new Map();
  }
  getTracks() {
    return Array.from(this.tracks.values());
  }
  /**
   * Finds the first track that matches the source filter, for example, getting
   * the user's camera track with getTrackBySource(Track.Source.Camera).
   * @param source
   * @returns
   */
  getTrack(source) {
    for (const [, pub] of this.tracks) {
      if (pub.source === source) {
        return pub;
      }
    }
  }
  /**
   * Finds the first track that matches the track's name.
   * @param name
   * @returns
   */
  getTrackByName(name) {
    for (const [, pub] of this.tracks) {
      if (pub.trackName === name) {
        return pub;
      }
    }
  }
  get connectionQuality() {
    return this._connectionQuality;
  }
  get isCameraEnabled() {
    var _a;
    const track = this.getTrack(Track.Source.Camera);
    return !((_a = track === null || track === void 0 ? void 0 : track.isMuted) !== null && _a !== void 0 ? _a : true);
  }
  get isMicrophoneEnabled() {
    var _a;
    const track = this.getTrack(Track.Source.Microphone);
    return !((_a = track === null || track === void 0 ? void 0 : track.isMuted) !== null && _a !== void 0 ? _a : true);
  }
  get isScreenShareEnabled() {
    const track = this.getTrack(Track.Source.ScreenShare);
    return !!track;
  }
  get isLocal() {
    return false;
  }
  /** when participant joined the room */
  get joinedAt() {
    if (this.participantInfo) {
      return new Date(Number.parseInt(this.participantInfo.joinedAt.toString()) * 1000);
    }
    return new Date();
  }
  /** @internal */
  updateInfo(info) {
    // it's possible the update could be applied out of order due to await
    // during reconnect sequences. when that happens, it's possible for server
    // to have sent more recent version of participant info while JS is waiting
    // to process the existing payload.
    // when the participant sid remains the same, and we already have a later version
    // of the payload, they can be safely skipped
    if (this.participantInfo && this.participantInfo.sid === info.sid && this.participantInfo.version > info.version) {
      return false;
    }
    this.identity = info.identity;
    this.sid = info.sid;
    this.setName(info.name);
    this.setMetadata(info.metadata);
    if (info.permission) {
      this.setPermissions(info.permission);
    }
    // set this last so setMetadata can detect changes
    this.participantInfo = info;
    livekitLogger.trace('update participant info', {
      info
    });
    return true;
  }
  /** @internal */
  setMetadata(md) {
    const changed = this.metadata !== md;
    const prevMetadata = this.metadata;
    this.metadata = md;
    if (changed) {
      this.emit(ParticipantEvent.ParticipantMetadataChanged, prevMetadata);
    }
  }
  setName(name) {
    const changed = this.name !== name;
    this.name = name;
    if (changed) {
      this.emit(ParticipantEvent.ParticipantNameChanged, name);
    }
  }
  /** @internal */
  setPermissions(permissions) {
    var _a, _b, _c, _d, _e;
    const prevPermissions = this.permissions;
    const changed = permissions.canPublish !== ((_a = this.permissions) === null || _a === void 0 ? void 0 : _a.canPublish) || permissions.canSubscribe !== ((_b = this.permissions) === null || _b === void 0 ? void 0 : _b.canSubscribe) || permissions.canPublishData !== ((_c = this.permissions) === null || _c === void 0 ? void 0 : _c.canPublishData) || permissions.hidden !== ((_d = this.permissions) === null || _d === void 0 ? void 0 : _d.hidden) || permissions.recorder !== ((_e = this.permissions) === null || _e === void 0 ? void 0 : _e.recorder) || permissions.canPublishSources.length !== this.permissions.canPublishSources.length || permissions.canPublishSources.some((value, index) => {
      var _a;
      return value !== ((_a = this.permissions) === null || _a === void 0 ? void 0 : _a.canPublishSources[index]);
    });
    this.permissions = permissions;
    if (changed) {
      this.emit(ParticipantEvent.ParticipantPermissionsChanged, prevPermissions);
    }
    return changed;
  }
  /** @internal */
  setIsSpeaking(speaking) {
    if (speaking === this.isSpeaking) {
      return;
    }
    this.isSpeaking = speaking;
    if (speaking) {
      this.lastSpokeAt = new Date();
    }
    this.emit(ParticipantEvent.IsSpeakingChanged, speaking);
  }
  /** @internal */
  setConnectionQuality(q) {
    const prevQuality = this._connectionQuality;
    this._connectionQuality = qualityFromProto(q);
    if (prevQuality !== this._connectionQuality) {
      this.emit(ParticipantEvent.ConnectionQualityChanged, this._connectionQuality);
    }
  }
  /**
   * @internal
   */
  setAudioContext(ctx) {
    this.audioContext = ctx;
    this.audioTracks.forEach(track => (track.track instanceof RemoteAudioTrack || track.track instanceof LocalAudioTrack) && track.track.setAudioContext(ctx));
  }
  addTrackPublication(publication) {
    // forward publication driven events
    publication.on(TrackEvent.Muted, () => {
      this.emit(ParticipantEvent.TrackMuted, publication);
    });
    publication.on(TrackEvent.Unmuted, () => {
      this.emit(ParticipantEvent.TrackUnmuted, publication);
    });
    const pub = publication;
    if (pub.track) {
      pub.track.sid = publication.trackSid;
    }
    this.tracks.set(publication.trackSid, publication);
    switch (publication.kind) {
      case Track.Kind.Audio:
        this.audioTracks.set(publication.trackSid, publication);
        break;
      case Track.Kind.Video:
        this.videoTracks.set(publication.trackSid, publication);
        break;
    }
  }
}

function trackPermissionToProto(perms) {
  var _a, _b, _c;
  if (!perms.participantSid && !perms.participantIdentity) {
    throw new Error('Invalid track permission, must provide at least one of participantIdentity and participantSid');
  }
  return new TrackPermission({
    participantIdentity: (_a = perms.participantIdentity) !== null && _a !== void 0 ? _a : '',
    participantSid: (_b = perms.participantSid) !== null && _b !== void 0 ? _b : '',
    allTracks: (_c = perms.allowAll) !== null && _c !== void 0 ? _c : false,
    trackSids: perms.allowedTrackSids || []
  });
}

class RemoteTrackPublication extends TrackPublication {
  constructor(kind, ti, autoSubscribe) {
    super(kind, ti.sid, ti.name);
    this.track = undefined;
    /** @internal */
    this.allowed = true;
    this.disabled = false;
    this.currentVideoQuality = VideoQuality.HIGH;
    this.handleEnded = track => {
      this.setTrack(undefined);
      this.emit(TrackEvent.Ended, track);
    };
    this.handleVisibilityChange = visible => {
      livekitLogger.debug("adaptivestream video visibility ".concat(this.trackSid, ", visible=").concat(visible), {
        trackSid: this.trackSid
      });
      this.disabled = !visible;
      this.emitTrackUpdate();
    };
    this.handleVideoDimensionsChange = dimensions => {
      livekitLogger.debug("adaptivestream video dimensions ".concat(dimensions.width, "x").concat(dimensions.height), {
        trackSid: this.trackSid
      });
      this.videoDimensions = dimensions;
      this.emitTrackUpdate();
    };
    this.subscribed = autoSubscribe;
    this.updateInfo(ti);
  }
  /**
   * Subscribe or unsubscribe to this remote track
   * @param subscribed true to subscribe to a track, false to unsubscribe
   */
  setSubscribed(subscribed) {
    const prevStatus = this.subscriptionStatus;
    const prevPermission = this.permissionStatus;
    this.subscribed = subscribed;
    // reset allowed status when desired subscription state changes
    // server will notify client via signal message if it's not allowed
    if (subscribed) {
      this.allowed = true;
    }
    const sub = new UpdateSubscription({
      trackSids: [this.trackSid],
      subscribe: this.subscribed,
      participantTracks: [new ParticipantTracks({
        // sending an empty participant id since TrackPublication doesn't keep it
        // this is filled in by the participant that receives this message
        participantSid: '',
        trackSids: [this.trackSid]
      })]
    });
    this.emit(TrackEvent.UpdateSubscription, sub);
    this.emitSubscriptionUpdateIfChanged(prevStatus);
    this.emitPermissionUpdateIfChanged(prevPermission);
  }
  get subscriptionStatus() {
    if (this.subscribed === false) {
      return TrackPublication.SubscriptionStatus.Unsubscribed;
    }
    if (!super.isSubscribed) {
      return TrackPublication.SubscriptionStatus.Desired;
    }
    return TrackPublication.SubscriptionStatus.Subscribed;
  }
  get permissionStatus() {
    return this.allowed ? TrackPublication.PermissionStatus.Allowed : TrackPublication.PermissionStatus.NotAllowed;
  }
  /**
   * Returns true if track is subscribed, and ready for playback
   */
  get isSubscribed() {
    if (this.subscribed === false) {
      return false;
    }
    return super.isSubscribed;
  }
  // returns client's desire to subscribe to a track, also true if autoSubscribe is enabled
  get isDesired() {
    return this.subscribed !== false;
  }
  get isEnabled() {
    return !this.disabled;
  }
  /**
   * disable server from sending down data for this track. this is useful when
   * the participant is off screen, you may disable streaming down their video
   * to reduce bandwidth requirements
   * @param enabled
   */
  setEnabled(enabled) {
    if (!this.isManualOperationAllowed() || this.disabled === !enabled) {
      return;
    }
    this.disabled = !enabled;
    this.emitTrackUpdate();
  }
  /**
   * for tracks that support simulcasting, adjust subscribed quality
   *
   * This indicates the highest quality the client can accept. if network
   * bandwidth does not allow, server will automatically reduce quality to
   * optimize for uninterrupted video
   */
  setVideoQuality(quality) {
    if (!this.isManualOperationAllowed() || this.currentVideoQuality === quality) {
      return;
    }
    this.currentVideoQuality = quality;
    this.videoDimensions = undefined;
    this.emitTrackUpdate();
  }
  setVideoDimensions(dimensions) {
    var _a, _b;
    if (!this.isManualOperationAllowed()) {
      return;
    }
    if (((_a = this.videoDimensions) === null || _a === void 0 ? void 0 : _a.width) === dimensions.width && ((_b = this.videoDimensions) === null || _b === void 0 ? void 0 : _b.height) === dimensions.height) {
      return;
    }
    if (this.track instanceof RemoteVideoTrack) {
      this.videoDimensions = dimensions;
    }
    this.currentVideoQuality = undefined;
    this.emitTrackUpdate();
  }
  setVideoFPS(fps) {
    if (!this.isManualOperationAllowed()) {
      return;
    }
    if (!(this.track instanceof RemoteVideoTrack)) {
      return;
    }
    if (this.fps === fps) {
      return;
    }
    this.fps = fps;
    this.emitTrackUpdate();
  }
  get videoQuality() {
    return this.currentVideoQuality;
  }
  /** @internal */
  setTrack(track) {
    const prevStatus = this.subscriptionStatus;
    const prevPermission = this.permissionStatus;
    const prevTrack = this.track;
    if (prevTrack === track) {
      return;
    }
    if (prevTrack) {
      // unregister listener
      prevTrack.off(TrackEvent.VideoDimensionsChanged, this.handleVideoDimensionsChange);
      prevTrack.off(TrackEvent.VisibilityChanged, this.handleVisibilityChange);
      prevTrack.off(TrackEvent.Ended, this.handleEnded);
      prevTrack.detach();
      prevTrack.stopMonitor();
      this.emit(TrackEvent.Unsubscribed, prevTrack);
    }
    super.setTrack(track);
    if (track) {
      track.sid = this.trackSid;
      track.on(TrackEvent.VideoDimensionsChanged, this.handleVideoDimensionsChange);
      track.on(TrackEvent.VisibilityChanged, this.handleVisibilityChange);
      track.on(TrackEvent.Ended, this.handleEnded);
      this.emit(TrackEvent.Subscribed, track);
    }
    this.emitPermissionUpdateIfChanged(prevPermission);
    this.emitSubscriptionUpdateIfChanged(prevStatus);
  }
  /** @internal */
  setAllowed(allowed) {
    const prevStatus = this.subscriptionStatus;
    const prevPermission = this.permissionStatus;
    this.allowed = allowed;
    this.emitPermissionUpdateIfChanged(prevPermission);
    this.emitSubscriptionUpdateIfChanged(prevStatus);
  }
  /** @internal */
  setSubscriptionError(error) {
    this.emit(TrackEvent.SubscriptionFailed, error);
  }
  /** @internal */
  updateInfo(info) {
    super.updateInfo(info);
    const prevMetadataMuted = this.metadataMuted;
    this.metadataMuted = info.muted;
    if (this.track) {
      this.track.setMuted(info.muted);
    } else if (prevMetadataMuted !== info.muted) {
      this.emit(info.muted ? TrackEvent.Muted : TrackEvent.Unmuted);
    }
  }
  emitSubscriptionUpdateIfChanged(previousStatus) {
    const currentStatus = this.subscriptionStatus;
    if (previousStatus === currentStatus) {
      return;
    }
    this.emit(TrackEvent.SubscriptionStatusChanged, currentStatus, previousStatus);
  }
  emitPermissionUpdateIfChanged(previousPermissionStatus) {
    const currentPermissionStatus = this.permissionStatus;
    if (currentPermissionStatus !== previousPermissionStatus) {
      this.emit(TrackEvent.SubscriptionPermissionChanged, this.permissionStatus, previousPermissionStatus);
    }
  }
  isManualOperationAllowed() {
    if (this.kind === Track.Kind.Video && this.isAdaptiveStream) {
      livekitLogger.warn('adaptive stream is enabled, cannot change video track settings', {
        trackSid: this.trackSid
      });
      return false;
    }
    if (!this.isDesired) {
      livekitLogger.warn('cannot update track settings when not subscribed', {
        trackSid: this.trackSid
      });
      return false;
    }
    return true;
  }
  get isAdaptiveStream() {
    return this.track instanceof RemoteVideoTrack && this.track.isAdaptiveStream;
  }
  /* @internal */
  emitTrackUpdate() {
    const settings = new UpdateTrackSettings({
      trackSids: [this.trackSid],
      disabled: this.disabled,
      fps: this.fps
    });
    if (this.videoDimensions) {
      settings.width = Math.ceil(this.videoDimensions.width);
      settings.height = Math.ceil(this.videoDimensions.height);
    } else if (this.currentVideoQuality !== undefined) {
      settings.quality = this.currentVideoQuality;
    } else {
      // defaults to high quality
      settings.quality = VideoQuality.HIGH;
    }
    this.emit(TrackEvent.UpdateSettings, settings);
  }
}

class RemoteParticipant extends Participant {
  /** @internal */
  static fromParticipantInfo(signalClient, pi) {
    return new RemoteParticipant(signalClient, pi.sid, pi.identity, pi.name, pi.metadata);
  }
  /** @internal */
  constructor(signalClient, sid, identity, name, metadata) {
    super(sid, identity || '', name, metadata);
    this.signalClient = signalClient;
    this.tracks = new Map();
    this.audioTracks = new Map();
    this.videoTracks = new Map();
    this.volumeMap = new Map();
  }
  addTrackPublication(publication) {
    super.addTrackPublication(publication);
    // register action events
    publication.on(TrackEvent.UpdateSettings, settings => {
      livekitLogger.debug('send update settings', settings);
      this.signalClient.sendUpdateTrackSettings(settings);
    });
    publication.on(TrackEvent.UpdateSubscription, sub => {
      sub.participantTracks.forEach(pt => {
        pt.participantSid = this.sid;
      });
      this.signalClient.sendUpdateSubscription(sub);
    });
    publication.on(TrackEvent.SubscriptionPermissionChanged, status => {
      this.emit(ParticipantEvent.TrackSubscriptionPermissionChanged, publication, status);
    });
    publication.on(TrackEvent.SubscriptionStatusChanged, status => {
      this.emit(ParticipantEvent.TrackSubscriptionStatusChanged, publication, status);
    });
    publication.on(TrackEvent.Subscribed, track => {
      this.emit(ParticipantEvent.TrackSubscribed, track, publication);
    });
    publication.on(TrackEvent.Unsubscribed, previousTrack => {
      this.emit(ParticipantEvent.TrackUnsubscribed, previousTrack, publication);
    });
    publication.on(TrackEvent.SubscriptionFailed, error => {
      this.emit(ParticipantEvent.TrackSubscriptionFailed, publication.trackSid, error);
    });
  }
  getTrack(source) {
    const track = super.getTrack(source);
    if (track) {
      return track;
    }
  }
  getTrackByName(name) {
    const track = super.getTrackByName(name);
    if (track) {
      return track;
    }
  }
  /**
   * sets the volume on the participant's audio track
   * by default, this affects the microphone publication
   * a different source can be passed in as a second argument
   * if no track exists the volume will be applied when the microphone track is added
   */
  setVolume(volume) {
    let source = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : Track.Source.Microphone;
    this.volumeMap.set(source, volume);
    const audioPublication = this.getTrack(source);
    if (audioPublication && audioPublication.track) {
      audioPublication.track.setVolume(volume);
    }
  }
  /**
   * gets the volume on the participant's microphone track
   */
  getVolume() {
    let source = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : Track.Source.Microphone;
    const audioPublication = this.getTrack(source);
    if (audioPublication && audioPublication.track) {
      return audioPublication.track.getVolume();
    }
    return this.volumeMap.get(source);
  }
  /** @internal */
  addSubscribedMediaTrack(mediaTrack, sid, mediaStream, receiver, adaptiveStreamSettings, triesLeft) {
    // find the track publication
    // it's possible for the media track to arrive before participant info
    let publication = this.getTrackPublication(sid);
    // it's also possible that the browser didn't honor our original track id
    // FireFox would use its own local uuid instead of server track id
    if (!publication) {
      if (!sid.startsWith('TR')) {
        // find the first track that matches type
        this.tracks.forEach(p => {
          if (!publication && mediaTrack.kind === p.kind.toString()) {
            publication = p;
          }
        });
      }
    }
    // when we couldn't locate the track, it's possible that the metadata hasn't
    // yet arrived. Wait a bit longer for it to arrive, or fire an error
    if (!publication) {
      if (triesLeft === 0) {
        livekitLogger.error('could not find published track', {
          participant: this.sid,
          trackSid: sid
        });
        this.emit(ParticipantEvent.TrackSubscriptionFailed, sid);
        return;
      }
      if (triesLeft === undefined) triesLeft = 20;
      setTimeout(() => {
        this.addSubscribedMediaTrack(mediaTrack, sid, mediaStream, receiver, adaptiveStreamSettings, triesLeft - 1);
      }, 150);
      return;
    }
    if (mediaTrack.readyState === 'ended') {
      livekitLogger.error('unable to subscribe because MediaStreamTrack is ended. Do not call MediaStreamTrack.stop()', {
        participant: this.sid,
        trackSid: sid
      });
      this.emit(ParticipantEvent.TrackSubscriptionFailed, sid);
      return;
    }
    const isVideo = mediaTrack.kind === 'video';
    let track;
    if (isVideo) {
      track = new RemoteVideoTrack(mediaTrack, sid, receiver, adaptiveStreamSettings);
    } else {
      track = new RemoteAudioTrack(mediaTrack, sid, receiver, this.audioContext, this.audioOutput);
    }
    // set track info
    track.source = publication.source;
    // keep publication's muted status
    track.isMuted = publication.isMuted;
    track.setMediaStream(mediaStream);
    track.start();
    publication.setTrack(track);
    // set participant volumes on new audio tracks
    if (this.volumeMap.has(publication.source) && track instanceof RemoteAudioTrack) {
      track.setVolume(this.volumeMap.get(publication.source));
    }
    return publication;
  }
  /** @internal */
  get hasMetadata() {
    return !!this.participantInfo;
  }
  getTrackPublication(sid) {
    return this.tracks.get(sid);
  }
  /** @internal */
  updateInfo(info) {
    if (!super.updateInfo(info)) {
      return false;
    }
    // we are getting a list of all available tracks, reconcile in here
    // and send out events for changes
    // reconcile track publications, publish events only if metadata is already there
    // i.e. changes since the local participant has joined
    const validTracks = new Map();
    const newTracks = new Map();
    info.tracks.forEach(ti => {
      var _a;
      let publication = this.getTrackPublication(ti.sid);
      if (!publication) {
        // new publication
        const kind = Track.kindFromProto(ti.type);
        if (!kind) {
          return;
        }
        publication = new RemoteTrackPublication(kind, ti, (_a = this.signalClient.connectOptions) === null || _a === void 0 ? void 0 : _a.autoSubscribe);
        publication.updateInfo(ti);
        newTracks.set(ti.sid, publication);
        const existingTrackOfSource = Array.from(this.tracks.values()).find(publishedTrack => publishedTrack.source === (publication === null || publication === void 0 ? void 0 : publication.source));
        if (existingTrackOfSource && publication.source !== Track.Source.Unknown) {
          livekitLogger.debug("received a second track publication for ".concat(this.identity, " with the same source: ").concat(publication.source), {
            oldTrack: existingTrackOfSource,
            newTrack: publication,
            participant: this,
            participantInfo: info
          });
        }
        this.addTrackPublication(publication);
      } else {
        publication.updateInfo(ti);
      }
      validTracks.set(ti.sid, publication);
    });
    // detect removed tracks
    this.tracks.forEach(publication => {
      if (!validTracks.has(publication.trackSid)) {
        livekitLogger.trace('detected removed track on remote participant, unpublishing', {
          publication,
          participantSid: this.sid
        });
        this.unpublishTrack(publication.trackSid, true);
      }
    });
    // always emit events for new publications, Room will not forward them unless it's ready
    newTracks.forEach(publication => {
      this.emit(ParticipantEvent.TrackPublished, publication);
    });
    return true;
  }
  /** @internal */
  unpublishTrack(sid, sendUnpublish) {
    const publication = this.tracks.get(sid);
    if (!publication) {
      return;
    }
    // also send unsubscribe, if track is actively subscribed
    const {
      track
    } = publication;
    if (track) {
      track.stop();
      publication.setTrack(undefined);
    }
    // remove track from maps only after unsubscribed has been fired
    this.tracks.delete(sid);
    // remove from the right type map
    switch (publication.kind) {
      case Track.Kind.Audio:
        this.audioTracks.delete(sid);
        break;
      case Track.Kind.Video:
        this.videoTracks.delete(sid);
        break;
    }
    if (sendUnpublish) {
      this.emit(ParticipantEvent.TrackUnpublished, publication);
    }
  }
  /**
   * @internal
   */
  setAudioOutput(output) {
    return __awaiter(this, void 0, void 0, function* () {
      this.audioOutput = output;
      const promises = [];
      this.audioTracks.forEach(pub => {
        var _a;
        if (pub.track instanceof RemoteAudioTrack) {
          promises.push(pub.track.setSinkId((_a = output.deviceId) !== null && _a !== void 0 ? _a : 'default'));
        }
      });
      yield Promise.all(promises);
    });
  }
  /** @internal */
  emit(event) {
    for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
      args[_key - 1] = arguments[_key];
    }
    livekitLogger.trace('participant event', {
      participant: this.sid,
      event,
      args
    });
    return super.emit(event, ...args);
  }
}

class LocalParticipant extends Participant {
  /** @internal */
  constructor(sid, identity, engine, options) {
    super(sid, identity);
    this.pendingPublishing = new Set();
    this.pendingPublishPromises = new Map();
    this.participantTrackPermissions = [];
    this.allParticipantsAllowedToSubscribe = true;
    this.encryptionType = Encryption_Type.NONE;
    this.handleReconnecting = () => {
      if (!this.reconnectFuture) {
        this.reconnectFuture = new Future();
      }
    };
    this.handleReconnected = () => {
      var _a, _b;
      (_b = (_a = this.reconnectFuture) === null || _a === void 0 ? void 0 : _a.resolve) === null || _b === void 0 ? void 0 : _b.call(_a);
      this.reconnectFuture = undefined;
      this.updateTrackSubscriptionPermissions();
    };
    this.handleDisconnected = () => {
      var _a, _b;
      if (this.reconnectFuture) {
        this.reconnectFuture.promise.catch(e => livekitLogger.warn(e));
        (_b = (_a = this.reconnectFuture) === null || _a === void 0 ? void 0 : _a.reject) === null || _b === void 0 ? void 0 : _b.call(_a, 'Got disconnected during reconnection attempt');
        this.reconnectFuture = undefined;
      }
    };
    this.updateTrackSubscriptionPermissions = () => {
      livekitLogger.debug('updating track subscription permissions', {
        allParticipantsAllowed: this.allParticipantsAllowedToSubscribe,
        participantTrackPermissions: this.participantTrackPermissions
      });
      this.engine.client.sendUpdateSubscriptionPermissions(this.allParticipantsAllowedToSubscribe, this.participantTrackPermissions.map(p => trackPermissionToProto(p)));
    };
    /** @internal */
    this.onTrackUnmuted = track => {
      this.onTrackMuted(track, track.isUpstreamPaused);
    };
    // when the local track changes in mute status, we'll notify server as such
    /** @internal */
    this.onTrackMuted = (track, muted) => {
      if (muted === undefined) {
        muted = true;
      }
      if (!track.sid) {
        livekitLogger.error('could not update mute status for unpublished track', track);
        return;
      }
      this.engine.updateMuteStatus(track.sid, muted);
    };
    this.onTrackUpstreamPaused = track => {
      livekitLogger.debug('upstream paused');
      this.onTrackMuted(track, true);
    };
    this.onTrackUpstreamResumed = track => {
      livekitLogger.debug('upstream resumed');
      this.onTrackMuted(track, track.isMuted);
    };
    this.handleSubscribedQualityUpdate = update => __awaiter(this, void 0, void 0, function* () {
      var _a, e_1, _b, _c;
      var _d, _e;
      if (!((_d = this.roomOptions) === null || _d === void 0 ? void 0 : _d.dynacast)) {
        return;
      }
      const pub = this.videoTracks.get(update.trackSid);
      if (!pub) {
        livekitLogger.warn('received subscribed quality update for unknown track', {
          method: 'handleSubscribedQualityUpdate',
          sid: update.trackSid
        });
        return;
      }
      if (update.subscribedCodecs.length > 0) {
        if (!pub.videoTrack) {
          return;
        }
        const newCodecs = yield pub.videoTrack.setPublishingCodecs(update.subscribedCodecs);
        try {
          for (var _f = true, newCodecs_1 = __asyncValues(newCodecs), newCodecs_1_1; newCodecs_1_1 = yield newCodecs_1.next(), _a = newCodecs_1_1.done, !_a; _f = true) {
            _c = newCodecs_1_1.value;
            _f = false;
            const codec = _c;
            if (isBackupCodec(codec)) {
              livekitLogger.debug("publish ".concat(codec, " for ").concat(pub.videoTrack.sid));
              yield this.publishAdditionalCodecForTrack(pub.videoTrack, codec, pub.options);
            }
          }
        } catch (e_1_1) {
          e_1 = {
            error: e_1_1
          };
        } finally {
          try {
            if (!_f && !_a && (_b = newCodecs_1.return)) yield _b.call(newCodecs_1);
          } finally {
            if (e_1) throw e_1.error;
          }
        }
      } else if (update.subscribedQualities.length > 0) {
        yield (_e = pub.videoTrack) === null || _e === void 0 ? void 0 : _e.setPublishingLayers(update.subscribedQualities);
      }
    });
    this.handleLocalTrackUnpublished = unpublished => {
      const track = this.tracks.get(unpublished.trackSid);
      if (!track) {
        livekitLogger.warn('received unpublished event for unknown track', {
          method: 'handleLocalTrackUnpublished',
          trackSid: unpublished.trackSid
        });
        return;
      }
      this.unpublishTrack(track.track);
    };
    this.handleTrackEnded = track => __awaiter(this, void 0, void 0, function* () {
      if (track.source === Track.Source.ScreenShare || track.source === Track.Source.ScreenShareAudio) {
        livekitLogger.debug('unpublishing local track due to TrackEnded', {
          track: track.sid
        });
        this.unpublishTrack(track);
      } else if (track.isUserProvided) {
        yield track.mute();
      } else if (track instanceof LocalAudioTrack || track instanceof LocalVideoTrack) {
        try {
          if (isWeb()) {
            try {
              const currentPermissions = yield navigator === null || navigator === void 0 ? void 0 : navigator.permissions.query({
                // the permission query for camera and microphone currently not supported in Safari and Firefox
                // @ts-ignore
                name: track.source === Track.Source.Camera ? 'camera' : 'microphone'
              });
              if (currentPermissions && currentPermissions.state === 'denied') {
                livekitLogger.warn("user has revoked access to ".concat(track.source));
                // detect granted change after permissions were denied to try and resume then
                currentPermissions.onchange = () => {
                  if (currentPermissions.state !== 'denied') {
                    if (!track.isMuted) {
                      track.restartTrack();
                    }
                    currentPermissions.onchange = null;
                  }
                };
                throw new Error('GetUserMedia Permission denied');
              }
            } catch (e) {
              // permissions query fails for firefox, we continue and try to restart the track
            }
          }
          if (!track.isMuted) {
            livekitLogger.debug('track ended, attempting to use a different device');
            yield track.restartTrack();
          }
        } catch (e) {
          livekitLogger.warn("could not restart track, muting instead");
          yield track.mute();
        }
      }
    });
    this.audioTracks = new Map();
    this.videoTracks = new Map();
    this.tracks = new Map();
    this.engine = engine;
    this.roomOptions = options;
    this.setupEngine(engine);
    this.activeDeviceMap = new Map();
  }
  get lastCameraError() {
    return this.cameraError;
  }
  get lastMicrophoneError() {
    return this.microphoneError;
  }
  get isE2EEEnabled() {
    return this.encryptionType !== Encryption_Type.NONE;
  }
  getTrack(source) {
    const track = super.getTrack(source);
    if (track) {
      return track;
    }
  }
  getTrackByName(name) {
    const track = super.getTrackByName(name);
    if (track) {
      return track;
    }
  }
  /**
   * @internal
   */
  setupEngine(engine) {
    this.engine = engine;
    this.engine.client.onRemoteMuteChanged = (trackSid, muted) => {
      const pub = this.tracks.get(trackSid);
      if (!pub || !pub.track) {
        return;
      }
      if (muted) {
        pub.mute();
      } else {
        pub.unmute();
      }
    };
    this.engine.client.onSubscribedQualityUpdate = this.handleSubscribedQualityUpdate;
    this.engine.client.onLocalTrackUnpublished = this.handleLocalTrackUnpublished;
    this.engine.on(EngineEvent.Connected, this.handleReconnected).on(EngineEvent.Restarted, this.handleReconnected).on(EngineEvent.Resumed, this.handleReconnected).on(EngineEvent.Restarting, this.handleReconnecting).on(EngineEvent.Resuming, this.handleReconnecting).on(EngineEvent.Disconnected, this.handleDisconnected);
  }
  /**
   * Sets and updates the metadata of the local participant.
   * Note: this requires `canUpdateOwnMetadata` permission encoded in the token.
   * @param metadata
   */
  setMetadata(metadata) {
    var _a;
    super.setMetadata(metadata);
    this.engine.client.sendUpdateLocalMetadata(metadata, (_a = this.name) !== null && _a !== void 0 ? _a : '');
  }
  /**
   * Sets and updates the name of the local participant.
   * Note: this requires `canUpdateOwnMetadata` permission encoded in the token.
   * @param metadata
   */
  setName(name) {
    var _a;
    super.setName(name);
    this.engine.client.sendUpdateLocalMetadata((_a = this.metadata) !== null && _a !== void 0 ? _a : '', name);
  }
  /**
   * Enable or disable a participant's camera track.
   *
   * If a track has already published, it'll mute or unmute the track.
   * Resolves with a `LocalTrackPublication` instance if successful and `undefined` otherwise
   */
  setCameraEnabled(enabled, options, publishOptions) {
    return this.setTrackEnabled(Track.Source.Camera, enabled, options, publishOptions);
  }
  /**
   * Enable or disable a participant's microphone track.
   *
   * If a track has already published, it'll mute or unmute the track.
   * Resolves with a `LocalTrackPublication` instance if successful and `undefined` otherwise
   */
  setMicrophoneEnabled(enabled, options, publishOptions) {
    return this.setTrackEnabled(Track.Source.Microphone, enabled, options, publishOptions);
  }
  /**
   * Start or stop sharing a participant's screen
   * Resolves with a `LocalTrackPublication` instance if successful and `undefined` otherwise
   */
  setScreenShareEnabled(enabled, options, publishOptions) {
    return this.setTrackEnabled(Track.Source.ScreenShare, enabled, options, publishOptions);
  }
  /** @internal */
  setPermissions(permissions) {
    const prevPermissions = this.permissions;
    const changed = super.setPermissions(permissions);
    if (changed && prevPermissions) {
      this.emit(ParticipantEvent.ParticipantPermissionsChanged, prevPermissions);
    }
    return changed;
  }
  /** @internal */
  setE2EEEnabled(enabled) {
    return __awaiter(this, void 0, void 0, function* () {
      this.encryptionType = enabled ? Encryption_Type.GCM : Encryption_Type.NONE;
      yield this.republishAllTracks(undefined, false);
    });
  }
  setTrackEnabled(source, enabled, options, publishOptions) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      livekitLogger.debug('setTrackEnabled', {
        source,
        enabled
      });
      let track = this.getTrack(source);
      if (enabled) {
        if (track) {
          yield track.unmute();
        } else {
          let localTracks;
          if (this.pendingPublishing.has(source)) {
            livekitLogger.info('skipping duplicate published source', {
              source
            });
            // no-op it's already been requested
            return;
          }
          this.pendingPublishing.add(source);
          try {
            switch (source) {
              case Track.Source.Camera:
                localTracks = yield this.createTracks({
                  video: (_a = options) !== null && _a !== void 0 ? _a : true
                });
                break;
              case Track.Source.Microphone:
                localTracks = yield this.createTracks({
                  audio: (_b = options) !== null && _b !== void 0 ? _b : true
                });
                break;
              case Track.Source.ScreenShare:
                localTracks = yield this.createScreenTracks(Object.assign({}, options));
                break;
              default:
                throw new TrackInvalidError(source);
            }
            const publishPromises = [];
            for (const localTrack of localTracks) {
              livekitLogger.info('publishing track', {
                localTrack
              });
              publishPromises.push(this.publishTrack(localTrack, publishOptions));
            }
            const publishedTracks = yield Promise.all(publishPromises);
            // for screen share publications including audio, this will only return the screen share publication, not the screen share audio one
            // revisit if we want to return an array of tracks instead for v2
            [track] = publishedTracks;
          } catch (e) {
            localTracks === null || localTracks === void 0 ? void 0 : localTracks.forEach(tr => {
              tr.stop();
            });
            if (e instanceof Error && !(e instanceof TrackInvalidError)) {
              this.emit(ParticipantEvent.MediaDevicesError, e);
            }
            throw e;
          } finally {
            this.pendingPublishing.delete(source);
          }
        }
      } else if (track && track.track) {
        // screenshare cannot be muted, unpublish instead
        if (source === Track.Source.ScreenShare) {
          track = yield this.unpublishTrack(track.track);
          const screenAudioTrack = this.getTrack(Track.Source.ScreenShareAudio);
          if (screenAudioTrack && screenAudioTrack.track) {
            this.unpublishTrack(screenAudioTrack.track);
          }
        } else {
          yield track.mute();
        }
      }
      return track;
    });
  }
  /**
   * Publish both camera and microphone at the same time. This is useful for
   * displaying a single Permission Dialog box to the end user.
   */
  enableCameraAndMicrophone() {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.pendingPublishing.has(Track.Source.Camera) || this.pendingPublishing.has(Track.Source.Microphone)) {
        // no-op it's already been requested
        return;
      }
      this.pendingPublishing.add(Track.Source.Camera);
      this.pendingPublishing.add(Track.Source.Microphone);
      try {
        const tracks = yield this.createTracks({
          audio: true,
          video: true
        });
        yield Promise.all(tracks.map(track => this.publishTrack(track)));
      } finally {
        this.pendingPublishing.delete(Track.Source.Camera);
        this.pendingPublishing.delete(Track.Source.Microphone);
      }
    });
  }
  /**
   * Create local camera and/or microphone tracks
   * @param options
   * @returns
   */
  createTracks(options) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      const opts = mergeDefaultOptions(options, (_a = this.roomOptions) === null || _a === void 0 ? void 0 : _a.audioCaptureDefaults, (_b = this.roomOptions) === null || _b === void 0 ? void 0 : _b.videoCaptureDefaults);
      const constraints = constraintsForOptions(opts);
      let stream;
      try {
        stream = yield navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        if (err instanceof Error) {
          if (constraints.audio) {
            this.microphoneError = err;
          }
          if (constraints.video) {
            this.cameraError = err;
          }
        }
        throw err;
      }
      if (constraints.audio) {
        this.microphoneError = undefined;
      }
      if (constraints.video) {
        this.cameraError = undefined;
      }
      return stream.getTracks().map(mediaStreamTrack => {
        const isAudio = mediaStreamTrack.kind === 'audio';
        isAudio ? options.audio : options.video;
        let trackConstraints;
        const conOrBool = isAudio ? constraints.audio : constraints.video;
        if (typeof conOrBool !== 'boolean') {
          trackConstraints = conOrBool;
        }
        const track = mediaTrackToLocalTrack(mediaStreamTrack, trackConstraints);
        if (track.kind === Track.Kind.Video) {
          track.source = Track.Source.Camera;
        } else if (track.kind === Track.Kind.Audio) {
          track.source = Track.Source.Microphone;
        }
        track.mediaStream = stream;
        return track;
      });
    });
  }
  /**
   * Creates a screen capture tracks with getDisplayMedia().
   * A LocalVideoTrack is always created and returned.
   * If { audio: true }, and the browser supports audio capture, a LocalAudioTrack is also created.
   */
  createScreenTracks(options) {
    return __awaiter(this, void 0, void 0, function* () {
      if (options === undefined) {
        options = {};
      }
      if (options.resolution === undefined) {
        options.resolution = ScreenSharePresets.h1080fps15.resolution;
      }
      if (navigator.mediaDevices.getDisplayMedia === undefined) {
        throw new DeviceUnsupportedError('getDisplayMedia not supported');
      }
      const constraints = screenCaptureToDisplayMediaStreamOptions(options);
      const stream = yield navigator.mediaDevices.getDisplayMedia(constraints);
      const tracks = stream.getVideoTracks();
      if (tracks.length === 0) {
        throw new TrackInvalidError('no video track found');
      }
      const screenVideo = new LocalVideoTrack(tracks[0], undefined, false);
      screenVideo.source = Track.Source.ScreenShare;
      const localTracks = [screenVideo];
      if (stream.getAudioTracks().length > 0) {
        const screenAudio = new LocalAudioTrack(stream.getAudioTracks()[0], undefined, false, this.audioContext);
        screenAudio.source = Track.Source.ScreenShareAudio;
        localTracks.push(screenAudio);
      }
      return localTracks;
    });
  }
  /**
   * Publish a new track to the room
   * @param track
   * @param options
   */
  publishTrack(track, options) {
    var _a, _b, _c, _d;
    return __awaiter(this, void 0, void 0, function* () {
      yield (_a = this.reconnectFuture) === null || _a === void 0 ? void 0 : _a.promise;
      if (track instanceof LocalTrack && this.pendingPublishPromises.has(track)) {
        yield this.pendingPublishPromises.get(track);
      }
      let defaultConstraints;
      if (track instanceof MediaStreamTrack) {
        defaultConstraints = track.getConstraints();
      } else {
        // we want to access constraints directly as `track.mediaStreamTrack`
        // might be pointing to a non-device track (e.g. processed track) already
        defaultConstraints = track.constraints;
        let deviceKind = undefined;
        switch (track.source) {
          case Track.Source.Microphone:
            deviceKind = 'audioinput';
            break;
          case Track.Source.Camera:
            deviceKind = 'videoinput';
        }
        if (deviceKind && this.activeDeviceMap.has(deviceKind)) {
          defaultConstraints = Object.assign(Object.assign({}, defaultConstraints), {
            deviceId: this.activeDeviceMap.get(deviceKind)
          });
        }
      }
      // convert raw media track into audio or video track
      if (track instanceof MediaStreamTrack) {
        switch (track.kind) {
          case 'audio':
            track = new LocalAudioTrack(track, defaultConstraints, true, this.audioContext);
            break;
          case 'video':
            track = new LocalVideoTrack(track, defaultConstraints, true);
            break;
          default:
            throw new TrackInvalidError("unsupported MediaStreamTrack kind ".concat(track.kind));
        }
      }
      if (track instanceof LocalAudioTrack) {
        track.setAudioContext(this.audioContext);
      }
      // is it already published? if so skip
      let existingPublication;
      this.tracks.forEach(publication => {
        if (!publication.track) {
          return;
        }
        if (publication.track === track) {
          existingPublication = publication;
        }
      });
      if (existingPublication) {
        livekitLogger.warn('track has already been published, skipping');
        return existingPublication;
      }
      const isStereoInput = 'channelCount' in track.mediaStreamTrack.getSettings() &&
      // @ts-ignore `channelCount` on getSettings() is currently only available for Safari, but is generally the best way to determine a stereo track https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings/channelCount
      track.mediaStreamTrack.getSettings().channelCount === 2 || track.mediaStreamTrack.getConstraints().channelCount === 2;
      const isStereo = (_b = options === null || options === void 0 ? void 0 : options.forceStereo) !== null && _b !== void 0 ? _b : isStereoInput;
      // disable dtx for stereo track if not enabled explicitly
      if (isStereo) {
        if (!options) {
          options = {};
        }
        if (options.dtx === undefined) {
          livekitLogger.info("Opus DTX will be disabled for stereo tracks by default. Enable them explicitly to make it work.");
        }
        if (options.red === undefined) {
          livekitLogger.info("Opus RED will be disabled for stereo tracks by default. Enable them explicitly to make it work.");
        }
        (_c = options.dtx) !== null && _c !== void 0 ? _c : options.dtx = false;
        (_d = options.red) !== null && _d !== void 0 ? _d : options.red = false;
      }
      const opts = Object.assign(Object.assign({}, this.roomOptions.publishDefaults), options);
      // disable simulcast if e2ee is set on safari
      if (isSafari() && this.roomOptions.e2ee) {
        livekitLogger.info("End-to-end encryption is set up, simulcast publishing will be disabled on Safari");
        opts.simulcast = false;
      }
      if (opts.source) {
        track.source = opts.source;
      }
      const publishPromise = this.publish(track, opts, isStereo);
      this.pendingPublishPromises.set(track, publishPromise);
      try {
        const publication = yield publishPromise;
        return publication;
      } catch (e) {
        throw e;
      } finally {
        this.pendingPublishPromises.delete(track);
      }
    });
  }
  publish(track, opts, isStereo) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    return __awaiter(this, void 0, void 0, function* () {
      const existingTrackOfSource = Array.from(this.tracks.values()).find(publishedTrack => track instanceof LocalTrack && publishedTrack.source === track.source);
      if (existingTrackOfSource && track.source !== Track.Source.Unknown) {
        try {
          // throw an Error in order to capture the stack trace
          throw Error("publishing a second track with the same source: ".concat(track.source));
        } catch (e) {
          if (e instanceof Error) {
            livekitLogger.warn(e.message, {
              oldTrack: existingTrackOfSource,
              newTrack: track,
              trace: e.stack
            });
          }
        }
      }
      if (opts.stopMicTrackOnMute && track instanceof LocalAudioTrack) {
        track.stopOnMute = true;
      }
      if (track.source === Track.Source.ScreenShare && isFireFox()) {
        // Firefox does not work well with simulcasted screen share
        // we frequently get no data on layer 0 when enabled
        opts.simulcast = false;
      }
      // require full AV1/VP9 SVC support prior to using it
      if (opts.videoCodec === 'av1' && !supportsAV1()) {
        opts.videoCodec = undefined;
      }
      if (opts.videoCodec === 'vp9' && !supportsVP9()) {
        opts.videoCodec = undefined;
      }
      // handle track actions
      track.on(TrackEvent.Muted, this.onTrackMuted);
      track.on(TrackEvent.Unmuted, this.onTrackUnmuted);
      track.on(TrackEvent.Ended, this.handleTrackEnded);
      track.on(TrackEvent.UpstreamPaused, this.onTrackUpstreamPaused);
      track.on(TrackEvent.UpstreamResumed, this.onTrackUpstreamResumed);
      // create track publication from track
      const req = new AddTrackRequest({
        // get local track id for use during publishing
        cid: track.mediaStreamTrack.id,
        name: opts.name,
        type: Track.kindToProto(track.kind),
        muted: track.isMuted,
        source: Track.sourceToProto(track.source),
        disableDtx: !((_a = opts.dtx) !== null && _a !== void 0 ? _a : true),
        encryption: this.encryptionType,
        stereo: isStereo,
        disableRed: this.isE2EEEnabled || !((_b = opts.red) !== null && _b !== void 0 ? _b : true)
      });
      // compute encodings and layers for video
      let encodings;
      let simEncodings;
      if (track.kind === Track.Kind.Video) {
        let dims = {
          width: 0,
          height: 0
        };
        try {
          dims = yield track.waitForDimensions();
        } catch (e) {
          // use defaults, it's quite painful for congestion control without simulcast
          // so using default dims according to publish settings
          const defaultRes = (_d = (_c = this.roomOptions.videoCaptureDefaults) === null || _c === void 0 ? void 0 : _c.resolution) !== null && _d !== void 0 ? _d : VideoPresets.h720.resolution;
          dims = {
            width: defaultRes.width,
            height: defaultRes.height
          };
          // log failure
          livekitLogger.error('could not determine track dimensions, using defaults', dims);
        }
        // width and height should be defined for video
        req.width = dims.width;
        req.height = dims.height;
        // for svc codecs, disable simulcast and use vp8 for backup codec
        if (track instanceof LocalVideoTrack) {
          if (isSVCCodec(opts.videoCodec)) {
            // set scalabilityMode to 'L3T3_KEY' by default
            opts.scalabilityMode = (_e = opts.scalabilityMode) !== null && _e !== void 0 ? _e : 'L3T3_KEY';
          }
          // set up backup
          if (opts.videoCodec && opts.backupCodec && opts.videoCodec !== opts.backupCodec.codec) {
            if (!this.roomOptions.dynacast) {
              this.roomOptions.dynacast = true;
            }
            const simOpts = Object.assign({}, opts);
            simOpts.simulcast = true;
            simEncodings = computeTrackBackupEncodings(track, opts.backupCodec.codec, simOpts);
            req.simulcastCodecs = [new SimulcastCodec({
              codec: opts.videoCodec,
              cid: track.mediaStreamTrack.id,
              enableSimulcastLayers: true
            }), new SimulcastCodec({
              codec: opts.backupCodec.codec,
              cid: '',
              enableSimulcastLayers: true
            })];
          } else if (opts.videoCodec) {
            // pass codec info to sfu so it can prefer codec for the client which don't support
            // setCodecPreferences
            req.simulcastCodecs = [new SimulcastCodec({
              codec: opts.videoCodec,
              cid: track.mediaStreamTrack.id,
              enableSimulcastLayers: (_f = opts.simulcast) !== null && _f !== void 0 ? _f : false
            })];
          }
        }
        encodings = computeVideoEncodings(track.source === Track.Source.ScreenShare, dims.width, dims.height, opts);
        req.layers = videoLayersFromEncodings(req.width, req.height, encodings, isSVCCodec(opts.videoCodec));
      } else if (track.kind === Track.Kind.Audio) {
        encodings = [{
          maxBitrate: (_h = (_g = opts.audioPreset) === null || _g === void 0 ? void 0 : _g.maxBitrate) !== null && _h !== void 0 ? _h : opts.audioBitrate,
          priority: (_k = (_j = opts.audioPreset) === null || _j === void 0 ? void 0 : _j.priority) !== null && _k !== void 0 ? _k : 'high',
          networkPriority: (_m = (_l = opts.audioPreset) === null || _l === void 0 ? void 0 : _l.priority) !== null && _m !== void 0 ? _m : 'high'
        }];
      }
      if (!this.engine || this.engine.isClosed) {
        throw new UnexpectedConnectionState('cannot publish track when not connected');
      }
      const ti = yield this.engine.addTrack(req);
      let primaryCodecSupported = false;
      let backupCodecSupported = false;
      ti.codecs.forEach(c => {
        if (isCodecEqual(c.mimeType, opts.videoCodec)) {
          primaryCodecSupported = true;
        } else if (opts.backupCodec && isCodecEqual(c.mimeType, opts.backupCodec.codec)) {
          backupCodecSupported = true;
        }
      });
      if (req.simulcastCodecs.length > 0) {
        if (!primaryCodecSupported && !backupCodecSupported) {
          throw Error('cannot publish track, codec not supported by server');
        }
        if (!primaryCodecSupported && opts.backupCodec) {
          const backupCodec = opts.backupCodec;
          opts = Object.assign({}, opts);
          livekitLogger.debug("primary codec ".concat(opts.videoCodec, " not supported, fallback to ").concat(backupCodec.codec));
          opts.videoCodec = backupCodec.codec;
          opts.videoEncoding = backupCodec.encoding;
          encodings = simEncodings;
        }
      }
      const publication = new LocalTrackPublication(track.kind, ti, track);
      // save options for when it needs to be republished again
      publication.options = opts;
      track.sid = ti.sid;
      if (!this.engine.publisher) {
        throw new UnexpectedConnectionState('publisher is closed');
      }
      livekitLogger.debug("publishing ".concat(track.kind, " with encodings"), {
        encodings,
        trackInfo: ti
      });
      // store RTPSender
      track.sender = yield this.engine.createSender(track, opts, encodings);
      if (encodings) {
        if (isFireFox() && track.kind === Track.Kind.Audio) {
          /* Refer to RFC https://datatracker.ietf.org/doc/html/rfc7587#section-6.1,
             livekit-server uses maxaveragebitrate=510000in the answer sdp to permit client to
             publish high quality audio track. But firefox always uses this value as the actual
             bitrates, causing the audio bitrates to rise to 510Kbps in any stereo case unexpectedly.
             So the client need to modify maxaverragebitrates in answer sdp to user provided value to
             fix the issue.
           */
          let trackTransceiver = undefined;
          for (const transceiver of this.engine.publisher.pc.getTransceivers()) {
            if (transceiver.sender === track.sender) {
              trackTransceiver = transceiver;
              break;
            }
          }
          if (trackTransceiver) {
            this.engine.publisher.setTrackCodecBitrate({
              transceiver: trackTransceiver,
              codec: 'opus',
              maxbr: ((_o = encodings[0]) === null || _o === void 0 ? void 0 : _o.maxBitrate) ? encodings[0].maxBitrate / 1000 : 0
            });
          }
        } else if (track.codec && isSVCCodec(track.codec) && ((_p = encodings[0]) === null || _p === void 0 ? void 0 : _p.maxBitrate)) {
          this.engine.publisher.setTrackCodecBitrate({
            cid: req.cid,
            codec: track.codec,
            maxbr: encodings[0].maxBitrate / 1000
          });
        }
      }
      yield this.engine.negotiate();
      if (track instanceof LocalVideoTrack) {
        track.startMonitor(this.engine.client);
      } else if (track instanceof LocalAudioTrack) {
        track.startMonitor();
      }
      this.addTrackPublication(publication);
      // send event for publication
      this.emit(ParticipantEvent.LocalTrackPublished, publication);
      return publication;
    });
  }
  get isLocal() {
    return true;
  }
  /** @internal
   * publish additional codec to existing track
   */
  publishAdditionalCodecForTrack(track, videoCodec, options) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      // is it not published? if so skip
      let existingPublication;
      this.tracks.forEach(publication => {
        if (!publication.track) {
          return;
        }
        if (publication.track === track) {
          existingPublication = publication;
        }
      });
      if (!existingPublication) {
        throw new TrackInvalidError('track is not published');
      }
      if (!(track instanceof LocalVideoTrack)) {
        throw new TrackInvalidError('track is not a video track');
      }
      const opts = Object.assign(Object.assign({}, (_a = this.roomOptions) === null || _a === void 0 ? void 0 : _a.publishDefaults), options);
      const encodings = computeTrackBackupEncodings(track, videoCodec, opts);
      if (!encodings) {
        livekitLogger.info("backup codec has been disabled, ignoring request to add additional codec for track");
        return;
      }
      const simulcastTrack = track.addSimulcastTrack(videoCodec, encodings);
      const req = new AddTrackRequest({
        cid: simulcastTrack.mediaStreamTrack.id,
        type: Track.kindToProto(track.kind),
        muted: track.isMuted,
        source: Track.sourceToProto(track.source),
        sid: track.sid,
        simulcastCodecs: [{
          codec: opts.videoCodec,
          cid: simulcastTrack.mediaStreamTrack.id,
          enableSimulcastLayers: opts.simulcast
        }]
      });
      req.layers = videoLayersFromEncodings(req.width, req.height, encodings);
      if (!this.engine || this.engine.isClosed) {
        throw new UnexpectedConnectionState('cannot publish track when not connected');
      }
      const ti = yield this.engine.addTrack(req);
      yield this.engine.createSimulcastSender(track, simulcastTrack, opts, encodings);
      yield this.engine.negotiate();
      livekitLogger.debug("published ".concat(videoCodec, " for track ").concat(track.sid), {
        encodings,
        trackInfo: ti
      });
    });
  }
  unpublishTrack(track, stopOnUnpublish) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      // look through all published tracks to find the right ones
      const publication = this.getPublicationForTrack(track);
      livekitLogger.debug('unpublishing track', {
        track,
        method: 'unpublishTrack'
      });
      if (!publication || !publication.track) {
        livekitLogger.warn('track was not unpublished because no publication was found', {
          track,
          method: 'unpublishTrack'
        });
        return undefined;
      }
      track = publication.track;
      track.off(TrackEvent.Muted, this.onTrackMuted);
      track.off(TrackEvent.Unmuted, this.onTrackUnmuted);
      track.off(TrackEvent.Ended, this.handleTrackEnded);
      track.off(TrackEvent.UpstreamPaused, this.onTrackUpstreamPaused);
      track.off(TrackEvent.UpstreamResumed, this.onTrackUpstreamResumed);
      if (stopOnUnpublish === undefined) {
        stopOnUnpublish = (_b = (_a = this.roomOptions) === null || _a === void 0 ? void 0 : _a.stopLocalTrackOnUnpublish) !== null && _b !== void 0 ? _b : true;
      }
      if (stopOnUnpublish) {
        track.stop();
      }
      let negotiationNeeded = false;
      const trackSender = track.sender;
      track.sender = undefined;
      if (this.engine.publisher && this.engine.publisher.pc.connectionState !== 'closed' && trackSender) {
        try {
          for (const transceiver of this.engine.publisher.pc.getTransceivers()) {
            // if sender is not currently sending (after replaceTrack(null))
            // removeTrack would have no effect.
            // to ensure we end up successfully removing the track, manually set
            // the transceiver to inactive
            if (transceiver.sender === trackSender) {
              transceiver.direction = 'inactive';
              negotiationNeeded = true;
            }
          }
          if (this.engine.removeTrack(trackSender)) {
            negotiationNeeded = true;
          }
          if (track instanceof LocalVideoTrack) {
            for (const [, trackInfo] of track.simulcastCodecs) {
              if (trackInfo.sender) {
                if (this.engine.removeTrack(trackInfo.sender)) {
                  negotiationNeeded = true;
                }
                trackInfo.sender = undefined;
              }
            }
            track.simulcastCodecs.clear();
          }
        } catch (e) {
          livekitLogger.warn('failed to unpublish track', {
            error: e,
            method: 'unpublishTrack'
          });
        }
      }
      // remove from our maps
      this.tracks.delete(publication.trackSid);
      switch (publication.kind) {
        case Track.Kind.Audio:
          this.audioTracks.delete(publication.trackSid);
          break;
        case Track.Kind.Video:
          this.videoTracks.delete(publication.trackSid);
          break;
      }
      this.emit(ParticipantEvent.LocalTrackUnpublished, publication);
      publication.setTrack(undefined);
      if (negotiationNeeded) {
        yield this.engine.negotiate();
      }
      return publication;
    });
  }
  unpublishTracks(tracks) {
    return __awaiter(this, void 0, void 0, function* () {
      const results = yield Promise.all(tracks.map(track => this.unpublishTrack(track)));
      return results.filter(track => track instanceof LocalTrackPublication);
    });
  }
  republishAllTracks(options) {
    let restartTracks = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
    return __awaiter(this, void 0, void 0, function* () {
      const localPubs = [];
      this.tracks.forEach(pub => {
        if (pub.track) {
          if (options) {
            pub.options = Object.assign(Object.assign({}, pub.options), options);
          }
          localPubs.push(pub);
        }
      });
      yield Promise.all(localPubs.map(pub => __awaiter(this, void 0, void 0, function* () {
        const track = pub.track;
        yield this.unpublishTrack(track, false);
        if (restartTracks && !track.isMuted && (track instanceof LocalAudioTrack || track instanceof LocalVideoTrack) && !track.isUserProvided) {
          // generally we need to restart the track before publishing, often a full reconnect
          // is necessary because computer had gone to sleep.
          livekitLogger.debug('restarting existing track', {
            track: pub.trackSid
          });
          yield track.restartTrack();
        }
        yield this.publishTrack(track, pub.options);
      })));
    });
  }
  publishData(data, kind) {
    let publishOptions = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    return __awaiter(this, void 0, void 0, function* () {
      const destination = Array.isArray(publishOptions) ? publishOptions : publishOptions === null || publishOptions === void 0 ? void 0 : publishOptions.destination;
      const destinationSids = [];
      const topic = !Array.isArray(publishOptions) ? publishOptions.topic : undefined;
      if (destination !== undefined) {
        destination.forEach(val => {
          if (val instanceof RemoteParticipant) {
            destinationSids.push(val.sid);
          } else {
            destinationSids.push(val);
          }
        });
      }
      const packet = new DataPacket({
        kind,
        value: {
          case: 'user',
          value: new UserPacket({
            participantSid: this.sid,
            payload: data,
            destinationSids: destinationSids,
            topic
          })
        }
      });
      yield this.engine.sendDataPacket(packet, kind);
    });
  }
  /**
   * Control who can subscribe to LocalParticipant's published tracks.
   *
   * By default, all participants can subscribe. This allows fine-grained control over
   * who is able to subscribe at a participant and track level.
   *
   * Note: if access is given at a track-level (i.e. both [allParticipantsAllowed] and
   * [ParticipantTrackPermission.allTracksAllowed] are false), any newer published tracks
   * will not grant permissions to any participants and will require a subsequent
   * permissions update to allow subscription.
   *
   * @param allParticipantsAllowed Allows all participants to subscribe all tracks.
   *  Takes precedence over [[participantTrackPermissions]] if set to true.
   *  By default this is set to true.
   * @param participantTrackPermissions Full list of individual permissions per
   *  participant/track. Any omitted participants will not receive any permissions.
   */
  setTrackSubscriptionPermissions(allParticipantsAllowed) {
    let participantTrackPermissions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
    this.participantTrackPermissions = participantTrackPermissions;
    this.allParticipantsAllowedToSubscribe = allParticipantsAllowed;
    if (this.engine.client.isConnected) {
      this.updateTrackSubscriptionPermissions();
    }
  }
  /** @internal */
  updateInfo(info) {
    if (info.sid !== this.sid) {
      // drop updates that specify a wrong sid.
      // the sid for local participant is only explicitly set on join and full reconnect
      return false;
    }
    if (!super.updateInfo(info)) {
      return false;
    }
    // reconcile track mute status.
    // if server's track mute status doesn't match actual, we'll have to update
    // the server's copy
    info.tracks.forEach(ti => {
      var _a, _b;
      const pub = this.tracks.get(ti.sid);
      if (pub) {
        const mutedOnServer = pub.isMuted || ((_b = (_a = pub.track) === null || _a === void 0 ? void 0 : _a.isUpstreamPaused) !== null && _b !== void 0 ? _b : false);
        if (mutedOnServer !== ti.muted) {
          livekitLogger.debug('updating server mute state after reconcile', {
            sid: ti.sid,
            muted: mutedOnServer
          });
          this.engine.client.sendMuteTrack(ti.sid, mutedOnServer);
        }
      }
    });
    return true;
  }
  getPublicationForTrack(track) {
    let publication;
    this.tracks.forEach(pub => {
      const localTrack = pub.track;
      if (!localTrack) {
        return;
      }
      // this looks overly complicated due to this object tree
      if (track instanceof MediaStreamTrack) {
        if (localTrack instanceof LocalAudioTrack || localTrack instanceof LocalVideoTrack) {
          if (localTrack.mediaStreamTrack === track) {
            publication = pub;
          }
        }
      } else if (track === localTrack) {
        publication = pub;
      }
    });
    return publication;
  }
  /** @internal */
  publishedTracksInfo() {
    const infos = [];
    this.tracks.forEach(track => {
      if (track.track !== undefined) {
        infos.push(new TrackPublishedResponse({
          cid: track.track.mediaStreamID,
          track: track.trackInfo
        }));
      }
    });
    return infos;
  }
  /** @internal */
  dataChannelsInfo() {
    const infos = [];
    const getInfo = (dc, target) => {
      if ((dc === null || dc === void 0 ? void 0 : dc.id) !== undefined && dc.id !== null) {
        infos.push(new DataChannelInfo({
          label: dc.label,
          id: dc.id,
          target
        }));
      }
    };
    getInfo(this.engine.dataChannelForKind(DataPacket_Kind.LOSSY), SignalTarget.PUBLISHER);
    getInfo(this.engine.dataChannelForKind(DataPacket_Kind.RELIABLE), SignalTarget.PUBLISHER);
    getInfo(this.engine.dataChannelForKind(DataPacket_Kind.LOSSY, true), SignalTarget.SUBSCRIBER);
    getInfo(this.engine.dataChannelForKind(DataPacket_Kind.RELIABLE, true), SignalTarget.SUBSCRIBER);
    return infos;
  }
}

var ConnectionState;
(function (ConnectionState) {
  ConnectionState["Disconnected"] = "disconnected";
  ConnectionState["Connecting"] = "connecting";
  ConnectionState["Connected"] = "connected";
  ConnectionState["Reconnecting"] = "reconnecting";
})(ConnectionState || (ConnectionState = {}));
const connectionReconcileFrequency = 2 * 1000;
/** @deprecated RoomState has been renamed to [[ConnectionState]] */
const RoomState = ConnectionState;
/**
 * In LiveKit, a room is the logical grouping for a list of participants.
 * Participants in a room can publish tracks, and subscribe to others' tracks.
 *
 * a Room fires [[RoomEvent | RoomEvents]].
 *
 * @noInheritDoc
 */
class Room extends eventsExports.EventEmitter {
  /**
   * Creates a new Room, the primary construct for a LiveKit session.
   * @param options
   */
  constructor(options) {
    var _this;
    var _a;
    super();
    _this = this;
    this.state = ConnectionState.Disconnected;
    /**
     * list of participants that are actively speaking. when this changes
     * a [[RoomEvent.ActiveSpeakersChanged]] event is fired
     */
    this.activeSpeakers = [];
    /** reflects the sender encryption status of the local participant */
    this.isE2EEEnabled = false;
    this.audioEnabled = true;
    this.connect = (url, token, opts) => __awaiter(this, void 0, void 0, function* () {
      var _b;
      // In case a disconnect called happened right before the connect call, make sure the disconnect is completed first by awaiting its lock
      const unlockDisconnect = yield this.disconnectLock.lock();
      if (this.state === ConnectionState.Connected) {
        // when the state is reconnecting or connected, this function returns immediately
        livekitLogger.info("already connected to room ".concat(this.name));
        unlockDisconnect();
        return Promise.resolve();
      }
      if (this.connectFuture) {
        unlockDisconnect();
        return this.connectFuture.promise;
      }
      this.setAndEmitConnectionState(ConnectionState.Connecting);
      if (((_b = this.regionUrlProvider) === null || _b === void 0 ? void 0 : _b.getServerUrl().toString()) !== url) {
        this.regionUrl = undefined;
        this.regionUrlProvider = undefined;
      }
      if (isCloud(new URL(url))) {
        if (this.regionUrlProvider === undefined) {
          this.regionUrlProvider = new RegionUrlProvider(url, token);
        } else {
          this.regionUrlProvider.updateToken(token);
        }
        // trigger the first fetch without waiting for a response
        // if initial connection fails, this will speed up picking regional url
        // on subsequent runs
        this.regionUrlProvider.fetchRegionSettings().catch(e => {
          livekitLogger.warn('could not fetch region settings', {
            error: e
          });
        });
      }
      const connectFn = (resolve, reject, regionUrl) => __awaiter(this, void 0, void 0, function* () {
        var _c;
        if (this.abortController) {
          this.abortController.abort();
        }
        // explicit creation as local var needed to satisfy TS compiler when passing it to `attemptConnection` further down
        const abortController = new AbortController();
        this.abortController = abortController;
        // at this point the intention to connect has been signalled so we can allow cancelling of the connection via disconnect() again
        unlockDisconnect === null || unlockDisconnect === void 0 ? void 0 : unlockDisconnect();
        try {
          yield this.attemptConnection(regionUrl !== null && regionUrl !== void 0 ? regionUrl : url, token, opts, abortController);
          this.abortController = undefined;
          resolve();
        } catch (e) {
          if (this.regionUrlProvider && e instanceof ConnectionError && e.reason !== 3 /* ConnectionErrorReason.Cancelled */ && e.reason !== 0 /* ConnectionErrorReason.NotAllowed */) {
            let nextUrl = null;
            try {
              nextUrl = yield this.regionUrlProvider.getNextBestRegionUrl((_c = this.abortController) === null || _c === void 0 ? void 0 : _c.signal);
            } catch (error) {
              if (error instanceof ConnectionError && (error.status === 401 || error.reason === 3 /* ConnectionErrorReason.Cancelled */)) {
                reject(error);
                return;
              }
            }
            if (nextUrl) {
              livekitLogger.info('initial connection failed, retrying with another region', {
                nextUrl
              });
              yield connectFn(resolve, reject, nextUrl);
            } else {
              reject(e);
            }
          } else {
            reject(e);
          }
        }
      });
      const regionUrl = this.regionUrl;
      this.regionUrl = undefined;
      this.connectFuture = new Future((resolve, reject) => {
        connectFn(resolve, reject, regionUrl);
      }, () => {
        this.clearConnectionFutures();
      });
      return this.connectFuture.promise;
    });
    this.connectSignal = (url, token, engine, connectOptions, roomOptions, abortController) => __awaiter(this, void 0, void 0, function* () {
      const joinResponse = yield engine.join(url, token, {
        autoSubscribe: connectOptions.autoSubscribe,
        publishOnly: connectOptions.publishOnly,
        adaptiveStream: typeof roomOptions.adaptiveStream === 'object' ? true : roomOptions.adaptiveStream,
        maxRetries: connectOptions.maxRetries,
        e2eeEnabled: !!this.e2eeManager,
        websocketTimeout: connectOptions.websocketTimeout
      }, abortController.signal);
      let serverInfo = joinResponse.serverInfo;
      if (!serverInfo) {
        serverInfo = {
          version: joinResponse.serverVersion,
          region: joinResponse.serverRegion
        };
      }
      livekitLogger.debug("connected to Livekit Server ".concat(Object.entries(serverInfo).map(_ref => {
        let [key, value] = _ref;
        return "".concat(key, ": ").concat(value);
      }).join(', ')));
      if (!joinResponse.serverVersion) {
        throw new UnsupportedServer('unknown server version');
      }
      if (joinResponse.serverVersion === '0.15.1' && this.options.dynacast) {
        livekitLogger.debug('disabling dynacast due to server version');
        // dynacast has a bug in 0.15.1, so we cannot use it then
        roomOptions.dynacast = false;
      }
      return joinResponse;
    });
    this.applyJoinResponse = joinResponse => {
      const pi = joinResponse.participant;
      this.localParticipant.sid = pi.sid;
      this.localParticipant.identity = pi.identity;
      // populate remote participants, these should not trigger new events
      this.handleParticipantUpdates([pi, ...joinResponse.otherParticipants]);
      if (joinResponse.room) {
        this.handleRoomUpdate(joinResponse.room);
      }
      if (this.options.e2ee && this.e2eeManager) {
        this.e2eeManager.setSifTrailer(joinResponse.sifTrailer);
      }
    };
    this.attemptConnection = (url, token, opts, abortController) => __awaiter(this, void 0, void 0, function* () {
      var _d, _e;
      if (this.state === ConnectionState.Reconnecting) {
        livekitLogger.info('Reconnection attempt replaced by new connection attempt');
        // make sure we close and recreate the existing engine in order to get rid of any potentially ongoing reconnection attempts
        this.recreateEngine();
      } else {
        // create engine if previously disconnected
        this.maybeCreateEngine();
      }
      if ((_d = this.regionUrlProvider) === null || _d === void 0 ? void 0 : _d.isCloud()) {
        this.engine.setRegionUrlProvider(this.regionUrlProvider);
      }
      this.acquireAudioContext();
      this.connOptions = Object.assign(Object.assign({}, roomConnectOptionDefaults), opts);
      if (this.connOptions.rtcConfig) {
        this.engine.rtcConfig = this.connOptions.rtcConfig;
      }
      if (this.connOptions.peerConnectionTimeout) {
        this.engine.peerConnectionTimeout = this.connOptions.peerConnectionTimeout;
      }
      try {
        const joinResponse = yield this.connectSignal(url, token, this.engine, this.connOptions, this.options, abortController);
        this.applyJoinResponse(joinResponse);
        // forward metadata changed for the local participant
        this.setupLocalParticipantEvents();
        this.emit(RoomEvent.SignalConnected);
      } catch (err) {
        this.recreateEngine();
        this.handleDisconnect(this.options.stopLocalTrackOnUnpublish);
        const resultingError = new ConnectionError("could not establish signal connection");
        if (err instanceof Error) {
          resultingError.message = "".concat(resultingError.message, ": ").concat(err.message);
        }
        if (err instanceof ConnectionError) {
          resultingError.reason = err.reason;
          resultingError.status = err.status;
        }
        livekitLogger.debug("error trying to establish signal connection", {
          error: err
        });
        throw resultingError;
      }
      if (abortController.signal.aborted) {
        this.recreateEngine();
        this.handleDisconnect(this.options.stopLocalTrackOnUnpublish);
        throw new ConnectionError("Connection attempt aborted");
      }
      try {
        yield this.engine.waitForPCInitialConnection(this.connOptions.peerConnectionTimeout, abortController);
      } catch (e) {
        this.recreateEngine();
        this.handleDisconnect(this.options.stopLocalTrackOnUnpublish);
        throw e;
      }
      // also hook unload event
      if (isWeb() && this.options.disconnectOnPageLeave) {
        // capturing both 'pagehide' and 'beforeunload' to capture broadest set of browser behaviors
        window.addEventListener('pagehide', this.onPageLeave);
        window.addEventListener('beforeunload', this.onPageLeave);
      }
      if (isWeb()) {
        document.addEventListener('freeze', this.onPageLeave);
        (_e = navigator.mediaDevices) === null || _e === void 0 ? void 0 : _e.addEventListener('devicechange', this.handleDeviceChange);
      }
      this.setAndEmitConnectionState(ConnectionState.Connected);
      this.emit(RoomEvent.Connected);
      this.registerConnectionReconcile();
    });
    /**
     * disconnects the room, emits [[RoomEvent.Disconnected]]
     */
    this.disconnect = function () {
      let stopTracks = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;
      return __awaiter(_this, void 0, void 0, function* () {
        var _f, _g, _h, _j;
        const unlock = yield this.disconnectLock.lock();
        try {
          if (this.state === ConnectionState.Disconnected) {
            livekitLogger.debug('already disconnected');
            return;
          }
          livekitLogger.info('disconnect from room', {
            identity: this.localParticipant.identity
          });
          if (this.state === ConnectionState.Connecting || this.state === ConnectionState.Reconnecting) {
            // try aborting pending connection attempt
            livekitLogger.warn('abort connection attempt');
            (_f = this.abortController) === null || _f === void 0 ? void 0 : _f.abort();
            // in case the abort controller didn't manage to cancel the connection attempt, reject the connect promise explicitly
            (_h = (_g = this.connectFuture) === null || _g === void 0 ? void 0 : _g.reject) === null || _h === void 0 ? void 0 : _h.call(_g, new ConnectionError('Client initiated disconnect'));
            this.connectFuture = undefined;
          }
          // send leave
          if ((_j = this.engine) === null || _j === void 0 ? void 0 : _j.client.isConnected) {
            yield this.engine.client.sendLeave();
          }
          // close engine (also closes client)
          if (this.engine) {
            yield this.engine.close();
          }
          this.handleDisconnect(stopTracks, DisconnectReason.CLIENT_INITIATED);
          /* @ts-ignore */
          this.engine = undefined;
        } finally {
          unlock();
        }
      });
    };
    this.onPageLeave = () => __awaiter(this, void 0, void 0, function* () {
      yield this.disconnect();
    });
    this.handleRestarting = () => {
      this.clearConnectionReconcile();
      // also unwind existing participants & existing subscriptions
      for (const p of this.participants.values()) {
        this.handleParticipantDisconnected(p.sid, p);
      }
      if (this.setAndEmitConnectionState(ConnectionState.Reconnecting)) {
        this.emit(RoomEvent.Reconnecting);
      }
    };
    this.handleSignalRestarted = joinResponse => __awaiter(this, void 0, void 0, function* () {
      livekitLogger.debug("signal reconnected to server", {
        region: joinResponse.serverRegion
      });
      this.cachedParticipantSids = [];
      this.applyJoinResponse(joinResponse);
      try {
        // unpublish & republish tracks
        const localPubs = [];
        this.localParticipant.tracks.forEach(pub => {
          if (pub.track) {
            localPubs.push(pub);
          }
        });
        yield Promise.all(localPubs.map(pub => __awaiter(this, void 0, void 0, function* () {
          const track = pub.track;
          this.localParticipant.unpublishTrack(track, false);
          if (!track.isMuted) {
            if ((track instanceof LocalAudioTrack || track instanceof LocalVideoTrack) && track.source !== Track.Source.ScreenShare && track.source !== Track.Source.ScreenShareAudio && !track.isUserProvided) {
              // we need to restart the track before publishing, often a full reconnect
              // is necessary because computer had gone to sleep.
              livekitLogger.debug('restarting existing track', {
                track: pub.trackSid
              });
              yield track.restartTrack();
            }
            livekitLogger.debug('publishing new track', {
              track: pub.trackSid
            });
            yield this.localParticipant.publishTrack(track, pub.options);
          }
        })));
      } catch (error) {
        livekitLogger.error('error trying to re-publish tracks after reconnection', {
          error
        });
      }
      try {
        yield this.engine.waitForRestarted();
        livekitLogger.debug("fully reconnected to server", {
          region: joinResponse.serverRegion
        });
      } catch (_k) {
        // reconnection failed, handleDisconnect is being invoked already, just return here
        return;
      }
      this.setAndEmitConnectionState(ConnectionState.Connected);
      this.emit(RoomEvent.Reconnected);
      this.registerConnectionReconcile();
      // emit participant connected events after connection has been re-established
      this.participants.forEach(participant => {
        this.emit(RoomEvent.ParticipantConnected, participant);
      });
    });
    this.handleParticipantUpdates = participantInfos => {
      // handle changes to participant state, and send events
      participantInfos.forEach(info => {
        if (info.identity === this.localParticipant.identity) {
          this.localParticipant.updateInfo(info);
          return;
        }
        // ensure identity <=> sid mapping
        const sid = this.identityToSid.get(info.identity);
        if (sid && sid !== info.sid) {
          // sid had changed, need to remove previous participant
          this.handleParticipantDisconnected(sid, this.participants.get(sid));
        }
        let remoteParticipant = this.participants.get(info.sid);
        const isNewParticipant = !remoteParticipant;
        // when it's disconnected, send updates
        if (info.state === ParticipantInfo_State.DISCONNECTED) {
          this.handleParticipantDisconnected(info.sid, remoteParticipant);
        } else {
          // create participant if doesn't exist
          remoteParticipant = this.getOrCreateParticipant(info.sid, info);
          if (!isNewParticipant) {
            // just update, no events
            remoteParticipant.updateInfo(info);
          }
        }
      });
    };
    // updates are sent only when there's a change to speaker ordering
    this.handleActiveSpeakersUpdate = speakers => {
      const activeSpeakers = [];
      const seenSids = {};
      speakers.forEach(speaker => {
        seenSids[speaker.sid] = true;
        if (speaker.sid === this.localParticipant.sid) {
          this.localParticipant.audioLevel = speaker.level;
          this.localParticipant.setIsSpeaking(true);
          activeSpeakers.push(this.localParticipant);
        } else {
          const p = this.participants.get(speaker.sid);
          if (p) {
            p.audioLevel = speaker.level;
            p.setIsSpeaking(true);
            activeSpeakers.push(p);
          }
        }
      });
      if (!seenSids[this.localParticipant.sid]) {
        this.localParticipant.audioLevel = 0;
        this.localParticipant.setIsSpeaking(false);
      }
      this.participants.forEach(p => {
        if (!seenSids[p.sid]) {
          p.audioLevel = 0;
          p.setIsSpeaking(false);
        }
      });
      this.activeSpeakers = activeSpeakers;
      this.emitWhenConnected(RoomEvent.ActiveSpeakersChanged, activeSpeakers);
    };
    // process list of changed speakers
    this.handleSpeakersChanged = speakerUpdates => {
      const lastSpeakers = new Map();
      this.activeSpeakers.forEach(p => {
        lastSpeakers.set(p.sid, p);
      });
      speakerUpdates.forEach(speaker => {
        let p = this.participants.get(speaker.sid);
        if (speaker.sid === this.localParticipant.sid) {
          p = this.localParticipant;
        }
        if (!p) {
          return;
        }
        p.audioLevel = speaker.level;
        p.setIsSpeaking(speaker.active);
        if (speaker.active) {
          lastSpeakers.set(speaker.sid, p);
        } else {
          lastSpeakers.delete(speaker.sid);
        }
      });
      const activeSpeakers = Array.from(lastSpeakers.values());
      activeSpeakers.sort((a, b) => b.audioLevel - a.audioLevel);
      this.activeSpeakers = activeSpeakers;
      this.emitWhenConnected(RoomEvent.ActiveSpeakersChanged, activeSpeakers);
    };
    this.handleStreamStateUpdate = streamStateUpdate => {
      streamStateUpdate.streamStates.forEach(streamState => {
        const participant = this.participants.get(streamState.participantSid);
        if (!participant) {
          return;
        }
        const pub = participant.getTrackPublication(streamState.trackSid);
        if (!pub || !pub.track) {
          return;
        }
        pub.track.streamState = Track.streamStateFromProto(streamState.state);
        participant.emit(ParticipantEvent.TrackStreamStateChanged, pub, pub.track.streamState);
        this.emitWhenConnected(RoomEvent.TrackStreamStateChanged, pub, pub.track.streamState, participant);
      });
    };
    this.handleSubscriptionPermissionUpdate = update => {
      const participant = this.participants.get(update.participantSid);
      if (!participant) {
        return;
      }
      const pub = participant.getTrackPublication(update.trackSid);
      if (!pub) {
        return;
      }
      pub.setAllowed(update.allowed);
    };
    this.handleSubscriptionError = update => {
      const participant = Array.from(this.participants.values()).find(p => p.tracks.has(update.trackSid));
      if (!participant) {
        return;
      }
      const pub = participant.getTrackPublication(update.trackSid);
      if (!pub) {
        return;
      }
      pub.setSubscriptionError(update.err);
    };
    this.handleDataPacket = (userPacket, kind) => {
      // find the participant
      const participant = this.participants.get(userPacket.participantSid);
      this.emit(RoomEvent.DataReceived, userPacket.payload, participant, kind, userPacket.topic);
      // also emit on the participant
      participant === null || participant === void 0 ? void 0 : participant.emit(ParticipantEvent.DataReceived, userPacket.payload, kind);
    };
    this.handleAudioPlaybackStarted = () => {
      if (this.canPlaybackAudio) {
        return;
      }
      this.audioEnabled = true;
      this.emit(RoomEvent.AudioPlaybackStatusChanged, true);
    };
    this.handleAudioPlaybackFailed = e => {
      livekitLogger.warn('could not playback audio', e);
      if (!this.canPlaybackAudio) {
        return;
      }
      this.audioEnabled = false;
      this.emit(RoomEvent.AudioPlaybackStatusChanged, false);
    };
    this.handleDeviceChange = () => __awaiter(this, void 0, void 0, function* () {
      this.emit(RoomEvent.MediaDevicesChanged);
    });
    this.handleRoomUpdate = room => {
      const oldRoom = this.roomInfo;
      this.roomInfo = room;
      if (oldRoom && oldRoom.metadata !== room.metadata) {
        this.emitWhenConnected(RoomEvent.RoomMetadataChanged, room.metadata);
      }
      if ((oldRoom === null || oldRoom === void 0 ? void 0 : oldRoom.activeRecording) !== room.activeRecording) {
        this.emitWhenConnected(RoomEvent.RecordingStatusChanged, room.activeRecording);
      }
    };
    this.handleConnectionQualityUpdate = update => {
      update.updates.forEach(info => {
        if (info.participantSid === this.localParticipant.sid) {
          this.localParticipant.setConnectionQuality(info.quality);
          return;
        }
        const participant = this.participants.get(info.participantSid);
        if (participant) {
          participant.setConnectionQuality(info.quality);
        }
      });
    };
    this.onLocalParticipantMetadataChanged = metadata => {
      this.emit(RoomEvent.ParticipantMetadataChanged, metadata, this.localParticipant);
    };
    this.onLocalParticipantNameChanged = name => {
      this.emit(RoomEvent.ParticipantNameChanged, name, this.localParticipant);
    };
    this.onLocalTrackMuted = pub => {
      this.emit(RoomEvent.TrackMuted, pub, this.localParticipant);
    };
    this.onLocalTrackUnmuted = pub => {
      this.emit(RoomEvent.TrackUnmuted, pub, this.localParticipant);
    };
    this.onLocalTrackPublished = pub => __awaiter(this, void 0, void 0, function* () {
      var _l;
      this.emit(RoomEvent.LocalTrackPublished, pub, this.localParticipant);
      if (pub.track instanceof LocalAudioTrack) {
        const trackIsSilent = yield pub.track.checkForSilence();
        if (trackIsSilent) {
          this.emit(RoomEvent.LocalAudioSilenceDetected, pub);
        }
      }
      const deviceId = yield (_l = pub.track) === null || _l === void 0 ? void 0 : _l.getDeviceId();
      const deviceKind = sourceToKind(pub.source);
      if (deviceKind && deviceId && deviceId !== this.localParticipant.activeDeviceMap.get(deviceKind)) {
        this.localParticipant.activeDeviceMap.set(deviceKind, deviceId);
        this.emit(RoomEvent.ActiveDeviceChanged, deviceKind, deviceId);
      }
    });
    this.onLocalTrackUnpublished = pub => {
      this.emit(RoomEvent.LocalTrackUnpublished, pub, this.localParticipant);
    };
    this.onLocalConnectionQualityChanged = quality => {
      this.emit(RoomEvent.ConnectionQualityChanged, quality, this.localParticipant);
    };
    this.onMediaDevicesError = e => {
      this.emit(RoomEvent.MediaDevicesError, e);
    };
    this.onLocalParticipantPermissionsChanged = prevPermissions => {
      this.emit(RoomEvent.ParticipantPermissionsChanged, prevPermissions, this.localParticipant);
    };
    this.setMaxListeners(100);
    this.participants = new Map();
    this.cachedParticipantSids = [];
    this.identityToSid = new Map();
    this.options = Object.assign(Object.assign({}, roomOptionDefaults), options);
    this.options.audioCaptureDefaults = Object.assign(Object.assign({}, audioDefaults), options === null || options === void 0 ? void 0 : options.audioCaptureDefaults);
    this.options.videoCaptureDefaults = Object.assign(Object.assign({}, videoDefaults), options === null || options === void 0 ? void 0 : options.videoCaptureDefaults);
    this.options.publishDefaults = Object.assign(Object.assign({}, publishDefaults), options === null || options === void 0 ? void 0 : options.publishDefaults);
    this.maybeCreateEngine();
    this.disconnectLock = new Mutex();
    this.localParticipant = new LocalParticipant('', '', this.engine, this.options);
    if (this.options.videoCaptureDefaults.deviceId) {
      this.localParticipant.activeDeviceMap.set('videoinput', unwrapConstraint(this.options.videoCaptureDefaults.deviceId));
    }
    if (this.options.audioCaptureDefaults.deviceId) {
      this.localParticipant.activeDeviceMap.set('audioinput', unwrapConstraint(this.options.audioCaptureDefaults.deviceId));
    }
    if ((_a = this.options.audioOutput) === null || _a === void 0 ? void 0 : _a.deviceId) {
      this.switchActiveDevice('audiooutput', unwrapConstraint(this.options.audioOutput.deviceId));
    }
    if (this.options.e2ee) {
      this.setupE2EE();
    }
  }
  /**
   * @experimental
   */
  setE2EEEnabled(enabled) {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.e2eeManager) {
        yield Promise.all([this.localParticipant.setE2EEEnabled(enabled)]);
        if (this.localParticipant.identity !== '') {
          this.e2eeManager.setParticipantCryptorEnabled(enabled, this.localParticipant.identity);
        }
      } else {
        throw Error('e2ee not configured, please set e2ee settings within the room options');
      }
    });
  }
  setupE2EE() {
    var _a;
    if (this.options.e2ee) {
      this.e2eeManager = new E2EEManager(this.options.e2ee);
      this.e2eeManager.on(EncryptionEvent.ParticipantEncryptionStatusChanged, (enabled, participant) => {
        if (participant instanceof LocalParticipant) {
          this.isE2EEEnabled = enabled;
        }
        this.emit(RoomEvent.ParticipantEncryptionStatusChanged, enabled, participant);
      });
      this.e2eeManager.on(EncryptionEvent.EncryptionError, error => this.emit(RoomEvent.EncryptionError, error));
      (_a = this.e2eeManager) === null || _a === void 0 ? void 0 : _a.setup(this);
    }
  }
  /**
   * if the current room has a participant with `recorder: true` in its JWT grant
   **/
  get isRecording() {
    var _a, _b;
    return (_b = (_a = this.roomInfo) === null || _a === void 0 ? void 0 : _a.activeRecording) !== null && _b !== void 0 ? _b : false;
  }
  /** server assigned unique room id */
  get sid() {
    var _a, _b;
    return (_b = (_a = this.roomInfo) === null || _a === void 0 ? void 0 : _a.sid) !== null && _b !== void 0 ? _b : '';
  }
  /** user assigned name, derived from JWT token */
  get name() {
    var _a, _b;
    return (_b = (_a = this.roomInfo) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '';
  }
  /** room metadata */
  get metadata() {
    var _a;
    return (_a = this.roomInfo) === null || _a === void 0 ? void 0 : _a.metadata;
  }
  get numParticipants() {
    var _a, _b;
    return (_b = (_a = this.roomInfo) === null || _a === void 0 ? void 0 : _a.numParticipants) !== null && _b !== void 0 ? _b : 0;
  }
  get numPublishers() {
    var _a, _b;
    return (_b = (_a = this.roomInfo) === null || _a === void 0 ? void 0 : _a.numPublishers) !== null && _b !== void 0 ? _b : 0;
  }
  maybeCreateEngine() {
    if (this.engine && !this.engine.isClosed) {
      return;
    }
    this.engine = new RTCEngine(this.options);
    this.engine.on(EngineEvent.ParticipantUpdate, this.handleParticipantUpdates).on(EngineEvent.RoomUpdate, this.handleRoomUpdate).on(EngineEvent.SpeakersChanged, this.handleSpeakersChanged).on(EngineEvent.StreamStateChanged, this.handleStreamStateUpdate).on(EngineEvent.ConnectionQualityUpdate, this.handleConnectionQualityUpdate).on(EngineEvent.SubscriptionError, this.handleSubscriptionError).on(EngineEvent.SubscriptionPermissionUpdate, this.handleSubscriptionPermissionUpdate).on(EngineEvent.MediaTrackAdded, (mediaTrack, stream, receiver) => {
      this.onTrackAdded(mediaTrack, stream, receiver);
    }).on(EngineEvent.Disconnected, reason => {
      this.handleDisconnect(this.options.stopLocalTrackOnUnpublish, reason);
    }).on(EngineEvent.ActiveSpeakersUpdate, this.handleActiveSpeakersUpdate).on(EngineEvent.DataPacketReceived, this.handleDataPacket).on(EngineEvent.Resuming, () => {
      this.clearConnectionReconcile();
      if (this.setAndEmitConnectionState(ConnectionState.Reconnecting)) {
        this.emit(RoomEvent.Reconnecting);
      }
      this.cachedParticipantSids = Array.from(this.participants.keys());
    }).on(EngineEvent.Resumed, () => {
      this.setAndEmitConnectionState(ConnectionState.Connected);
      this.emit(RoomEvent.Reconnected);
      this.registerConnectionReconcile();
      this.updateSubscriptions();
      // once reconnected, figure out if any participants connected during reconnect and emit events for it
      const diffParticipants = Array.from(this.participants.values()).filter(p => !this.cachedParticipantSids.includes(p.sid));
      diffParticipants.forEach(p => this.emit(RoomEvent.ParticipantConnected, p));
      this.cachedParticipantSids = [];
    }).on(EngineEvent.SignalResumed, () => {
      if (this.state === ConnectionState.Reconnecting) {
        this.sendSyncState();
      }
    }).on(EngineEvent.Restarting, this.handleRestarting).on(EngineEvent.SignalRestarted, this.handleSignalRestarted).on(EngineEvent.DCBufferStatusChanged, (status, kind) => {
      this.emit(RoomEvent.DCBufferStatusChanged, status, kind);
    });
    if (this.localParticipant) {
      this.localParticipant.setupEngine(this.engine);
    }
    if (this.e2eeManager) {
      this.e2eeManager.setupEngine(this.engine);
    }
  }
  /**
   * getLocalDevices abstracts navigator.mediaDevices.enumerateDevices.
   * In particular, it handles Chrome's unique behavior of creating `default`
   * devices. When encountered, it'll be removed from the list of devices.
   * The actual default device will be placed at top.
   * @param kind
   * @returns a list of available local devices
   */
  static getLocalDevices(kind) {
    let requestPermissions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
    return DeviceManager.getInstance().getDevices(kind, requestPermissions);
  }
  /**
   * prepareConnection should be called as soon as the page is loaded, in order
   * to speed up the connection attempt. This function will
   * - perform DNS resolution and pre-warm the DNS cache
   * - establish TLS connection and cache TLS keys
   *
   * With LiveKit Cloud, it will also determine the best edge data center for
   * the current client to connect to if a token is provided.
   */
  prepareConnection(url, token) {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.state !== ConnectionState.Disconnected) {
        return;
      }
      livekitLogger.debug("prepareConnection to ".concat(url));
      try {
        if (isCloud(new URL(url)) && token) {
          this.regionUrlProvider = new RegionUrlProvider(url, token);
          const regionUrl = yield this.regionUrlProvider.getNextBestRegionUrl();
          // we will not replace the regionUrl if an attempt had already started
          // to avoid overriding regionUrl after a new connection attempt had started
          if (regionUrl && this.state === ConnectionState.Disconnected) {
            this.regionUrl = regionUrl;
            yield fetch(toHttpUrl(regionUrl), {
              method: 'HEAD'
            });
            livekitLogger.debug("prepared connection to ".concat(regionUrl));
          }
        } else {
          yield fetch(toHttpUrl(url), {
            method: 'HEAD'
          });
        }
      } catch (e) {
        livekitLogger.warn('could not prepare connection', {
          error: e
        });
      }
    });
  }
  /**
   * retrieves a participant by identity
   * @param identity
   * @returns
   */
  getParticipantByIdentity(identity) {
    if (this.localParticipant.identity === identity) {
      return this.localParticipant;
    }
    const sid = this.identityToSid.get(identity);
    if (sid) {
      return this.participants.get(sid);
    }
  }
  clearConnectionFutures() {
    this.connectFuture = undefined;
  }
  /**
   * @internal for testing
   */
  simulateScenario(scenario, arg) {
    return __awaiter(this, void 0, void 0, function* () {
      let postAction = () => {};
      let req;
      switch (scenario) {
        case 'signal-reconnect':
          // @ts-expect-error function is private
          yield this.engine.client.handleOnClose('simulate disconnect');
          break;
        case 'speaker':
          req = new SimulateScenario({
            scenario: {
              case: 'speakerUpdate',
              value: 3
            }
          });
          break;
        case 'node-failure':
          req = new SimulateScenario({
            scenario: {
              case: 'nodeFailure',
              value: true
            }
          });
          break;
        case 'server-leave':
          req = new SimulateScenario({
            scenario: {
              case: 'serverLeave',
              value: true
            }
          });
          break;
        case 'migration':
          req = new SimulateScenario({
            scenario: {
              case: 'migration',
              value: true
            }
          });
          break;
        case 'resume-reconnect':
          this.engine.failNext();
          // @ts-expect-error function is private
          yield this.engine.client.handleOnClose('simulate resume-disconnect');
          break;
        case 'full-reconnect':
          this.engine.fullReconnectOnNext = true;
          // @ts-expect-error function is private
          yield this.engine.client.handleOnClose('simulate full-reconnect');
          break;
        case 'force-tcp':
        case 'force-tls':
          req = new SimulateScenario({
            scenario: {
              case: 'switchCandidateProtocol',
              value: scenario === 'force-tls' ? 2 : 1
            }
          });
          postAction = () => __awaiter(this, void 0, void 0, function* () {
            const onLeave = this.engine.client.onLeave;
            if (onLeave) {
              onLeave(new LeaveRequest({
                reason: DisconnectReason.CLIENT_INITIATED,
                canReconnect: true
              }));
            }
          });
          break;
        case 'subscriber-bandwidth':
          if (arg === undefined || typeof arg !== 'number') {
            throw new Error('subscriber-bandwidth requires a number as argument');
          }
          req = new SimulateScenario({
            scenario: {
              case: 'subscriberBandwidth',
              value: BigInt(arg)
            }
          });
          break;
      }
      if (req) {
        this.engine.client.sendSimulateScenario(req);
        postAction();
      }
    });
  }
  /**
   * Browsers have different policies regarding audio playback. Most requiring
   * some form of user interaction (click/tap/etc).
   * In those cases, audio will be silent until a click/tap triggering one of the following
   * - `startAudio`
   * - `getUserMedia`
   */
  startAudio() {
    return __awaiter(this, void 0, void 0, function* () {
      const elements = [];
      const browser = getBrowser();
      if (browser && browser.os === 'iOS') {
        /**
         * iOS blocks audio element playback if
         * - user is not publishing audio themselves and
         * - no other audio source is playing
         *
         * as a workaround, we create an audio element with an empty track, so that
         * silent audio is always playing
         */
        const audioId = 'livekit-dummy-audio-el';
        let dummyAudioEl = document.getElementById(audioId);
        if (!dummyAudioEl) {
          dummyAudioEl = document.createElement('audio');
          dummyAudioEl.id = audioId;
          dummyAudioEl.autoplay = true;
          dummyAudioEl.hidden = true;
          const track = getEmptyAudioStreamTrack();
          track.enabled = true;
          const stream = new MediaStream([track]);
          dummyAudioEl.srcObject = stream;
          document.addEventListener('visibilitychange', () => {
            if (!dummyAudioEl) {
              return;
            }
            // set the srcObject to null on page hide in order to prevent lock screen controls to show up for it
            dummyAudioEl.srcObject = document.hidden ? null : stream;
          });
          document.body.append(dummyAudioEl);
          this.once(RoomEvent.Disconnected, () => {
            dummyAudioEl === null || dummyAudioEl === void 0 ? void 0 : dummyAudioEl.remove();
          });
        }
        elements.push(dummyAudioEl);
      }
      this.participants.forEach(p => {
        p.audioTracks.forEach(t => {
          if (t.track) {
            t.track.attachedElements.forEach(e => {
              elements.push(e);
            });
          }
        });
      });
      try {
        yield Promise.all([this.acquireAudioContext(), ...elements.map(e => {
          e.muted = false;
          return e.play();
        })]);
        this.handleAudioPlaybackStarted();
      } catch (err) {
        this.handleAudioPlaybackFailed(err);
        throw err;
      }
    });
  }
  /**
   * Returns true if audio playback is enabled
   */
  get canPlaybackAudio() {
    return this.audioEnabled;
  }
  /**
   * Returns the active audio output device used in this room.
   * @return the previously successfully set audio output device ID or an empty string if the default device is used.
   * @deprecated use `getActiveDevice('audiooutput')` instead
   */
  getActiveAudioOutputDevice() {
    var _a, _b;
    return (_b = (_a = this.options.audioOutput) === null || _a === void 0 ? void 0 : _a.deviceId) !== null && _b !== void 0 ? _b : '';
  }
  getActiveDevice(kind) {
    return this.localParticipant.activeDeviceMap.get(kind);
  }
  /**
   * Switches all active devices used in this room to the given device.
   *
   * Note: setting AudioOutput is not supported on some browsers. See [setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId#browser_compatibility)
   *
   * @param kind use `videoinput` for camera track,
   *  `audioinput` for microphone track,
   *  `audiooutput` to set speaker for all incoming audio tracks
   * @param deviceId
   */
  switchActiveDevice(kind, deviceId) {
    let exact = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
    var _a, _b;
    var _c;
    return __awaiter(this, void 0, void 0, function* () {
      let deviceHasChanged = false;
      let success = true;
      const deviceConstraint = exact ? {
        exact: deviceId
      } : deviceId;
      if (kind === 'audioinput') {
        const prevDeviceId = this.options.audioCaptureDefaults.deviceId;
        this.options.audioCaptureDefaults.deviceId = deviceConstraint;
        deviceHasChanged = prevDeviceId !== deviceConstraint;
        const tracks = Array.from(this.localParticipant.audioTracks.values()).filter(track => track.source === Track.Source.Microphone);
        try {
          success = (yield Promise.all(tracks.map(t => {
            var _a;
            return (_a = t.audioTrack) === null || _a === void 0 ? void 0 : _a.setDeviceId(deviceConstraint);
          }))).every(val => val === true);
        } catch (e) {
          this.options.audioCaptureDefaults.deviceId = prevDeviceId;
          throw e;
        }
      } else if (kind === 'videoinput') {
        const prevDeviceId = this.options.videoCaptureDefaults.deviceId;
        this.options.videoCaptureDefaults.deviceId = deviceConstraint;
        deviceHasChanged = prevDeviceId !== deviceConstraint;
        const tracks = Array.from(this.localParticipant.videoTracks.values()).filter(track => track.source === Track.Source.Camera);
        try {
          success = (yield Promise.all(tracks.map(t => {
            var _a;
            return (_a = t.videoTrack) === null || _a === void 0 ? void 0 : _a.setDeviceId(deviceConstraint);
          }))).every(val => val === true);
        } catch (e) {
          this.options.videoCaptureDefaults.deviceId = prevDeviceId;
          throw e;
        }
      } else if (kind === 'audiooutput') {
        if (!supportsSetSinkId() && !this.options.expWebAudioMix || this.options.expWebAudioMix && this.audioContext && !('setSinkId' in this.audioContext)) {
          throw new Error('cannot switch audio output, setSinkId not supported');
        }
        (_a = (_c = this.options).audioOutput) !== null && _a !== void 0 ? _a : _c.audioOutput = {};
        const prevDeviceId = this.options.audioOutput.deviceId;
        this.options.audioOutput.deviceId = deviceId;
        deviceHasChanged = prevDeviceId !== deviceConstraint;
        try {
          if (this.options.expWebAudioMix) {
            // @ts-expect-error setSinkId is not yet in the typescript type of AudioContext
            (_b = this.audioContext) === null || _b === void 0 ? void 0 : _b.setSinkId(deviceId);
          } else {
            yield Promise.all(Array.from(this.participants.values()).map(p => p.setAudioOutput({
              deviceId
            })));
          }
        } catch (e) {
          this.options.audioOutput.deviceId = prevDeviceId;
          throw e;
        }
      }
      if (deviceHasChanged && success) {
        this.localParticipant.activeDeviceMap.set(kind, deviceId);
        this.emit(RoomEvent.ActiveDeviceChanged, kind, deviceId);
      }
      return success;
    });
  }
  setupLocalParticipantEvents() {
    this.localParticipant.on(ParticipantEvent.ParticipantMetadataChanged, this.onLocalParticipantMetadataChanged).on(ParticipantEvent.ParticipantNameChanged, this.onLocalParticipantNameChanged).on(ParticipantEvent.TrackMuted, this.onLocalTrackMuted).on(ParticipantEvent.TrackUnmuted, this.onLocalTrackUnmuted).on(ParticipantEvent.LocalTrackPublished, this.onLocalTrackPublished).on(ParticipantEvent.LocalTrackUnpublished, this.onLocalTrackUnpublished).on(ParticipantEvent.ConnectionQualityChanged, this.onLocalConnectionQualityChanged).on(ParticipantEvent.MediaDevicesError, this.onMediaDevicesError).on(ParticipantEvent.ParticipantPermissionsChanged, this.onLocalParticipantPermissionsChanged);
  }
  recreateEngine() {
    var _a;
    (_a = this.engine) === null || _a === void 0 ? void 0 : _a.close();
    /* @ts-ignore */
    this.engine = undefined;
    // clear out existing remote participants, since they may have attached
    // the old engine
    this.participants.clear();
    this.maybeCreateEngine();
  }
  onTrackAdded(mediaTrack, stream, receiver) {
    // don't fire onSubscribed when connecting
    // WebRTC fires onTrack as soon as setRemoteDescription is called on the offer
    // at that time, ICE connectivity has not been established so the track is not
    // technically subscribed.
    // We'll defer these events until when the room is connected or eventually disconnected.
    if (this.state === ConnectionState.Connecting || this.state === ConnectionState.Reconnecting) {
      const reconnectedHandler = () => {
        this.onTrackAdded(mediaTrack, stream, receiver);
        cleanup();
      };
      const cleanup = () => {
        this.off(RoomEvent.Reconnected, reconnectedHandler);
        this.off(RoomEvent.Connected, reconnectedHandler);
        this.off(RoomEvent.Disconnected, cleanup);
      };
      this.once(RoomEvent.Reconnected, reconnectedHandler);
      this.once(RoomEvent.Connected, reconnectedHandler);
      this.once(RoomEvent.Disconnected, cleanup);
      return;
    }
    if (this.state === ConnectionState.Disconnected) {
      livekitLogger.warn('skipping incoming track after Room disconnected');
      return;
    }
    const parts = unpackStreamId(stream.id);
    const participantId = parts[0];
    let trackId = parts[1];
    if (!trackId || trackId === '') trackId = mediaTrack.id;
    if (participantId === this.localParticipant.sid) {
      livekitLogger.warn('tried to create RemoteParticipant for local participant');
      return;
    }
    const participant = this.participants.get(participantId);
    if (!participant) {
      livekitLogger.error("Tried to add a track for a participant, that's not present. Sid: ".concat(participantId));
      return;
    }
    let adaptiveStreamSettings;
    if (this.options.adaptiveStream) {
      if (typeof this.options.adaptiveStream === 'object') {
        adaptiveStreamSettings = this.options.adaptiveStream;
      } else {
        adaptiveStreamSettings = {};
      }
    }
    participant.addSubscribedMediaTrack(mediaTrack, trackId, stream, receiver, adaptiveStreamSettings);
  }
  handleDisconnect() {
    let shouldStopTracks = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;
    let reason = arguments.length > 1 ? arguments[1] : undefined;
    var _a;
    this.clearConnectionReconcile();
    if (this.state === ConnectionState.Disconnected) {
      return;
    }
    this.regionUrl = undefined;
    try {
      this.participants.forEach(p => {
        p.tracks.forEach(pub => {
          p.unpublishTrack(pub.trackSid);
        });
      });
      this.localParticipant.tracks.forEach(pub => {
        var _a, _b;
        if (pub.track) {
          this.localParticipant.unpublishTrack(pub.track, shouldStopTracks);
        }
        if (shouldStopTracks) {
          (_a = pub.track) === null || _a === void 0 ? void 0 : _a.detach();
          (_b = pub.track) === null || _b === void 0 ? void 0 : _b.stop();
        }
      });
      this.localParticipant.off(ParticipantEvent.ParticipantMetadataChanged, this.onLocalParticipantMetadataChanged).off(ParticipantEvent.ParticipantNameChanged, this.onLocalParticipantNameChanged).off(ParticipantEvent.TrackMuted, this.onLocalTrackMuted).off(ParticipantEvent.TrackUnmuted, this.onLocalTrackUnmuted).off(ParticipantEvent.LocalTrackPublished, this.onLocalTrackPublished).off(ParticipantEvent.LocalTrackUnpublished, this.onLocalTrackUnpublished).off(ParticipantEvent.ConnectionQualityChanged, this.onLocalConnectionQualityChanged).off(ParticipantEvent.MediaDevicesError, this.onMediaDevicesError).off(ParticipantEvent.ParticipantPermissionsChanged, this.onLocalParticipantPermissionsChanged);
      this.localParticipant.tracks.clear();
      this.localParticipant.videoTracks.clear();
      this.localParticipant.audioTracks.clear();
      this.participants.clear();
      this.activeSpeakers = [];
      if (this.audioContext && typeof this.options.expWebAudioMix === 'boolean') {
        this.audioContext.close();
        this.audioContext = undefined;
      }
      if (isWeb()) {
        window.removeEventListener('beforeunload', this.onPageLeave);
        window.removeEventListener('pagehide', this.onPageLeave);
        window.removeEventListener('freeze', this.onPageLeave);
        (_a = navigator.mediaDevices) === null || _a === void 0 ? void 0 : _a.removeEventListener('devicechange', this.handleDeviceChange);
      }
    } finally {
      this.setAndEmitConnectionState(ConnectionState.Disconnected);
      this.emit(RoomEvent.Disconnected, reason);
    }
  }
  handleParticipantDisconnected(sid, participant) {
    // remove and send event
    this.participants.delete(sid);
    if (!participant) {
      return;
    }
    this.identityToSid.delete(participant.identity);
    participant.tracks.forEach(publication => {
      participant.unpublishTrack(publication.trackSid, true);
    });
    this.emit(RoomEvent.ParticipantDisconnected, participant);
  }
  acquireAudioContext() {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      if (typeof this.options.expWebAudioMix !== 'boolean' && this.options.expWebAudioMix.audioContext) {
        // override audio context with custom audio context if supplied by user
        this.audioContext = this.options.expWebAudioMix.audioContext;
      } else if (!this.audioContext || this.audioContext.state === 'closed') {
        // by using an AudioContext, it reduces lag on audio elements
        // https://stackoverflow.com/questions/9811429/html5-audio-tag-on-safari-has-a-delay/54119854#54119854
        this.audioContext = (_a = getNewAudioContext()) !== null && _a !== void 0 ? _a : undefined;
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        // for iOS a newly created AudioContext is always in `suspended` state.
        // we try our best to resume the context here, if that doesn't work, we just continue with regular processing
        try {
          yield this.audioContext.resume();
        } catch (e) {
          livekitLogger.warn(e);
        }
      }
      if (this.options.expWebAudioMix) {
        this.participants.forEach(participant => participant.setAudioContext(this.audioContext));
      }
      this.localParticipant.setAudioContext(this.audioContext);
      const newContextIsRunning = ((_b = this.audioContext) === null || _b === void 0 ? void 0 : _b.state) === 'running';
      if (newContextIsRunning !== this.canPlaybackAudio) {
        this.audioEnabled = newContextIsRunning;
        this.emit(RoomEvent.AudioPlaybackStatusChanged, newContextIsRunning);
      }
    });
  }
  createParticipant(id, info) {
    let participant;
    if (info) {
      participant = RemoteParticipant.fromParticipantInfo(this.engine.client, info);
    } else {
      participant = new RemoteParticipant(this.engine.client, id, '', undefined, undefined);
    }
    if (this.options.expWebAudioMix) {
      participant.setAudioContext(this.audioContext);
    }
    return participant;
  }
  getOrCreateParticipant(id, info) {
    if (this.participants.has(id)) {
      return this.participants.get(id);
    }
    const participant = this.createParticipant(id, info);
    this.participants.set(id, participant);
    this.identityToSid.set(info.identity, info.sid);
    // if we have valid info and the participant wasn't in the map before, we can assume the participant is new
    // firing here to make sure that `ParticipantConnected` fires before the initial track events
    this.emitWhenConnected(RoomEvent.ParticipantConnected, participant);
    // also forward events
    // trackPublished is only fired for tracks added after both local participant
    // and remote participant joined the room
    participant.on(ParticipantEvent.TrackPublished, trackPublication => {
      this.emitWhenConnected(RoomEvent.TrackPublished, trackPublication, participant);
    }).on(ParticipantEvent.TrackSubscribed, (track, publication) => {
      // monitor playback status
      if (track.kind === Track.Kind.Audio) {
        track.on(TrackEvent.AudioPlaybackStarted, this.handleAudioPlaybackStarted);
        track.on(TrackEvent.AudioPlaybackFailed, this.handleAudioPlaybackFailed);
      }
      this.emit(RoomEvent.TrackSubscribed, track, publication, participant);
    }).on(ParticipantEvent.TrackUnpublished, publication => {
      this.emit(RoomEvent.TrackUnpublished, publication, participant);
    }).on(ParticipantEvent.TrackUnsubscribed, (track, publication) => {
      this.emit(RoomEvent.TrackUnsubscribed, track, publication, participant);
    }).on(ParticipantEvent.TrackSubscriptionFailed, sid => {
      this.emit(RoomEvent.TrackSubscriptionFailed, sid, participant);
    }).on(ParticipantEvent.TrackMuted, pub => {
      this.emitWhenConnected(RoomEvent.TrackMuted, pub, participant);
    }).on(ParticipantEvent.TrackUnmuted, pub => {
      this.emitWhenConnected(RoomEvent.TrackUnmuted, pub, participant);
    }).on(ParticipantEvent.ParticipantMetadataChanged, metadata => {
      this.emitWhenConnected(RoomEvent.ParticipantMetadataChanged, metadata, participant);
    }).on(ParticipantEvent.ParticipantNameChanged, name => {
      this.emitWhenConnected(RoomEvent.ParticipantNameChanged, name, participant);
    }).on(ParticipantEvent.ConnectionQualityChanged, quality => {
      this.emitWhenConnected(RoomEvent.ConnectionQualityChanged, quality, participant);
    }).on(ParticipantEvent.ParticipantPermissionsChanged, prevPermissions => {
      this.emitWhenConnected(RoomEvent.ParticipantPermissionsChanged, prevPermissions, participant);
    }).on(ParticipantEvent.TrackSubscriptionStatusChanged, (pub, status) => {
      this.emitWhenConnected(RoomEvent.TrackSubscriptionStatusChanged, pub, status, participant);
    }).on(ParticipantEvent.TrackSubscriptionFailed, (trackSid, error) => {
      this.emit(RoomEvent.TrackSubscriptionFailed, trackSid, participant, error);
    }).on(ParticipantEvent.TrackSubscriptionPermissionChanged, (pub, status) => {
      this.emitWhenConnected(RoomEvent.TrackSubscriptionPermissionChanged, pub, status, participant);
    });
    // update info at the end after callbacks have been set up
    if (info) {
      participant.updateInfo(info);
    }
    return participant;
  }
  sendSyncState() {
    var _a, _b;
    if (this.engine.subscriber === undefined || this.engine.subscriber.pc.localDescription === null) {
      return;
    }
    const previousAnswer = this.engine.subscriber.pc.localDescription;
    const previousOffer = this.engine.subscriber.pc.remoteDescription;
    /* 1. autosubscribe on, so subscribed tracks = all tracks - unsub tracks,
          in this case, we send unsub tracks, so server add all tracks to this
          subscribe pc and unsub special tracks from it.
       2. autosubscribe off, we send subscribed tracks.
    */
    const autoSubscribe = (_b = (_a = this.connOptions) === null || _a === void 0 ? void 0 : _a.autoSubscribe) !== null && _b !== void 0 ? _b : true;
    const trackSids = new Array();
    this.participants.forEach(participant => {
      participant.tracks.forEach(track => {
        if (track.isDesired !== autoSubscribe) {
          trackSids.push(track.trackSid);
        }
      });
    });
    this.engine.client.sendSyncState(new SyncState({
      answer: toProtoSessionDescription({
        sdp: previousAnswer.sdp,
        type: previousAnswer.type
      }),
      offer: previousOffer ? toProtoSessionDescription({
        sdp: previousOffer.sdp,
        type: previousOffer.type
      }) : undefined,
      subscription: new UpdateSubscription({
        trackSids,
        subscribe: !autoSubscribe,
        participantTracks: []
      }),
      publishTracks: this.localParticipant.publishedTracksInfo(),
      dataChannels: this.localParticipant.dataChannelsInfo()
    }));
  }
  /**
   * After resuming, we'll need to notify the server of the current
   * subscription settings.
   */
  updateSubscriptions() {
    for (const p of this.participants.values()) {
      for (const pub of p.videoTracks.values()) {
        if (pub.isSubscribed && pub instanceof RemoteTrackPublication) {
          pub.emitTrackUpdate();
        }
      }
    }
  }
  registerConnectionReconcile() {
    this.clearConnectionReconcile();
    let consecutiveFailures = 0;
    this.connectionReconcileInterval = CriticalTimers.setInterval(() => {
      if (
      // ensure we didn't tear it down
      !this.engine ||
      // engine detected close, but Room missed it
      this.engine.isClosed ||
      // transports failed without notifying engine
      !this.engine.verifyTransport()) {
        consecutiveFailures++;
        livekitLogger.warn('detected connection state mismatch', {
          numFailures: consecutiveFailures
        });
        if (consecutiveFailures >= 3) {
          this.recreateEngine();
          this.handleDisconnect(this.options.stopLocalTrackOnUnpublish, DisconnectReason.STATE_MISMATCH);
        }
      } else {
        consecutiveFailures = 0;
      }
    }, connectionReconcileFrequency);
  }
  clearConnectionReconcile() {
    if (this.connectionReconcileInterval) {
      CriticalTimers.clearInterval(this.connectionReconcileInterval);
    }
  }
  setAndEmitConnectionState(state) {
    if (state === this.state) {
      // unchanged
      return false;
    }
    this.state = state;
    this.emit(RoomEvent.ConnectionStateChanged, this.state);
    return true;
  }
  emitWhenConnected(event) {
    if (this.state === ConnectionState.Connected) {
      for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }
      return this.emit(event, ...args);
    }
    return false;
  }
  /**
   * Allows to populate a room with simulated participants.
   * No actual connection to a server will be established, all state is
   * @experimental
   */
  simulateParticipants(options) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      const publishOptions = Object.assign({
        audio: true,
        video: true,
        useRealTracks: false
      }, options.publish);
      const participantOptions = Object.assign({
        count: 9,
        audio: false,
        video: true,
        aspectRatios: [1.66, 1.7, 1.3]
      }, options.participants);
      this.handleDisconnect();
      this.roomInfo = new Room$1({
        sid: 'RM_SIMULATED',
        name: 'simulated-room',
        emptyTimeout: 0,
        maxParticipants: 0,
        creationTime: protoInt64.parse(new Date().getTime()),
        metadata: '',
        numParticipants: 1,
        numPublishers: 1,
        turnPassword: '',
        enabledCodecs: [],
        activeRecording: false
      });
      this.localParticipant.updateInfo(new ParticipantInfo({
        identity: 'simulated-local',
        name: 'local-name'
      }));
      this.setupLocalParticipantEvents();
      this.emit(RoomEvent.SignalConnected);
      this.emit(RoomEvent.Connected);
      this.setAndEmitConnectionState(ConnectionState.Connected);
      if (publishOptions.video) {
        const camPub = new LocalTrackPublication(Track.Kind.Video, new TrackInfo({
          source: TrackSource.CAMERA,
          sid: Math.floor(Math.random() * 10000).toString(),
          type: TrackType.AUDIO,
          name: 'video-dummy'
        }), new LocalVideoTrack(publishOptions.useRealTracks ? (yield window.navigator.mediaDevices.getUserMedia({
          video: true
        })).getVideoTracks()[0] : createDummyVideoStreamTrack((_a = 160 * participantOptions.aspectRatios[0]) !== null && _a !== void 0 ? _a : 1, 160, true, true)));
        // @ts-ignore
        this.localParticipant.addTrackPublication(camPub);
        this.localParticipant.emit(ParticipantEvent.LocalTrackPublished, camPub);
      }
      if (publishOptions.audio) {
        const audioPub = new LocalTrackPublication(Track.Kind.Audio, new TrackInfo({
          source: TrackSource.MICROPHONE,
          sid: Math.floor(Math.random() * 10000).toString(),
          type: TrackType.AUDIO
        }), new LocalAudioTrack(publishOptions.useRealTracks ? (yield navigator.mediaDevices.getUserMedia({
          audio: true
        })).getAudioTracks()[0] : getEmptyAudioStreamTrack()));
        // @ts-ignore
        this.localParticipant.addTrackPublication(audioPub);
        this.localParticipant.emit(ParticipantEvent.LocalTrackPublished, audioPub);
      }
      for (let i = 0; i < participantOptions.count - 1; i += 1) {
        let info = new ParticipantInfo({
          sid: Math.floor(Math.random() * 10000).toString(),
          identity: "simulated-".concat(i),
          state: ParticipantInfo_State.ACTIVE,
          tracks: [],
          joinedAt: protoInt64.parse(Date.now())
        });
        const p = this.getOrCreateParticipant(info.identity, info);
        if (participantOptions.video) {
          const dummyVideo = createDummyVideoStreamTrack((_b = 160 * participantOptions.aspectRatios[i % participantOptions.aspectRatios.length]) !== null && _b !== void 0 ? _b : 1, 160, false, true);
          const videoTrack = new TrackInfo({
            source: TrackSource.CAMERA,
            sid: Math.floor(Math.random() * 10000).toString(),
            type: TrackType.AUDIO
          });
          p.addSubscribedMediaTrack(dummyVideo, videoTrack.sid, new MediaStream([dummyVideo]));
          info.tracks = [...info.tracks, videoTrack];
        }
        if (participantOptions.audio) {
          const dummyTrack = getEmptyAudioStreamTrack();
          const audioTrack = new TrackInfo({
            source: TrackSource.MICROPHONE,
            sid: Math.floor(Math.random() * 10000).toString(),
            type: TrackType.AUDIO
          });
          p.addSubscribedMediaTrack(dummyTrack, audioTrack.sid, new MediaStream([dummyTrack]));
          info.tracks = [...info.tracks, audioTrack];
        }
        p.updateInfo(info);
      }
    });
  }
  // /** @internal */
  emit(event) {
    for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }
    // active speaker updates are too spammy
    if (event !== RoomEvent.ActiveSpeakersChanged) {
      livekitLogger.debug("room event ".concat(event), {
        event,
        args
      });
    }
    return super.emit(event, ...args);
  }
}

var CheckStatus;
(function (CheckStatus) {
  CheckStatus[CheckStatus["IDLE"] = 0] = "IDLE";
  CheckStatus[CheckStatus["RUNNING"] = 1] = "RUNNING";
  CheckStatus[CheckStatus["SKIPPED"] = 2] = "SKIPPED";
  CheckStatus[CheckStatus["SUCCESS"] = 3] = "SUCCESS";
  CheckStatus[CheckStatus["FAILED"] = 4] = "FAILED";
})(CheckStatus || (CheckStatus = {}));
class Checker extends eventsExports.EventEmitter {
  constructor(url, token) {
    let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    super();
    this.status = CheckStatus.IDLE;
    this.logs = [];
    this.errorsAsWarnings = false;
    this.url = url;
    this.token = token;
    this.name = this.constructor.name;
    this.room = new Room(options.roomOptions);
    this.connectOptions = options.connectOptions;
    if (options.errorsAsWarnings) {
      this.errorsAsWarnings = options.errorsAsWarnings;
    }
  }
  run(onComplete) {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.status !== CheckStatus.IDLE) {
        throw Error('check is running already');
      }
      this.setStatus(CheckStatus.RUNNING);
      try {
        yield this.perform();
      } catch (err) {
        if (err instanceof Error) {
          if (this.errorsAsWarnings) {
            this.appendWarning(err.message);
          } else {
            this.appendError(err.message);
          }
        }
      }
      yield this.disconnect();
      // sleep for a bit to ensure disconnect
      yield new Promise(resolve => setTimeout(resolve, 500));
      // @ts-ignore
      if (this.status !== CheckStatus.SKIPPED) {
        this.setStatus(this.isSuccess() ? CheckStatus.SUCCESS : CheckStatus.FAILED);
      }
      if (onComplete) {
        onComplete();
      }
      return this.getInfo();
    });
  }
  isSuccess() {
    return !this.logs.some(l => l.level === 'error');
  }
  connect() {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.room.state === ConnectionState.Connected) {
        return this.room;
      }
      yield this.room.connect(this.url, this.token);
      return this.room;
    });
  }
  disconnect() {
    return __awaiter(this, void 0, void 0, function* () {
      if (this.room && this.room.state !== ConnectionState.Disconnected) {
        yield this.room.disconnect();
        // wait for it to go through
        yield new Promise(resolve => setTimeout(resolve, 500));
      }
    });
  }
  skip() {
    this.setStatus(CheckStatus.SKIPPED);
  }
  appendMessage(message) {
    this.logs.push({
      level: 'info',
      message
    });
    this.emit('update', this.getInfo());
  }
  appendWarning(message) {
    this.logs.push({
      level: 'warning',
      message
    });
    this.emit('update', this.getInfo());
  }
  appendError(message) {
    this.logs.push({
      level: 'error',
      message
    });
    this.emit('update', this.getInfo());
  }
  setStatus(status) {
    this.status = status;
    this.emit('update', this.getInfo());
  }
  get engine() {
    var _a;
    return (_a = this.room) === null || _a === void 0 ? void 0 : _a.engine;
  }
  getInfo() {
    return {
      logs: this.logs,
      name: this.name,
      status: this.status,
      description: this.description
    };
  }
}

/**
 * Creates a local video and audio track at the same time. When acquiring both
 * audio and video tracks together, it'll display a single permission prompt to
 * the user instead of two separate ones.
 * @param options
 */
function createLocalTracks(options) {
  var _a, _b;
  return __awaiter(this, void 0, void 0, function* () {
    // set default options to true
    options !== null && options !== void 0 ? options : options = {};
    (_a = options.audio) !== null && _a !== void 0 ? _a : options.audio = true;
    (_b = options.video) !== null && _b !== void 0 ? _b : options.video = true;
    const opts = mergeDefaultOptions(options, audioDefaults, videoDefaults);
    const constraints = constraintsForOptions(opts);
    // Keep a reference to the promise on DeviceManager and await it in getLocalDevices()
    // works around iOS Safari Bug https://bugs.webkit.org/show_bug.cgi?id=179363
    const mediaPromise = navigator.mediaDevices.getUserMedia(constraints);
    if (options.audio) {
      DeviceManager.userMediaPromiseMap.set('audioinput', mediaPromise);
      mediaPromise.catch(() => DeviceManager.userMediaPromiseMap.delete('audioinput'));
    }
    if (options.video) {
      DeviceManager.userMediaPromiseMap.set('videoinput', mediaPromise);
      mediaPromise.catch(() => DeviceManager.userMediaPromiseMap.delete('videoinput'));
    }
    const stream = yield mediaPromise;
    return stream.getTracks().map(mediaStreamTrack => {
      const isAudio = mediaStreamTrack.kind === 'audio';
      isAudio ? options.audio : options.video;
      let trackConstraints;
      const conOrBool = isAudio ? constraints.audio : constraints.video;
      if (typeof conOrBool !== 'boolean') {
        trackConstraints = conOrBool;
      }
      // update the constraints with the device id the user gave permissions to in the permission prompt
      // otherwise each track restart (e.g. mute - unmute) will try to initialize the device again -> causing additional permission prompts
      if (trackConstraints) {
        trackConstraints.deviceId = mediaStreamTrack.getSettings().deviceId;
      } else {
        trackConstraints = {
          deviceId: mediaStreamTrack.getSettings().deviceId
        };
      }
      const track = mediaTrackToLocalTrack(mediaStreamTrack, trackConstraints);
      if (track.kind === Track.Kind.Video) {
        track.source = Track.Source.Camera;
      } else if (track.kind === Track.Kind.Audio) {
        track.source = Track.Source.Microphone;
      }
      track.mediaStream = stream;
      return track;
    });
  });
}
/**
 * Creates a [[LocalVideoTrack]] with getUserMedia()
 * @param options
 */
function createLocalVideoTrack(options) {
  return __awaiter(this, void 0, void 0, function* () {
    const tracks = yield createLocalTracks({
      audio: false,
      video: options
    });
    return tracks[0];
  });
}
function createLocalAudioTrack(options) {
  return __awaiter(this, void 0, void 0, function* () {
    const tracks = yield createLocalTracks({
      audio: options,
      video: false
    });
    return tracks[0];
  });
}
/**
 * Creates a screen capture tracks with getDisplayMedia().
 * A LocalVideoTrack is always created and returned.
 * If { audio: true }, and the browser supports audio capture, a LocalAudioTrack is also created.
 */
function createLocalScreenTracks(options) {
  return __awaiter(this, void 0, void 0, function* () {
    if (options === undefined) {
      options = {};
    }
    if (options.resolution === undefined) {
      options.resolution = ScreenSharePresets.h1080fps15.resolution;
    }
    if (navigator.mediaDevices.getDisplayMedia === undefined) {
      throw new DeviceUnsupportedError('getDisplayMedia not supported');
    }
    const constraints = screenCaptureToDisplayMediaStreamOptions(options);
    const stream = yield navigator.mediaDevices.getDisplayMedia(constraints);
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) {
      throw new TrackInvalidError('no video track found');
    }
    const screenVideo = new LocalVideoTrack(tracks[0], undefined, false);
    screenVideo.source = Track.Source.ScreenShare;
    const localTracks = [screenVideo];
    if (stream.getAudioTracks().length > 0) {
      const screenAudio = new LocalAudioTrack(stream.getAudioTracks()[0], undefined, false);
      screenAudio.source = Track.Source.ScreenShareAudio;
      localTracks.push(screenAudio);
    }
    return localTracks;
  });
}

class PublishAudioCheck extends Checker {
  get description() {
    return 'Can publish audio';
  }
  perform() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      const room = yield this.connect();
      const track = yield createLocalAudioTrack();
      room.localParticipant.publishTrack(track);
      // wait for a few seconds to publish
      yield new Promise(resolve => setTimeout(resolve, 3000));
      // verify RTC stats that it's publishing
      const stats = yield (_a = track.sender) === null || _a === void 0 ? void 0 : _a.getStats();
      if (!stats) {
        throw new Error('Could not get RTCStats');
      }
      let numPackets = 0;
      stats.forEach(stat => {
        if (stat.type === 'outbound-rtp' && stat.mediaType === 'audio') {
          numPackets = stat.packetsSent;
        }
      });
      if (numPackets === 0) {
        throw new Error('Could not determine packets are sent');
      }
      this.appendMessage("published ".concat(numPackets, " audio packets"));
    });
  }
}

class PublishVideoCheck extends Checker {
  get description() {
    return 'Can publish video';
  }
  perform() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      const room = yield this.connect();
      const track = yield createLocalVideoTrack();
      room.localParticipant.publishTrack(track);
      // wait for a few seconds to publish
      yield new Promise(resolve => setTimeout(resolve, 3000));
      // verify RTC stats that it's publishing
      const stats = yield (_a = track.sender) === null || _a === void 0 ? void 0 : _a.getStats();
      if (!stats) {
        throw new Error('Could not get RTCStats');
      }
      let numPackets = 0;
      stats.forEach(stat => {
        if (stat.type === 'outbound-rtp' && stat.mediaType === 'video') {
          numPackets = stat.packetsSent;
        }
      });
      if (numPackets === 0) {
        throw new Error('Could not determine packets are sent');
      }
      this.appendMessage("published ".concat(numPackets, " video packets"));
    });
  }
}

class ReconnectCheck extends Checker {
  get description() {
    return 'Resuming connection after interruption';
  }
  perform() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      const room = yield this.connect();
      let reconnectingTriggered = false;
      let reconnected = false;
      let reconnectResolver;
      const reconnectTimeout = new Promise(resolve => {
        setTimeout(resolve, 5000);
        reconnectResolver = resolve;
      });
      room.on(RoomEvent.Reconnecting, () => {
        reconnectingTriggered = true;
      }).on(RoomEvent.Reconnected, () => {
        reconnected = true;
        reconnectResolver(true);
      });
      (_a = room.engine.client.ws) === null || _a === void 0 ? void 0 : _a.close();
      const onClose = room.engine.client.onClose;
      if (onClose) {
        onClose('');
      }
      yield reconnectTimeout;
      if (!reconnectingTriggered) {
        throw new Error('Did not attempt to reconnect');
      } else if (!reconnected || room.state !== ConnectionState.Connected) {
        this.appendWarning('reconnection is only possible in Redis-based configurations');
        throw new Error('Not able to reconnect');
      }
    });
  }
}

class TURNCheck extends Checker {
  get description() {
    return 'Can connect via TURN';
  }
  perform() {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      const signalClient = new SignalClient();
      const joinRes = yield signalClient.join(this.url, this.token, {
        autoSubscribe: true,
        maxRetries: 0,
        e2eeEnabled: false,
        websocketTimeout: 15000
      });
      let hasTLS = false;
      let hasTURN = false;
      let hasSTUN = false;
      for (let iceServer of joinRes.iceServers) {
        for (let url of iceServer.urls) {
          if (url.startsWith('turn:')) {
            hasTURN = true;
            hasSTUN = true;
          } else if (url.startsWith('turns:')) {
            hasTURN = true;
            hasSTUN = true;
            hasTLS = true;
          }
          if (url.startsWith('stun:')) {
            hasSTUN = true;
          }
        }
      }
      if (!hasSTUN) {
        this.appendWarning('No STUN servers configured on server side.');
      } else if (hasTURN && !hasTLS) {
        this.appendWarning('TURN is configured server side, but TURN/TLS is unavailable.');
      }
      yield signalClient.close();
      if (((_b = (_a = this.connectOptions) === null || _a === void 0 ? void 0 : _a.rtcConfig) === null || _b === void 0 ? void 0 : _b.iceServers) || hasTURN) {
        yield this.room.connect(this.url, this.token, {
          rtcConfig: {
            iceTransportPolicy: 'relay'
          }
        });
      } else {
        this.appendWarning('No TURN servers configured.');
        this.skip();
        yield new Promise(resolve => setTimeout(resolve, 0));
      }
    });
  }
}

class WebRTCCheck extends Checker {
  get description() {
    return 'Establishing WebRTC connection';
  }
  perform() {
    return __awaiter(this, void 0, void 0, function* () {
      let hasTcp = false;
      let hasIpv4Udp = false;
      this.room.on(RoomEvent.SignalConnected, () => {
        const prevTrickle = this.room.engine.client.onTrickle;
        this.room.engine.client.onTrickle = (sd, target) => {
          if (sd.candidate) {
            const candidate = new RTCIceCandidate(sd);
            let str = "".concat(candidate.protocol, " ").concat(candidate.address, ":").concat(candidate.port, " ").concat(candidate.type);
            if (candidate.address) {
              if (isIPPrivate(candidate.address)) {
                str += ' (private)';
              } else {
                if (candidate.protocol === 'tcp' && candidate.tcpType === 'passive') {
                  hasTcp = true;
                  str += ' (passive)';
                } else if (candidate.protocol === 'udp') {
                  hasIpv4Udp = true;
                }
              }
            }
            this.appendMessage(str);
          }
          if (prevTrickle) {
            prevTrickle(sd, target);
          }
        };
        if (this.room.engine.subscriber) {
          this.room.engine.subscriber.pc.onicecandidateerror = ev => {
            if (ev instanceof RTCPeerConnectionIceErrorEvent) {
              this.appendWarning("error with ICE candidate: ".concat(ev.errorCode, " ").concat(ev.errorText, " ").concat(ev.url));
            }
          };
        }
      });
      try {
        yield this.connect();
        livekitLogger.info('now the room is connected');
      } catch (err) {
        this.appendWarning('ports need to be open on firewall in order to connect.');
        throw err;
      }
      if (!hasTcp) {
        this.appendWarning('Server is not configured for ICE/TCP');
      }
      if (!hasIpv4Udp) {
        this.appendWarning('No public IPv4 UDP candidates were found. Your server is likely not configured correctly');
      }
    });
  }
}
function isIPPrivate(address) {
  const parts = address.split('.');
  if (parts.length === 4) {
    if (parts[0] === '10') {
      return true;
    } else if (parts[0] === '192' && parts[1] === '168') {
      return true;
    } else if (parts[0] === '172') {
      const second = parseInt(parts[1], 10);
      if (second >= 16 && second <= 31) {
        return true;
      }
    }
  }
  return false;
}

class WebSocketCheck extends Checker {
  get description() {
    return 'Connecting to signal connection via WebSocket';
  }
  perform() {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
      if (this.url.startsWith('ws:') || this.url.startsWith('http:')) {
        this.appendWarning('Server is insecure, clients may block connections to it');
      }
      let signalClient = new SignalClient();
      const joinRes = yield signalClient.join(this.url, this.token, {
        autoSubscribe: true,
        maxRetries: 0,
        e2eeEnabled: false,
        websocketTimeout: 15000
      });
      this.appendMessage("Connected to server, version ".concat(joinRes.serverVersion, "."));
      if (((_a = joinRes.serverInfo) === null || _a === void 0 ? void 0 : _a.edition) === ServerInfo_Edition.Cloud && ((_b = joinRes.serverInfo) === null || _b === void 0 ? void 0 : _b.region)) {
        this.appendMessage("LiveKit Cloud: ".concat((_c = joinRes.serverInfo) === null || _c === void 0 ? void 0 : _c.region));
      }
      yield signalClient.close();
    });
  }
}

class ConnectionCheck extends eventsExports.EventEmitter {
  constructor(url, token) {
    super();
    this.checkResults = new Map();
    this.url = url;
    this.token = token;
  }
  getNextCheckId() {
    const nextId = this.checkResults.size;
    this.checkResults.set(nextId, {
      logs: [],
      status: CheckStatus.IDLE,
      name: '',
      description: ''
    });
    return nextId;
  }
  updateCheck(checkId, info) {
    this.checkResults.set(checkId, info);
    this.emit('checkUpdate', checkId, info);
  }
  isSuccess() {
    return Array.from(this.checkResults.values()).every(r => r.status !== CheckStatus.FAILED);
  }
  getResults() {
    return Array.from(this.checkResults.values());
  }
  createAndRunCheck(check) {
    return __awaiter(this, void 0, void 0, function* () {
      const checkId = this.getNextCheckId();
      const test = new check(this.url, this.token);
      const handleUpdate = info => {
        this.updateCheck(checkId, info);
      };
      test.on('update', handleUpdate);
      const result = yield test.run();
      test.off('update', handleUpdate);
      return result;
    });
  }
  checkWebsocket() {
    return __awaiter(this, void 0, void 0, function* () {
      return this.createAndRunCheck(WebSocketCheck);
    });
  }
  checkWebRTC() {
    return __awaiter(this, void 0, void 0, function* () {
      return this.createAndRunCheck(WebRTCCheck);
    });
  }
  checkTURN() {
    return __awaiter(this, void 0, void 0, function* () {
      return this.createAndRunCheck(TURNCheck);
    });
  }
  checkReconnect() {
    return __awaiter(this, void 0, void 0, function* () {
      return this.createAndRunCheck(ReconnectCheck);
    });
  }
  checkPublishAudio() {
    return __awaiter(this, void 0, void 0, function* () {
      return this.createAndRunCheck(PublishAudioCheck);
    });
  }
  checkPublishVideo() {
    return __awaiter(this, void 0, void 0, function* () {
      return this.createAndRunCheck(PublishVideoCheck);
    });
  }
}

/**
 * Try to analyze the local track to determine the facing mode of a track.
 *
 * @remarks
 * There is no property supported by all browsers to detect whether a video track originated from a user- or environment-facing camera device.
 * For this reason, we use the `facingMode` property when available, but will fall back on a string-based analysis of the device label to determine the facing mode.
 * If both methods fail, the default facing mode will be used.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/facingMode | MDN docs on facingMode}
 * @experimental
 */
function facingModeFromLocalTrack(localTrack) {
  let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var _a;
  const track = localTrack instanceof LocalTrack ? localTrack.mediaStreamTrack : localTrack;
  const trackSettings = track.getSettings();
  let result = {
    facingMode: (_a = options.defaultFacingMode) !== null && _a !== void 0 ? _a : 'user',
    confidence: 'low'
  };
  // 1. Try to get facingMode from track settings.
  if ('facingMode' in trackSettings) {
    const rawFacingMode = trackSettings.facingMode;
    livekitLogger.debug('rawFacingMode', {
      rawFacingMode
    });
    if (rawFacingMode && typeof rawFacingMode === 'string' && isFacingModeValue(rawFacingMode)) {
      result = {
        facingMode: rawFacingMode,
        confidence: 'high'
      };
    }
  }
  // 2. If we don't have a high confidence we try to get the facing mode from the device label.
  if (['low', 'medium'].includes(result.confidence)) {
    livekitLogger.debug("Try to get facing mode from device label: (".concat(track.label, ")"));
    const labelAnalysisResult = facingModeFromDeviceLabel(track.label);
    if (labelAnalysisResult !== undefined) {
      result = labelAnalysisResult;
    }
  }
  return result;
}
const knownDeviceLabels = new Map([['obs virtual camera', {
  facingMode: 'environment',
  confidence: 'medium'
}]]);
const knownDeviceLabelSections = new Map([['iphone', {
  facingMode: 'environment',
  confidence: 'medium'
}], ['ipad', {
  facingMode: 'environment',
  confidence: 'medium'
}]]);
/**
 * Attempt to analyze the device label to determine the facing mode.
 *
 * @experimental
 */
function facingModeFromDeviceLabel(deviceLabel) {
  var _a;
  const label = deviceLabel.trim().toLowerCase();
  // Empty string is a valid device label but we can't infer anything from it.
  if (label === '') {
    return undefined;
  }
  // Can we match against widely known device labels.
  if (knownDeviceLabels.has(label)) {
    return knownDeviceLabels.get(label);
  }
  // Can we match against sections of the device label.
  return (_a = Array.from(knownDeviceLabelSections.entries()).find(_ref => {
    let [section] = _ref;
    return label.includes(section);
  })) === null || _a === void 0 ? void 0 : _a[1];
}
function isFacingModeValue(item) {
  const allowedValues = ['user', 'environment', 'left', 'right'];
  return item === undefined || allowedValues.includes(item);
}

export { AudioPresets, BaseKeyProvider, ConnectionCheck, ConnectionError, ConnectionQuality, ConnectionState, CriticalTimers, CryptorEvent, DataPacket_Kind, DefaultReconnectPolicy, DeviceUnsupportedError, DisconnectReason, EncryptionEvent, EngineEvent, ExternalE2EEKeyProvider, KeyHandlerEvent, KeyProviderEvent, LivekitError, LocalAudioTrack, LocalParticipant, LocalTrack, LocalTrackPublication, LocalVideoTrack, LogLevel, MediaDeviceFailure, NegotiationError, Participant, ParticipantEvent, PublishDataError, RemoteAudioTrack, RemoteParticipant, RemoteTrack, RemoteTrackPublication, RemoteVideoTrack, Room, RoomEvent, RoomState, ScreenSharePresets, Track, TrackEvent, TrackInvalidError, TrackPublication, UnexpectedConnectionState, UnsupportedServer, VideoPreset, VideoPresets, VideoPresets43, VideoQuality, attachToElement, createAudioAnalyser, createE2EEKey, createKeyMaterialFromBuffer, createKeyMaterialFromString, createLocalAudioTrack, createLocalScreenTracks, createLocalTracks, createLocalVideoTrack, deriveKeys, detachTrack, facingModeFromDeviceLabel, facingModeFromLocalTrack, getEmptyAudioStreamTrack, getEmptyVideoStreamTrack, importKey, isBackupCodec, isBrowserSupported, isCodecEqual, isE2EESupported, isInsertableStreamSupported, isScriptTransformSupported, isVideoFrame, mimeTypeToVideoCodecString, protocolVersion, ratchet, setLogExtension, setLogLevel, supportsAV1, supportsAdaptiveStream, supportsDynacast, supportsVP9, version, videoCodecs };
//# sourceMappingURL=livekit-client.esm.mjs.map
