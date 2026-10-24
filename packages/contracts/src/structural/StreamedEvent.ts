// Illuminate\Http\StreamedEvent, as a contract names it (AD-1.2): its two public properties.

/** One server-sent event of an event stream. */
export interface StreamedEvent {
  /** The name of the event. */
  event: string;

  /** The data of the stream. */
  data: unknown;
}
