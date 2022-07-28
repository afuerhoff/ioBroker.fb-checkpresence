/*
 * Date Format 1.2.3
 * (c) 2007-2009 Steven Levithan <stevenlevithan.com>
 * MIT license
 *
 * Includes enhancements by Scott Trenda <scott.trenda.net>
 * and Kris Kowal <cixar.com/~kris.kowal/>
 *
 * Accepts a date, a mask, or a date and a mask.
 * Returns a formatted version of the given date.
 * The date defaults to the current date/time.
 * The mask defaults to dateFormat.masks.default.
 */

//https://blog.stevenlevithan.com/archives/javascript-date-format

//Includes enhancements from https://github.com/felixge/node-dateformat v5.0.3

const dateFormat = function () {
    const	token = /d{1,4}|D{3,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|W{1,2}|[LlopSZN]|"[^"]*"|'[^']*'/g,
        //timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,
        timezone = /\b(?:[A-Z]{1,3}[A-Z][TC])(?:[-+]\d{4})?|((?:Australian )?(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time)\b/g,
        timezoneClip = /[^-+\dA-Z]/g,
        pad = function (val, len) {
            val = String(val);
            len = len || 2;
            while (val.length < len) val = '0' + val;
            return val;
        };

    // Regexes and supporting functions are cached through closure
    return function (date, mask, utc) {
        const dF = dateFormat;

        // You can't provide utc if you skip other args (use the "UTC:" mask prefix)
        if (arguments.length == 1 && Object.prototype.toString.call(date) == '[object String]' && !/\d/.test(date)) {
            mask = date;
            date = undefined;
        }

        // Passing date through Date applies Date.parse, if necessary
        date = date ? new Date(date) : new Date;
        if (isNaN(date)) throw SyntaxError('invalid date');

        mask = String(dF.masks[mask] || mask || dF.masks['default']);

        // Allow setting the utc argument via the mask
        if (mask.slice(0, 4) == 'UTC:') {
            mask = mask.slice(4);
            utc = true;
        }

        const	_ = utc ? 'getUTC' : 'get',
            d = date[_ + 'Date'](),
            D = date[_ + 'Day'](),
            m = date[_ + 'Month'](),
            y = date[_ + 'FullYear'](),
            H = date[_ + 'Hours'](),
            M = date[_ + 'Minutes'](),
            s = date[_ + 'Seconds'](),
            L = date[_ + 'Milliseconds'](),
            o = utc ? 0 : date.getTimezoneOffset(),
            W = getWeek(date),
            N = getDayOfWeek(date),
            flags = {
                d:    d,
                dd:   pad(d),
                ddd:  dF.i18n.dayNames[D],
                DDD:  getDayName({y: y, m: m, d: d, _: _, dayName: dateFormat.i18n.dayNames[D], short: true}),
                dddd: dF.i18n.dayNames[D + 7],
                DDDD: getDayName({y: y, m: m, d: d, _: _, dayName: dateFormat.i18n.dayNames[D + 7]}),
                m:    m + 1,
                mm:   pad(m + 1),
                mmm:  dF.i18n.monthNames[m],
                mmmm: dF.i18n.monthNames[m + 12],
                yy:   String(y).slice(2),
                yyyy: y,
                h:    H % 12 || 12,
                hh:   pad(H % 12 || 12),
                H:    H,
                HH:   pad(H),
                M:    M,
                MM:   pad(M),
                s:    s,
                ss:   pad(s),
                l:    pad(L, 3),
                L:    pad(L > 99 ? Math.round(L / 10) : L),
                t:    H < 12 ? 'a'  : 'p',
                tt:   H < 12 ? 'am' : 'pm',
                T:    H < 12 ? 'A'  : 'P',
                TT:   H < 12 ? 'AM' : 'PM',
                Z:    utc ? 'UTC' : (String(date).match(timezone) || ['']).pop().replace(timezoneClip, ''),
                o:    (o > 0 ? '-' : '+') + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
                p:    (o > 0 ? '-' : '+') + pad(Math.floor(Math.abs(o) / 60), 2) + ':' + pad(Math.floor(Math.abs(o) % 60), 2),
                S:    ['th', 'st', 'nd', 'rd'][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10],
                W:    W,
                WW:   pad(W),
                N:    N
            };

        return mask.replace(token, function ($0) {
            return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
        });
    };
}();

/**
 * Get day name
 * Yesterday, Today, Tomorrow if the date lies within, else fallback to Monday - Sunday
 * @param  {Object}
 * @return {String}
 */
const getDayName = ({ y, m, d, _, dayName, short = false }) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday[_ + 'Date']() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow[_ + 'Date']() + 1);
    const today_d = () => today[_ + 'Date']();
    const today_m = () => today[_ + 'Month']();
    const today_y = () => today[_ + 'FullYear']();
    const yesterday_d = () => yesterday[_ + 'Date']();
    const yesterday_m = () => yesterday[_ + 'Month']();
    const yesterday_y = () => yesterday[_ + 'FullYear']();
    const tomorrow_d = () => tomorrow[_ + 'Date']();
    const tomorrow_m = () => tomorrow[_ + 'Month']();
    const tomorrow_y = () => tomorrow[_ + 'FullYear']();
  
    if (today_y() === y && today_m() === m && today_d() === d) {
        return short ? 'Tdy' : 'Today';
    }
    else if (yesterday_y() === y && yesterday_m() === m && yesterday_d() === d) {
        return short ? 'Ysd' : 'Yesterday';
    }
    else if (tomorrow_y() === y && tomorrow_m() === m && tomorrow_d() === d) {
        return short ? 'Tmw' : 'Tomorrow';
    }
    return dayName;
};

/**
 * Get the ISO 8601 week number
 * Based on comments from
 * http://techblog.procurios.nl/k/n618/news/view/33796/14863/Calculate-ISO-8601-week-and-year-in-javascript.html
 *
 * @param  {Date} `date`
 * @return {Number}
 */
const getWeek = (date) => {
    // Remove time components of date
    const targetThursday = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );
  
    // Change date to Thursday same week
    targetThursday.setDate(
        targetThursday.getDate() - ((targetThursday.getDay() + 6) % 7) + 3
    );
  
    // Take January 4th as it is always in week 1 (see ISO 8601)
    const firstThursday = new Date(targetThursday.getFullYear(), 0, 4);
  
    // Change date to Thursday same week
    firstThursday.setDate(
        firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3
    );
  
    // Check if daylight-saving-time-switch occurred and correct for it
    const ds =
      targetThursday.getTimezoneOffset() - firstThursday.getTimezoneOffset();
    targetThursday.setHours(targetThursday.getHours() - ds);
  
    // Number of weeks between target Thursday and first Thursday
    const weekDiff = (targetThursday - firstThursday) / (86400000 * 7);
    return 1 + Math.floor(weekDiff);
};
  
/**
   * Get ISO-8601 numeric representation of the day of the week
   * 1 (for Monday) through 7 (for Sunday)
   *
   * @param  {Date} `date`
   * @return {Number}
   */
const getDayOfWeek = (date) => {
    let dow = date.getDay();
    if (dow === 0) {
        dow = 7;
    }
    return dow;
};
  
// Some common format strings
dateFormat.masks = {
    'default':      'ddd mmm dd yyyy HH:MM:ss',
    shortDate:      'm/d/yy',
    paddedShortDate:'mm/dd/yyyy',
    mediumDate:     'mmm d, yyyy',
    longDate:       'mmmm d, yyyy',
    fullDate:       'dddd, mmmm d, yyyy',
    shortTime:      'h:MM TT',
    mediumTime:     'h:MM:ss TT',
    longTime:       'h:MM:ss TT Z',
    isoDate:        'yyyy-mm-dd',
    isoTime:        'HH:MM:ss',
    isoDateTime:    "yyyy-mm-dd'T'HH:MM:ss",
    isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
};

// Internationalization strings
dateFormat.i18n = {
    dayNames: [
        'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
        'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
    ],
    monthNames: [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
        'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
    ],
    timeNames: [
        'a', 'p', 'am', 'pm', 'A', 'P', 'AM', 'PM'
    ]
};

// For convenience...
Date.prototype.format = function (mask, utc) {
    return dateFormat(this, mask, utc);
};

exports.dateFormat = dateFormat;