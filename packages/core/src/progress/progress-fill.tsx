import { OverrideComponentProps } from "@kobalte/utils";
import { JSX, splitProps } from "solid-js";

import { AsChildProp, Polymorphic } from "../polymorphic";
import { useProgressContext } from "./progress-context";

export interface ProgressFillOptions extends AsChildProp {
  /** The HTML styles attribute (object form only). */
  style?: JSX.CSSProperties;
}

/**
 * The component that visually represents the progress value.
 * Used to visually show the fill of `Progress.Track`.
 */
export function ProgressFill(props: OverrideComponentProps<"div", ProgressFillOptions>) {
  const context = useProgressContext();

  const [local, others] = splitProps(props, ["style"]);

  return (
    <Polymorphic
      fallback="div"
      style={{
        "--kb-progress-fill-width": context.progressFillWidth(),
        ...local.style,
      }}
      {...context.dataset()}
      {...others}
    />
  );
}
