import type { ComponentType } from "react"

type HOC<P extends object> = (component: ComponentType<P>) => ComponentType<P>

export function pipeline<P extends object>(...fns: HOC<P>[]): (component: ComponentType<P>) => ComponentType<P> {
  return (component) => fns.reduceRight((acc, fn) => fn(acc), component)
}
