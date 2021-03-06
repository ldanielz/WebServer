// Generated by Proteus Visual Designer for Arduino

// Peripheral Configuration Code (Do Not Edit)
//---CONFIG_BEGIN---
#pragma GCC push_options
#pragma GCC optimize ("Os")

#include <core.h> // Required by cpu
#include <cpu.h>
#include <bridge.h> // Required by ESP1:STORAGE
#include <Vfp8266.h>
#include <Grove.h>
#include <Controls.h>

#pragma GCC pop_options

// Peripheral Constructors
CPU &cpu = Cpu;
Vfp8266::Server &ESP1_SERVER = VFP;
Vfp8266::FileStore &ESP1_STORAGE = FS;
GroveLED LED1 = GroveLED (3);
PushButton IotBtn1 = PushButton ("IotBtn1");

void peripheral_setup () {
 ESP1_SERVER.begin (80);
 ESP1_STORAGE.begin ();
 IotBtn1.attachEventHandler(&IotBtn1_ControlEvent);
}

void peripheral_loop() {
 ESP1_SERVER.poll ();
}
//---CONFIG_END---
// Flowchart Variables
bool var_state;
bool state;

// Flowchart Routines
void chart_SETUP() {
 cpu.pinMode(13,OUTPUT);
 ESP1_SERVER.debug().arg("YOOOO MAN").end();
}

void chart_LOOP() {
 ESP1_SERVER.waitForRequests(1000);
}

void chart_OnIotBtn1() {
 var_state=cpu.digitalRead(13);
 var_state=!var_state;
 cpu.digitalWrite(13,var_state);
 IotBtn1.setLamp(var_state);
 LED1.set(var_state);
}


// Entry Points and Interrupt Handlers
void setup () { peripheral_setup();  chart_SETUP(); }
void loop () { peripheral_loop();  chart_LOOP(); }
void IotBtn1_ControlEvent() { chart_OnIotBtn1(); }
