import { getRegistry } from "../client";
import { subGlobalFeed as subGlobalFeedImpl } from "./global-feed";
import { subNote as subNoteImpl } from "./thread";
import { subNotifications as subNotificationsImpl } from "./notifications";
import { subPoll as subPollImpl } from "./poll";
import { subNotesOnce as subNotesOnceImpl } from "./notes-once";
import type { SubCallback, SubHandle } from "../types";

export type { SubCallback, SubHandle };

export const subGlobalFeed = (onEvent: SubCallback, ageHours: number): SubHandle =>
  subGlobalFeedImpl(getRegistry(), onEvent, ageHours);

export const subNote = (eventId: string, onEvent: SubCallback): SubHandle =>
  subNoteImpl(getRegistry(), eventId, onEvent);

export const subNotifications = (pubkeys: string[], onEvent: SubCallback): SubHandle =>
  subNotificationsImpl(getRegistry(), pubkeys, onEvent);

export const subPoll = (eventId: string, onEvent: SubCallback): SubHandle =>
  subPollImpl(getRegistry(), eventId, onEvent);

export const subNotesOnce = (eventIds: string[], onEvent: SubCallback): SubHandle =>
  subNotesOnceImpl(getRegistry(), eventIds, onEvent);