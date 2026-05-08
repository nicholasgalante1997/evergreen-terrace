import type { ComponentType, NamedExoticComponent } from "react";

type MemoFn = <P extends object>(c: ComponentType<P>) => NamedExoticComponent<P>;

export function pipeline(fn: MemoFn) {
  return <P extends object>(component: ComponentType<P>): ComponentType<P> =>
    fn(component);
}
