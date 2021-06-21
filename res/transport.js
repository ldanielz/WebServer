// The code here implements the transport protocol between the controls and the Iot application.
// It can be changed to use alternate transport mechanisms and formatting as required for a particular platform.
var statusRequests = 0;
var statusFails = 0;
var statusAborted = false;
var statusHttpRequest = null;
var messageQueue = [];
var messageHttpRequest = null;
var firstResponse = true;
var iotBtn1 = $("#iotBtn1");
var state = 0;

document.title = "Virtual Front Panel (ESP8266)"

  
$(function () {
   iotBtn1.on('click', function () {
      //postEvent('IotBtn1', 1);
      postState('IotBtn1', "state", state ? 1 : 0);      
      $(this).toggleClass('btn-primary btn-danger');      
      state = !state;
      var statusText = state ? 'Lampada Ligada' : 'Lampada Desligada';
      $('#statusLed').val(statusText);
      $(this).html(state ? 'Desligar' : 'Ligar');
      //var getValState = getState('IotBtn1');  
      //statusRequest();
   })    
})
function statusRequest() {
   statusHttpRequest = new XMLHttpRequest();
   statusHttpRequest.timeout = 30000;
   statusHttpRequest.onreadystatechange = function () {
      if (statusHttpRequest.readyState == 4 && !statusAborted) {
         if (statusHttpRequest.status == 200) {
            // We have received a status response, all is well. Typically the first one will occur for 'session' which will respond
            // immediately so we can make a call on the viewer here to say/confirm that we are up and runnng.
            
            if (firstResponse) {
               if (typeof (viewer) == 'object' && viewer.setConnected != undefined)
                  viewer.setConnected(1);
               firstResponse = false;
            }            
            //parseResponse(statusHttpRequest.response);
            var response = statusHttpRequest.response;
            var lines = response.replace(/[^a-z0-9\s\u003D]/gi, '').replace(/\=/g, ':');
            var split = lines.split('\n');
            statusFails = 0; // reset the fail counter
            JSON.parse(JSON.stringify(split), (key, value) => {
               console.log(key);
               console.log(value);
            })
            //statusRequest();
         }
         else if (statusHttpRequest.status != 403 && ++statusFails < 3) {
            // If the status request fails then try to re-make it. Timeouts with broken connection seem to take 3-4 s
            // A 403 will occur where the server has been reset and a status request occurs without a prior reload.
            console.log("Status request failed", statusHttpRequest.status);
            window.setTimeout(statusRequest, 1000);
         }
         else {
            // Failed to reconnect - show an error:
            statusAbort();
            statusLost();
         }
      }
   };
   statusHttpRequest.ontimeout = function () {
      // Normally, a timeout occurs where the connection to the appliance is still valid but there is no response; it can also
      // occur if the appliance has been turned off or gone out of wifi range. We count this situation as 3 fails in total. 
      // The readystate will go to 4=done after a timeout so the mechanism above will trigger and the host/viewer will be informed.
      statusAbort();
      statusLost();
   };
   if (statusRequests++ == 0)
      statusHttpRequest.open("GET", "session", true);
   else
      statusHttpRequest.open("GET", "status", true);
   statusHttpRequest.send();
}

function postEvent(id, msg) { sendMessage("POST", id, null, msg); }
function postState(id, state, msg) { sendMessage("POST", id, state, msg); }
function recordState(id, state, msg) { sendMessage("PUT", id, state, msg); }
function getState(id) { sendMessage("GET", id, null, null); }

// Transmit state change event - the new state will be recorded/preserved by the server
function sendMessage(action, id, state, msg) {
   var params = "", arg;
   //console.log(action, id, state, msg);

   if (msg != undefined) {
      if (typeof (msg) != 'object')
         msg = [msg];
      for (var i in msg) {
         if (typeof (msg[i]) === 'string')
            arg = JSON.stringify(msg[i]);
         else
            arg = msg[i];
         if (i > 0)
            params = params + ',';
         params = params + arg;
      }
   }

   if (state != null) {
      messageQueue.push([action, id + "." + state + "=" + params]);
   } else {
      messageQueue.push([action, id + "=" + params]);
   }
   if (messageQueue.length == 1)
      dispatchMessages();
}

// Attempt to dispatch any queued messages. 
// Messages are dispatched in order and in batches (of the same action type)
// enabling a fairly fast throughput even over a slow link.
// The mesage body is disguised as pseudo JSON for the purposes of the ESP8266 web server.
function dispatchMessages() {
   if (messageQueue.length > 0) {
      var body = "";
      var msgCount = 0;
      var action = messageQueue[0][0];
      for (var i = 0; i < messageQueue.length && messageQueue[i][0] == action; ++i) {
         body += "{\n";
         body += messageQueue[i][1] + "\n";
         body += "}\n";
         msgCount += 1;
      }
      console.log(body);
      body += "\n";
      messageHttpRequest = new XMLHttpRequest();
      messageHttpRequest.open(action, "event", true);
      messageHttpRequest.setRequestHeader("Content-type", "text/plain");
      messageHttpRequest.timeout = 0;
      messageHttpRequest.onreadystatechange = function () {
         if (messageHttpRequest.readyState == 4 && !statusAborted) {
            if (messageHttpRequest.status == 200){
               //console.log(messageHttpRequest.responseText);
               messageQueue.splice(0, msgCount);  // Success so remove messages
            }
            dispatchMessages(); // Go again if messages are waiting.                                     
         }
      }
      messageHttpRequest.send(body);
   }
}

// Request a data or resource file from the server, then call a function when the request is complete.
function requestFile(filename, handler) {
   var xhttp = new XMLHttpRequest();
   xhttp.onreadystatechange = function () {
      if (xhttp.readyState == 4) {
         var text = (xhttp.status == 200) ? xhttp.responseText : null;
         handler(text);
      }
   }

   xhttp.open("GET", "/" + filename, true);
   xhttp.send();
}

function statusLost() {
   if (typeof (viewer) == "object" && viewer.setConnected != undefined)
      viewer.setConnected(0);
   //container.innerHTML = "<P class=\"error\">Lost connection to the '" + pageTitle + "'.</P>";
}

function statusAbort() {
   statusAborted = true;
   if (statusHttpRequest != null)
      statusHttpRequest.abort()
   if (messageHttpRequest != null)
      messageHttpRequest.abort()
}


function parseResponse(responseText) {
   var lines = responseText.split('\n');
   for (var i in lines) {
      if (lines[i].length > 0) {
         // The regex parses object.member = args and object.member (args)
         var rx = /([$a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\=?\s*(.*)/;
         var parts = rx.exec(lines[i]);
         var command;
         if (parts != null && parts.length == 4) {
            var ctl = parts[1];
            var member = parts[2];
            var args = parts[3];
            if (ctl == "$") {
               switch (member.split('.')[0]) {
                  case "title": pageTitle = eval(args); console.log('update page title'); break;
                  case "create":
                     var control = member.split('.')[1];
                     var className = eval(args);
      
                     //Check if the object instance exists already before adding
                     if (!controlObjects[control]) {
                        controlObjects[control] = eval(" new " + className + "('" + control + "')");
                     }

                     break;

                  case "authorized":
                     updateAuthorization(args === "1");
                     break;
               }
            } else if (typeof controlObjects[ctl] == "object") {
               console.log(lines[i]);
               if (args[0] == '(') {
                  // Simple method call:
                  command = 'controlObjects[ctl].' + member + args;
               } else {
                  // Assignments are translated to a setXXX call here, if such a function is defined or setState(member, value) if that is defined.
                  // This could be removed once we know we have ECMA 6 browsers everywhere since we could use actual setters
                  var setter = 'set' + member[0].toUpperCase() + member.substring(1);
                  if (controlObjects[ctl][setter] != undefined)
                     command = 'controlObjects[ctl].' + setter + '(' + args + ')';
                  else if (controlObjects[ctl].setState != undefined)
                     command = 'controlObjects[ctl].' + setState + '("' + member + '",' + args + ')';
                  else
                     command = 'controlObjects[ctl].' + member + '=' + args;
               }
               if (typeof command === "string") {
                  try {
                     eval(command);
                  } catch (err) {
                     console.log("Eval:" + err.message)
                  }
               }
            }
         }
      }
   }
}