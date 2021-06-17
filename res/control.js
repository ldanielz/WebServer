// D:/Programas/Labcenter Electronics/Proteus 8 Professional/DATA/VSM Studio/controls/PushButton/control.js

class PushButton {
   constructor(root, config) {
      var obj = this;
      var bounds = root.getElementsByClassName("bounds")[0];
      var lamp = root.getElementsByClassName("lamp")[0];
      var bbox = bounds.getBBox();
      var label = root.getElementsByTagName("text")[0];
      var icons = root.getElementsByClassName('buttonIcon');
      var faces = root.getElementsByClassName('buttonFace');
      var mode = parseInt(config.mode);
      var autoLamp = parseInt(config.autoLamp);
      var pressed = false;
      var state = false;
      var isIconButton = (icons.length != 0);

      if (faces.length < 1) {
         config.faceColour = undefined;
      } else {
         config.faceColour = config.faceColour === undefined ? faces[0].style.fill : config.faceColour;
      }

      if (!isIconButton) {
         config.icon = undefined;
      } else {
         config.icon = config.icon === undefined ? "0" : config.icon;
      }


      var symbols = !isIconButton ? root.getElementsByTagName("g") : icons[parseInt(config.icon)].getElementsByTagName("g");

      setHotSpot(this, root);

      // Fix legacy issues with inkscape:
      symbols[0].removeAttribute('display');
      symbols[1].removeAttribute('display');

      this.reconfigure = function (newinstance) {
         if (newinstance) {

            config.labelFont = getFontStyle(label);

            // Set thelamp colours from the skin. 
            config.lampColour = lamp != undefined ? lamp.style.fill : undefined;
         }

         label.firstChild.nodeValue = config.labelText;
         label.style.pointerEvents = "none";
         setFontStyle(label, config.labelFont);

         var x = null, y = null;
         var h = label.getBBox().height * 0.6;
         var s = parseInt(config.labelSpacing);
         switch (parseInt(config.labelPosition)) {
            case 1: label.style.textAnchor = "middle"; x = bbox.width / 2; y = -s; break;
            case 2: label.style.textAnchor = "middle"; x = bbox.width / 2; y = bbox.height + s + h; break;
            case 3: label.style.textAnchor = "end"; x = -s; y = bbox.height / 2 + h / 2; break;
            case 4: label.style.textAnchor = "start"; x = bbox.width + s; y = bbox.height / 2 + h / 2; break;
         }

         if (x != null && y != null) {
            label.setAttribute('x', x);
            label.setAttribute('y', y);
            label.style.display = "inherit";
         } else {
            label.style.display = "none";
         }

         // Display only the selected icon. This code does nothing if there are no icons.
         for (var i = 0; i < icons.length; ++i)
            icons[i].style.display = i == config.icon ? 'inline' : 'none';

         // Set the face colour for all icons or faces
         for (var i = 0; i < faces.length; ++i)
            faces[i].style.fill = config.faceColour;

         this.setState(false, true);
         this.setLamp(false);
         display(false);
      };

      this.onmousedown = function (evt) {
         if (mode == 0) {
            this.setState(true);
         } if (mode == 1) {
            this.setState(true);
            postEvent(obj.id, 1);
         }
         display(true);
         buttonClick();
      };

      this.onmousemove = function (evt) {
         var p = getEventPos(evt, bounds);
         var r = bbox;
         var hit = p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;

         if (mode == 0) {
            this.setState(hit);
         } else if (mode == 1) {
            if (hit != pressed) {
               this.setState(hit);
               postEvent(obj.id, hit ? 1 : 0);
            }
         }
         display(hit);

      };

      this.onmouseup = function (evt) {
         if (pressed) {
            display(false);
            if (mode == 0) {
               this.setState(false);
               postEvent(obj.id, -1);
            } else if (mode == 1) {
               this.setState(false);
               postEvent(obj.id, 0);
            } else if (mode == 2) {
               this.setState(!state);
               postState(obj.id, "state", state ? 1 : 0);
            }
         }
      };

      this.setState = function (newstate, force) {
         if (newstate != state || force == true) {
            state = newstate;
         }
         if (autoLamp)
            obj.setLamp(state);
      };

      this.setLamp = function (flag) {
         if (lamp != undefined) {
            lamp.style.fill = config.lampColour;
            lamp.style.opacity = flag ? 1.0 : 0.2;
         }
      };

      function display(down) {
         if (down) {
            symbols[0].style.display = 'none';
            symbols[1].style.display = 'inline';
         } else {
            symbols[0].style.display = 'inline';
            symbols[1].style.display = 'none';
         }
         pressed = down;
      }

      return this;
   }
}   





