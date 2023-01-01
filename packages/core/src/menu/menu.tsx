import {
  contains,
  getActiveElement,
  getDocument,
  getEventPoint,
  isPointInPolygon,
  mergeDefaultProps,
  Polygon,
} from "@kobalte/utils";
import { createEffect, createSignal, onCleanup, ParentProps, splitProps } from "solid-js";
import { isServer } from "solid-js/web";

import { createListState } from "../list";
import { Popper, PopperOptions } from "../popper";
import { Placement } from "../popper/utils";
import {
  CollectionItem,
  createDisclosureState,
  createRegisterId,
  focusSafely,
} from "../primitives";
import {
  createDomCollection,
  useOptionalDomCollectionContext,
} from "../primitives/create-dom-collection";
import { FocusStrategy } from "../selection";
import { MenuContext, MenuContextValue, useOptionalMenuContext } from "./menu-context";
import { useMenuRootContext } from "./menu-root-context";

export interface MenuProps
  extends Omit<PopperOptions, "anchorRef" | "contentRef" | "onCurrentPlacementChange"> {
  /** The controlled open state of the menu. */
  isOpen?: boolean;

  /**
   * The default open state when initially rendered.
   * Useful when you do not need to control the open state.
   */
  defaultIsOpen?: boolean;

  /** Event handler called when the open state of the menu changes. */
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * Container for menu items and nested menu, provide context for its children.
 */
export function Menu(props: ParentProps<MenuProps>) {
  const rootContext = useMenuRootContext();
  const parentDomCollectionContext = useOptionalDomCollectionContext();
  const parentMenuContext = useOptionalMenuContext();

  props = mergeDefaultProps(
    {
      placement: parentMenuContext != null ? "right-start" : "bottom-start",
    },
    props
  );

  const [local, others] = splitProps(props, ["isOpen", "defaultIsOpen", "onOpenChange"]);

  const nestedMenus = new Set<Element>([]);

  let closeTimeoutId: number | undefined;
  let resumePointerTimeoutId: number | undefined;

  const [triggerId, setTriggerId] = createSignal<string>();
  const [contentId, setContentId] = createSignal<string>();

  const [triggerRef, setTriggerRef] = createSignal<HTMLElement>();
  const [contentRef, setContentRef] = createSignal<HTMLDivElement>();

  const [focusStrategy, setFocusStrategy] = createSignal<FocusStrategy | boolean>(true);
  const [currentPlacement, setCurrentPlacement] = createSignal<Placement>(others.placement!);
  const [isPointerInNestedMenu, setIsPointerInNestedMenu] = createSignal(false);
  const [isPointerSuspended, setIsPointerSuspended] = createSignal(false);
  const [pointerGracePolygon, setPointerGracePolygon] = createSignal<Polygon | null>(null);

  const [items, setItems] = createSignal<CollectionItem[]>([]);

  const { DomCollectionProvider } = createDomCollection({ items, onItemsChange: setItems });

  const disclosureState = createDisclosureState({
    isOpen: () => local.isOpen,
    defaultIsOpen: () => local.defaultIsOpen,
    onOpenChange: isOpen => local.onOpenChange?.(isOpen),
  });

  const listState = createListState({
    selectionMode: "none",
    dataSource: items,
  });

  const open = (focusStrategy: FocusStrategy | boolean) => {
    setFocusStrategy(focusStrategy);
    disclosureState.open();
  };

  const close = () => {
    disclosureState.close();
  };

  const closeWithDelay = () => {
    if (isServer) {
      return;
    }

    closeTimeoutId = window.setTimeout(() => {
      close();
      closeTimeoutId = undefined;
    }, 3000);
  };

  const clearCloseTimeout = () => {
    if (isServer) {
      return;
    }

    window.clearTimeout(closeTimeoutId);
    closeTimeoutId = undefined;
  };

  const toggle = (focusStrategy: FocusStrategy | boolean) => {
    setFocusStrategy(focusStrategy);
    disclosureState.toggle();
  };

  const focusContent = (key?: string) => {
    const content = contentRef();

    if (content && !contains(content, getActiveElement())) {
      focusSafely(content);
    }

    listState.selectionManager().setFocused(true);
    listState.selectionManager().setFocusedKey(key);
  };

  const registerNestedMenu = (element: Element) => {
    nestedMenus.add(element);

    const parentUnregister = parentMenuContext?.registerNestedMenu(element);

    return () => {
      nestedMenus.delete(element);
      parentUnregister?.();
    };
  };

  const isTargetInNestedMenu = (target: Element) => {
    return [...nestedMenus].some(menu => contains(menu, target));
  };

  const trackPointerMove = (e: PointerEvent) => {
    // Cancel the previous closing attempt.
    clearCloseTimeout();

    const polygon = pointerGracePolygon();

    // If no polygon, user is already on the menu content or didn't go to it, so do nothing.
    if (!polygon) {
      return;
    }

    if (isPointInPolygon(getEventPoint(e), polygon)) {
      // Plan a closing attempt in case the user doesn't move to the menu content.
      closeWithDelay();
    } else {
      // User isn't moving to the menu content, close it.
      setPointerGracePolygon(null);
      parentMenuContext?.setIsPointerSuspended(false);
      close();
    }
  };

  const resumePointer = () => {
    setPointerGracePolygon(null);
    parentMenuContext?.setIsPointerSuspended(false);
    getDocument().removeEventListener("pointermove", trackPointerMove);
  };

  const suspendPointer = () => {
    // In case of this menu is a sub menu, suspend pointer on parent menu,
    // so hovering quickly a parent menu item
    // while moving to the sub menu content doesn't close the sub menu.
    parentMenuContext?.setIsPointerSuspended(true);

    getDocument().addEventListener("pointermove", trackPointerMove);

    resumePointerTimeoutId = window.setTimeout(resumePointer, 300);
  };

  const clearResumePointerTimeout = () => {
    if (isServer) {
      return;
    }

    window.clearTimeout(resumePointerTimeoutId);
    resumePointerTimeoutId = undefined;
  };

  createEffect(() => {
    const contentEl = contentRef();

    if (!contentEl || !parentMenuContext) {
      return;
    }

    const parentUnregister = parentMenuContext.registerNestedMenu(contentEl);

    onCleanup(() => {
      parentUnregister();
    });
  });

  onCleanup(() => {
    clearCloseTimeout();
    clearResumePointerTimeout();
    resumePointer();
  });

  const context: MenuContextValue = {
    isOpen: disclosureState.isOpen,
    shouldMount: () => rootContext.forceMount() || disclosureState.isOpen(),
    currentPlacement,
    isPointerInNestedMenu,
    isPointerSuspended,
    autoFocus: focusStrategy,
    listState: () => listState,
    parentMenuContext: () => parentMenuContext,
    triggerRef,
    contentRef,
    triggerId,
    contentId,
    setTriggerRef,
    setContentRef,
    setIsPointerInNestedMenu,
    setIsPointerSuspended,
    setPointerGracePolygon,
    open,
    close,
    clearCloseTimeout,
    toggle,
    focusContent,
    suspendPointer,
    isTargetInNestedMenu,
    registerNestedMenu,
    registerItemToParentDomCollection: parentDomCollectionContext?.registerItem,
    registerTriggerId: createRegisterId(setTriggerId),
    registerContentId: createRegisterId(setContentId),
  };

  return (
    <DomCollectionProvider>
      <MenuContext.Provider value={context}>
        <Popper
          anchorRef={triggerRef}
          contentRef={contentRef}
          onCurrentPlacementChange={setCurrentPlacement}
          {...others}
        />
      </MenuContext.Provider>
    </DomCollectionProvider>
  );
}
