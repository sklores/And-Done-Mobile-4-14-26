// Gizmo's troubleshooting knowledge base.
// Edit this file to update what Gizmo knows; redeploy the ask-gizmo function.
// Goal: fast, actionable steps a manager or shift lead can follow on the floor.
// The user should layer in GCDC-specific vendor phone numbers, equipment models,
// and house policies on top of this generic base.

export const KNOWLEDGE = `
# Gizmo's Troubleshooting Reference

You have access to the following playbook for common operational issues.
Use it when a user asks for help with POS, customer service, conflict
resolution, or equipment problems. Keep answers short and actionable —
give them the 3–5 steps to try right now, then escalate.

If the user asks something outside this playbook, say so honestly rather
than guessing.

---

## 1. POS Troubleshooting (Toast)

### Card reader not connecting
1. Confirm the reader is plugged into power and the handheld/terminal.
2. Toggle Bluetooth off/on on the terminal (iPad: Settings → Bluetooth).
3. Force-quit the Toast app (swipe up, swipe Toast off screen) and reopen.
4. If still failing, swap to a backup reader if available.
5. Escalate: Toast Support 617-682-0225 (24/7). Have the restaurant GUID ready.

### Terminal frozen or won't take orders
1. Hold the power button → "Restart" (do not hard-crash unless frozen solid).
2. If it boots but Toast app hangs: force-quit the app.
3. Check Wi-Fi bars — if weak, move the terminal or reboot the router.
4. If one terminal is broken but others work, keep taking orders on the rest and flag for repair.

### Kitchen Display (KDS) not showing tickets
1. Check that the KDS is on the same Wi-Fi as the POS.
2. On Toast Web: Kitchen → KDS status. Restart any offline device.
3. Physically unplug the KDS power for 10 seconds, plug back in.
4. Fallback: print paper tickets at the expo printer while you fix.

### Receipt / guest check printer not printing
1. Check paper roll and that the cover clicked fully shut.
2. Look for a blinking red light — usually paper jam or cover open.
3. Power cycle the printer (switch on back).
4. Confirm printer is online in Toast Web: Hardware → Printers.
5. Swap the cable between printer and router/switch if suspicion high.

### Payment declined repeatedly
1. Ask the guest to try a different card or tap/chip vs swipe.
2. If all cards decline: check Toast's status page (status.toasttab.com).
3. If Toast is down, switch to manual imprint / cash and document tickets for later entry.

### Orders not sending to kitchen
1. Check the Send button was actually tapped (a common miss during rushes).
2. Look for red error banner on the item — may be 86'd or out of stock in POS.
3. If a whole station isn't receiving, restart that KDS (see above).

### End-of-day batch won't close
1. Verify all open checks are closed or voided.
2. Check internet connectivity.
3. Re-run the batch from Toast Web: Reports → End of Day.
4. If persistent, Toast Support can reprocess overnight.

---

## 2. Customer Service

### General principles
- Listen fully before responding. Don't interrupt.
- Acknowledge the feeling before the fact: "I'm sorry that happened."
- Offer a fix before the guest has to ask for one.
- Never argue in front of the dining room — step aside.
- When comping, name it specifically ("Let me take care of that item")
  rather than opening with money.

### Wrong order delivered
1. Apologize, take the wrong item back immediately.
2. Put the correct order in as a remake with a rush flag.
3. Offer a free drink, app, or dessert while they wait.
4. If it's a severe delay (>15 min), comp the affected dish.

### Food quality complaint (too cold, under/overcooked, off-taste)
1. Apologize and offer to remake, swap for something else, or comp.
2. Remove the item from the check so it's clear nothing is being charged for it.
3. Flag to the kitchen so they can check the station.
4. Don't argue about whether it's "actually" wrong — guest perception is the metric.

### Long wait complaint
1. Acknowledge the wait. Don't make excuses ("We're slammed tonight").
2. Offer a concrete ETA if you can give one ("Your food is next up, about 5 minutes").
3. Drop a free starter or round of drinks for waits >20 min.
4. If you can't give an ETA, check with kitchen and come back within 2 minutes.

### Allergen or dietary issue
1. Stop the order immediately — do not let it fire.
2. Ask the guest to confirm the exact allergen.
3. Talk to the kitchen in person, not over KDS note.
4. Use a clean station, clean utensils, new gloves.
5. Mark the ticket clearly and walk it out yourself.
6. If a reaction has already occurred: call 911 first, then manager, then document.

### Guest asking for a refund
1. Listen first. Most refund requests resolve with a comp or remake instead.
2. If refund is the only outcome they'll accept: don't fight it under $50.
3. Process via Toast: find the check → Refund → select items → reason code.
4. Document in the log what happened and why you refunded.
5. If over $50 or suspicious (repeat complainer, gift-card scam pattern), get manager approval.

### Intoxicated guest
1. Stop alcohol service immediately. Offer water and food instead.
2. Don't confront in front of their party. Speak privately.
3. Offer to call a rideshare or cab — do not let them drive.
4. If they become aggressive: two staff members, calm voice, move toward the door.
5. If they won't leave: call non-emergency police (not 911 unless imminent danger).

### Guest won't pay the check
1. Stay calm, don't escalate. Don't chase them outside.
2. Note their description, vehicle, any card they did present.
3. Review camera footage if available.
4. Management decides whether to call police — usually not worth it for one check.
5. Document the loss as comp/walkout in Toast.

---

## 3. Conflict Resolution

### Staff-to-staff conflict
1. Pull both parties aside separately. Never referee in front of the floor.
2. Ask each: "What happened, and what do you need to happen next?"
3. Find the specific behavior, not the personality. ("You raised your voice" not "You're hostile.")
4. Bring them together only if both are calm and agree on a resolution.
5. Document in the log if it's a repeat — patterns matter for HR.

### Staff-to-manager conflict
1. Hear the staff member out fully. Don't interrupt to defend.
2. Acknowledge anything legitimate in their complaint, even partial.
3. Separate the feeling ("You're frustrated") from the ask ("What would fix this?").
4. If they're venting about a policy you can't change, say so plainly and offer what you can do.

### Guest-to-staff conflict
1. Remove the staff member from the situation — send them to back of house.
2. Talk to the guest alone. Start with acknowledgment, not defense.
3. Decide: is this a fixable service failure, or a guest being unreasonable?
4. If fixable: fix it. If unreasonable: offer one final resolution and mean it.
5. Support your staff publicly. Coach them privately.

### Kitchen-to-front conflict during service
1. Don't argue on the line. Say "Let's talk after rush."
2. In the moment: whoever is bottlenecked wins. If kitchen is slammed, front eats the wait.
3. Post-shift, sit down with both leads and talk through the specific tickets that caused friction.

### De-escalation basics
- Drop your voice. Match their volume then bring it lower.
- Keep your hands visible, palms open.
- Don't point. Don't cross your arms.
- Repeat back what you heard to prove you listened.
- Offer a choice ("Would you like X or Y?") — gives back control.
- If they're irrational, do not try to convince them. Contain, don't convert.

---

## 4. Equipment Repair (First-Look Diagnostics)

Before calling for service, try the obvious steps below. If they don't
work, log the issue and call the vendor. Do not attempt repair on
anything gas-fired or high-voltage beyond what's listed here.

### Panini press / flat-top won't heat
1. Confirm the breaker at the panel isn't tripped.
2. Check the thermostat dial — has it been bumped to off?
3. Listen for the element clicking on when you turn it up.
4. If electric and dead: unplug, wait 60 seconds, plug back in.
5. If gas and dead: pilot light may be out — follow the lighting instructions on the unit. Don't improvise.
6. Call service if no heat after 10 minutes.

### Espresso machine not pulling shots
1. Check the water supply — is the line open? Is the reservoir full?
2. Is the grind too fine? Shots will choke and drip slowly if so.
3. Clean the group head and portafilter screen (coffee oil buildup).
4. Backflush with cleaner if the machine supports it.
5. Descaling may be overdue — check the maintenance log.

### Walk-in cooler running warm (>40°F)
1. URGENT. Food safety clock starts at 40°F.
2. Check the door seal and that it fully latches — most common cause.
3. Look for ice buildup on the evaporator coil inside. Heavy frost = defrost issue.
4. Check the condenser outside/on top — if it's covered in dust or ice, that's the problem.
5. If it's been >2 hours over 40°F, start moving product to another cold unit and begin the temperature log for any potentially unsafe items.
6. Call refrigeration vendor immediately.

### Ice machine not making ice
1. Is the water supply on? Check the shutoff valve.
2. Look inside — is the ice bin packed so full the sensor thinks it's done?
3. Water filter overdue? Most machines have a filter change interval.
4. Condenser coils clogged with lint? Vacuum the intake.
5. Let it run 30 min after cleaning before calling service.

### Fryer not heating
1. Check the high-limit safety — there's usually a red reset button on the control panel.
2. If gas: check the gas valve is open. Pilot may need relighting.
3. Oil level — if too low, safety cutoffs engage.
4. If you just added fresh oil, it can take 20–40 min to heat to frying temp. Don't panic.
5. Do not attempt to repair gas valves or thermostats yourself. Call service.

### Dish machine not running or not cleaning
1. Check chemical bottles — detergent, rinse aid, sanitizer. Empty supply kills the cycle.
2. Clean out debris from the wash arms and drain.
3. Check the float/drain — if water isn't draining, the cycle won't restart.
4. Verify the temperature — wash should be 150°F+, rinse 180°F+ (or chemical sani at correct ppm).
5. If glasses come out spotted: rinse aid empty or dispenser miscalibrated.

### Hood / exhaust fan not pulling
1. Confirm the fan switch is on (sometimes turned off at closing and forgotten).
2. Listen — is the motor running? If humming but no airflow, belt may be broken.
3. Check the filters — if they're grease-clogged, airflow drops dramatically.
4. If smoke is filling the line, shut down the cooking equipment first, not the fan.
5. Hood/exhaust issues are a fire risk. If anything seems wrong, don't ignore it — call your HVAC/hood company same-day.

### General "something is wrong with the equipment" flow
1. Take a photo or video of the issue before you touch it.
2. Note: what was it doing before? Any error codes on the display?
3. Log it (Gizmo can log it for you if you ask).
4. Check warranty status — some repairs are covered.
5. Get at least two quotes for any repair over $500.

---

## How you should use this knowledge

When a user asks about a problem that matches one of the sections above:
- Give them the 3–5 most relevant steps first.
- Don't read the whole playbook aloud. Pick what's relevant.
- If they've already tried the basic steps, skip to the escalation.
- Always offer to log the incident: "Want me to log this in the activity log so you have a record?"
- If you don't see their issue in this playbook, say so: "This isn't in my reference — I'd call [Toast support / your refrigeration vendor / etc.] and log it so we have a paper trail."
`;
