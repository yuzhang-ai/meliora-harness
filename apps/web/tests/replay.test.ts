import {test} from "node:test";
import assert from "node:assert/strict";
import {publicEvents,streamFor,statusOf,resumePoint,scenarios} from "../src/replay";
test("all scenarios consume typed public fixtures",()=>{for(const s of scenarios){const events=publicEvents(streamFor(s.id));assert.ok(events.length);assert.ok(events.every(e=>e.visibility==="public"));}});
test("the frontend approval demo stays actionable without changing the shared fixture",()=>{const shared=streamFor("approval-required").find(e=>e.kind==="approval_requested");const live=streamFor("approval-live-demo").find(e=>e.kind==="approval_requested");assert.ok(shared&&live);assert.notEqual(shared.payload.expiresAt,live.payload.expiresAt);assert.equal(live.payload.expiresAt,"2099-12-31T23:59:59.000Z");});
test("reconnect duplicates are removed without inventing the absent prefix",()=>{const events=streamFor("reconnecting");assert.equal(resumePoint("reconnecting"),4);assert.deepEqual(publicEvents([...events,...events]),events);assert.equal(publicEvents(events)[0].sequence,5);});
test("private envelopes are rejected",()=>{const event=streamFor("cancelled")[0];assert.equal(publicEvents([{...event,visibility:"private"} as never]).length,0);});
test("tool success never implies run completion",()=>{const events=streamFor("read-only-success");assert.notEqual(statusOf(events.slice(0,4)),"completed");assert.equal(statusOf(events),"completed");});
test("terminal outcomes and approval remain distinct",()=>{for(const [id,state] of [["tool-failure","failed"],["cancelled","cancelled"],["blocked","blocked"],["approval-required","awaiting_approval"]] as const)assert.equal(statusOf(streamFor(id)),state);});

test("reconnecting has unknown status until an explicit status arrives",()=>{assert.equal(statusOf(streamFor("reconnecting").slice(0,1),"recovering"),"recovering");assert.equal(statusOf(streamFor("reconnecting"),"recovering"),"completed");});
