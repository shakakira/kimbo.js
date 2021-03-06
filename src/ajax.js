var mime_types = {
    xml: 'application/xml, text/xml',
    html: 'text/html',
    text: 'text/plain',
    json: 'application/json',
    script: 'text/javascript, application/javascript, application/ecmascript'
  },
  r_jsonp = /(\=)\?(&|$)|\?\?/i,
  dataParse = {
    json: Kimbo.parseJSON,
    xml: Kimbo.parseXML
  },
  xhrCallbacks = {};


// success and error callbacks
Kimbo.forEach(['success', 'error'], function (type) {
  xhrCallbacks[type] = function (res, msg, xhr, settings) {
    settings = settings || xhr;
    if (Kimbo.isFunction(settings[type])) {
      settings[type].apply(settings.context, arguments);
    }
  };
});

function _getResponse(response, type) {
  return (dataParse[type] ? dataParse[type](response) : response);
}

function _handleResponse(xhr, settings) {
  var response, contentType;

  // set dataType if missing
  if (!settings.dataType) {
    contentType = xhr.getResponseHeader('Content-Type');

    Kimbo.forEach(mime_types, function (name, type) {
      if (type.match(contentType)) {
        settings.dataType = name;
        return false;
      }
    });

    // fix settings headers
    _setHeaders(settings);
  }

  // handle response
  try {
    response = _getResponse(xhr.responseText, settings.dataType);
  } catch (e) {
    response = false;
    xhrCallbacks.error('parseerror', e, xhr, settings);
  }

  return response;
}

function _setHeaders(settings) {
  // must have this headers
  if (!settings.crossDomain && !settings.headers['X-Requested-With']) {
    settings.headers['X-Requested-With'] = 'XMLHttpRequest';
  }

  if (settings.contentType) {
    settings.headers['Content-Type'] = settings.contentType;
  }

  settings.headers.Accept = mime_types[settings.dataType] || '*/*';
}

function _timeout(xhr, settings) {
  xhr.onreadystatechange = null;
  xhr.abort();
  xhrCallbacks.error('error', 'timeout', xhr, settings);
}

function _createAbortTimeout(xhr, settings) {
  return window.setTimeout(function () {
    _timeout(xhr, settings);
  }, settings.timeout);
}

/*\
 * $.ajaxSettings
 [ property ]
 * Default ajax settings object.
 > Usage
 * If you want to change the global and default ajax settings, change this object properties:
 | $.ajaxSettings.error = function () {
 |   // handle any failed ajax request in your app
 | };
 | $.ajaxSettings.timeout = 1000; // 1 second
\*/
Kimbo.ajaxSettings = {
  type: 'GET',
  async: true,
  success: {},
  error: {},
  context: null,
  headers: {},
  data: null,
  xhr: function () {
    return new window.XMLHttpRequest();
  },
  crossDomain: false,
  timeout: 0,
  contentType: 'application/x-www-form-urlencoded; charset=UTF-8'
};


/*\
 * $.ajax
 [ method ]
 * Perform an asynchronous HTTP (Ajax) request.
 > Parameters
 - options (object) #optional An object with options
 o {
 o   url (string) Url to make the request.
 o   type (string) #optional Type of request. Could be `'GET'` or `'POST'`. Default value is `'GET'`.
 o   async (boolean) #optional Default value is `true` if you want synchronous requests set option to `false`.
 o   success (function) #optional A function that will be called if the request succeeds. Recieving (response, responseMessage, xhr, settings).
 o   error (function) #optional A function that will be called if the request fails. Recieving (response, responseMessage, xhr, settings).
 o   context (object) #optional The context in which all ajax request are made. By default the context are the settings object. Could be any DOM element.
 o   headers (object) #optional An object with additional header key/value pairs to send along with the request.
 o   data (string|object) #optional Additional data to send with the request, if it is an object is converted to a query string.
 o   xhr (function) #optional A function that returns a `new XMLHttpRequest()` object by default.
 o   crossDomain (boolean) #optional Indicate wether you want to force crossDomain requests. `false` by defualt.
 o   timeout (number) #optional Set a default timeout in milliseconds for the request.
 o   contentType (string) #optional The default and finest contentType for most cases is `'application/x-www-form-urlencoded; charset=UTF-8'`.
 o }
 = (object) The native xhr object.
 > Usage
 * Get a username passing an id to the /users url
 | $.ajax({
 |   url '/users',
 |   data: {
 |     id: 3
 |   },
 |   success: function (response, responseMessage, xhr, settings) {
 |     // success...
 |   },
 |   error: function (response, responseMessage, xhr, settings) {
 |     // error...
 |   }
 | });
\*/
Kimbo.ajax = function (options) {
  var settings = Kimbo.extend({}, Kimbo.ajaxSettings, options),
    xhr,
    abortTimeout,
    callback;

  // add data to url
  if (settings.data) {
    settings.url += (/\?/.test(settings.url) ? '&' : '?') + Kimbo.param(settings.data);
    delete settings.data;
  }

  // set default context
  if (!settings.context) {
    settings.context = settings;
  }

  // check if its jsonp
  if (r_jsonp.test(settings.url)) {
    return _getJSONP(settings);
  }

  // create new instance
  xhr = settings.xhr();

  // user specified timeout
  if (settings.timeout > 0) {
    abortTimeout = _createAbortTimeout(xhr, settings);
  }

  // on complete callback
  callback = function () {
    var response, status;

    // request complete
    if (xhr.readyState === 4) {
      status = xhr.status;

      // clear timeout
      window.clearTimeout(abortTimeout);

      // scuccess
      if ((status >= 200 && status < 300) || status === 304) {
        if (settings.async) {
          response = _handleResponse(xhr, settings);
          if (response !== false) {
            xhrCallbacks.success(response, xhr, settings);
          }
        }

      // fail
      } else {
        xhrCallbacks.error('error', xhr.statusText, xhr, settings);
      }
    }
  };

  // listen for response
  xhr.onreadystatechange = callback;

  // init request
  xhr.open(settings.type, settings.url, settings.async);

  // set settings headers
  _setHeaders(settings);

  // set xhr headers
  Kimbo.forEach(settings.headers, function (header, value) {
    xhr.setRequestHeader(header, value);
  });

  // try to send request
  xhr.send(settings.data);

  return (settings.async) ? xhr : callback();
};

/*\
 * $.get
 [ method ]
 * Load data from the server using HTTP GET request.
 > Parameters
 - url (string) A string containing the URL to which the request is sent.
 - data (string|object) #optional An option string or object with data params to send to the server.
 - callback (function) A callback function to execute if the request succeeds.
 - type (string) #optional String with the type of the data to send (intelligent guess by default).
 > Usage
 | $.get('url/users.php', { id: '123' }, function (data) {
 |   // success
 |   console.log('response:', data);
 | });
 * This method is a shorthand for the $.ajax
 | $.ajax({
 |   url: url,
 |   data: data,
 |   success: success,
 |   dataType: dataType
 | });
\*/

/*\
 * $.post
 [ method ]
 * Load data from the server using HTTP POST request.
 > Parameters
 - url (string) A string containing the URL to which the request is sent.
 - data (string|object) #optional An option string or object with data params to send to the server.
 - callback (function) A callback function to execute if the request succeeds.
 - type (string) #optional String with the type of the data to send (intelligent guess by default).
 > Usage
 | $.post('url/users.php', { user: 'denis', pass: '123' }, function (data) {
 |   // success
 |   console.log('response:', data);
 | });
 * This method is a shorthand for the $.ajax
 | $.ajax({
 |   type: 'POST',
 |   url: url,
 |   data: data,
 |   success: success,
 |   dataType: dataType
 | });
\*/
Kimbo.forEach(['get', 'post'], function (method) {
  Kimbo[method] = function (url, data, callback, type) {
    // prepare arguments
    if (Kimbo.isFunction(data)) {
      type = type || callback;
      callback = data;
      data = null;
    }

    // call ajax
    return Kimbo.ajax({
      type: method.toUpperCase(),
      url: url,
      data: data,
      success: callback,
      dataType: type
    });
  };
});

Kimbo.extend({
 /*\
  * $.getScript
  [ method ]
  * Load a JavaScript file from the server using a GET HTTP request, then execute it.
  > Parameters
  - url (string) A string containing the URL to which the request is sent.
  - callback (function) A callback function to execute if the request succeeds.
  > Usage
  | $.post('url/script.js', function (data) {
  |   // success
  |   console.log('response:', data);
  | });
  * This method is a shorthand for the $.ajax
  | $.ajax({
  |   url: url,
  |   dataType: 'script',
  |   success: success
  | });
 \*/
  getScript: function (url, callback) {
    return Kimbo.get(url, callback, 'script');
  },

 /*\
  * $.getJSON
  [ method ]
  * Load data from the server using HTTP POST request.
  > Parameters
  - url (string) A string containing the URL to which the request is sent.
  - data (string|object) #optional An option string or object with data params to send to the server.
  - callback (function) A callback function to execute if the request succeeds.
  - type (string) #optional String with the type of the data to send (intelligent guess by default).
  > Usage
  | $.post('url/test.json', { id: '2' }, function (data) {
  |   // success
  |   console.log('response:', data);
  | });
  * This method is a shorthand for the $.ajax
  | $.ajax({
  |   url: url,
  |   dataType: 'json',
  |   success: success
  | });
  * To get json data with jsonp:
  | $.getJSON('http://search.twitter.com/search.json?callback=?', 'q=#javascript', function (data) {
  |   console.log(data);
  | });
 \*/
  getJSON: function (url, data, callback) {
    return Kimbo.get(url, data, callback, 'json');
  }
});

// getJSONP internal use
function _getJSONP(settings) {
  var jsonpCallback = Kimbo.ref + '_' + Date.now(),
    script = document.createElement('script'),
    head = document.head,
    abortTimeout,
    xhr = {
      abort: function () {
        window.clearTimeout(abortTimeout);
        head.removeChild(script);
        delete window[jsonpCallback];
      }
    };

  // user specified timeout
  if (settings.timeout > 0) {
    abortTimeout = _createAbortTimeout(xhr, settings);
  }

  // set url
  script.src = settings.url.replace(r_jsonp, '$1' + jsonpCallback + '$2');

  // JSONP callback
  window[jsonpCallback] = function (response) {
    // remove script
    xhr.abort();

    // fake xhr
    Kimbo.extend(xhr, {
      statusText: 'OK',
      status: 200,
      response: response,
      headers: settings.headers
    });

    // success
    xhrCallbacks.success(response, xhr, settings);
  };

  // set settings headers
  _setHeaders(settings);

  // apend script to head to make the request
  head.appendChild(script);

  // return fake xhr object to abort manually
  return xhr;
}

/*\
 * $.param
 [ method ]
 * Create a serialized representation of an array or object, suitable for use in a URL query string or Ajax request.
 > Parameters
 - data (string|object) A string or object to serialize.
 > Usage
 | var obj = { name: 'Denis', last: 'Ciccale' };
 | var serialized = $.param(obj); // 'name=Denis&last=Ciccale'
\*/
Kimbo.param = function (data) {
  var params = '';

  if (Kimbo.isObject(data)) {
    Kimbo.forEach(data, function (name, value) {
      params += name + '=' + value + '&';
    });
  } else {
    params = data;
  }

  return window.encodeURIComponent(params).replace(/%20/g, '+').replace(/%\d[D6F]/g, window.unescape).replace(/^\?|&$/g, '');
};
