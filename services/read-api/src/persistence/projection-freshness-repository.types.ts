/** @module Read-model projection-watermark persistence models. */

export interface ProjectionFreshness {
  applied_at: Date
  event_id: string
  occurred_at: Date
  projection_name: string
}
