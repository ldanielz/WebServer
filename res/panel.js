// Virtual Front Panel - Javascript Framework.
var svgNS = 'http://www.w3.org/2000/svg';
var vfpNS = 'http://www.labcenter.com/namespaces/vfp';

var panelBounds = null;
var controlObjects = [];
var pageTitle = "";
var activeTab = null;
var capture = null;
var authorized = false;

//quick touch support check
var supportsTouch = 'ontouchstart' in window || navigator.msMaxTouchPoints;

function initPage() {
   window.onbeforeunload = function () { if (typeof (editor) == 'object') removeSignalHandlers(); statusAbort(); };

   if (typeof (statusRequest) != "function") {
      container.innerHTML = "<P class=\"error\">File 'transport.js' is missing.<BR>Please update the driver of the VFP server.</P>";
      return;
   }

   if (typeof (transport) == "object") {
      // Simulation mode: cheat by loading the panel directly:
      var content = transport.loadResource("panel.svg"); // TBD - choose form factor?
      if (content != "") {
         var div = document.createElement("div");
         div.innerHTML = content;
         var panelRoot = div.firstElementChild;
         panelRoot.setAttribute("class", "panel");
         container.replaceChild(panelRoot, container.firstChild);
         initPanel(panelRoot);
         return;
      }
   }

   var xhttp = new XMLHttpRequest();
   xhttp.onreadystatechange = function () {
      if (xhttp.readyState == 4) {
         if (xhttp.status == 200) {
            var container = document.getElementById("container");
            var panelDoc = xhttp.responseXML;
            var panelRoot = panelDoc.documentElement;
            panelRoot.setAttribute("class", "panel");
            container.replaceChild(panelRoot, container.firstChild);
            initPanel(panelRoot);
         }
         else if (xhttp.status == 404) {
            var container = document.getElementById("container");
            container.innerHTML = "<P class=\"error\">PANEL.SVG not found - please refer to the documentation</P>";
         }
      }
   };
   xhttp.open("GET", "/panel.svg", true);
   xhttp.send();
}

function initPanel(svg) {
   // Set the pageTitle and active tab.
   var tabs = getTabsArray();
   var publicTabs = getPublicTabsArray();

   if (svg.hasAttribute('vfp:title')) {
      pageTitle = svg.getAttribute('vfp:title');
   } else {
      pageTitle = document.title;
   }

   // If operating under viewer, we may need to resize to the panel and pass over the tab names:
   if (typeof (viewer) == 'object') {

      updateViewerTabs(publicTabs);

      if (viewer.resize != undefined) {
         var panelRect = svg.getBoundingClientRect();

         //Set viewer to accomodate pagination if more than 1 tab
         if (tabs.length > 1 && supportsTouch != true) {
            viewer.resize(panelRect.width, panelRect.height + 20);
         } else {
            viewer.resize(panelRect.width, panelRect.height);
         }
      }
   }

   // Set up for either editing or viewing:
   if (typeof (editor) == 'object') {
      initEditor(tabs.length == 0);
   } else {
      // Set up for touch vs mouse operation:
      if ('ontouchstart' in window) {
         window.addEventListener("touchstart", onpaneltouchstart, { passive: false });
         window.addEventListener("touchmove", onpaneltouchmove, { passive: false });
         window.addEventListener("touchend", onpaneltouchend, { passive: false });
         removeScrollers();
         removePagination();
         convertToStrip();
      } else {
         window.onmousedown = onpanelmousedown;
         window.onmouseup = onpanelmouseup;
         window.onmousemove = onpanelmousemove;

         if (publicTabs.length > 1) {

            showScrollers();
            showPagination(publicTabs);

            //Allow tab movement through keypress (left and right arrow)
            //Make sure the focus isnt on an input or select etc
            document.onkeydown = function (e) {
               var activeElement = document.activeElement;
               var inputs = ['input', 'select', 'button', 'textarea'];

               if (activeElement && inputs.indexOf(activeElement.tagName.toLowerCase()) == -1) {
                  switch (e.keyCode) {
                     case 37:
                        selectPreviousTab()
                        break;
                     case 39:
                        selectNextTab();
                        break;
                  }
               }
            };
         }
      }

      // Select the first tab:
      selectTabByOrdinal(0);
   }

   // Store this for future use:   
   panelBounds = panel.createSVGRect();
   panelBounds.width = panelWidth();
   panelBounds.height = panelHeight();
   panelBounds.x = -panelBounds.width / 2;
   panelBounds.y = -panelBounds.height / 2;

   //Create all controls (even hidden tabs)
   createControls(tabs);

   if (typeof (editor) !== "object") {
      updateAuthorization(false);
   }

   // Update the overlays after a tick - this issues related to the nested CSS layout:
   window.setTimeout(updateOverlays, 1);

   // Kick off the reverse AJAX process:
   statusRequest();
}

// Create a controller class object for the specified group element:
function initControl(root, config, reconfigure) {
   var control = null;
   var className = root.getAttribute("vfp:class");
   if (eval("typeof " + className + " == \"function\"")) {
      control = eval(" new " + className + "(root, config)");
      control.id = root.id;
      root.obj = control; // allows access to the class object from the element

      if (reconfigure && control.reconfigure != undefined) {
         var newinstance = (getVfpConfig(root) === undefined);
         control.reconfigure(newinstance);
      }
   }
   return control;
}

//Show slide prev/next
function showScrollers() {
   var scrollers = document.querySelectorAll(".scroller-path");
   if (scrollers.length) {
      for (var i = 0; i < scrollers.length; ++i) {
         scrollers[i].style.display = "inline";
      }
   }
}

// Remove the scrollers. 
function removeScrollers() {
   var scrollers = document.querySelectorAll(".scroller-path");
   if (scrollers.length) {
      for (var i = 0; i < scrollers.length; ++i) {
         scrollers[i].style.display = "none";
      }
   }
}

// Set arrow colours depending on where the user is
// Show them they can't go any further etc
function updateScrollerArrows(tabNumber, tabs) {

   var scrollers = document.querySelectorAll(".scroller-path");

   if (scrollers.length) {

      var firstScroller = scrollers[0];
      var secondScroller = scrollers[1];

      if (tabNumber == 0)
         firstScroller.style.cursor = "not-allowed";
      else
         firstScroller.style.cursor = "pointer";

      if (tabNumber + 1 == tabs.length)
         secondScroller.style.cursor = "not-allowed";
      else
         secondScroller.style.cursor = "pointer";
   }
}

//Show pagination
//Amount of tabs passed
function showPagination(publicTabs) {

   var pagination = document.querySelector(".pagination");
   var paginationTD = document.querySelector(".pagination td");

   //Display pagination table row
   pagination.style.display = "table-row";

   //Construct html to return in pagination td
   var paginationLinks = "";

   for (var i = 0; i < publicTabs.length; i++) {
      paginationLinks += '<svg onclick="updatePagination(' + i + ', true)" height="20" width="20">';
      paginationLinks += '<circle cx="10" cy="10" r="8" stroke="white" stroke-width="2" fill="none" />';
      paginationLinks += '</svg>';
   }

   //Set the constructed html to the td
   paginationTD.innerHTML = paginationLinks;
}

// Update Pagination - fill relevant circle
function updatePagination(paginationEl, changeTab) {

   //Get pagination for filling active
   var pagination = document.querySelectorAll(".pagination circle");

   if (pagination.length) {
      //Remove fill from all circles
      for (var i = 0; i < pagination.length; i++) {
         pagination[i].style.fill = "none";
      }

      //Add fill to relevant tab circle
      pagination[paginationEl].style.fill = "white";
   }

   if (changeTab) {
      selectTabByOrdinal(paginationEl);
   }
}

// Remove pagination / hide it
function removePagination() {

   //select pagination elem
   var pagination = document.querySelector(".pagination");

   //Display pagination table row
   pagination.style.display = "none";

}

// Reconfigure the panel for touch/swipe scrolling:
function convertToStrip() {
   // Relocate the tabs to form a horizontal strip and make them all visible:

   var allTabs = getTabsArray();
   var tabs = getPublicTabsArray();

   //Set all tabs to display none
   for (var i = 0; i < allTabs.length; i++) {
      allTabs[i].style.display = "none";
   }

   for (var i = 0; i < tabs.length; ++i) {
      var t = panel.createSVGTransform();
      var offset = i * panelWidth();
      t.setTranslate(offset, 0);
      tabs[i].transform.baseVal.initialize(t, 0);
      tabs[i].style.display = "inline";
   }

   // Duplicate the background.
   // The existing background image is moved into a group:
   var background = document.getElementById("Background");
   var image = background.firstElementChild;
   if (image.firstElementChild == null || authorized === true) {
      var group = document.createElementNS(svgNS, 'g');
      background.replaceChild(group, image);
      group.appendChild(image);

      // Step repeat for the additonal tabs. 
      for (var i = 1; i < tabs.length; ++i) {
         var copy = image.cloneNode(true);
         var t = panel.createSVGTransform();
         var offset = i * panelWidth();
         t.setTranslate(offset, 0);
         copy.transform.baseVal.appendItem(t, 0);
         group.appendChild(copy);
      }
   }
}

// Revert the actions of convert to strip - this is largely for debugging:
function revertToStack() {
   // Remove transforms from the tabs:
   var tabs = getTabsArray();
   for (var i = 1; i < tabs.length; ++i) {
      tabs[i].transform.baseVal.clear();
      tabs[i].style.display = tabs[i] == activeTab ? "inline" : "none";
   }

   // Remove duplicated background images:
   var background = document.getElementById("Background");
   var group = background.firstElementChild;
   var image = group.firstElementChild;
   if (image != null)
      background.replaceChild(image, group);

   // Reset the viewbox:   
   scrollToTab(0);
}

function isScrollable() {
   var background = document.getElementById("Background");
   var image = background.firstElementChild;
   return image.firstElementChild != null;
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
                  case "title": pageTitle = eval(args); updateDocumentTitle(); break;
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

// Select next tab:
function selectNextTab() {
   var tabs = getPublicTabsArray();
   var idx = getTabIndex();
   if (idx < tabs.length - 1) {
      selectTabByOrdinal(idx + 1);
   } else {
      selectTabByOrdinal(idx);
   }
}

// Select previous tab:
function selectPreviousTab() {
   var idx = getTabIndex();
   if (idx > 0) {
      selectTabByOrdinal(idx - 1)
   } else {
      selectTabByOrdinal(0)
   }
}

// Select a tab by zero based ordinal.
function selectTabByOrdinal(tabNumber) {

   var allTabs = getTabsArray();
   var publicTabs = getPublicTabsArray();
   var prevTab = activeTab;

   if (isScrollable()) {
      scrollToTab(tabNumber, true);
   } else {

      //Set all tabs to display none
      for (var i = 0; i < allTabs.length; i++) {
         allTabs[i].style.display = "none";
      }

      //Only show relevant public tabs
      for (var i = 0; i < publicTabs.length; i++) {
         if (i == tabNumber) {
            publicTabs[i].style.display = "inline";
         }
      }

      //Update arrow styling
      //Browser and viewer only (not shown on editor)
      if (typeof (editor) !== 'object' && allTabs.length > 1 && supportsTouch === undefined) {
         updateScrollerArrows(tabNumber, publicTabs);
      }

      //Update Pagination only if multiple and active
      //Viewer only (not shown on editor)
      if (typeof (editor) !== 'object' && allTabs.length > 1 && supportsTouch === undefined) {
         updatePagination(tabNumber);
      }
   }

   activeTab = publicTabs[tabNumber];
   updateDocumentTitle();
   updateOverlays();

   if (typeof (editor) === 'object' && publicTabs.length > 1 && activeTab != prevTab) {
      clearSelection();
      showTabLabel(true);
   }

}


// Show the named tab, hide all the others
// Note that the first layer is always the background image.
function selectTabByName(name) {
   var tabs = getTabsArray();
   var prevTab = activeTab;
   for (var i = 0; i < tabs.length; ++i) {
      if (tabs[i].id == name) {
         tabs[i].style.display = "inline";
         activeTab = tabs[i];
         updateDocumentTitle();
      }
      else
         tabs[i].style.display = "none";
   }
   if (typeof (editor) == 'object' && activeTab != prevTab) {
      clearSelection();
      showTabLabel(true);
   }
   updateOverlays();
}

function updateDocumentTitle() {
   var tabs = getPublicTabsArray();
   var currentTab = getTabIndex();

   //If multiple tabs / pagination needed
   if (tabs.length > 1) {

      //construct text and chars for title
      var title = "";
      title += pageTitle + " - " + activeTab.id + " - ";

      for (i = 0; tabs.length > i; i++) {
         if (currentTab == i) {
            title += " \u25C6";
         } else {
            title += " \u25C7";
         }
      }

      //Return constructed title
      document.title = title;

   } else {
      document.title = pageTitle;
   }
   if (typeof (viewer) == 'object' && viewer.setConnected != undefined) {
      viewer.setConnected(1); // This needed for IoS - we should really have a hander in the app but it was messy - 
   }
}

// Return the array of top level <g> elements excluding the background.
function getTabsArray() {
   return panel.querySelectorAll("svg > g:not(#Background)");
}

//Return tabs which dont require auth
function getPublicTabsArray() {
   var tabs = panel.querySelectorAll("svg > g:not(#Background)");
   var publicTabs = [];

   //Add all if authed or within editor
   //Get auth check for if the user has turned off panel settings without removing option from the indiviaul tab
   for (i = 0; i < tabs.length; i++) {
      if (!tabs[i].hasAttribute("vfp:requiresauth") ||
         authorized === true ||
         typeof (editor) === 'object' ||
         getAuthStatus() === '0'
      ) {
         publicTabs.push(tabs[i]);
      }
   }

   return publicTabs;
}

// Return the ordinal of the current tab.
function getTabIndex() {
   var tabs = getPublicTabsArray();
   for (var i = 0; i < tabs.length; i++) {
      if (tabs[i] == activeTab) {
         return i;
      }
   }
   return 0; // default     
}

// Translate mouse coords to a point within an svg object by using that object's CTM.
function getEventPos(evt, obj) {
   var panelRect = panel.getBoundingClientRect();
   var p = panel.createSVGPoint();
   var ctm = obj.getCTM();
   p.x = evt.clientX - panelRect.left;
   p.y = evt.clientY - panelRect.top;
   p = p.matrixTransform(ctm.inverse());
   return p;

}

function isVisible(obj) {
   while (obj != null && obj != panel) {
      if (obj.style.display == 'none')
         return false;
      obj = obj.parentNode;
   }
   return true;
}

// Return true if a control has been configured:
function hasControlConfig(control) {
   return control.hasAttribute('vfp:config') || control.getElementsByTagName('vfp:config')[0] != undefined;
}

// Return the control config properties as a JS object.
// Attribute names containing ',' characters result in a hierarchical object definition.
function getControlConfig(control) {
   // Control config, if present:   
   var config = {};
   var elem = getVfpConfig(control);
   if (elem != undefined) {
      if (elem.firstChild != null) {
         // New style: JSON string is stored as escaped text
         config = JSON.parse(elem.textContent);
      }
      else if (elem.hasAttributes()) {
         // Legacy - config is stored as attributes of a vfp:config element
         // These are parsed in order to re-assemble the config object.
         while (elem.attributes.length > 0) {
            var name = elem.attributes[0].name;
            var names = name.split('.');
            var item = config;
            for (var j = 0; j < names.length - 1; ++j) {
               var group = names[j];
               if (item[group] == undefined)
                  item[group] = {};
               item = item[group];
            }
            item[names[j]] = elem.attributes[0].value;
            elem.removeAttribute(name);
         }

         // Re-store as JSON text
         setControlConfig(control, config);
      }
   }
   return config;
}

// Store a config object as escaped JSON text
function setControlConfig(control, config) {
   var configNode = getVfpConfig(control);
   var json = JSON.stringify(config);
   if (configNode == undefined) {
      configNode = document.createElement('vfp:config'); // May not work in newer browsers
      control.appendChild(configNode);
   }
   configNode.textContent = json;
}

// Return the vfp:config element - this is a bit quirky due to namespace issues in webkit
function getVfpConfig(control) {
   var elem = control.getElementsByTagNameNS(vfpNS, 'config')[0];
   if (elem == undefined)
      elem = control.getElementsByTagName('vfp:config')[0]; // For legacy webkit
   return elem;
}


// Create a JS element over to overlay a specified region of a control 
function createOverlay(owner, target, elementType) {
   if (target.overlay == undefined)
      target.overlay = document.createElement(elementType);

   var panelRect = container.getBoundingClientRect();
   var ctrlRect = target.getBoundingClientRect();
   var top = ctrlRect.top - panelRect.top;
   var left = ctrlRect.left - panelRect.left;
   var width = ctrlRect.right - ctrlRect.left;
   var height = ctrlRect.bottom - ctrlRect.top;
   var overlay = target.overlay;
   overlay.onmousedown = function (e) { e.stopPropagation(); }
   overlay.onmouseup = function (e) { e.stopPropagation(); }
   overlay.style.position = "absolute"
   overlay.style.top = top + "px";
   overlay.style.left = left + "px";
   overlay.style.width = width + "px";
   overlay.style.height = height + "px";
   overlay.style.paddingLeft = "0px";
   overlay.style.paddingRight = "0px";
   overlay.style.paddingTop = "0px";
   overlay.style.paddingBottom = "0px";
   overlay.style.background = 'none';
   overlay.style.borderStyle = "none";
   container.appendChild(overlay);
   overlay.owner = owner;
   overlay.target = target;
   return overlay;
}

function deleteOverlay(overlay) {
   overlay.target.overlay = undefined;
   container.removeChild(overlay);
}

// Re-position all overlay objects to make them consistent with the panel.
function updateOverlays() {
   var panelRect = container.getBoundingClientRect();
   var overlay, next;
   for (overlay = panel.nextElementSibling; overlay != null; overlay = next) {
      var owner = overlay.owner;
      var target = overlay.target;
      next = overlay.nextElementSibling;
      if (target != undefined) {
         var ctrlRect = target.getBoundingClientRect();
         if (document.getElementById(target.id) == null)
            // The overlay has been orphaned, remove it
            container.removeChild(overlay);
         else if (!isVisible(target)) {
            // The target is not visible, hide the overlay:
            overlay.style.visibility = 'hidden';
         } else {
            // Re-position the overlay over it's target
            var top = ctrlRect.top - panelRect.top;
            var left = ctrlRect.left - panelRect.left;
            var width = ctrlRect.right - ctrlRect.left;
            var height = ctrlRect.bottom - ctrlRect.top;
            overlay.style.top = top + "px";
            overlay.style.left = left + "px";
            overlay.style.width = width + "px";
            overlay.style.height = height + "px";
            overlay.style.visibility = 'visible';

            // Set up clipping on the overlay. CSS clip is deprecated but CSS clip-path is not as yet in webkit
            // so it's probably OK to use clip.
            var ctop = Math.max(0, panelRect.top - ctrlRect.top) + 'px';
            var cleft = Math.max(0, panelRect.left - ctrlRect.left) + 'px';
            var cright = Math.max(0, panelRect.right - ctrlRect.left) + 'px';
            var cbottom = Math.max(0, panelRect.bottom - ctrlRect.top) + 'px';
            var clip = 'rect(' + ctop + ',' + cright + ',' + cbottom + ',' + cleft + ')';
            overlay.style.clip = clip;
         }
      }
   }
}


// Convert CSV to an array of string values. Returns NULL if CSV string not well formed.
function CSVtoArray(text) {
   var re_valid = /^\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*)*$/;
   var re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
   // Return NULL if input string is not well formed CSV string.
   if (!re_valid.test(text)) return null;
   var a = [];                // Initialize array to receive values.
   text.replace(re_value, // "Walk" the string using replace with callback.
      function (m0, m1, m2, m3) {
         // Remove backslash from \' in single quoted values.
         if (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
            // Remove backslash from \" in double quoted values.
         else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"'));
         else if (m3 !== undefined) a.push(m3);
         return ''; // Return empty string.
      });
   // Handle special case of empty last value.
   if (/,\s*$/.test(text)) a.push('');
   return a;
}

// Built in sound effects:
function buttonClick() { playSound(0); }
function playAlarm() { playSound(1); }
function playSound(effect) {
   if (typeof viewer == "object" && "play" in viewer)
      viewer.play(effect);
}

// Haptic feedback
function vibrate(t) {
   if (typeof viewer == "object" && "vibrate" in viewer)
      viewer.vibrate(t);
   else if ("vibrate" in navigator)
      navigator.vibrate(t);
}

// Return panel resolution properties in svg coords
function panelWidth() { return parseInt(panel.getAttribute("width")); }
function panelHeight() { return parseInt(panel.getAttribute("height")); }
function panelDpi() { return panel.hasAttribute("vfp:dpi") ? parseInt(panel.getAttribute("vfp:dpi")) : 163; }
function panelGrid() { return panel.hasAttribute("vfp:grid") ? parseInt(panel.getAttribute("vfp:grid")) : 10; }

// Mouse/touch handling:
// The aim here is to abstract mousedown/move/up gestures in a manner that is independent from mouse/touch functionality.
// Controls can then be developed in a mouse based environment with a good chance that they will work just as well on a touch screen.
// N.B. The presence of a window.touchstart function (outside of our webkit) indicates a touch device.

// Capture immediately over the whole window to a pure JS object
function setCapture(object, multi) {
   if (capture == null)
      capture = { control: object, element: null };
}

// Initiate capture when specified element is clicked
function setHotSpot(control, element) {
   if (control.onclick != undefined) {
      // Simulate a click to a JS object on an associated SVG element
      element.onclick = function (e) {
         if (capture == null)
            if (typeof (editor) != 'object' || editor.testMode())
               control.onclick(e, element);
      }
   } else {
      // Capture to a JS object via an associated SVG element
      element.ontouchstart = function (e) {
         if (capture == null)
            if (typeof (editor) != 'object' || editor.testMode()) {
               capture = { control: control, element: element };
            }
      }
      element.onmousedown = function (e) {
         if (capture == null)
            if (typeof (editor) != 'object' || editor.testMode()) {
               capture = { control: control, element: element };
            }
      }
   }
}

// Cancel hotspot bindings
function clearHotSpot(control, element) {
   element.onclick = null;
   element.ontouchstart = null;
   element.onmousedown = null;
}

var touchTimer = null;
var touchFirst, touchLast;
var touchGesture;

function onpaneltouchstart(evt) {
   if (typeof popup_container == "object")
      return;
   touchFirst = touchLast = evt.touches.item(0);
   touchTimer = setTimeout(function () {
      if (capture != null) {
         onpanelmousedown(touchToMouse(evt, touchFirst));
      } else {
         touchGesture = true;
      }
      touchTimer = null;
   }, 200);
   touchGesture = evt.touches.length > 1;
   evt.preventDefault();

}

function onpaneltouchmove(evt) {
   if (typeof popup_container == "object")
      return;
   touchLast = evt.touches.item(0);
   if (touchGesture) {
      var dx = touchLast.screenX - touchFirst.screenX;
      var dy = touchLast.screenY - touchFirst.screenY;
      scrollToTab(scrollPosition - dx / window.innerWidth, false);
   } else if (evt.touches.length > 1) {
      touchGesture = true;
      clearTimeout(touchTimer);
   } else if (touchTimer != null) {
      // Pointer is moved significantly during the disambiguation period.  Unless the mouse has been captured by a control's
      // ontouchstart handler, this is deemed to be the start of a touch gesture. Otherwise, nothing happens until the time code fires, at which point
      // the control will see a mousedown and then any further move messages.
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
         if (capture == null) {
            touchGesture = true;
            clearTimeout(touchTimer);
         }
      }
   } else if (capture != null)
      onpanelmousemove(touchToMouse(evt, touchLast));
   evt.preventDefault();
}

function onpaneltouchend(evt) {
   var dx = touchLast.screenX - touchFirst.screenX;
   if (typeof popup_container == "object")
      return;
   if (touchGesture) {
      // If we've captured the scroll strip, what happens next depends on how far the user has dragged it.
      if (dx > window.innerWidth / 4) {
         // Finish a swipe right.
         scrollPosition -= dx / window.innerWidth;
         selectPreviousTab();
      }
      else if (dx < -window.innerWidth / 4) {
         // Finish a swipe left
         scrollPosition -= dx / window.innerWidth;
         selectNextTab();
      }
      else {
         // Revert to current tab.
         scrollToTab(scrollPosition, true)
      }
   } else if (touchTimer != null) {
      // Touch start/end in the disambiguation period
      if (dx > 10) {
         // Quick swipe right
         selectPreviousTab();
         capture = null;
      } else if (dx < -10) {
         // Quick swipe left
         selectNextTab();
         capture = null;
      } else {
         // Tap - simulated a mouse click
         setTimeout(function () { onpanelmousedown(touchToMouse(evt, touchFirst)); }, 0);
         setTimeout(function () { onpanelmouseup(touchToMouse(evt, touchFirst)); }, 200);
      }
   } else if (touchTimer == null) {
      // End of standard mouse gesture. 
      setTimeout(function () { onpanelmouseup(touchToMouse(evt, touchLast)); }, 100);
   }
   clearTimeout(touchTimer);
   touchTimer = null;
   evt.preventDefault();
}

// Convert a touch event to a mouse event
function touchToMouse(evt, t) {
   if (t != null) {
      evt.screenX = t.screenX;
      evt.screenY = t.screenY;
      evt.clientX = t.clientX;
      evt.clientY = t.clientY;
   }
   evt.button = 0;
   return evt;
}


function onpanelmousedown(evt) {
   if (evt.target.tagName == "HTML")
      return true; // This occurs if the event is outside the document area, e.g. on the scrollbars.

   evt.preventDefault();

   if (capture != null) {
      if (capture.control.onmousedown != undefined) {
         capture.control.onmousedown(evt, capture.element);
         vibrate(10);
      }
      return true;
   }

   return false;
}

function onpanelmousemove(evt) {
   evt.preventDefault();

   if (capture != null) {
      if (capture.control.onmousemove != undefined)
         capture.control.onmousemove(evt, capture.element);
      return true;
   }
   return false;
}

function onpanelmouseup(evt) {
   evt.preventDefault();

   if (capture != null) {
      if (capture.control.onmouseup != undefined)
         if (capture.control.onmouseup(evt, capture.element) == true)
            return true; // If the control's mouseup handler returns true, capturing continues
      capture = null;
      return true;
   }

   return false;
}

// Scroll the strip so that tab 'n' is visible in the svg viewport.
// n can be fractional so as to allow for swipe animation 
var scrollTarget = 0;   // Target scroll position
var scrollPosition = 0;  // Current scroll positiob
var scrollVelocity = 0;  // Current velocity of the scrolling
var scrollTimer = null;  // Timer / interval used for the animation callbacks
var scrollInterval = 50; // Scroll animation period (ms)

function scrollToTab(n, animate) {
   var numTabs = getPublicTabsArray().length;
   if (n < -0.1) {
      n = -0.1;
   } else if (n > numTabs - 0.9) {
      n = numTabs - 0.9;
   }
   if (animate) {
      if (!scrollTimer) {
         scrollTimer = setInterval(scrollAnimate, scrollInterval);
      }
      scrollTarget = n;
   } else {
      var w = panelWidth();
      var h = panelHeight();
      var viewBox = (n * panelWidth() - w / 2) + " " + (-h / 2) + " " + w + " " + h;
      panel.setAttribute("viewBox", viewBox);
      updateOverlays();
   }
}

function scrollAnimate() {
   // Calculate distance and velocity. 
   var accelFactor = 10 / 1000;   // How fast the movement accelerates wrt distance
   var frictFactor = 1; // Resistance slowing the needle down
   var stickyness = 1 / 10000; // The needle will eventually jump or stick to the target value, 
   var dist = scrollTarget - scrollPosition;
   var dV = (dist * accelFactor) - (scrollVelocity * frictFactor);
   scrollVelocity += dV;

   // Calculate the new scroll position using the calculated change in velocity, 
   // taking into account "stickyness" (which causes the needle to jump to the target value 
   // and end the animation
   if ((Math.abs(dist) < stickyness) && (Math.abs(scrollVelocity) < stickyness)) {
      // The current position is close enough to the destination (target) and also moving slowly, 
      // so jump it to the final value and end the animation
      scrollPosition = scrollTarget;
      scrollVelocity = 0;
      clearInterval(scrollTimer);
      scrollTimer = null;
   } else {
      // Calculate the new position using the change in velocity,
      // also scaling it back into actual pixels
      scrollPosition += (scrollVelocity * scrollInterval);
   }
   scrollToTab(scrollPosition, false);
}

//Check whether auth is enabled through the panel settings
//Checks the top level SVG attribute which is toggled
function getAuthStatus() {
   var svg = container.firstElementChild;
   var svgAuth = svg.getAttribute("vfp:requiresauth");
   return svgAuth;
}

function updateAuthorization(auth) {

   if(jQuery('.outer').hasClass('not-clickable')) {
      jQuery('.outer').removeClass('not-clickable');
   }

   //Passed from server - True or false
   authorized = auth;

   //Get tabs and update view
   var allTabs = getTabsArray();
   var publicTabs = getPublicTabsArray();
   var currentTab = getTabIndex();

   //Configure controls to show/hide etc
   updateControlAccess(publicTabs);

   //Update scrollers so we know the new start and end points
   //Update Pagination with new amount of circles etc
   if (typeof (editor) !== 'object' && allTabs.length > 1 && supportsTouch === undefined) {
      showScrollers();
      showPagination(publicTabs);
   }

   //If after logging out public tabs goes back to only 1 tab then remove pagination and scrollers
   if (typeof (editor) !== 'object' && allTabs.length <= 1 && supportsTouch === undefined) {
      removeScrollers();
      removePagination();
   }
   updateScrollerArrows(currentTab, publicTabs);

   //Reconvert add to list for mobile
   if (supportsTouch === true) {
      convertToStrip();
   }

   //Select current tab so there isn't multiple slides with inline block
   selectTabByOrdinal(currentTab);

   //Check if all tabs are authed and show login form if needed
   checkLogin();

   //Update viewer tab names
   updateViewerTabs(publicTabs);

}

//Loop over the tabs array, create controls, update auth styling etc
function createControls(tabs) {

   for (var i = 0; i < tabs.length; i++) {

      var controlNodes = tabs[i].getElementsByTagName("g");

      for (var j = 0; j < controlNodes.length; j++) {
         if (controlNodes[j].hasAttribute("vfp:class")) {
            var root = controlNodes[j];
            var control = initControl(root, getControlConfig(root), false);
            if (control != null) {
               controlObjects[root.id] = control;
               console.log("Created", control, "with id", root.id);
            }
         }
      }
   }
}

//Find and update controls with vfp:auth values depending on auth
function updateControlAccess(tabs) {
   for (var i = 0; i < tabs.length; i++) {
      var controlNodes = tabs[i].getElementsByTagName("g");
      for (var j = 0; j < controlNodes.length; j++) {

         if (controlNodes[j].hasAttribute("vfp:auth") && getAuthStatus() === "1") {
            var authLevel = controlNodes[j].getAttribute("vfp:auth");
            if (authorized === false) {
               switch (authLevel) {
                  case "1":
                     controlNodes[j].style.pointerEvents = "none";
                     break;
                  case "2":
                     controlNodes[j].style.display = "none";
                     break;
               }
            } else {
               switch (authLevel) {
                  case "1":
                     controlNodes[j].style.pointerEvents = "auto";
                     break;
                  case "2":
                     controlNodes[j].style.display = "block";
                     break;
               }
            }
         }

         //If the panel settings have been turned off after applying values, reset single control view
         if (controlNodes[j].hasAttribute("vfp:auth") && getAuthStatus() === "0") {
            controlNodes[j].style.pointerEvents = "auto";
            controlNodes[j].style.display = "block";
         }

         //If the individual control.js has a auth method, trigger it
         if (typeof (editor) != 'object') {
             if (controlNodes[j].obj != undefined && controlNodes[j].obj.updateAuthorization != undefined)
                controlNodes[j].obj.updateAuthorization(authorized);
         }
      }
   }

}

//Update the dropdown select in Proteus when the simulation is running
function updateViewerTabs(publicTabs) {
   if (typeof (viewer) === "object" && viewer.setTabNames != undefined) {
      var tabNames = [];
      for (var i = 0; i < publicTabs.length; ++i) {
         tabNames.push(publicTabs[i].id);
      }

      //If all tabs are hidden, push main controls
      //Prevents user from getting stuck in console mode
      if (tabNames.length === 0) {
         tabNames.push("Main Controls");
      }

      viewer.setTabNames(tabNames);
   }
}

// If all tabs require auth, and none are visible then use
// the login control to present the login prompt.
function checkLogin() {
   var publicTabs = getPublicTabsArray();

   if (publicTabs.length === 0) {
      for (var controlName in controlObjects) {
         var control = controlObjects[controlName];
         if (control instanceof Login) {
            control.showPopup(controlName);
            break;
         }
      }
   }
}

//Make bbox work if the element is hidden (Firefox mainly)
//Proteus webkit version seems to use SVGAELEMENT
if(typeof(SVGGraphicsElement) !== 'undefined' && typeof(editor) !== 'object') {
   var _getBBox = SVGGraphicsElement.prototype.getBBox;   
   SVGGraphicsElement.prototype.getBBox = function() {
      var bbox, tempControl, tempSvg;
      //If the item has height return normal bbox function
      //Otherwise create, clone and take height of that before removing
      if (this.offsetHeight) {
         return _getBBox.apply(this);
      } else {
         tempControl = document.createElement("div");
         tempControl.setAttribute("style", "position:absolute; visibility:hidden; width:0; height:0");
         if (this.tagName === "svg") {
            tempSvg = this.cloneNode(true);
         } else {
            tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            tempSvg.appendChild(this.cloneNode(true));
         }
         tempControl.appendChild(tempSvg);
         document.body.appendChild(tempControl);
         bbox = _getBBox.apply(tempSvg);
         document.body.removeChild(tempControl);
         return bbox;
      }
   };
}