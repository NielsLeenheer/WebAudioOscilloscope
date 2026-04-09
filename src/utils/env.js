/**
 * Custom env() value replacement
 *
 * Replaces custom env() values in strings before DOM insertion.
 * Supports optional default values which are ignored (we always resolve).
 *
 * Supported values:
 *   env(time-hour)       -> current hour (0-23)
 *   env(time-minute)     -> current minute (0-59)
 *   env(time-second)     -> current second (0-59)
 *   env(time-hour, 12)   -> current hour (default value ignored)
 */

const ENV_REGEX = /env\(\s*([\w-]+)(?:\s*,\s*[^)]+)?\s*\)/g;

const resolvers = {
    'time-hour': () => new Date().getHours(),
    'time-minute': () => new Date().getMinutes(),
    'time-second': () => new Date().getSeconds()
};

/**
 * Replace all env() values in a string
 * @param {string} str - Input string
 * @returns {string} String with env() values resolved
 */
export function resolveEnv(str) {
    if (!str || !str.includes('env(')) return str;

    return str.replace(ENV_REGEX, (match, name) => {
        const resolver = resolvers[name];
        if (resolver) return String(resolver());
        return match; // Unknown env(), leave as-is
    });
}
