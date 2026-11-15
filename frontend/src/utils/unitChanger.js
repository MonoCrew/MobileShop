/**
 * Global Unit Changer Utility
 * Formats large payments and monetary amounts into human-readable units:
 * - Trillion (>= 1,000,000,000,000)
 * - Billion (>= 1,000,000,000)
 * - Million (>= 1,000,000)
 * - Lac     (>= 100,000)
 * - Standard comma-separated numbers (< 100,000 e.g. "Rs. 1,200", "Rs. 25,000")
 *
 * @param {number|string} amount - The numeric value to format
 * @param {object} options - Configuration options
 * @param {string} [options.prefix="Rs. "] - Currency or text prefix
 * @param {boolean} [options.showPrefix=true] - Whether to show the prefix
 * @param {number} [options.decimals=2] - Maximum decimal places
 * @param {boolean} [options.sign=false] - Whether to show explicit '+' for positive values
 * @param {boolean} [options.compactThousand=false] - If true, abbreviates >= 1,000 as 'k'
 * @returns {string} Formatted string e.g. "Rs. 246.41 Billion", "Rs. 1.5 Lac", "Rs. 1,200"
 */
export function formatUnit(amount, options = {}) {
  const {
    prefix = "Rs. ",
    showPrefix = true,
    decimals = 2,
    sign = false,
    compactThousand = false,
  } = options;

  if (amount === null || amount === undefined || amount === "") {
    return `${showPrefix ? prefix : ""}0`;
  }

  const num = Number(amount);
  if (isNaN(num)) {
    return `${showPrefix ? prefix : ""}0`;
  }

  const isNegative = num < 0;
  const abs = Math.abs(num);

  let signStr = "";
  if (isNegative) {
    signStr = "-";
  } else if (sign && num > 0) {
    signStr = "+";
  }

  const pref = showPrefix ? prefix : "";

  // Helper to format decimal numbers and trim unnecessary trailing zeros (e.g. 2.50 -> 2.5, 2.00 -> 2)
  const formatNum = (val) => {
    const formatted = val.toFixed(decimals);
    return formatted.replace(/\.?0+$/, "");
  };

  if (abs >= 1_000_000_000_000) {
    return `${signStr}${pref}${formatNum(abs / 1_000_000_000_000)} Trillion`;
  }
  if (abs >= 1_000_000_000) {
    return `${signStr}${pref}${formatNum(abs / 1_000_000_000)} Billion`;
  }
  if (abs >= 1_000_000) {
    return `${signStr}${pref}${formatNum(abs / 1_000_000)} Million`;
  }
  if (abs >= 100_000) {
    return `${signStr}${pref}${formatNum(abs / 100_000)} Lac`;
  }
  if (compactThousand && abs >= 1_000) {
    return `${signStr}${pref}${formatNum(abs / 1_000)}k`;
  }

  // Amounts under 100,000: Format with commas (e.g. "Rs. 1,200", "Rs. 15,500")
  const formattedWithCommas =
    Math.round(abs) === abs
      ? abs.toLocaleString("en-US")
      : Number(abs.toFixed(decimals)).toLocaleString("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: decimals,
        });

  return `${signStr}${pref}${formattedWithCommas}`;
}

// Alias for convenience
export const unitChanger = formatUnit;

/**
 * Returns full precision currency string with commas for tooltips or detailed views
 * @param {number|string} amount
 * @param {string} [prefix="Rs. "]
 * @returns {string} e.g. "Rs. 246,406,464,002"
 */
export function formatFullAmount(amount, prefix = "Rs. ") {
  const num = Number(amount || 0);
  if (isNaN(num)) return `${prefix}0`;
  return `${num < 0 ? "-" : ""}${prefix}${Math.abs(num).toLocaleString("en-US")}`;
}

export default formatUnit;
