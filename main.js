"use strict";
const obsidian = require("obsidian");
const sharedConfig = {
  context: void 0,
  registry: void 0
};
const equalFn = (a, b) => a === b;
const $PROXY = Symbol("solid-proxy");
const $TRACK = Symbol("solid-track");
const signalOptions = {
  equals: equalFn
};
let runEffects = runQueue;
const STALE = 1;
const PENDING = 2;
const UNOWNED = {
  owned: null,
  cleanups: null,
  context: null,
  owner: null
};
var Owner = null;
let Transition = null;
let ExternalSourceConfig = null;
let Listener = null;
let Updates = null;
let Effects = null;
let ExecCount = 0;
function createRoot(fn, detachedOwner) {
  const listener = Listener, owner = Owner, unowned = fn.length === 0, current = detachedOwner === void 0 ? owner : detachedOwner, root = unowned ? UNOWNED : {
    owned: null,
    cleanups: null,
    context: current ? current.context : null,
    owner: current
  }, updateFn = unowned ? fn : () => fn(() => untrack(() => cleanNode(root)));
  Owner = root;
  Listener = null;
  try {
    return runUpdates(updateFn, true);
  } finally {
    Listener = listener;
    Owner = owner;
  }
}
function createSignal(value, options) {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions;
  const s = {
    value,
    observers: null,
    observerSlots: null,
    comparator: options.equals || void 0
  };
  const setter = (value2) => {
    if (typeof value2 === "function") {
      value2 = value2(s.value);
    }
    return writeSignal(s, value2);
  };
  return [readSignal.bind(s), setter];
}
function createRenderEffect(fn, value, options) {
  const c = createComputation(fn, value, false, STALE);
  updateComputation(c);
}
function createEffect(fn, value, options) {
  runEffects = runUserEffects;
  const c = createComputation(fn, value, false, STALE);
  if (!options || !options.render) c.user = true;
  Effects ? Effects.push(c) : updateComputation(c);
}
function createMemo(fn, value, options) {
  options = options ? Object.assign({}, signalOptions, options) : signalOptions;
  const c = createComputation(fn, value, true, 0);
  c.observers = null;
  c.observerSlots = null;
  c.comparator = options.equals || void 0;
  updateComputation(c);
  return readSignal.bind(c);
}
function batch(fn) {
  return runUpdates(fn, false);
}
function untrack(fn) {
  if (Listener === null) return fn();
  const listener = Listener;
  Listener = null;
  try {
    if (ExternalSourceConfig) ;
    return fn();
  } finally {
    Listener = listener;
  }
}
function on(deps, fn, options) {
  const isArray = Array.isArray(deps);
  let prevInput;
  let defer = options && options.defer;
  return (prevValue) => {
    let input;
    if (isArray) {
      input = Array(deps.length);
      for (let i = 0; i < deps.length; i++) input[i] = deps[i]();
    } else input = deps();
    if (defer) {
      defer = false;
      return prevValue;
    }
    const result = untrack(() => fn(input, prevInput, prevValue));
    prevInput = input;
    return result;
  };
}
function onMount(fn) {
  createEffect(() => untrack(fn));
}
function onCleanup(fn) {
  if (Owner === null) ;
  else if (Owner.cleanups === null) Owner.cleanups = [fn];
  else Owner.cleanups.push(fn);
  return fn;
}
function getListener() {
  return Listener;
}
function getOwner() {
  return Owner;
}
function runWithOwner(o, fn) {
  const prev = Owner;
  const prevListener = Listener;
  Owner = o;
  Listener = null;
  try {
    return runUpdates(fn, true);
  } catch (err) {
    handleError(err);
  } finally {
    Owner = prev;
    Listener = prevListener;
  }
}
function createContext(defaultValue, options) {
  const id = Symbol("context");
  return {
    id,
    Provider: createProvider(id),
    defaultValue
  };
}
function useContext(context) {
  return Owner && Owner.context && Owner.context[context.id] !== void 0 ? Owner.context[context.id] : context.defaultValue;
}
function children(fn) {
  const children2 = createMemo(fn);
  const memo = createMemo(() => resolveChildren(children2()));
  memo.toArray = () => {
    const c = memo();
    return Array.isArray(c) ? c : c != null ? [c] : [];
  };
  return memo;
}
function readSignal() {
  if (this.sources && this.state) {
    if (this.state === STALE) updateComputation(this);
    else {
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(this), false);
      Updates = updates;
    }
  }
  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots.push(sSlot);
    }
    if (!this.observers) {
      this.observers = [Listener];
      this.observerSlots = [Listener.sources.length - 1];
    } else {
      this.observers.push(Listener);
      this.observerSlots.push(Listener.sources.length - 1);
    }
  }
  return this.value;
}
function writeSignal(node, value, isComp) {
  let current = node.value;
  if (!node.comparator || !node.comparator(current, value)) {
    node.value = value;
    if (node.observers && node.observers.length) {
      runUpdates(() => {
        for (let i = 0; i < node.observers.length; i += 1) {
          const o = node.observers[i];
          const TransitionRunning = Transition && Transition.running;
          if (TransitionRunning && Transition.disposed.has(o)) ;
          if (TransitionRunning ? !o.tState : !o.state) {
            if (o.pure) Updates.push(o);
            else Effects.push(o);
            if (o.observers) markDownstream(o);
          }
          if (!TransitionRunning) o.state = STALE;
        }
        if (Updates.length > 1e6) {
          Updates = [];
          if (false) ;
          throw new Error();
        }
      }, false);
    }
  }
  return value;
}
function updateComputation(node) {
  if (!node.fn) return;
  cleanNode(node);
  const time = ExecCount;
  runComputation(
    node,
    node.value,
    time
  );
}
function runComputation(node, value, time) {
  let nextValue;
  const owner = Owner, listener = Listener;
  Listener = Owner = node;
  try {
    nextValue = node.fn(value);
  } catch (err) {
    if (node.pure) {
      {
        node.state = STALE;
        node.owned && node.owned.forEach(cleanNode);
        node.owned = null;
      }
    }
    node.updatedAt = time + 1;
    return handleError(err);
  } finally {
    Listener = listener;
    Owner = owner;
  }
  if (!node.updatedAt || node.updatedAt <= time) {
    if (node.updatedAt != null && "observers" in node) {
      writeSignal(node, nextValue);
    } else node.value = nextValue;
    node.updatedAt = time;
  }
}
function createComputation(fn, init, pure, state = STALE, options) {
  const c = {
    fn,
    state,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    cleanups: null,
    value: init,
    owner: Owner,
    context: Owner ? Owner.context : null,
    pure
  };
  if (Owner === null) ;
  else if (Owner !== UNOWNED) {
    {
      if (!Owner.owned) Owner.owned = [c];
      else Owner.owned.push(c);
    }
  }
  return c;
}
function runTop(node) {
  if (node.state === 0) return;
  if (node.state === PENDING) return lookUpstream(node);
  if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
  const ancestors = [node];
  while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
    if (node.state) ancestors.push(node);
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    node = ancestors[i];
    if (node.state === STALE) {
      updateComputation(node);
    } else if (node.state === PENDING) {
      const updates = Updates;
      Updates = null;
      runUpdates(() => lookUpstream(node, ancestors[0]), false);
      Updates = updates;
    }
  }
}
function runUpdates(fn, init) {
  if (Updates) return fn();
  let wait = false;
  if (!init) Updates = [];
  if (Effects) wait = true;
  else Effects = [];
  ExecCount++;
  try {
    const res = fn();
    completeUpdates(wait);
    return res;
  } catch (err) {
    if (!wait) Effects = null;
    Updates = null;
    handleError(err);
  }
}
function completeUpdates(wait) {
  if (Updates) {
    runQueue(Updates);
    Updates = null;
  }
  if (wait) return;
  const e = Effects;
  Effects = null;
  if (e.length) runUpdates(() => runEffects(e), false);
}
function runQueue(queue) {
  for (let i = 0; i < queue.length; i++) runTop(queue[i]);
}
function runUserEffects(queue) {
  let i, userLength = 0;
  for (i = 0; i < queue.length; i++) {
    const e = queue[i];
    if (!e.user) runTop(e);
    else queue[userLength++] = e;
  }
  for (i = 0; i < userLength; i++) runTop(queue[i]);
}
function lookUpstream(node, ignore) {
  node.state = 0;
  for (let i = 0; i < node.sources.length; i += 1) {
    const source = node.sources[i];
    if (source.sources) {
      const state = source.state;
      if (state === STALE) {
        if (source !== ignore && (!source.updatedAt || source.updatedAt < ExecCount))
          runTop(source);
      } else if (state === PENDING) lookUpstream(source, ignore);
    }
  }
}
function markDownstream(node) {
  for (let i = 0; i < node.observers.length; i += 1) {
    const o = node.observers[i];
    if (!o.state) {
      o.state = PENDING;
      if (o.pure) Updates.push(o);
      else Effects.push(o);
      o.observers && markDownstream(o);
    }
  }
}
function cleanNode(node) {
  let i;
  if (node.sources) {
    while (node.sources.length) {
      const source = node.sources.pop(), index = node.sourceSlots.pop(), obs = source.observers;
      if (obs && obs.length) {
        const n = obs.pop(), s = source.observerSlots.pop();
        if (index < obs.length) {
          n.sourceSlots[s] = index;
          obs[index] = n;
          source.observerSlots[index] = s;
        }
      }
    }
  }
  if (node.owned) {
    for (i = node.owned.length - 1; i >= 0; i--) cleanNode(node.owned[i]);
    node.owned = null;
  }
  if (node.cleanups) {
    for (i = node.cleanups.length - 1; i >= 0; i--) node.cleanups[i]();
    node.cleanups = null;
  }
  node.state = 0;
}
function castError(err) {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : "Unknown error", {
    cause: err
  });
}
function handleError(err, owner = Owner) {
  const error = castError(err);
  throw error;
}
function resolveChildren(children2) {
  if (typeof children2 === "function" && !children2.length) return resolveChildren(children2());
  if (Array.isArray(children2)) {
    const results = [];
    for (let i = 0; i < children2.length; i++) {
      const result = resolveChildren(children2[i]);
      Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
    }
    return results;
  }
  return children2;
}
function createProvider(id, options) {
  return function provider(props) {
    let res;
    createRenderEffect(
      () => res = untrack(() => {
        Owner.context = {
          ...Owner.context,
          [id]: props.value
        };
        return children(() => props.children);
      }),
      void 0
    );
    return res;
  };
}
const FALLBACK = Symbol("fallback");
function dispose(d) {
  for (let i = 0; i < d.length; i++) d[i]();
}
function mapArray(list, mapFn, options = {}) {
  let items = [], mapped = [], disposers = [], len = 0, indexes = mapFn.length > 1 ? [] : null;
  onCleanup(() => dispose(disposers));
  return () => {
    let newItems = list() || [], i, j;
    newItems[$TRACK];
    return untrack(() => {
      let newLen = newItems.length, newIndices, newIndicesNext, temp, tempdisposers, tempIndexes, start, end, newEnd, item;
      if (newLen === 0) {
        if (len !== 0) {
          dispose(disposers);
          disposers = [];
          items = [];
          mapped = [];
          len = 0;
          indexes && (indexes = []);
        }
        if (options.fallback) {
          items = [FALLBACK];
          mapped[0] = createRoot((disposer) => {
            disposers[0] = disposer;
            return options.fallback();
          });
          len = 1;
        }
      } else if (len === 0) {
        mapped = new Array(newLen);
        for (j = 0; j < newLen; j++) {
          items[j] = newItems[j];
          mapped[j] = createRoot(mapper);
        }
        len = newLen;
      } else {
        temp = new Array(newLen);
        tempdisposers = new Array(newLen);
        indexes && (tempIndexes = new Array(newLen));
        for (start = 0, end = Math.min(len, newLen); start < end && items[start] === newItems[start]; start++) ;
        for (end = len - 1, newEnd = newLen - 1; end >= start && newEnd >= start && items[end] === newItems[newEnd]; end--, newEnd--) {
          temp[newEnd] = mapped[end];
          tempdisposers[newEnd] = disposers[end];
          indexes && (tempIndexes[newEnd] = indexes[end]);
        }
        newIndices = /* @__PURE__ */ new Map();
        newIndicesNext = new Array(newEnd + 1);
        for (j = newEnd; j >= start; j--) {
          item = newItems[j];
          i = newIndices.get(item);
          newIndicesNext[j] = i === void 0 ? -1 : i;
          newIndices.set(item, j);
        }
        for (i = start; i <= end; i++) {
          item = items[i];
          j = newIndices.get(item);
          if (j !== void 0 && j !== -1) {
            temp[j] = mapped[i];
            tempdisposers[j] = disposers[i];
            indexes && (tempIndexes[j] = indexes[i]);
            j = newIndicesNext[j];
            newIndices.set(item, j);
          } else disposers[i]();
        }
        for (j = start; j < newLen; j++) {
          if (j in temp) {
            mapped[j] = temp[j];
            disposers[j] = tempdisposers[j];
            if (indexes) {
              indexes[j] = tempIndexes[j];
              indexes[j](j);
            }
          } else mapped[j] = createRoot(mapper);
        }
        mapped = mapped.slice(0, len = newLen);
        items = newItems.slice(0);
      }
      return mapped;
    });
    function mapper(disposer) {
      disposers[j] = disposer;
      if (indexes) {
        const [s, set] = createSignal(j);
        indexes[j] = set;
        return mapFn(newItems[j], s);
      }
      return mapFn(newItems[j]);
    }
  };
}
let hydrationEnabled = false;
function createComponent(Comp, props) {
  if (hydrationEnabled) ;
  return untrack(() => Comp(props || {}));
}
function trueFn() {
  return true;
}
const propTraps = {
  get(_, property, receiver) {
    if (property === $PROXY) return receiver;
    return _.get(property);
  },
  has(_, property) {
    if (property === $PROXY) return true;
    return _.has(property);
  },
  set: trueFn,
  deleteProperty: trueFn,
  getOwnPropertyDescriptor(_, property) {
    return {
      configurable: true,
      enumerable: true,
      get() {
        return _.get(property);
      },
      set: trueFn,
      deleteProperty: trueFn
    };
  },
  ownKeys(_) {
    return _.keys();
  }
};
function resolveSource(s) {
  return !(s = typeof s === "function" ? s() : s) ? {} : s;
}
function resolveSources() {
  for (let i = 0, length = this.length; i < length; ++i) {
    const v = this[i]();
    if (v !== void 0) return v;
  }
}
function mergeProps(...sources) {
  let proxy = false;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    proxy = proxy || !!s && $PROXY in s;
    sources[i] = typeof s === "function" ? (proxy = true, createMemo(s)) : s;
  }
  if (proxy) {
    return new Proxy(
      {
        get(property) {
          for (let i = sources.length - 1; i >= 0; i--) {
            const v = resolveSource(sources[i])[property];
            if (v !== void 0) return v;
          }
        },
        has(property) {
          for (let i = sources.length - 1; i >= 0; i--) {
            if (property in resolveSource(sources[i])) return true;
          }
          return false;
        },
        keys() {
          const keys = [];
          for (let i = 0; i < sources.length; i++)
            keys.push(...Object.keys(resolveSource(sources[i])));
          return [...new Set(keys)];
        }
      },
      propTraps
    );
  }
  const sourcesMap = {};
  const defined = /* @__PURE__ */ Object.create(null);
  for (let i = sources.length - 1; i >= 0; i--) {
    const source = sources[i];
    if (!source) continue;
    const sourceKeys = Object.getOwnPropertyNames(source);
    for (let i2 = sourceKeys.length - 1; i2 >= 0; i2--) {
      const key = sourceKeys[i2];
      if (key === "__proto__" || key === "constructor") continue;
      const desc = Object.getOwnPropertyDescriptor(source, key);
      if (!defined[key]) {
        defined[key] = desc.get ? {
          enumerable: true,
          configurable: true,
          get: resolveSources.bind(sourcesMap[key] = [desc.get.bind(source)])
        } : desc.value !== void 0 ? desc : void 0;
      } else {
        const sources2 = sourcesMap[key];
        if (sources2) {
          if (desc.get) sources2.push(desc.get.bind(source));
          else if (desc.value !== void 0) sources2.push(() => desc.value);
        }
      }
    }
  }
  const target = {};
  const definedKeys = Object.keys(defined);
  for (let i = definedKeys.length - 1; i >= 0; i--) {
    const key = definedKeys[i], desc = defined[key];
    if (desc && desc.get) Object.defineProperty(target, key, desc);
    else target[key] = desc ? desc.value : void 0;
  }
  return target;
}
function splitProps(props, ...keys) {
  if ($PROXY in props) {
    const blocked = new Set(keys.length > 1 ? keys.flat() : keys[0]);
    const res = keys.map((k) => {
      return new Proxy(
        {
          get(property) {
            return k.includes(property) ? props[property] : void 0;
          },
          has(property) {
            return k.includes(property) && property in props;
          },
          keys() {
            return k.filter((property) => property in props);
          }
        },
        propTraps
      );
    });
    res.push(
      new Proxy(
        {
          get(property) {
            return blocked.has(property) ? void 0 : props[property];
          },
          has(property) {
            return blocked.has(property) ? false : property in props;
          },
          keys() {
            return Object.keys(props).filter((k) => !blocked.has(k));
          }
        },
        propTraps
      )
    );
    return res;
  }
  const otherObject = {};
  const objects = keys.map(() => ({}));
  for (const propName of Object.getOwnPropertyNames(props)) {
    const desc = Object.getOwnPropertyDescriptor(props, propName);
    const isDefaultDesc = !desc.get && !desc.set && desc.enumerable && desc.writable && desc.configurable;
    let blocked = false;
    let objectIndex = 0;
    for (const k of keys) {
      if (k.includes(propName)) {
        blocked = true;
        isDefaultDesc ? objects[objectIndex][propName] = desc.value : Object.defineProperty(objects[objectIndex], propName, desc);
      }
      ++objectIndex;
    }
    if (!blocked) {
      isDefaultDesc ? otherObject[propName] = desc.value : Object.defineProperty(otherObject, propName, desc);
    }
  }
  return [...objects, otherObject];
}
let counter = 0;
function createUniqueId() {
  return `cl-${counter++}`;
}
const narrowedError = (name) => `Stale read from <${name}>.`;
function For(props) {
  const fallback = "fallback" in props && {
    fallback: () => props.fallback
  };
  return createMemo(mapArray(() => props.each, props.children, fallback || void 0));
}
function Show(props) {
  const keyed = props.keyed;
  const condition = createMemo(() => props.when, void 0, {
    equals: (a, b) => keyed ? a === b : !a === !b
  });
  return createMemo(
    () => {
      const c = condition();
      if (c) {
        const child = props.children;
        const fn = typeof child === "function" && child.length > 0;
        return fn ? untrack(
          () => child(
            keyed ? c : () => {
              if (!untrack(condition)) throw narrowedError("Show");
              return props.when;
            }
          )
        ) : child;
      }
      return props.fallback;
    },
    void 0,
    void 0
  );
}
function Switch(props) {
  let keyed = false;
  const equals = (a, b) => (keyed ? a[1] === b[1] : !a[1] === !b[1]) && a[2] === b[2];
  const conditions = children(() => props.children), evalConditions = createMemo(
    () => {
      let conds = conditions();
      if (!Array.isArray(conds)) conds = [conds];
      for (let i = 0; i < conds.length; i++) {
        const c = conds[i].when;
        if (c) {
          keyed = !!conds[i].keyed;
          return [i, c, conds[i]];
        }
      }
      return [-1];
    },
    void 0,
    {
      equals
    }
  );
  return createMemo(
    () => {
      const [index, when, cond] = evalConditions();
      if (index < 0) return props.fallback;
      const c = cond.children;
      const fn = typeof c === "function" && c.length > 0;
      return fn ? untrack(
        () => c(
          keyed ? when : () => {
            if (untrack(evalConditions)[0] !== index) throw narrowedError("Match");
            return cond.when;
          }
        )
      ) : c;
    },
    void 0,
    void 0
  );
}
function Match(props) {
  return props;
}
const booleans = [
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "disabled",
  "formnovalidate",
  "hidden",
  "indeterminate",
  "inert",
  "ismap",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "seamless",
  "selected"
];
const Properties = /* @__PURE__ */ new Set([
  "className",
  "value",
  "readOnly",
  "formNoValidate",
  "isMap",
  "noModule",
  "playsInline",
  ...booleans
]);
const ChildProperties = /* @__PURE__ */ new Set([
  "innerHTML",
  "textContent",
  "innerText",
  "children"
]);
const Aliases = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(null), {
  className: "class",
  htmlFor: "for"
});
const PropAliases = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(null), {
  class: "className",
  formnovalidate: {
    $: "formNoValidate",
    BUTTON: 1,
    INPUT: 1
  },
  ismap: {
    $: "isMap",
    IMG: 1
  },
  nomodule: {
    $: "noModule",
    SCRIPT: 1
  },
  playsinline: {
    $: "playsInline",
    VIDEO: 1
  },
  readonly: {
    $: "readOnly",
    INPUT: 1,
    TEXTAREA: 1
  }
});
function getPropAlias(prop, tagName) {
  const a = PropAliases[prop];
  return typeof a === "object" ? a[tagName] ? a["$"] : void 0 : a;
}
const DelegatedEvents = /* @__PURE__ */ new Set([
  "beforeinput",
  "click",
  "dblclick",
  "contextmenu",
  "focusin",
  "focusout",
  "input",
  "keydown",
  "keyup",
  "mousedown",
  "mousemove",
  "mouseout",
  "mouseover",
  "mouseup",
  "pointerdown",
  "pointermove",
  "pointerout",
  "pointerover",
  "pointerup",
  "touchend",
  "touchmove",
  "touchstart"
]);
const SVGElements = /* @__PURE__ */ new Set([
  "altGlyph",
  "altGlyphDef",
  "altGlyphItem",
  "animate",
  "animateColor",
  "animateMotion",
  "animateTransform",
  "circle",
  "clipPath",
  "color-profile",
  "cursor",
  "defs",
  "desc",
  "ellipse",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "filter",
  "font",
  "font-face",
  "font-face-format",
  "font-face-name",
  "font-face-src",
  "font-face-uri",
  "foreignObject",
  "g",
  "glyph",
  "glyphRef",
  "hkern",
  "image",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "metadata",
  "missing-glyph",
  "mpath",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "set",
  "stop",
  "svg",
  "switch",
  "symbol",
  "text",
  "textPath",
  "tref",
  "tspan",
  "use",
  "view",
  "vkern"
]);
const SVGNamespace = {
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace"
};
function reconcileArrays(parentNode, a, b) {
  let bLength = b.length, aEnd = a.length, bEnd = bLength, aStart = 0, bStart = 0, after = a[aEnd - 1].nextSibling, map = null;
  while (aStart < aEnd || bStart < bEnd) {
    if (a[aStart] === b[bStart]) {
      aStart++;
      bStart++;
      continue;
    }
    while (a[aEnd - 1] === b[bEnd - 1]) {
      aEnd--;
      bEnd--;
    }
    if (aEnd === aStart) {
      const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
      while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
    } else if (bEnd === bStart) {
      while (aStart < aEnd) {
        if (!map || !map.has(a[aStart])) a[aStart].remove();
        aStart++;
      }
    } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
      const node = a[--aEnd].nextSibling;
      parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
      parentNode.insertBefore(b[--bEnd], node);
      a[aEnd] = b[bEnd];
    } else {
      if (!map) {
        map = /* @__PURE__ */ new Map();
        let i = bStart;
        while (i < bEnd) map.set(b[i], i++);
      }
      const index = map.get(a[aStart]);
      if (index != null) {
        if (bStart < index && index < bEnd) {
          let i = aStart, sequence = 1, t;
          while (++i < aEnd && i < bEnd) {
            if ((t = map.get(a[i])) == null || t !== index + sequence) break;
            sequence++;
          }
          if (sequence > index - bStart) {
            const node = a[aStart];
            while (bStart < index) parentNode.insertBefore(b[bStart++], node);
          } else parentNode.replaceChild(b[bStart++], a[aStart++]);
        } else aStart++;
      } else a[aStart++].remove();
    }
  }
}
const $$EVENTS = "_$DX_DELEGATE";
function render(code, element, init, options = {}) {
  let disposer;
  createRoot((dispose2) => {
    disposer = dispose2;
    element === document ? code() : insert(element, code(), element.firstChild ? null : void 0, init);
  }, options.owner);
  return () => {
    disposer();
    element.textContent = "";
  };
}
function template(html, isCE, isSVG) {
  let node;
  const create = () => {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content.firstChild;
  };
  const fn = () => (node || (node = create())).cloneNode(true);
  fn.cloneNode = fn;
  return fn;
}
function delegateEvents(eventNames, document2 = window.document) {
  const e = document2[$$EVENTS] || (document2[$$EVENTS] = /* @__PURE__ */ new Set());
  for (let i = 0, l = eventNames.length; i < l; i++) {
    const name = eventNames[i];
    if (!e.has(name)) {
      e.add(name);
      document2.addEventListener(name, eventHandler);
    }
  }
}
function setAttribute(node, name, value) {
  if (value == null) node.removeAttribute(name);
  else node.setAttribute(name, value);
}
function setAttributeNS(node, namespace, name, value) {
  if (value == null) node.removeAttributeNS(namespace, name);
  else node.setAttributeNS(namespace, name, value);
}
function className(node, value) {
  if (value == null) node.removeAttribute("class");
  else node.className = value;
}
function addEventListener(node, name, handler, delegate) {
  if (delegate) {
    if (Array.isArray(handler)) {
      node[`$$${name}`] = handler[0];
      node[`$$${name}Data`] = handler[1];
    } else node[`$$${name}`] = handler;
  } else if (Array.isArray(handler)) {
    const handlerFn = handler[0];
    node.addEventListener(name, handler[0] = (e) => handlerFn.call(node, handler[1], e));
  } else node.addEventListener(name, handler);
}
function classList(node, value, prev = {}) {
  const classKeys = Object.keys(value || {}), prevKeys = Object.keys(prev);
  let i, len;
  for (i = 0, len = prevKeys.length; i < len; i++) {
    const key = prevKeys[i];
    if (!key || key === "undefined" || value[key]) continue;
    toggleClassKey(node, key, false);
    delete prev[key];
  }
  for (i = 0, len = classKeys.length; i < len; i++) {
    const key = classKeys[i], classValue = !!value[key];
    if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
    toggleClassKey(node, key, true);
    prev[key] = classValue;
  }
  return prev;
}
function style(node, value, prev) {
  if (!value) return prev ? setAttribute(node, "style") : value;
  const nodeStyle = node.style;
  if (typeof value === "string") return nodeStyle.cssText = value;
  typeof prev === "string" && (nodeStyle.cssText = prev = void 0);
  prev || (prev = {});
  value || (value = {});
  let v, s;
  for (s in prev) {
    value[s] == null && nodeStyle.removeProperty(s);
    delete prev[s];
  }
  for (s in value) {
    v = value[s];
    if (v !== prev[s]) {
      nodeStyle.setProperty(s, v);
      prev[s] = v;
    }
  }
  return prev;
}
function spread(node, props = {}, isSVG, skipChildren) {
  const prevProps = {};
  if (!skipChildren) {
    createRenderEffect(
      () => prevProps.children = insertExpression(node, props.children, prevProps.children)
    );
  }
  createRenderEffect(
    () => typeof props.ref === "function" ? use(props.ref, node) : props.ref = node
  );
  createRenderEffect(() => assign(node, props, isSVG, true, prevProps, true));
  return prevProps;
}
function use(fn, element, arg) {
  return untrack(() => fn(element, arg));
}
function insert(parent, accessor, marker, initial) {
  if (marker !== void 0 && !initial) initial = [];
  if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
  createRenderEffect((current) => insertExpression(parent, accessor(), current, marker), initial);
}
function assign(node, props, isSVG, skipChildren, prevProps = {}, skipRef = false) {
  props || (props = {});
  for (const prop in prevProps) {
    if (!(prop in props)) {
      if (prop === "children") continue;
      prevProps[prop] = assignProp(node, prop, null, prevProps[prop], isSVG, skipRef);
    }
  }
  for (const prop in props) {
    if (prop === "children") {
      continue;
    }
    const value = props[prop];
    prevProps[prop] = assignProp(node, prop, value, prevProps[prop], isSVG, skipRef);
  }
}
function toPropertyName(name) {
  return name.toLowerCase().replace(/-([a-z])/g, (_, w) => w.toUpperCase());
}
function toggleClassKey(node, key, value) {
  const classNames = key.trim().split(/\s+/);
  for (let i = 0, nameLen = classNames.length; i < nameLen; i++)
    node.classList.toggle(classNames[i], value);
}
function assignProp(node, prop, value, prev, isSVG, skipRef) {
  let isCE, isProp, isChildProp, propAlias, forceProp;
  if (prop === "style") return style(node, value, prev);
  if (prop === "classList") return classList(node, value, prev);
  if (value === prev) return prev;
  if (prop === "ref") {
    if (!skipRef) value(node);
  } else if (prop.slice(0, 3) === "on:") {
    const e = prop.slice(3);
    prev && node.removeEventListener(e, prev);
    value && node.addEventListener(e, value);
  } else if (prop.slice(0, 10) === "oncapture:") {
    const e = prop.slice(10);
    prev && node.removeEventListener(e, prev, true);
    value && node.addEventListener(e, value, true);
  } else if (prop.slice(0, 2) === "on") {
    const name = prop.slice(2).toLowerCase();
    const delegate = DelegatedEvents.has(name);
    if (!delegate && prev) {
      const h = Array.isArray(prev) ? prev[0] : prev;
      node.removeEventListener(name, h);
    }
    if (delegate || value) {
      addEventListener(node, name, value, delegate);
      delegate && delegateEvents([name]);
    }
  } else if (prop.slice(0, 5) === "attr:") {
    setAttribute(node, prop.slice(5), value);
  } else if ((forceProp = prop.slice(0, 5) === "prop:") || (isChildProp = ChildProperties.has(prop)) || !isSVG && ((propAlias = getPropAlias(prop, node.tagName)) || (isProp = Properties.has(prop))) || (isCE = node.nodeName.includes("-"))) {
    if (forceProp) {
      prop = prop.slice(5);
      isProp = true;
    }
    if (prop === "class" || prop === "className") className(node, value);
    else if (isCE && !isProp && !isChildProp) node[toPropertyName(prop)] = value;
    else node[propAlias || prop] = value;
  } else {
    const ns = isSVG && prop.indexOf(":") > -1 && SVGNamespace[prop.split(":")[0]];
    if (ns) setAttributeNS(node, ns, prop, value);
    else setAttribute(node, Aliases[prop] || prop, value);
  }
  return value;
}
function eventHandler(e) {
  const key = `$$${e.type}`;
  let node = e.composedPath && e.composedPath()[0] || e.target;
  if (e.target !== node) {
    Object.defineProperty(e, "target", {
      configurable: true,
      value: node
    });
  }
  Object.defineProperty(e, "currentTarget", {
    configurable: true,
    get() {
      return node || document;
    }
  });
  while (node) {
    const handler = node[key];
    if (handler && !node.disabled) {
      const data = node[`${key}Data`];
      data !== void 0 ? handler.call(node, data, e) : handler.call(node, e);
      if (e.cancelBubble) return;
    }
    node = node._$host || node.parentNode || node.host;
  }
}
function insertExpression(parent, value, current, marker, unwrapArray) {
  while (typeof current === "function") current = current();
  if (value === current) return current;
  const t = typeof value, multi = marker !== void 0;
  parent = multi && current[0] && current[0].parentNode || parent;
  if (t === "string" || t === "number") {
    if (t === "number") {
      value = value.toString();
      if (value === current) return current;
    }
    if (multi) {
      let node = current[0];
      if (node && node.nodeType === 3) {
        node.data !== value && (node.data = value);
      } else node = document.createTextNode(value);
      current = cleanChildren(parent, current, marker, node);
    } else {
      if (current !== "" && typeof current === "string") {
        current = parent.firstChild.data = value;
      } else current = parent.textContent = value;
    }
  } else if (value == null || t === "boolean") {
    current = cleanChildren(parent, current, marker);
  } else if (t === "function") {
    createRenderEffect(() => {
      let v = value();
      while (typeof v === "function") v = v();
      current = insertExpression(parent, v, current, marker);
    });
    return () => current;
  } else if (Array.isArray(value)) {
    const array = [];
    const currentArray = current && Array.isArray(current);
    if (normalizeIncomingArray(array, value, current, unwrapArray)) {
      createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
      return () => current;
    }
    if (array.length === 0) {
      current = cleanChildren(parent, current, marker);
      if (multi) return current;
    } else if (currentArray) {
      if (current.length === 0) {
        appendNodes(parent, array, marker);
      } else reconcileArrays(parent, current, array);
    } else {
      current && cleanChildren(parent);
      appendNodes(parent, array);
    }
    current = array;
  } else if (value.nodeType) {
    if (Array.isArray(current)) {
      if (multi) return current = cleanChildren(parent, current, marker, value);
      cleanChildren(parent, current, null, value);
    } else if (current == null || current === "" || !parent.firstChild) {
      parent.appendChild(value);
    } else parent.replaceChild(value, parent.firstChild);
    current = value;
  } else ;
  return current;
}
function normalizeIncomingArray(normalized, array, current, unwrap2) {
  let dynamic = false;
  for (let i = 0, len = array.length; i < len; i++) {
    let item = array[i], prev = current && current[normalized.length], t;
    if (item == null || item === true || item === false) ;
    else if ((t = typeof item) === "object" && item.nodeType) {
      normalized.push(item);
    } else if (Array.isArray(item)) {
      dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
    } else if (t === "function") {
      if (unwrap2) {
        while (typeof item === "function") item = item();
        dynamic = normalizeIncomingArray(
          normalized,
          Array.isArray(item) ? item : [item],
          Array.isArray(prev) ? prev : [prev]
        ) || dynamic;
      } else {
        normalized.push(item);
        dynamic = true;
      }
    } else {
      const value = String(item);
      if (prev && prev.nodeType === 3 && prev.data === value) normalized.push(prev);
      else normalized.push(document.createTextNode(value));
    }
  }
  return dynamic;
}
function appendNodes(parent, array, marker = null) {
  for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
}
function cleanChildren(parent, current, marker, replacement) {
  if (marker === void 0) return parent.textContent = "";
  const node = replacement || document.createTextNode("");
  if (current.length) {
    let inserted = false;
    for (let i = current.length - 1; i >= 0; i--) {
      const el = current[i];
      if (node !== el) {
        const isParent = el.parentNode === parent;
        if (!inserted && !i)
          isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);
        else isParent && el.remove();
      } else inserted = true;
    }
  } else parent.insertBefore(node, marker);
  return [node];
}
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
function createElement(tagName, isSVG = false) {
  return isSVG ? document.createElementNS(SVG_NAMESPACE, tagName) : document.createElement(tagName);
}
function Portal(props) {
  const { useShadow } = props, marker = document.createTextNode(""), mount = () => props.mount || document.body, owner = getOwner();
  let content;
  let hydrating = !!sharedConfig.context;
  createEffect(
    () => {
      content || (content = runWithOwner(owner, () => createMemo(() => props.children)));
      const el = mount();
      if (el instanceof HTMLHeadElement) {
        const [clean, setClean] = createSignal(false);
        const cleanup = () => setClean(true);
        createRoot((dispose2) => insert(el, () => !clean() ? content() : dispose2(), null));
        onCleanup(cleanup);
      } else {
        const container = createElement(props.isSVG ? "g" : "div", props.isSVG), renderRoot = useShadow && container.attachShadow ? container.attachShadow({
          mode: "open"
        }) : container;
        Object.defineProperty(container, "_$host", {
          get() {
            return marker.parentNode;
          },
          configurable: true
        });
        insert(renderRoot, content);
        el.appendChild(container);
        props.ref && props.ref(container);
        onCleanup(() => el.removeChild(container));
      }
    },
    void 0,
    {
      render: !hydrating
    }
  );
  return marker;
}
function Dynamic(props) {
  const [p, others] = splitProps(props, ["component"]);
  const cached = createMemo(() => p.component);
  return createMemo(() => {
    const component = cached();
    switch (typeof component) {
      case "function":
        return untrack(() => component(others));
      case "string":
        const isSvg = SVGElements.has(component);
        const el = createElement(component, isSvg);
        spread(el, others, isSvg);
        return el;
    }
  });
}
const $RAW = Symbol("store-raw"), $NODE = Symbol("store-node"), $HAS = Symbol("store-has"), $SELF = Symbol("store-self");
function wrap$1(value) {
  let p = value[$PROXY];
  if (!p) {
    Object.defineProperty(value, $PROXY, {
      value: p = new Proxy(value, proxyTraps$1)
    });
    if (!Array.isArray(value)) {
      const keys = Object.keys(value), desc = Object.getOwnPropertyDescriptors(value);
      for (let i = 0, l = keys.length; i < l; i++) {
        const prop = keys[i];
        if (desc[prop].get) {
          Object.defineProperty(value, prop, {
            enumerable: desc[prop].enumerable,
            get: desc[prop].get.bind(p)
          });
        }
      }
    }
  }
  return p;
}
function isWrappable(obj) {
  let proto;
  return obj != null && typeof obj === "object" && (obj[$PROXY] || !(proto = Object.getPrototypeOf(obj)) || proto === Object.prototype || Array.isArray(obj));
}
function unwrap(item, set = /* @__PURE__ */ new Set()) {
  let result, unwrapped, v, prop;
  if (result = item != null && item[$RAW]) return result;
  if (!isWrappable(item) || set.has(item)) return item;
  if (Array.isArray(item)) {
    if (Object.isFrozen(item)) item = item.slice(0);
    else set.add(item);
    for (let i = 0, l = item.length; i < l; i++) {
      v = item[i];
      if ((unwrapped = unwrap(v, set)) !== v) item[i] = unwrapped;
    }
  } else {
    if (Object.isFrozen(item)) item = Object.assign({}, item);
    else set.add(item);
    const keys = Object.keys(item), desc = Object.getOwnPropertyDescriptors(item);
    for (let i = 0, l = keys.length; i < l; i++) {
      prop = keys[i];
      if (desc[prop].get) continue;
      v = item[prop];
      if ((unwrapped = unwrap(v, set)) !== v) item[prop] = unwrapped;
    }
  }
  return item;
}
function getNodes(target, symbol) {
  let nodes = target[symbol];
  if (!nodes)
    Object.defineProperty(target, symbol, {
      value: nodes = /* @__PURE__ */ Object.create(null)
    });
  return nodes;
}
function getNode(nodes, property, value) {
  if (nodes[property]) return nodes[property];
  const [s, set] = createSignal(value, {
    equals: false,
    internal: true
  });
  s.$ = set;
  return nodes[property] = s;
}
function proxyDescriptor$1(target, property) {
  const desc = Reflect.getOwnPropertyDescriptor(target, property);
  if (!desc || desc.get || !desc.configurable || property === $PROXY || property === $NODE)
    return desc;
  delete desc.value;
  delete desc.writable;
  desc.get = () => target[$PROXY][property];
  return desc;
}
function trackSelf(target) {
  getListener() && getNode(getNodes(target, $NODE), $SELF)();
}
function ownKeys(target) {
  trackSelf(target);
  return Reflect.ownKeys(target);
}
const proxyTraps$1 = {
  get(target, property, receiver) {
    if (property === $RAW) return target;
    if (property === $PROXY) return receiver;
    if (property === $TRACK) {
      trackSelf(target);
      return receiver;
    }
    const nodes = getNodes(target, $NODE);
    const tracked = nodes[property];
    let value = tracked ? tracked() : target[property];
    if (property === $NODE || property === $HAS || property === "__proto__") return value;
    if (!tracked) {
      const desc = Object.getOwnPropertyDescriptor(target, property);
      if (getListener() && (typeof value !== "function" || target.hasOwnProperty(property)) && !(desc && desc.get))
        value = getNode(nodes, property, value)();
    }
    return isWrappable(value) ? wrap$1(value) : value;
  },
  has(target, property) {
    if (property === $RAW || property === $PROXY || property === $TRACK || property === $NODE || property === $HAS || property === "__proto__")
      return true;
    getListener() && getNode(getNodes(target, $HAS), property)();
    return property in target;
  },
  set() {
    return true;
  },
  deleteProperty() {
    return true;
  },
  ownKeys,
  getOwnPropertyDescriptor: proxyDescriptor$1
};
function setProperty(state, property, value, deleting = false) {
  if (!deleting && state[property] === value) return;
  const prev = state[property], len = state.length;
  if (value === void 0) {
    delete state[property];
    if (state[$HAS] && state[$HAS][property] && prev !== void 0) state[$HAS][property].$();
  } else {
    state[property] = value;
    if (state[$HAS] && state[$HAS][property] && prev === void 0) state[$HAS][property].$();
  }
  let nodes = getNodes(state, $NODE), node;
  if (node = getNode(nodes, property, prev)) node.$(() => value);
  if (Array.isArray(state) && state.length !== len) {
    for (let i = state.length; i < len; i++) (node = nodes[i]) && node.$();
    (node = getNode(nodes, "length", len)) && node.$(state.length);
  }
  (node = nodes[$SELF]) && node.$();
}
function mergeStoreNode(state, value) {
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    setProperty(state, key, value[key]);
  }
}
function updateArray(current, next) {
  if (typeof next === "function") next = next(current);
  next = unwrap(next);
  if (Array.isArray(next)) {
    if (current === next) return;
    let i = 0, len = next.length;
    for (; i < len; i++) {
      const value = next[i];
      if (current[i] !== value) setProperty(current, i, value);
    }
    setProperty(current, "length", len);
  } else mergeStoreNode(current, next);
}
function updatePath(current, path, traversed = []) {
  let part, prev = current;
  if (path.length > 1) {
    part = path.shift();
    const partType = typeof part, isArray = Array.isArray(current);
    if (Array.isArray(part)) {
      for (let i = 0; i < part.length; i++) {
        updatePath(current, [part[i]].concat(path), traversed);
      }
      return;
    } else if (isArray && partType === "function") {
      for (let i = 0; i < current.length; i++) {
        if (part(current[i], i)) updatePath(current, [i].concat(path), traversed);
      }
      return;
    } else if (isArray && partType === "object") {
      const { from = 0, to = current.length - 1, by = 1 } = part;
      for (let i = from; i <= to; i += by) {
        updatePath(current, [i].concat(path), traversed);
      }
      return;
    } else if (path.length > 1) {
      updatePath(current[part], path, [part].concat(traversed));
      return;
    }
    prev = current[part];
    traversed = [part].concat(traversed);
  }
  let value = path[0];
  if (typeof value === "function") {
    value = value(prev, traversed);
    if (value === prev) return;
  }
  if (part === void 0 && value == void 0) return;
  value = unwrap(value);
  if (part === void 0 || isWrappable(prev) && isWrappable(value) && !Array.isArray(value)) {
    mergeStoreNode(prev, value);
  } else setProperty(current, part, value);
}
function createStore(...[store, options]) {
  const unwrappedStore = unwrap(store || {});
  const isArray = Array.isArray(unwrappedStore);
  const wrappedStore = wrap$1(unwrappedStore);
  function setStore(...args) {
    batch(() => {
      isArray && args.length === 1 ? updateArray(unwrappedStore, args[0]) : updatePath(unwrappedStore, args);
    });
  }
  return [wrappedStore, setStore];
}
const COMPLEX_PROPERTY_PLACEHOLDER = "file.complex-property";
const toNumber = (v, defaultNumber, min, max, validator) => {
  const num = Number(v);
  if (Number.isNaN(num)) return 0;
  return num;
};
const checkIfDateHasTime = (dt) => {
  const isTime = dt.hour !== 0 || dt.minute !== 0 || dt.second !== 0;
  return isTime;
};
const getValueType = (value, property, luxon) => {
  const t = typeof value;
  if (t === "string") return "text";
  if (t === "number") return "number";
  if (t === "boolean") return "checkbox";
  if (t === "object") {
    if (Array.isArray(value)) {
      return property === "tags" ? "tags" : "list";
    }
    if (luxon.DateTime.isDateTime(value)) {
      const dt = value;
      const isTime = checkIfDateHasTime(dt);
      return isTime ? "datetime" : "date";
    }
    return "text";
  }
  throw new Error("Failed to get property value type");
};
const registerDataviewEvents = (plugin, callback) => {
  plugin.app.metadataCache.on("dataview:index-ready", callback);
  plugin.app.metadataCache.on(
    "dataview:metadata-change",
    callback
  );
};
const unregisterDataviewEvents = (plugin, callback) => {
  plugin.app.metadataCache.off("dataview:index-ready", callback);
  plugin.app.metadataCache.off(
    "dataview:metadata-change",
    callback
  );
};
const getIdColumnIndex = (headers, tableIdColumnName) => {
  const i = headers.findIndex(
    (h) => h.toLowerCase() === tableIdColumnName.toLowerCase() || h === "file.link"
  );
  if (i === -1) {
    throw new Error("Couldn't fine ID column index");
  }
  return i;
};
const checkIfDataviewLink = (val) => {
  if (!val) return false;
  if (typeof val !== "object") return false;
  if (!val.hasOwnProperty("type")) return false;
  if (val.type !== "file") return false;
  return true;
};
const tryDataviewLinkToMarkdown = (val) => {
  if (!checkIfDataviewLink(val)) return val;
  return val.markdown();
};
const tryDataviewArrayToArray = (val) => {
  if (typeof val !== "object") return val;
  if (!(val == null ? void 0 : val.hasOwnProperty("array"))) return val;
  return { ...val }.array();
};
const getColumnPropertyNames = (source) => {
  const line = source.split("\n")[0];
  const isWithoutId = line.toLowerCase().includes("without id");
  const cols = source.split("\n")[0].substring(isWithoutId ? 17 : 6).split(",").map((c) => {
    const str = c.trim();
    const potential = str.split(/\sAS\s/gim)[0].trim();
    const invalidChars = [
      "(",
      ")",
      "[",
      "]",
      "{",
      "}",
      "+",
      // "-", dashes are pretty common in property names
      "*",
      "/",
      "%",
      "<",
      ">",
      "!",
      "=",
      '"'
    ];
    const isComplex = !Number.isNaN(Number(potential)) || //prettier-ignore
    potential.split("").some((char) => invalidChars.includes(char));
    if (isComplex) {
      return COMPLEX_PROPERTY_PLACEHOLDER;
    }
    return potential;
  });
  if (isWithoutId) return cols;
  return ["File", ...cols];
};
const updateMetadataProperty = async (property, value, filePath, plugin, previousValue, itemIndex) => {
  const {
    app: { fileManager, vault }
  } = plugin;
  const file = vault.getFileByPath(filePath);
  if (!file) {
    throw new Error(
      "Tried updating frontmatter property but couldn't find file"
    );
  }
  let fmUpdated = false;
  await fileManager.processFrontMatter(file, (fm) => {
    if (!fm.hasOwnProperty(property)) {
      if (property.includes(".")) {
        assignDotPropertyValue(fm, property, value);
        return fmUpdated = true;
      }
      return;
    }
    fm[property] = value;
    return fmUpdated = true;
  });
  if (fmUpdated) return;
  const inlineUpdated = await tryUpdateInlineProperty(
    property,
    value,
    previousValue,
    file,
    vault,
    itemIndex
  );
  if (inlineUpdated) return;
  await fileManager.processFrontMatter(file, (fm) => {
    fm[property] = value;
  });
};
const assignDotPropertyValue = (obj, property, value) => {
  const keys = property.split(".");
  let current = obj;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
    } else {
      if (!current[key] || typeof current[key] !== "object") {
        current[key] = {};
      }
      current = current[key];
    }
  });
};
const parseLinesForInlineFields = (lines) => {
  const reg = new RegExp(/[\[\(]?([^\n\r\(\[]*)::[ ]*([^\)\]\n\r]*)[\]\)]?/gm);
  return lines.reduce((prev, curr, index) => {
    let matches = reg.exec(curr ?? "");
    if (!matches) {
      return prev;
    }
    const key = matches[1].trim();
    const oldVal = matches[2].trim();
    return [
      ...prev,
      {
        key,
        value: oldVal,
        line: index,
        match: matches[0]
      }
    ];
  }, []);
};
const tryUpdateInlineProperty = async (property, value, previousValue, file, vault, itemIndex) => {
  var _a;
  const content = await vault.read(file);
  const lines = content.split("\n");
  const yaml = [];
  if (lines[0] === "---") {
    const lastYamlDashesIndex = lines.findIndex(
      (l, i) => l === "---" && i !== 0
    );
    if (lastYamlDashesIndex !== -1 && lines[lastYamlDashesIndex + 1] !== void 0) {
      for (let j = 0; j < lastYamlDashesIndex + 1; j++) {
        yaml.push(lines[j]);
        lines[j] = null;
      }
    }
  }
  const parsedFields = parseLinesForInlineFields(lines);
  const foundInline = parsedFields.find(
    (f) => f.value === (previousValue == null ? void 0 : previousValue.toString())
  );
  if (!foundInline) {
    const isNameMatchedInline = parsedFields.some((f) => f.key === property);
    if (isNameMatchedInline) {
      new obsidian.Notice(
        "Inline fields found for property, so you can't use the plus button"
      );
      return true;
    }
    return false;
  }
  const newValue = Array.isArray(value) ? value[itemIndex ?? 0] : value;
  lines[foundInline.line] = ((_a = lines[foundInline.line]) == null ? void 0 : _a.replace(
    // TODO I don't think space after colons is required
    property + ":: " + foundInline.value,
    property + ":: " + (newValue ?? "").toString()
  )) ?? null;
  let finalContent = "";
  for (let m = 0; m < lines.length; m++) {
    const v = lines[m];
    if (v === null) continue;
    finalContent += "\n" + v;
  }
  await vault.modify(file, yaml.join("\n") + finalContent);
  return true;
};
const getExistingProperties = (app2) => {
  const { metadataCache } = app2;
  return metadataCache.getAllPropertyInfos();
};
const getTableLine = (codeBlockText) => {
  const lines = codeBlockText.split("\n");
  let index = 0;
  for (index; index < lines.length; index++) {
    const line = lines[index];
    if (!line.toLowerCase().startsWith("table")) continue;
    return {
      line,
      index
    };
  }
  throw new Error(
    "Unable to find table line from codeBlockText. This should be impossible."
  );
};
const defaultDataEditBlockConfig = {
  lockEditing: false
};
const splitQueryOnConfig = (codeBlockText) => {
  const [query, configStr] = codeBlockText.split(/\n^---$\n/gim);
  try {
    const config = obsidian.parseYaml(configStr);
    if (typeof config !== "object") throw new Error();
    return { query, config: { ...defaultDataEditBlockConfig, ...config } };
  } catch (e) {
    const msg = "invalid YAML detected in config";
    console.error(msg);
    return { query, config: defaultDataEditBlockConfig };
  }
};
const updateBlockConfig = async (key, value, dataEditInfos) => {
  const {
    config,
    ctx,
    el,
    plugin: {
      app: { vault }
    },
    query
  } = dataEditInfos;
  const queryLines = query.split("\n");
  const newConfig = { ...config, [key]: value };
  const newConfigStr = obsidian.stringifyYaml(newConfig);
  const newConfigLines = newConfigStr.split("\n");
  newConfigLines.pop();
  const { lineStart, lineEnd, text } = ctx.getSectionInfo(el);
  const lines = text.split("\n");
  const newLines = lines.toSpliced(
    // start at where the code block text starts
    lineStart + 1,
    // delete existing lines up to end of code block text
    lineEnd - lineStart - 1,
    ...queryLines,
    "---",
    ...newConfigLines
  );
  const file = vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    throw new Error("This should be impossible");
  }
  await vault.modify(file, newLines.join("\n"));
};
const setBlockConfig = async (config, dataEditInfos) => {
  const {
    ctx,
    el,
    plugin: {
      app: { vault }
    },
    query
  } = dataEditInfos;
  const queryLines = query.split("\n");
  const newConfigStr = obsidian.stringifyYaml(config);
  const newConfigLines = newConfigStr.split("\n");
  newConfigLines.pop();
  const { lineStart, lineEnd, text } = ctx.getSectionInfo(el);
  const lines = text.split("\n");
  const newLines = lines.toSpliced(
    // start at where the code block text starts
    lineStart + 1,
    // delete existing lines up to end of code block text
    lineEnd - lineStart - 1,
    ...queryLines,
    "---",
    ...newConfigLines
  );
  const file = vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    throw new Error("This should be impossible");
  }
  await vault.modify(file, newLines.join("\n"));
};
/**
* @license lucide-solid v0.412.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};
var defaultAttributes_default = defaultAttributes;
var _tmpl$$e = /* @__PURE__ */ template(`<svg>`);
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var mergeClasses = (...classes) => classes.filter((className2, index, array) => {
  return Boolean(className2) && array.indexOf(className2) === index;
}).join(" ");
var Icon = (props) => {
  const [localProps, rest] = splitProps(props, ["color", "size", "strokeWidth", "children", "class", "name", "iconNode", "absoluteStrokeWidth"]);
  return (() => {
    var _el$ = _tmpl$$e();
    spread(_el$, mergeProps(defaultAttributes_default, {
      get width() {
        return localProps.size ?? defaultAttributes_default.width;
      },
      get height() {
        return localProps.size ?? defaultAttributes_default.height;
      },
      get stroke() {
        return localProps.color ?? defaultAttributes_default.stroke;
      },
      get ["stroke-width"]() {
        return createMemo(() => !!localProps.absoluteStrokeWidth)() ? Number(localProps.strokeWidth ?? defaultAttributes_default["stroke-width"]) * 24 / Number(localProps.size) : Number(localProps.strokeWidth ?? defaultAttributes_default["stroke-width"]);
      },
      get ["class"]() {
        return mergeClasses("lucide", "lucide-icon", localProps.name != null ? `lucide-${toKebabCase(localProps == null ? void 0 : localProps.name)}` : void 0, localProps.class != null ? localProps.class : "");
      }
    }, rest), true, true);
    insert(_el$, createComponent(For, {
      get each() {
        return localProps.iconNode;
      },
      children: ([elementName, attrs]) => {
        return createComponent(Dynamic, mergeProps({
          component: elementName
        }, attrs));
      }
    }));
    return _el$;
  })();
};
var Icon_default = Icon;
var iconNode$6 = [["rect", {
  width: "18",
  height: "11",
  x: "3",
  y: "11",
  rx: "2",
  ry: "2",
  key: "1w4ew1"
}], ["path", {
  d: "M7 11V7a5 5 0 0 1 10 0v4",
  key: "fwvmzm"
}]];
var Lock = (props) => createComponent(Icon_default, mergeProps(props, {
  name: "Lock",
  iconNode: iconNode$6
}));
var lock_default = Lock;
var iconNode$5 = [["rect", {
  width: "18",
  height: "11",
  x: "3",
  y: "11",
  rx: "2",
  ry: "2",
  key: "1w4ew1"
}], ["path", {
  d: "M7 11V7a5 5 0 0 1 9.9-1",
  key: "1mm8w8"
}]];
var LockOpen = (props) => createComponent(Icon_default, mergeProps(props, {
  name: "LockOpen",
  iconNode: iconNode$5
}));
var lock_open_default = LockOpen;
var iconNode$4 = [["path", {
  d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
  key: "1qme2f"
}], ["circle", {
  cx: "12",
  cy: "12",
  r: "3",
  key: "1v7zrd"
}]];
var Settings = (props) => createComponent(Icon_default, mergeProps(props, {
  name: "Settings",
  iconNode: iconNode$4
}));
var settings_default = Settings;
var _tmpl$$d = /* @__PURE__ */ template(`<div>`);
const Markdown = (props) => {
  let ref;
  const [localProps, divProps] = splitProps(props, ["app", "markdown", "sourcePath"]);
  const md = createMemo(() => {
    const str = localProps.markdown ?? "&nbsp;";
    if (Array.isArray(str)) return str.join(", ");
    if (str === "" || typeof str === "object") return "&nbsp;";
    return str.toString();
  });
  const component = new obsidian.Component();
  createEffect(() => {
    ref.empty();
    obsidian.MarkdownRenderer.render(localProps.app, md(), ref, localProps.sourcePath, component);
  });
  return (() => {
    var _el$ = _tmpl$$d();
    use((r2) => ref = r2, _el$);
    spread(_el$, divProps, false, false);
    return _el$;
  })();
};
var _tmpl$$c = /* @__PURE__ */ template(`<input class=""type=checkbox>`);
const CheckboxInput = (props) => {
  const {
    plugin,
    config
  } = props.codeBlockInfo;
  return (() => {
    var _el$ = _tmpl$$c();
    _el$.$$click = async (e) => {
      await updateMetadataProperty(props.property, e.currentTarget.checked, props.filePath, plugin, props.value);
    };
    createRenderEffect(() => _el$.disabled = config.lockEditing);
    createRenderEffect(() => _el$.checked = !!props.value);
    return _el$;
  })();
};
delegateEvents(["click"]);
var autofocus = (element, autofocus2) => {
  if ((autofocus2 == null ? void 0 : autofocus2()) === false) {
    return;
  }
  onMount(() => {
    if (element.hasAttribute("autofocus"))
      setTimeout(() => element.focus());
  });
};
var _tmpl$$b = /* @__PURE__ */ template(`<input autofocus class="">`);
const DateDatetimeInput = (props) => {
  const {
    plugin,
    dataviewAPI: {
      luxon: {
        DateTime: DateTime2
      }
    }
  } = props.codeBlockInfo;
  const isTime = createMemo(() => {
    return checkIfDateHasTime(props.value);
  });
  return (() => {
    var _el$ = _tmpl$$b();
    _el$.addEventListener("blur", async (e) => {
      const isValid = e.target.validity;
      if (!isValid) return props.setEditing(false);
      const format = isTime() ? "yyyy-MM-dd'T'hh:mm" : "yyyy-MM-dd";
      const dt = DateTime2.fromFormat(e.target.value, format);
      const newValue = dt.toFormat(format);
      const formattedOld = props.value.toFormat(format);
      await updateMetadataProperty(props.property, newValue, props.filePath, plugin, formattedOld);
      props.setEditing(false);
    });
    use(autofocus, _el$, () => true);
    createRenderEffect(() => setAttribute(_el$, "type", isTime() ? "datetime-local" : "date"));
    createRenderEffect(() => _el$.value = isTime() ? props.value.toFormat("yyyy-MM-dd'T'hh:mm") : props.value.toFormat("yyyy-MM-dd"));
    return _el$;
  })();
};
var iconNode$3 = [["path", {
  d: "M5 12h14",
  key: "1ays0h"
}], ["path", {
  d: "M12 5v14",
  key: "s699le"
}]];
var Plus = (props) => createComponent(Icon_default, mergeProps(props, {
  name: "Plus",
  iconNode: iconNode$3
}));
var plus_default = Plus;
var _tmpl$$a = /* @__PURE__ */ template(`<input autofocus class="h-auto rounded-none border-none bg-transparent p-0 !shadow-none"type=text>`);
const TextInput = (props) => {
  var _a;
  const [size, setSize] = createSignal(((_a = props.value) == null ? void 0 : _a.toString().length) ?? 5);
  const {
    plugin
  } = props.codeBlockInfo;
  return (() => {
    var _el$ = _tmpl$$a();
    _el$.$$input = (e) => {
      setSize(e.target.value.length);
    };
    _el$.addEventListener("blur", async (e) => {
      if (props.updateProperty) {
        await props.updateProperty(e.target.value);
      } else {
        await updateMetadataProperty(props.property, e.target.value, props.filePath, plugin, props.value);
      }
      props.setEditing(false);
    });
    use(autofocus, _el$, () => true);
    createRenderEffect(() => setAttribute(_el$, "size", size()));
    createRenderEffect(() => {
      var _a2;
      return _el$.value = ((_a2 = props.value) == null ? void 0 : _a2.toString()) ?? "";
    });
    return _el$;
  })();
};
delegateEvents(["input"]);
var _tmpl$$9 = /* @__PURE__ */ template(`<ul class="m-0 flex flex-col gap-1 p-0 [&amp;>li]:list-disc"><button class="clickable-icon size-fit p-1">`), _tmpl$2$8 = /* @__PURE__ */ template(`<li class="m-0 ml-3">`);
const ListTableDataWrapper = (props) => {
  const {
    plugin,
    ctx,
    config
  } = props.codeBlockInfo;
  return (() => {
    var _el$ = _tmpl$$9(), _el$2 = _el$.firstChild;
    insert(_el$, createComponent(For, {
      get each() {
        return props.value;
      },
      children: (val, index) => createComponent(ListTableDataItem, mergeProps(props, {
        plugin,
        ctx,
        itemValue: val,
        get itemIndex() {
          return index();
        },
        config
      }))
    }), _el$2);
    _el$2.$$click = async (e) => {
      e.preventDefault();
      await updateMetadataProperty(props.property, [...props.value, ""], props.filePath, plugin, props.value);
    };
    insert(_el$2, createComponent(plus_default, {
      "class": "pointer-events-none size-3"
    }));
    createRenderEffect(() => _el$2.disabled = config.lockEditing);
    return _el$;
  })();
};
const ListTableDataItem = (props) => {
  const [isEditing, setEditing] = createSignal(false);
  return (() => {
    var _el$3 = _tmpl$2$8();
    insert(_el$3, createComponent(Show, {
      get when() {
        return createMemo(() => !!!props.config.lockEditing)() && isEditing();
      },
      get fallback() {
        return createComponent(Markdown, {
          "class": "size-full",
          get app() {
            return props.plugin.app;
          },
          get markdown() {
            return tryDataviewLinkToMarkdown(props.itemValue);
          },
          get sourcePath() {
            return props.ctx.sourcePath;
          },
          get onClick() {
            return props.config.lockEditing ? void 0 : () => setEditing(true);
          }
        });
      },
      get children() {
        return createComponent(ListInput, mergeProps(props, {
          setEditing
        }));
      }
    }));
    return _el$3;
  })();
};
const ListInput = (props) => {
  return createComponent(TextInput, mergeProps(props, {
    get value() {
      return props.itemValue;
    },
    valueType: "list",
    updateProperty: async (newVal) => {
      const value = [...props.value];
      if (!newVal && newVal !== 0) {
        const arr = value.filter((_, i) => i !== props.itemIndex);
        await updateMetadataProperty(props.property, arr, props.filePath, props.plugin, props.itemValue, props.itemIndex);
        return;
      }
      value[props.itemIndex] = newVal;
      await updateMetadataProperty(props.property, value, props.filePath, props.plugin, props.itemValue, props.itemIndex);
    }
  }));
};
delegateEvents(["click"]);
function r(e) {
  var t, f, n = "";
  if ("string" == typeof e || "number" == typeof e) n += e;
  else if ("object" == typeof e) if (Array.isArray(e)) {
    var o = e.length;
    for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
  } else for (f in e) e[f] && (n && (n += " "), n += f);
  return n;
}
function clsx() {
  for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
  return n;
}
const CLASS_PART_SEPARATOR = "-";
function createClassGroupUtils(config) {
  const classMap = createClassMap(config);
  const {
    conflictingClassGroups,
    conflictingClassGroupModifiers
  } = config;
  function getClassGroupId(className2) {
    const classParts = className2.split(CLASS_PART_SEPARATOR);
    if (classParts[0] === "" && classParts.length !== 1) {
      classParts.shift();
    }
    return getGroupRecursive(classParts, classMap) || getGroupIdForArbitraryProperty(className2);
  }
  function getConflictingClassGroupIds(classGroupId, hasPostfixModifier) {
    const conflicts = conflictingClassGroups[classGroupId] || [];
    if (hasPostfixModifier && conflictingClassGroupModifiers[classGroupId]) {
      return [...conflicts, ...conflictingClassGroupModifiers[classGroupId]];
    }
    return conflicts;
  }
  return {
    getClassGroupId,
    getConflictingClassGroupIds
  };
}
function getGroupRecursive(classParts, classPartObject) {
  var _a;
  if (classParts.length === 0) {
    return classPartObject.classGroupId;
  }
  const currentClassPart = classParts[0];
  const nextClassPartObject = classPartObject.nextPart.get(currentClassPart);
  const classGroupFromNextClassPart = nextClassPartObject ? getGroupRecursive(classParts.slice(1), nextClassPartObject) : void 0;
  if (classGroupFromNextClassPart) {
    return classGroupFromNextClassPart;
  }
  if (classPartObject.validators.length === 0) {
    return void 0;
  }
  const classRest = classParts.join(CLASS_PART_SEPARATOR);
  return (_a = classPartObject.validators.find(({
    validator
  }) => validator(classRest))) == null ? void 0 : _a.classGroupId;
}
const arbitraryPropertyRegex = /^\[(.+)\]$/;
function getGroupIdForArbitraryProperty(className2) {
  if (arbitraryPropertyRegex.test(className2)) {
    const arbitraryPropertyClassName = arbitraryPropertyRegex.exec(className2)[1];
    const property = arbitraryPropertyClassName == null ? void 0 : arbitraryPropertyClassName.substring(0, arbitraryPropertyClassName.indexOf(":"));
    if (property) {
      return "arbitrary.." + property;
    }
  }
}
function createClassMap(config) {
  const {
    theme,
    prefix
  } = config;
  const classMap = {
    nextPart: /* @__PURE__ */ new Map(),
    validators: []
  };
  const prefixedClassGroupEntries = getPrefixedClassGroupEntries(Object.entries(config.classGroups), prefix);
  prefixedClassGroupEntries.forEach(([classGroupId, classGroup]) => {
    processClassesRecursively(classGroup, classMap, classGroupId, theme);
  });
  return classMap;
}
function processClassesRecursively(classGroup, classPartObject, classGroupId, theme) {
  classGroup.forEach((classDefinition) => {
    if (typeof classDefinition === "string") {
      const classPartObjectToEdit = classDefinition === "" ? classPartObject : getPart(classPartObject, classDefinition);
      classPartObjectToEdit.classGroupId = classGroupId;
      return;
    }
    if (typeof classDefinition === "function") {
      if (isThemeGetter(classDefinition)) {
        processClassesRecursively(classDefinition(theme), classPartObject, classGroupId, theme);
        return;
      }
      classPartObject.validators.push({
        validator: classDefinition,
        classGroupId
      });
      return;
    }
    Object.entries(classDefinition).forEach(([key, classGroup2]) => {
      processClassesRecursively(classGroup2, getPart(classPartObject, key), classGroupId, theme);
    });
  });
}
function getPart(classPartObject, path) {
  let currentClassPartObject = classPartObject;
  path.split(CLASS_PART_SEPARATOR).forEach((pathPart) => {
    if (!currentClassPartObject.nextPart.has(pathPart)) {
      currentClassPartObject.nextPart.set(pathPart, {
        nextPart: /* @__PURE__ */ new Map(),
        validators: []
      });
    }
    currentClassPartObject = currentClassPartObject.nextPart.get(pathPart);
  });
  return currentClassPartObject;
}
function isThemeGetter(func) {
  return func.isThemeGetter;
}
function getPrefixedClassGroupEntries(classGroupEntries, prefix) {
  if (!prefix) {
    return classGroupEntries;
  }
  return classGroupEntries.map(([classGroupId, classGroup]) => {
    const prefixedClassGroup = classGroup.map((classDefinition) => {
      if (typeof classDefinition === "string") {
        return prefix + classDefinition;
      }
      if (typeof classDefinition === "object") {
        return Object.fromEntries(Object.entries(classDefinition).map(([key, value]) => [prefix + key, value]));
      }
      return classDefinition;
    });
    return [classGroupId, prefixedClassGroup];
  });
}
function createLruCache(maxCacheSize) {
  if (maxCacheSize < 1) {
    return {
      get: () => void 0,
      set: () => {
      }
    };
  }
  let cacheSize = 0;
  let cache = /* @__PURE__ */ new Map();
  let previousCache = /* @__PURE__ */ new Map();
  function update(key, value) {
    cache.set(key, value);
    cacheSize++;
    if (cacheSize > maxCacheSize) {
      cacheSize = 0;
      previousCache = cache;
      cache = /* @__PURE__ */ new Map();
    }
  }
  return {
    get(key) {
      let value = cache.get(key);
      if (value !== void 0) {
        return value;
      }
      if ((value = previousCache.get(key)) !== void 0) {
        update(key, value);
        return value;
      }
    },
    set(key, value) {
      if (cache.has(key)) {
        cache.set(key, value);
      } else {
        update(key, value);
      }
    }
  };
}
const IMPORTANT_MODIFIER = "!";
function createParseClassName(config) {
  const {
    separator,
    experimentalParseClassName
  } = config;
  const isSeparatorSingleCharacter = separator.length === 1;
  const firstSeparatorCharacter = separator[0];
  const separatorLength = separator.length;
  function parseClassName(className2) {
    const modifiers = [];
    let bracketDepth = 0;
    let modifierStart = 0;
    let postfixModifierPosition;
    for (let index = 0; index < className2.length; index++) {
      let currentCharacter = className2[index];
      if (bracketDepth === 0) {
        if (currentCharacter === firstSeparatorCharacter && (isSeparatorSingleCharacter || className2.slice(index, index + separatorLength) === separator)) {
          modifiers.push(className2.slice(modifierStart, index));
          modifierStart = index + separatorLength;
          continue;
        }
        if (currentCharacter === "/") {
          postfixModifierPosition = index;
          continue;
        }
      }
      if (currentCharacter === "[") {
        bracketDepth++;
      } else if (currentCharacter === "]") {
        bracketDepth--;
      }
    }
    const baseClassNameWithImportantModifier = modifiers.length === 0 ? className2 : className2.substring(modifierStart);
    const hasImportantModifier = baseClassNameWithImportantModifier.startsWith(IMPORTANT_MODIFIER);
    const baseClassName = hasImportantModifier ? baseClassNameWithImportantModifier.substring(1) : baseClassNameWithImportantModifier;
    const maybePostfixModifierPosition = postfixModifierPosition && postfixModifierPosition > modifierStart ? postfixModifierPosition - modifierStart : void 0;
    return {
      modifiers,
      hasImportantModifier,
      baseClassName,
      maybePostfixModifierPosition
    };
  }
  if (experimentalParseClassName) {
    return function parseClassNameExperimental(className2) {
      return experimentalParseClassName({
        className: className2,
        parseClassName
      });
    };
  }
  return parseClassName;
}
function sortModifiers(modifiers) {
  if (modifiers.length <= 1) {
    return modifiers;
  }
  const sortedModifiers = [];
  let unsortedModifiers = [];
  modifiers.forEach((modifier) => {
    const isArbitraryVariant = modifier[0] === "[";
    if (isArbitraryVariant) {
      sortedModifiers.push(...unsortedModifiers.sort(), modifier);
      unsortedModifiers = [];
    } else {
      unsortedModifiers.push(modifier);
    }
  });
  sortedModifiers.push(...unsortedModifiers.sort());
  return sortedModifiers;
}
function createConfigUtils(config) {
  return {
    cache: createLruCache(config.cacheSize),
    parseClassName: createParseClassName(config),
    ...createClassGroupUtils(config)
  };
}
const SPLIT_CLASSES_REGEX = /\s+/;
function mergeClassList(classList2, configUtils) {
  const {
    parseClassName,
    getClassGroupId,
    getConflictingClassGroupIds
  } = configUtils;
  const classGroupsInConflict = /* @__PURE__ */ new Set();
  return classList2.trim().split(SPLIT_CLASSES_REGEX).map((originalClassName) => {
    const {
      modifiers,
      hasImportantModifier,
      baseClassName,
      maybePostfixModifierPosition
    } = parseClassName(originalClassName);
    let hasPostfixModifier = Boolean(maybePostfixModifierPosition);
    let classGroupId = getClassGroupId(hasPostfixModifier ? baseClassName.substring(0, maybePostfixModifierPosition) : baseClassName);
    if (!classGroupId) {
      if (!hasPostfixModifier) {
        return {
          isTailwindClass: false,
          originalClassName
        };
      }
      classGroupId = getClassGroupId(baseClassName);
      if (!classGroupId) {
        return {
          isTailwindClass: false,
          originalClassName
        };
      }
      hasPostfixModifier = false;
    }
    const variantModifier = sortModifiers(modifiers).join(":");
    const modifierId = hasImportantModifier ? variantModifier + IMPORTANT_MODIFIER : variantModifier;
    return {
      isTailwindClass: true,
      modifierId,
      classGroupId,
      originalClassName,
      hasPostfixModifier
    };
  }).reverse().filter((parsed) => {
    if (!parsed.isTailwindClass) {
      return true;
    }
    const {
      modifierId,
      classGroupId,
      hasPostfixModifier
    } = parsed;
    const classId = modifierId + classGroupId;
    if (classGroupsInConflict.has(classId)) {
      return false;
    }
    classGroupsInConflict.add(classId);
    getConflictingClassGroupIds(classGroupId, hasPostfixModifier).forEach((group) => classGroupsInConflict.add(modifierId + group));
    return true;
  }).reverse().map((parsed) => parsed.originalClassName).join(" ");
}
function twJoin() {
  let index = 0;
  let argument;
  let resolvedValue;
  let string = "";
  while (index < arguments.length) {
    if (argument = arguments[index++]) {
      if (resolvedValue = toValue(argument)) {
        string && (string += " ");
        string += resolvedValue;
      }
    }
  }
  return string;
}
function toValue(mix) {
  if (typeof mix === "string") {
    return mix;
  }
  let resolvedValue;
  let string = "";
  for (let k = 0; k < mix.length; k++) {
    if (mix[k]) {
      if (resolvedValue = toValue(mix[k])) {
        string && (string += " ");
        string += resolvedValue;
      }
    }
  }
  return string;
}
function createTailwindMerge(createConfigFirst, ...createConfigRest) {
  let configUtils;
  let cacheGet;
  let cacheSet;
  let functionToCall = initTailwindMerge;
  function initTailwindMerge(classList2) {
    const config = createConfigRest.reduce((previousConfig, createConfigCurrent) => createConfigCurrent(previousConfig), createConfigFirst());
    configUtils = createConfigUtils(config);
    cacheGet = configUtils.cache.get;
    cacheSet = configUtils.cache.set;
    functionToCall = tailwindMerge;
    return tailwindMerge(classList2);
  }
  function tailwindMerge(classList2) {
    const cachedResult = cacheGet(classList2);
    if (cachedResult) {
      return cachedResult;
    }
    const result = mergeClassList(classList2, configUtils);
    cacheSet(classList2, result);
    return result;
  }
  return function callTailwindMerge() {
    return functionToCall(twJoin.apply(null, arguments));
  };
}
function fromTheme(key) {
  const themeGetter = (theme) => theme[key] || [];
  themeGetter.isThemeGetter = true;
  return themeGetter;
}
const arbitraryValueRegex = /^\[(?:([a-z-]+):)?(.+)\]$/i;
const fractionRegex = /^\d+\/\d+$/;
const stringLengths = /* @__PURE__ */ new Set(["px", "full", "screen"]);
const tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
const lengthUnitRegex = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
const colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch))\(.+\)$/;
const shadowRegex = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
const imageRegex = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
function isLength(value) {
  return isNumber(value) || stringLengths.has(value) || fractionRegex.test(value);
}
function isArbitraryLength(value) {
  return getIsArbitraryValue(value, "length", isLengthOnly);
}
function isNumber(value) {
  return Boolean(value) && !Number.isNaN(Number(value));
}
function isArbitraryNumber(value) {
  return getIsArbitraryValue(value, "number", isNumber);
}
function isInteger(value) {
  return Boolean(value) && Number.isInteger(Number(value));
}
function isPercent(value) {
  return value.endsWith("%") && isNumber(value.slice(0, -1));
}
function isArbitraryValue(value) {
  return arbitraryValueRegex.test(value);
}
function isTshirtSize(value) {
  return tshirtUnitRegex.test(value);
}
const sizeLabels = /* @__PURE__ */ new Set(["length", "size", "percentage"]);
function isArbitrarySize(value) {
  return getIsArbitraryValue(value, sizeLabels, isNever);
}
function isArbitraryPosition(value) {
  return getIsArbitraryValue(value, "position", isNever);
}
const imageLabels = /* @__PURE__ */ new Set(["image", "url"]);
function isArbitraryImage(value) {
  return getIsArbitraryValue(value, imageLabels, isImage);
}
function isArbitraryShadow(value) {
  return getIsArbitraryValue(value, "", isShadow);
}
function isAny() {
  return true;
}
function getIsArbitraryValue(value, label, testValue) {
  const result = arbitraryValueRegex.exec(value);
  if (result) {
    if (result[1]) {
      return typeof label === "string" ? result[1] === label : label.has(result[1]);
    }
    return testValue(result[2]);
  }
  return false;
}
function isLengthOnly(value) {
  return lengthUnitRegex.test(value) && !colorFunctionRegex.test(value);
}
function isNever() {
  return false;
}
function isShadow(value) {
  return shadowRegex.test(value);
}
function isImage(value) {
  return imageRegex.test(value);
}
function getDefaultConfig() {
  const colors = fromTheme("colors");
  const spacing = fromTheme("spacing");
  const blur = fromTheme("blur");
  const brightness = fromTheme("brightness");
  const borderColor = fromTheme("borderColor");
  const borderRadius = fromTheme("borderRadius");
  const borderSpacing = fromTheme("borderSpacing");
  const borderWidth = fromTheme("borderWidth");
  const contrast = fromTheme("contrast");
  const grayscale = fromTheme("grayscale");
  const hueRotate = fromTheme("hueRotate");
  const invert = fromTheme("invert");
  const gap = fromTheme("gap");
  const gradientColorStops = fromTheme("gradientColorStops");
  const gradientColorStopPositions = fromTheme("gradientColorStopPositions");
  const inset = fromTheme("inset");
  const margin = fromTheme("margin");
  const opacity = fromTheme("opacity");
  const padding = fromTheme("padding");
  const saturate = fromTheme("saturate");
  const scale = fromTheme("scale");
  const sepia = fromTheme("sepia");
  const skew = fromTheme("skew");
  const space = fromTheme("space");
  const translate = fromTheme("translate");
  const getOverscroll = () => ["auto", "contain", "none"];
  const getOverflow = () => ["auto", "hidden", "clip", "visible", "scroll"];
  const getSpacingWithAutoAndArbitrary = () => ["auto", isArbitraryValue, spacing];
  const getSpacingWithArbitrary = () => [isArbitraryValue, spacing];
  const getLengthWithEmptyAndArbitrary = () => ["", isLength, isArbitraryLength];
  const getNumberWithAutoAndArbitrary = () => ["auto", isNumber, isArbitraryValue];
  const getPositions = () => ["bottom", "center", "left", "left-bottom", "left-top", "right", "right-bottom", "right-top", "top"];
  const getLineStyles = () => ["solid", "dashed", "dotted", "double", "none"];
  const getBlendModes = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
  const getAlign = () => ["start", "end", "center", "between", "around", "evenly", "stretch"];
  const getZeroAndEmpty = () => ["", "0", isArbitraryValue];
  const getBreaks = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"];
  const getNumber = () => [isNumber, isArbitraryNumber];
  const getNumberAndArbitrary = () => [isNumber, isArbitraryValue];
  return {
    cacheSize: 500,
    separator: ":",
    theme: {
      colors: [isAny],
      spacing: [isLength, isArbitraryLength],
      blur: ["none", "", isTshirtSize, isArbitraryValue],
      brightness: getNumber(),
      borderColor: [colors],
      borderRadius: ["none", "", "full", isTshirtSize, isArbitraryValue],
      borderSpacing: getSpacingWithArbitrary(),
      borderWidth: getLengthWithEmptyAndArbitrary(),
      contrast: getNumber(),
      grayscale: getZeroAndEmpty(),
      hueRotate: getNumberAndArbitrary(),
      invert: getZeroAndEmpty(),
      gap: getSpacingWithArbitrary(),
      gradientColorStops: [colors],
      gradientColorStopPositions: [isPercent, isArbitraryLength],
      inset: getSpacingWithAutoAndArbitrary(),
      margin: getSpacingWithAutoAndArbitrary(),
      opacity: getNumber(),
      padding: getSpacingWithArbitrary(),
      saturate: getNumber(),
      scale: getNumber(),
      sepia: getZeroAndEmpty(),
      skew: getNumberAndArbitrary(),
      space: getSpacingWithArbitrary(),
      translate: getSpacingWithArbitrary()
    },
    classGroups: {
      // Layout
      /**
       * Aspect Ratio
       * @see https://tailwindcss.com/docs/aspect-ratio
       */
      aspect: [{
        aspect: ["auto", "square", "video", isArbitraryValue]
      }],
      /**
       * Container
       * @see https://tailwindcss.com/docs/container
       */
      container: ["container"],
      /**
       * Columns
       * @see https://tailwindcss.com/docs/columns
       */
      columns: [{
        columns: [isTshirtSize]
      }],
      /**
       * Break After
       * @see https://tailwindcss.com/docs/break-after
       */
      "break-after": [{
        "break-after": getBreaks()
      }],
      /**
       * Break Before
       * @see https://tailwindcss.com/docs/break-before
       */
      "break-before": [{
        "break-before": getBreaks()
      }],
      /**
       * Break Inside
       * @see https://tailwindcss.com/docs/break-inside
       */
      "break-inside": [{
        "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"]
      }],
      /**
       * Box Decoration Break
       * @see https://tailwindcss.com/docs/box-decoration-break
       */
      "box-decoration": [{
        "box-decoration": ["slice", "clone"]
      }],
      /**
       * Box Sizing
       * @see https://tailwindcss.com/docs/box-sizing
       */
      box: [{
        box: ["border", "content"]
      }],
      /**
       * Display
       * @see https://tailwindcss.com/docs/display
       */
      display: ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"],
      /**
       * Floats
       * @see https://tailwindcss.com/docs/float
       */
      float: [{
        float: ["right", "left", "none", "start", "end"]
      }],
      /**
       * Clear
       * @see https://tailwindcss.com/docs/clear
       */
      clear: [{
        clear: ["left", "right", "both", "none", "start", "end"]
      }],
      /**
       * Isolation
       * @see https://tailwindcss.com/docs/isolation
       */
      isolation: ["isolate", "isolation-auto"],
      /**
       * Object Fit
       * @see https://tailwindcss.com/docs/object-fit
       */
      "object-fit": [{
        object: ["contain", "cover", "fill", "none", "scale-down"]
      }],
      /**
       * Object Position
       * @see https://tailwindcss.com/docs/object-position
       */
      "object-position": [{
        object: [...getPositions(), isArbitraryValue]
      }],
      /**
       * Overflow
       * @see https://tailwindcss.com/docs/overflow
       */
      overflow: [{
        overflow: getOverflow()
      }],
      /**
       * Overflow X
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-x": [{
        "overflow-x": getOverflow()
      }],
      /**
       * Overflow Y
       * @see https://tailwindcss.com/docs/overflow
       */
      "overflow-y": [{
        "overflow-y": getOverflow()
      }],
      /**
       * Overscroll Behavior
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      overscroll: [{
        overscroll: getOverscroll()
      }],
      /**
       * Overscroll Behavior X
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-x": [{
        "overscroll-x": getOverscroll()
      }],
      /**
       * Overscroll Behavior Y
       * @see https://tailwindcss.com/docs/overscroll-behavior
       */
      "overscroll-y": [{
        "overscroll-y": getOverscroll()
      }],
      /**
       * Position
       * @see https://tailwindcss.com/docs/position
       */
      position: ["static", "fixed", "absolute", "relative", "sticky"],
      /**
       * Top / Right / Bottom / Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      inset: [{
        inset: [inset]
      }],
      /**
       * Right / Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-x": [{
        "inset-x": [inset]
      }],
      /**
       * Top / Bottom
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      "inset-y": [{
        "inset-y": [inset]
      }],
      /**
       * Start
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      start: [{
        start: [inset]
      }],
      /**
       * End
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      end: [{
        end: [inset]
      }],
      /**
       * Top
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      top: [{
        top: [inset]
      }],
      /**
       * Right
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      right: [{
        right: [inset]
      }],
      /**
       * Bottom
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      bottom: [{
        bottom: [inset]
      }],
      /**
       * Left
       * @see https://tailwindcss.com/docs/top-right-bottom-left
       */
      left: [{
        left: [inset]
      }],
      /**
       * Visibility
       * @see https://tailwindcss.com/docs/visibility
       */
      visibility: ["visible", "invisible", "collapse"],
      /**
       * Z-Index
       * @see https://tailwindcss.com/docs/z-index
       */
      z: [{
        z: ["auto", isInteger, isArbitraryValue]
      }],
      // Flexbox and Grid
      /**
       * Flex Basis
       * @see https://tailwindcss.com/docs/flex-basis
       */
      basis: [{
        basis: getSpacingWithAutoAndArbitrary()
      }],
      /**
       * Flex Direction
       * @see https://tailwindcss.com/docs/flex-direction
       */
      "flex-direction": [{
        flex: ["row", "row-reverse", "col", "col-reverse"]
      }],
      /**
       * Flex Wrap
       * @see https://tailwindcss.com/docs/flex-wrap
       */
      "flex-wrap": [{
        flex: ["wrap", "wrap-reverse", "nowrap"]
      }],
      /**
       * Flex
       * @see https://tailwindcss.com/docs/flex
       */
      flex: [{
        flex: ["1", "auto", "initial", "none", isArbitraryValue]
      }],
      /**
       * Flex Grow
       * @see https://tailwindcss.com/docs/flex-grow
       */
      grow: [{
        grow: getZeroAndEmpty()
      }],
      /**
       * Flex Shrink
       * @see https://tailwindcss.com/docs/flex-shrink
       */
      shrink: [{
        shrink: getZeroAndEmpty()
      }],
      /**
       * Order
       * @see https://tailwindcss.com/docs/order
       */
      order: [{
        order: ["first", "last", "none", isInteger, isArbitraryValue]
      }],
      /**
       * Grid Template Columns
       * @see https://tailwindcss.com/docs/grid-template-columns
       */
      "grid-cols": [{
        "grid-cols": [isAny]
      }],
      /**
       * Grid Column Start / End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start-end": [{
        col: ["auto", {
          span: ["full", isInteger, isArbitraryValue]
        }, isArbitraryValue]
      }],
      /**
       * Grid Column Start
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-start": [{
        "col-start": getNumberWithAutoAndArbitrary()
      }],
      /**
       * Grid Column End
       * @see https://tailwindcss.com/docs/grid-column
       */
      "col-end": [{
        "col-end": getNumberWithAutoAndArbitrary()
      }],
      /**
       * Grid Template Rows
       * @see https://tailwindcss.com/docs/grid-template-rows
       */
      "grid-rows": [{
        "grid-rows": [isAny]
      }],
      /**
       * Grid Row Start / End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start-end": [{
        row: ["auto", {
          span: [isInteger, isArbitraryValue]
        }, isArbitraryValue]
      }],
      /**
       * Grid Row Start
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-start": [{
        "row-start": getNumberWithAutoAndArbitrary()
      }],
      /**
       * Grid Row End
       * @see https://tailwindcss.com/docs/grid-row
       */
      "row-end": [{
        "row-end": getNumberWithAutoAndArbitrary()
      }],
      /**
       * Grid Auto Flow
       * @see https://tailwindcss.com/docs/grid-auto-flow
       */
      "grid-flow": [{
        "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"]
      }],
      /**
       * Grid Auto Columns
       * @see https://tailwindcss.com/docs/grid-auto-columns
       */
      "auto-cols": [{
        "auto-cols": ["auto", "min", "max", "fr", isArbitraryValue]
      }],
      /**
       * Grid Auto Rows
       * @see https://tailwindcss.com/docs/grid-auto-rows
       */
      "auto-rows": [{
        "auto-rows": ["auto", "min", "max", "fr", isArbitraryValue]
      }],
      /**
       * Gap
       * @see https://tailwindcss.com/docs/gap
       */
      gap: [{
        gap: [gap]
      }],
      /**
       * Gap X
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-x": [{
        "gap-x": [gap]
      }],
      /**
       * Gap Y
       * @see https://tailwindcss.com/docs/gap
       */
      "gap-y": [{
        "gap-y": [gap]
      }],
      /**
       * Justify Content
       * @see https://tailwindcss.com/docs/justify-content
       */
      "justify-content": [{
        justify: ["normal", ...getAlign()]
      }],
      /**
       * Justify Items
       * @see https://tailwindcss.com/docs/justify-items
       */
      "justify-items": [{
        "justify-items": ["start", "end", "center", "stretch"]
      }],
      /**
       * Justify Self
       * @see https://tailwindcss.com/docs/justify-self
       */
      "justify-self": [{
        "justify-self": ["auto", "start", "end", "center", "stretch"]
      }],
      /**
       * Align Content
       * @see https://tailwindcss.com/docs/align-content
       */
      "align-content": [{
        content: ["normal", ...getAlign(), "baseline"]
      }],
      /**
       * Align Items
       * @see https://tailwindcss.com/docs/align-items
       */
      "align-items": [{
        items: ["start", "end", "center", "baseline", "stretch"]
      }],
      /**
       * Align Self
       * @see https://tailwindcss.com/docs/align-self
       */
      "align-self": [{
        self: ["auto", "start", "end", "center", "stretch", "baseline"]
      }],
      /**
       * Place Content
       * @see https://tailwindcss.com/docs/place-content
       */
      "place-content": [{
        "place-content": [...getAlign(), "baseline"]
      }],
      /**
       * Place Items
       * @see https://tailwindcss.com/docs/place-items
       */
      "place-items": [{
        "place-items": ["start", "end", "center", "baseline", "stretch"]
      }],
      /**
       * Place Self
       * @see https://tailwindcss.com/docs/place-self
       */
      "place-self": [{
        "place-self": ["auto", "start", "end", "center", "stretch"]
      }],
      // Spacing
      /**
       * Padding
       * @see https://tailwindcss.com/docs/padding
       */
      p: [{
        p: [padding]
      }],
      /**
       * Padding X
       * @see https://tailwindcss.com/docs/padding
       */
      px: [{
        px: [padding]
      }],
      /**
       * Padding Y
       * @see https://tailwindcss.com/docs/padding
       */
      py: [{
        py: [padding]
      }],
      /**
       * Padding Start
       * @see https://tailwindcss.com/docs/padding
       */
      ps: [{
        ps: [padding]
      }],
      /**
       * Padding End
       * @see https://tailwindcss.com/docs/padding
       */
      pe: [{
        pe: [padding]
      }],
      /**
       * Padding Top
       * @see https://tailwindcss.com/docs/padding
       */
      pt: [{
        pt: [padding]
      }],
      /**
       * Padding Right
       * @see https://tailwindcss.com/docs/padding
       */
      pr: [{
        pr: [padding]
      }],
      /**
       * Padding Bottom
       * @see https://tailwindcss.com/docs/padding
       */
      pb: [{
        pb: [padding]
      }],
      /**
       * Padding Left
       * @see https://tailwindcss.com/docs/padding
       */
      pl: [{
        pl: [padding]
      }],
      /**
       * Margin
       * @see https://tailwindcss.com/docs/margin
       */
      m: [{
        m: [margin]
      }],
      /**
       * Margin X
       * @see https://tailwindcss.com/docs/margin
       */
      mx: [{
        mx: [margin]
      }],
      /**
       * Margin Y
       * @see https://tailwindcss.com/docs/margin
       */
      my: [{
        my: [margin]
      }],
      /**
       * Margin Start
       * @see https://tailwindcss.com/docs/margin
       */
      ms: [{
        ms: [margin]
      }],
      /**
       * Margin End
       * @see https://tailwindcss.com/docs/margin
       */
      me: [{
        me: [margin]
      }],
      /**
       * Margin Top
       * @see https://tailwindcss.com/docs/margin
       */
      mt: [{
        mt: [margin]
      }],
      /**
       * Margin Right
       * @see https://tailwindcss.com/docs/margin
       */
      mr: [{
        mr: [margin]
      }],
      /**
       * Margin Bottom
       * @see https://tailwindcss.com/docs/margin
       */
      mb: [{
        mb: [margin]
      }],
      /**
       * Margin Left
       * @see https://tailwindcss.com/docs/margin
       */
      ml: [{
        ml: [margin]
      }],
      /**
       * Space Between X
       * @see https://tailwindcss.com/docs/space
       */
      "space-x": [{
        "space-x": [space]
      }],
      /**
       * Space Between X Reverse
       * @see https://tailwindcss.com/docs/space
       */
      "space-x-reverse": ["space-x-reverse"],
      /**
       * Space Between Y
       * @see https://tailwindcss.com/docs/space
       */
      "space-y": [{
        "space-y": [space]
      }],
      /**
       * Space Between Y Reverse
       * @see https://tailwindcss.com/docs/space
       */
      "space-y-reverse": ["space-y-reverse"],
      // Sizing
      /**
       * Width
       * @see https://tailwindcss.com/docs/width
       */
      w: [{
        w: ["auto", "min", "max", "fit", "svw", "lvw", "dvw", isArbitraryValue, spacing]
      }],
      /**
       * Min-Width
       * @see https://tailwindcss.com/docs/min-width
       */
      "min-w": [{
        "min-w": [isArbitraryValue, spacing, "min", "max", "fit"]
      }],
      /**
       * Max-Width
       * @see https://tailwindcss.com/docs/max-width
       */
      "max-w": [{
        "max-w": [isArbitraryValue, spacing, "none", "full", "min", "max", "fit", "prose", {
          screen: [isTshirtSize]
        }, isTshirtSize]
      }],
      /**
       * Height
       * @see https://tailwindcss.com/docs/height
       */
      h: [{
        h: [isArbitraryValue, spacing, "auto", "min", "max", "fit", "svh", "lvh", "dvh"]
      }],
      /**
       * Min-Height
       * @see https://tailwindcss.com/docs/min-height
       */
      "min-h": [{
        "min-h": [isArbitraryValue, spacing, "min", "max", "fit", "svh", "lvh", "dvh"]
      }],
      /**
       * Max-Height
       * @see https://tailwindcss.com/docs/max-height
       */
      "max-h": [{
        "max-h": [isArbitraryValue, spacing, "min", "max", "fit", "svh", "lvh", "dvh"]
      }],
      /**
       * Size
       * @see https://tailwindcss.com/docs/size
       */
      size: [{
        size: [isArbitraryValue, spacing, "auto", "min", "max", "fit"]
      }],
      // Typography
      /**
       * Font Size
       * @see https://tailwindcss.com/docs/font-size
       */
      "font-size": [{
        text: ["base", isTshirtSize, isArbitraryLength]
      }],
      /**
       * Font Smoothing
       * @see https://tailwindcss.com/docs/font-smoothing
       */
      "font-smoothing": ["antialiased", "subpixel-antialiased"],
      /**
       * Font Style
       * @see https://tailwindcss.com/docs/font-style
       */
      "font-style": ["italic", "not-italic"],
      /**
       * Font Weight
       * @see https://tailwindcss.com/docs/font-weight
       */
      "font-weight": [{
        font: ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black", isArbitraryNumber]
      }],
      /**
       * Font Family
       * @see https://tailwindcss.com/docs/font-family
       */
      "font-family": [{
        font: [isAny]
      }],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-normal": ["normal-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-ordinal": ["ordinal"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-slashed-zero": ["slashed-zero"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-figure": ["lining-nums", "oldstyle-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-spacing": ["proportional-nums", "tabular-nums"],
      /**
       * Font Variant Numeric
       * @see https://tailwindcss.com/docs/font-variant-numeric
       */
      "fvn-fraction": ["diagonal-fractions", "stacked-fractons"],
      /**
       * Letter Spacing
       * @see https://tailwindcss.com/docs/letter-spacing
       */
      tracking: [{
        tracking: ["tighter", "tight", "normal", "wide", "wider", "widest", isArbitraryValue]
      }],
      /**
       * Line Clamp
       * @see https://tailwindcss.com/docs/line-clamp
       */
      "line-clamp": [{
        "line-clamp": ["none", isNumber, isArbitraryNumber]
      }],
      /**
       * Line Height
       * @see https://tailwindcss.com/docs/line-height
       */
      leading: [{
        leading: ["none", "tight", "snug", "normal", "relaxed", "loose", isLength, isArbitraryValue]
      }],
      /**
       * List Style Image
       * @see https://tailwindcss.com/docs/list-style-image
       */
      "list-image": [{
        "list-image": ["none", isArbitraryValue]
      }],
      /**
       * List Style Type
       * @see https://tailwindcss.com/docs/list-style-type
       */
      "list-style-type": [{
        list: ["none", "disc", "decimal", isArbitraryValue]
      }],
      /**
       * List Style Position
       * @see https://tailwindcss.com/docs/list-style-position
       */
      "list-style-position": [{
        list: ["inside", "outside"]
      }],
      /**
       * Placeholder Color
       * @deprecated since Tailwind CSS v3.0.0
       * @see https://tailwindcss.com/docs/placeholder-color
       */
      "placeholder-color": [{
        placeholder: [colors]
      }],
      /**
       * Placeholder Opacity
       * @see https://tailwindcss.com/docs/placeholder-opacity
       */
      "placeholder-opacity": [{
        "placeholder-opacity": [opacity]
      }],
      /**
       * Text Alignment
       * @see https://tailwindcss.com/docs/text-align
       */
      "text-alignment": [{
        text: ["left", "center", "right", "justify", "start", "end"]
      }],
      /**
       * Text Color
       * @see https://tailwindcss.com/docs/text-color
       */
      "text-color": [{
        text: [colors]
      }],
      /**
       * Text Opacity
       * @see https://tailwindcss.com/docs/text-opacity
       */
      "text-opacity": [{
        "text-opacity": [opacity]
      }],
      /**
       * Text Decoration
       * @see https://tailwindcss.com/docs/text-decoration
       */
      "text-decoration": ["underline", "overline", "line-through", "no-underline"],
      /**
       * Text Decoration Style
       * @see https://tailwindcss.com/docs/text-decoration-style
       */
      "text-decoration-style": [{
        decoration: [...getLineStyles(), "wavy"]
      }],
      /**
       * Text Decoration Thickness
       * @see https://tailwindcss.com/docs/text-decoration-thickness
       */
      "text-decoration-thickness": [{
        decoration: ["auto", "from-font", isLength, isArbitraryLength]
      }],
      /**
       * Text Underline Offset
       * @see https://tailwindcss.com/docs/text-underline-offset
       */
      "underline-offset": [{
        "underline-offset": ["auto", isLength, isArbitraryValue]
      }],
      /**
       * Text Decoration Color
       * @see https://tailwindcss.com/docs/text-decoration-color
       */
      "text-decoration-color": [{
        decoration: [colors]
      }],
      /**
       * Text Transform
       * @see https://tailwindcss.com/docs/text-transform
       */
      "text-transform": ["uppercase", "lowercase", "capitalize", "normal-case"],
      /**
       * Text Overflow
       * @see https://tailwindcss.com/docs/text-overflow
       */
      "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
      /**
       * Text Wrap
       * @see https://tailwindcss.com/docs/text-wrap
       */
      "text-wrap": [{
        text: ["wrap", "nowrap", "balance", "pretty"]
      }],
      /**
       * Text Indent
       * @see https://tailwindcss.com/docs/text-indent
       */
      indent: [{
        indent: getSpacingWithArbitrary()
      }],
      /**
       * Vertical Alignment
       * @see https://tailwindcss.com/docs/vertical-align
       */
      "vertical-align": [{
        align: ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", isArbitraryValue]
      }],
      /**
       * Whitespace
       * @see https://tailwindcss.com/docs/whitespace
       */
      whitespace: [{
        whitespace: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"]
      }],
      /**
       * Word Break
       * @see https://tailwindcss.com/docs/word-break
       */
      break: [{
        break: ["normal", "words", "all", "keep"]
      }],
      /**
       * Hyphens
       * @see https://tailwindcss.com/docs/hyphens
       */
      hyphens: [{
        hyphens: ["none", "manual", "auto"]
      }],
      /**
       * Content
       * @see https://tailwindcss.com/docs/content
       */
      content: [{
        content: ["none", isArbitraryValue]
      }],
      // Backgrounds
      /**
       * Background Attachment
       * @see https://tailwindcss.com/docs/background-attachment
       */
      "bg-attachment": [{
        bg: ["fixed", "local", "scroll"]
      }],
      /**
       * Background Clip
       * @see https://tailwindcss.com/docs/background-clip
       */
      "bg-clip": [{
        "bg-clip": ["border", "padding", "content", "text"]
      }],
      /**
       * Background Opacity
       * @deprecated since Tailwind CSS v3.0.0
       * @see https://tailwindcss.com/docs/background-opacity
       */
      "bg-opacity": [{
        "bg-opacity": [opacity]
      }],
      /**
       * Background Origin
       * @see https://tailwindcss.com/docs/background-origin
       */
      "bg-origin": [{
        "bg-origin": ["border", "padding", "content"]
      }],
      /**
       * Background Position
       * @see https://tailwindcss.com/docs/background-position
       */
      "bg-position": [{
        bg: [...getPositions(), isArbitraryPosition]
      }],
      /**
       * Background Repeat
       * @see https://tailwindcss.com/docs/background-repeat
       */
      "bg-repeat": [{
        bg: ["no-repeat", {
          repeat: ["", "x", "y", "round", "space"]
        }]
      }],
      /**
       * Background Size
       * @see https://tailwindcss.com/docs/background-size
       */
      "bg-size": [{
        bg: ["auto", "cover", "contain", isArbitrarySize]
      }],
      /**
       * Background Image
       * @see https://tailwindcss.com/docs/background-image
       */
      "bg-image": [{
        bg: ["none", {
          "gradient-to": ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
        }, isArbitraryImage]
      }],
      /**
       * Background Color
       * @see https://tailwindcss.com/docs/background-color
       */
      "bg-color": [{
        bg: [colors]
      }],
      /**
       * Gradient Color Stops From Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-from-pos": [{
        from: [gradientColorStopPositions]
      }],
      /**
       * Gradient Color Stops Via Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via-pos": [{
        via: [gradientColorStopPositions]
      }],
      /**
       * Gradient Color Stops To Position
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to-pos": [{
        to: [gradientColorStopPositions]
      }],
      /**
       * Gradient Color Stops From
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-from": [{
        from: [gradientColorStops]
      }],
      /**
       * Gradient Color Stops Via
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-via": [{
        via: [gradientColorStops]
      }],
      /**
       * Gradient Color Stops To
       * @see https://tailwindcss.com/docs/gradient-color-stops
       */
      "gradient-to": [{
        to: [gradientColorStops]
      }],
      // Borders
      /**
       * Border Radius
       * @see https://tailwindcss.com/docs/border-radius
       */
      rounded: [{
        rounded: [borderRadius]
      }],
      /**
       * Border Radius Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-s": [{
        "rounded-s": [borderRadius]
      }],
      /**
       * Border Radius End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-e": [{
        "rounded-e": [borderRadius]
      }],
      /**
       * Border Radius Top
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-t": [{
        "rounded-t": [borderRadius]
      }],
      /**
       * Border Radius Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-r": [{
        "rounded-r": [borderRadius]
      }],
      /**
       * Border Radius Bottom
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-b": [{
        "rounded-b": [borderRadius]
      }],
      /**
       * Border Radius Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-l": [{
        "rounded-l": [borderRadius]
      }],
      /**
       * Border Radius Start Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ss": [{
        "rounded-ss": [borderRadius]
      }],
      /**
       * Border Radius Start End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-se": [{
        "rounded-se": [borderRadius]
      }],
      /**
       * Border Radius End End
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-ee": [{
        "rounded-ee": [borderRadius]
      }],
      /**
       * Border Radius End Start
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-es": [{
        "rounded-es": [borderRadius]
      }],
      /**
       * Border Radius Top Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tl": [{
        "rounded-tl": [borderRadius]
      }],
      /**
       * Border Radius Top Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-tr": [{
        "rounded-tr": [borderRadius]
      }],
      /**
       * Border Radius Bottom Right
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-br": [{
        "rounded-br": [borderRadius]
      }],
      /**
       * Border Radius Bottom Left
       * @see https://tailwindcss.com/docs/border-radius
       */
      "rounded-bl": [{
        "rounded-bl": [borderRadius]
      }],
      /**
       * Border Width
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w": [{
        border: [borderWidth]
      }],
      /**
       * Border Width X
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-x": [{
        "border-x": [borderWidth]
      }],
      /**
       * Border Width Y
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-y": [{
        "border-y": [borderWidth]
      }],
      /**
       * Border Width Start
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-s": [{
        "border-s": [borderWidth]
      }],
      /**
       * Border Width End
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-e": [{
        "border-e": [borderWidth]
      }],
      /**
       * Border Width Top
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-t": [{
        "border-t": [borderWidth]
      }],
      /**
       * Border Width Right
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-r": [{
        "border-r": [borderWidth]
      }],
      /**
       * Border Width Bottom
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-b": [{
        "border-b": [borderWidth]
      }],
      /**
       * Border Width Left
       * @see https://tailwindcss.com/docs/border-width
       */
      "border-w-l": [{
        "border-l": [borderWidth]
      }],
      /**
       * Border Opacity
       * @see https://tailwindcss.com/docs/border-opacity
       */
      "border-opacity": [{
        "border-opacity": [opacity]
      }],
      /**
       * Border Style
       * @see https://tailwindcss.com/docs/border-style
       */
      "border-style": [{
        border: [...getLineStyles(), "hidden"]
      }],
      /**
       * Divide Width X
       * @see https://tailwindcss.com/docs/divide-width
       */
      "divide-x": [{
        "divide-x": [borderWidth]
      }],
      /**
       * Divide Width X Reverse
       * @see https://tailwindcss.com/docs/divide-width
       */
      "divide-x-reverse": ["divide-x-reverse"],
      /**
       * Divide Width Y
       * @see https://tailwindcss.com/docs/divide-width
       */
      "divide-y": [{
        "divide-y": [borderWidth]
      }],
      /**
       * Divide Width Y Reverse
       * @see https://tailwindcss.com/docs/divide-width
       */
      "divide-y-reverse": ["divide-y-reverse"],
      /**
       * Divide Opacity
       * @see https://tailwindcss.com/docs/divide-opacity
       */
      "divide-opacity": [{
        "divide-opacity": [opacity]
      }],
      /**
       * Divide Style
       * @see https://tailwindcss.com/docs/divide-style
       */
      "divide-style": [{
        divide: getLineStyles()
      }],
      /**
       * Border Color
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color": [{
        border: [borderColor]
      }],
      /**
       * Border Color X
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-x": [{
        "border-x": [borderColor]
      }],
      /**
       * Border Color Y
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-y": [{
        "border-y": [borderColor]
      }],
      /**
       * Border Color Top
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-t": [{
        "border-t": [borderColor]
      }],
      /**
       * Border Color Right
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-r": [{
        "border-r": [borderColor]
      }],
      /**
       * Border Color Bottom
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-b": [{
        "border-b": [borderColor]
      }],
      /**
       * Border Color Left
       * @see https://tailwindcss.com/docs/border-color
       */
      "border-color-l": [{
        "border-l": [borderColor]
      }],
      /**
       * Divide Color
       * @see https://tailwindcss.com/docs/divide-color
       */
      "divide-color": [{
        divide: [borderColor]
      }],
      /**
       * Outline Style
       * @see https://tailwindcss.com/docs/outline-style
       */
      "outline-style": [{
        outline: ["", ...getLineStyles()]
      }],
      /**
       * Outline Offset
       * @see https://tailwindcss.com/docs/outline-offset
       */
      "outline-offset": [{
        "outline-offset": [isLength, isArbitraryValue]
      }],
      /**
       * Outline Width
       * @see https://tailwindcss.com/docs/outline-width
       */
      "outline-w": [{
        outline: [isLength, isArbitraryLength]
      }],
      /**
       * Outline Color
       * @see https://tailwindcss.com/docs/outline-color
       */
      "outline-color": [{
        outline: [colors]
      }],
      /**
       * Ring Width
       * @see https://tailwindcss.com/docs/ring-width
       */
      "ring-w": [{
        ring: getLengthWithEmptyAndArbitrary()
      }],
      /**
       * Ring Width Inset
       * @see https://tailwindcss.com/docs/ring-width
       */
      "ring-w-inset": ["ring-inset"],
      /**
       * Ring Color
       * @see https://tailwindcss.com/docs/ring-color
       */
      "ring-color": [{
        ring: [colors]
      }],
      /**
       * Ring Opacity
       * @see https://tailwindcss.com/docs/ring-opacity
       */
      "ring-opacity": [{
        "ring-opacity": [opacity]
      }],
      /**
       * Ring Offset Width
       * @see https://tailwindcss.com/docs/ring-offset-width
       */
      "ring-offset-w": [{
        "ring-offset": [isLength, isArbitraryLength]
      }],
      /**
       * Ring Offset Color
       * @see https://tailwindcss.com/docs/ring-offset-color
       */
      "ring-offset-color": [{
        "ring-offset": [colors]
      }],
      // Effects
      /**
       * Box Shadow
       * @see https://tailwindcss.com/docs/box-shadow
       */
      shadow: [{
        shadow: ["", "inner", "none", isTshirtSize, isArbitraryShadow]
      }],
      /**
       * Box Shadow Color
       * @see https://tailwindcss.com/docs/box-shadow-color
       */
      "shadow-color": [{
        shadow: [isAny]
      }],
      /**
       * Opacity
       * @see https://tailwindcss.com/docs/opacity
       */
      opacity: [{
        opacity: [opacity]
      }],
      /**
       * Mix Blend Mode
       * @see https://tailwindcss.com/docs/mix-blend-mode
       */
      "mix-blend": [{
        "mix-blend": [...getBlendModes(), "plus-lighter", "plus-darker"]
      }],
      /**
       * Background Blend Mode
       * @see https://tailwindcss.com/docs/background-blend-mode
       */
      "bg-blend": [{
        "bg-blend": getBlendModes()
      }],
      // Filters
      /**
       * Filter
       * @deprecated since Tailwind CSS v3.0.0
       * @see https://tailwindcss.com/docs/filter
       */
      filter: [{
        filter: ["", "none"]
      }],
      /**
       * Blur
       * @see https://tailwindcss.com/docs/blur
       */
      blur: [{
        blur: [blur]
      }],
      /**
       * Brightness
       * @see https://tailwindcss.com/docs/brightness
       */
      brightness: [{
        brightness: [brightness]
      }],
      /**
       * Contrast
       * @see https://tailwindcss.com/docs/contrast
       */
      contrast: [{
        contrast: [contrast]
      }],
      /**
       * Drop Shadow
       * @see https://tailwindcss.com/docs/drop-shadow
       */
      "drop-shadow": [{
        "drop-shadow": ["", "none", isTshirtSize, isArbitraryValue]
      }],
      /**
       * Grayscale
       * @see https://tailwindcss.com/docs/grayscale
       */
      grayscale: [{
        grayscale: [grayscale]
      }],
      /**
       * Hue Rotate
       * @see https://tailwindcss.com/docs/hue-rotate
       */
      "hue-rotate": [{
        "hue-rotate": [hueRotate]
      }],
      /**
       * Invert
       * @see https://tailwindcss.com/docs/invert
       */
      invert: [{
        invert: [invert]
      }],
      /**
       * Saturate
       * @see https://tailwindcss.com/docs/saturate
       */
      saturate: [{
        saturate: [saturate]
      }],
      /**
       * Sepia
       * @see https://tailwindcss.com/docs/sepia
       */
      sepia: [{
        sepia: [sepia]
      }],
      /**
       * Backdrop Filter
       * @deprecated since Tailwind CSS v3.0.0
       * @see https://tailwindcss.com/docs/backdrop-filter
       */
      "backdrop-filter": [{
        "backdrop-filter": ["", "none"]
      }],
      /**
       * Backdrop Blur
       * @see https://tailwindcss.com/docs/backdrop-blur
       */
      "backdrop-blur": [{
        "backdrop-blur": [blur]
      }],
      /**
       * Backdrop Brightness
       * @see https://tailwindcss.com/docs/backdrop-brightness
       */
      "backdrop-brightness": [{
        "backdrop-brightness": [brightness]
      }],
      /**
       * Backdrop Contrast
       * @see https://tailwindcss.com/docs/backdrop-contrast
       */
      "backdrop-contrast": [{
        "backdrop-contrast": [contrast]
      }],
      /**
       * Backdrop Grayscale
       * @see https://tailwindcss.com/docs/backdrop-grayscale
       */
      "backdrop-grayscale": [{
        "backdrop-grayscale": [grayscale]
      }],
      /**
       * Backdrop Hue Rotate
       * @see https://tailwindcss.com/docs/backdrop-hue-rotate
       */
      "backdrop-hue-rotate": [{
        "backdrop-hue-rotate": [hueRotate]
      }],
      /**
       * Backdrop Invert
       * @see https://tailwindcss.com/docs/backdrop-invert
       */
      "backdrop-invert": [{
        "backdrop-invert": [invert]
      }],
      /**
       * Backdrop Opacity
       * @see https://tailwindcss.com/docs/backdrop-opacity
       */
      "backdrop-opacity": [{
        "backdrop-opacity": [opacity]
      }],
      /**
       * Backdrop Saturate
       * @see https://tailwindcss.com/docs/backdrop-saturate
       */
      "backdrop-saturate": [{
        "backdrop-saturate": [saturate]
      }],
      /**
       * Backdrop Sepia
       * @see https://tailwindcss.com/docs/backdrop-sepia
       */
      "backdrop-sepia": [{
        "backdrop-sepia": [sepia]
      }],
      // Tables
      /**
       * Border Collapse
       * @see https://tailwindcss.com/docs/border-collapse
       */
      "border-collapse": [{
        border: ["collapse", "separate"]
      }],
      /**
       * Border Spacing
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing": [{
        "border-spacing": [borderSpacing]
      }],
      /**
       * Border Spacing X
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-x": [{
        "border-spacing-x": [borderSpacing]
      }],
      /**
       * Border Spacing Y
       * @see https://tailwindcss.com/docs/border-spacing
       */
      "border-spacing-y": [{
        "border-spacing-y": [borderSpacing]
      }],
      /**
       * Table Layout
       * @see https://tailwindcss.com/docs/table-layout
       */
      "table-layout": [{
        table: ["auto", "fixed"]
      }],
      /**
       * Caption Side
       * @see https://tailwindcss.com/docs/caption-side
       */
      caption: [{
        caption: ["top", "bottom"]
      }],
      // Transitions and Animation
      /**
       * Tranisition Property
       * @see https://tailwindcss.com/docs/transition-property
       */
      transition: [{
        transition: ["none", "all", "", "colors", "opacity", "shadow", "transform", isArbitraryValue]
      }],
      /**
       * Transition Duration
       * @see https://tailwindcss.com/docs/transition-duration
       */
      duration: [{
        duration: getNumberAndArbitrary()
      }],
      /**
       * Transition Timing Function
       * @see https://tailwindcss.com/docs/transition-timing-function
       */
      ease: [{
        ease: ["linear", "in", "out", "in-out", isArbitraryValue]
      }],
      /**
       * Transition Delay
       * @see https://tailwindcss.com/docs/transition-delay
       */
      delay: [{
        delay: getNumberAndArbitrary()
      }],
      /**
       * Animation
       * @see https://tailwindcss.com/docs/animation
       */
      animate: [{
        animate: ["none", "spin", "ping", "pulse", "bounce", isArbitraryValue]
      }],
      // Transforms
      /**
       * Transform
       * @see https://tailwindcss.com/docs/transform
       */
      transform: [{
        transform: ["", "gpu", "none"]
      }],
      /**
       * Scale
       * @see https://tailwindcss.com/docs/scale
       */
      scale: [{
        scale: [scale]
      }],
      /**
       * Scale X
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-x": [{
        "scale-x": [scale]
      }],
      /**
       * Scale Y
       * @see https://tailwindcss.com/docs/scale
       */
      "scale-y": [{
        "scale-y": [scale]
      }],
      /**
       * Rotate
       * @see https://tailwindcss.com/docs/rotate
       */
      rotate: [{
        rotate: [isInteger, isArbitraryValue]
      }],
      /**
       * Translate X
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-x": [{
        "translate-x": [translate]
      }],
      /**
       * Translate Y
       * @see https://tailwindcss.com/docs/translate
       */
      "translate-y": [{
        "translate-y": [translate]
      }],
      /**
       * Skew X
       * @see https://tailwindcss.com/docs/skew
       */
      "skew-x": [{
        "skew-x": [skew]
      }],
      /**
       * Skew Y
       * @see https://tailwindcss.com/docs/skew
       */
      "skew-y": [{
        "skew-y": [skew]
      }],
      /**
       * Transform Origin
       * @see https://tailwindcss.com/docs/transform-origin
       */
      "transform-origin": [{
        origin: ["center", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left", "top-left", isArbitraryValue]
      }],
      // Interactivity
      /**
       * Accent Color
       * @see https://tailwindcss.com/docs/accent-color
       */
      accent: [{
        accent: ["auto", colors]
      }],
      /**
       * Appearance
       * @see https://tailwindcss.com/docs/appearance
       */
      appearance: [{
        appearance: ["none", "auto"]
      }],
      /**
       * Cursor
       * @see https://tailwindcss.com/docs/cursor
       */
      cursor: [{
        cursor: ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", isArbitraryValue]
      }],
      /**
       * Caret Color
       * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
       */
      "caret-color": [{
        caret: [colors]
      }],
      /**
       * Pointer Events
       * @see https://tailwindcss.com/docs/pointer-events
       */
      "pointer-events": [{
        "pointer-events": ["none", "auto"]
      }],
      /**
       * Resize
       * @see https://tailwindcss.com/docs/resize
       */
      resize: [{
        resize: ["none", "y", "x", ""]
      }],
      /**
       * Scroll Behavior
       * @see https://tailwindcss.com/docs/scroll-behavior
       */
      "scroll-behavior": [{
        scroll: ["auto", "smooth"]
      }],
      /**
       * Scroll Margin
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-m": [{
        "scroll-m": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Margin X
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mx": [{
        "scroll-mx": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Margin Y
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-my": [{
        "scroll-my": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Margin Start
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ms": [{
        "scroll-ms": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Margin End
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-me": [{
        "scroll-me": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Margin Top
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mt": [{
        "scroll-mt": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Margin Right
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mr": [{
        "scroll-mr": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Margin Bottom
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-mb": [{
        "scroll-mb": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Margin Left
       * @see https://tailwindcss.com/docs/scroll-margin
       */
      "scroll-ml": [{
        "scroll-ml": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Padding
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-p": [{
        "scroll-p": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Padding X
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-px": [{
        "scroll-px": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Padding Y
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-py": [{
        "scroll-py": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Padding Start
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-ps": [{
        "scroll-ps": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Padding End
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pe": [{
        "scroll-pe": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Padding Top
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pt": [{
        "scroll-pt": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Padding Right
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pr": [{
        "scroll-pr": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Padding Bottom
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pb": [{
        "scroll-pb": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Padding Left
       * @see https://tailwindcss.com/docs/scroll-padding
       */
      "scroll-pl": [{
        "scroll-pl": getSpacingWithArbitrary()
      }],
      /**
       * Scroll Snap Align
       * @see https://tailwindcss.com/docs/scroll-snap-align
       */
      "snap-align": [{
        snap: ["start", "end", "center", "align-none"]
      }],
      /**
       * Scroll Snap Stop
       * @see https://tailwindcss.com/docs/scroll-snap-stop
       */
      "snap-stop": [{
        snap: ["normal", "always"]
      }],
      /**
       * Scroll Snap Type
       * @see https://tailwindcss.com/docs/scroll-snap-type
       */
      "snap-type": [{
        snap: ["none", "x", "y", "both"]
      }],
      /**
       * Scroll Snap Type Strictness
       * @see https://tailwindcss.com/docs/scroll-snap-type
       */
      "snap-strictness": [{
        snap: ["mandatory", "proximity"]
      }],
      /**
       * Touch Action
       * @see https://tailwindcss.com/docs/touch-action
       */
      touch: [{
        touch: ["auto", "none", "manipulation"]
      }],
      /**
       * Touch Action X
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-x": [{
        "touch-pan": ["x", "left", "right"]
      }],
      /**
       * Touch Action Y
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-y": [{
        "touch-pan": ["y", "up", "down"]
      }],
      /**
       * Touch Action Pinch Zoom
       * @see https://tailwindcss.com/docs/touch-action
       */
      "touch-pz": ["touch-pinch-zoom"],
      /**
       * User Select
       * @see https://tailwindcss.com/docs/user-select
       */
      select: [{
        select: ["none", "text", "all", "auto"]
      }],
      /**
       * Will Change
       * @see https://tailwindcss.com/docs/will-change
       */
      "will-change": [{
        "will-change": ["auto", "scroll", "contents", "transform", isArbitraryValue]
      }],
      // SVG
      /**
       * Fill
       * @see https://tailwindcss.com/docs/fill
       */
      fill: [{
        fill: [colors, "none"]
      }],
      /**
       * Stroke Width
       * @see https://tailwindcss.com/docs/stroke-width
       */
      "stroke-w": [{
        stroke: [isLength, isArbitraryLength, isArbitraryNumber]
      }],
      /**
       * Stroke
       * @see https://tailwindcss.com/docs/stroke
       */
      stroke: [{
        stroke: [colors, "none"]
      }],
      // Accessibility
      /**
       * Screen Readers
       * @see https://tailwindcss.com/docs/screen-readers
       */
      sr: ["sr-only", "not-sr-only"],
      /**
       * Forced Color Adjust
       * @see https://tailwindcss.com/docs/forced-color-adjust
       */
      "forced-color-adjust": [{
        "forced-color-adjust": ["auto", "none"]
      }]
    },
    conflictingClassGroups: {
      overflow: ["overflow-x", "overflow-y"],
      overscroll: ["overscroll-x", "overscroll-y"],
      inset: ["inset-x", "inset-y", "start", "end", "top", "right", "bottom", "left"],
      "inset-x": ["right", "left"],
      "inset-y": ["top", "bottom"],
      flex: ["basis", "grow", "shrink"],
      gap: ["gap-x", "gap-y"],
      p: ["px", "py", "ps", "pe", "pt", "pr", "pb", "pl"],
      px: ["pr", "pl"],
      py: ["pt", "pb"],
      m: ["mx", "my", "ms", "me", "mt", "mr", "mb", "ml"],
      mx: ["mr", "ml"],
      my: ["mt", "mb"],
      size: ["w", "h"],
      "font-size": ["leading"],
      "fvn-normal": ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"],
      "fvn-ordinal": ["fvn-normal"],
      "fvn-slashed-zero": ["fvn-normal"],
      "fvn-figure": ["fvn-normal"],
      "fvn-spacing": ["fvn-normal"],
      "fvn-fraction": ["fvn-normal"],
      "line-clamp": ["display", "overflow"],
      rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"],
      "rounded-s": ["rounded-ss", "rounded-es"],
      "rounded-e": ["rounded-se", "rounded-ee"],
      "rounded-t": ["rounded-tl", "rounded-tr"],
      "rounded-r": ["rounded-tr", "rounded-br"],
      "rounded-b": ["rounded-br", "rounded-bl"],
      "rounded-l": ["rounded-tl", "rounded-bl"],
      "border-spacing": ["border-spacing-x", "border-spacing-y"],
      "border-w": ["border-w-s", "border-w-e", "border-w-t", "border-w-r", "border-w-b", "border-w-l"],
      "border-w-x": ["border-w-r", "border-w-l"],
      "border-w-y": ["border-w-t", "border-w-b"],
      "border-color": ["border-color-t", "border-color-r", "border-color-b", "border-color-l"],
      "border-color-x": ["border-color-r", "border-color-l"],
      "border-color-y": ["border-color-t", "border-color-b"],
      "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"],
      "scroll-mx": ["scroll-mr", "scroll-ml"],
      "scroll-my": ["scroll-mt", "scroll-mb"],
      "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"],
      "scroll-px": ["scroll-pr", "scroll-pl"],
      "scroll-py": ["scroll-pt", "scroll-pb"],
      touch: ["touch-x", "touch-y", "touch-pz"],
      "touch-x": ["touch"],
      "touch-y": ["touch"],
      "touch-pz": ["touch"]
    },
    conflictingClassGroupModifiers: {
      "font-size": ["leading"]
    }
  };
}
const twMerge = /* @__PURE__ */ createTailwindMerge(getDefaultConfig);
const cn = (...classLists) => twMerge(clsx(classLists));
function chain(callbacks) {
  return (...args) => {
    for (const callback of callbacks)
      callback && callback(...args);
  };
}
var access$1 = (v) => typeof v === "function" && !v.length ? v() : v;
function accessWith(valueOrFn, ...args) {
  return typeof valueOrFn === "function" ? valueOrFn(...args) : valueOrFn;
}
function mergeRefs(...refs) {
  return chain(refs);
}
function removeItemFromArray(array, item) {
  const updatedArray = [...array];
  const index = updatedArray.indexOf(item);
  if (index !== -1) {
    updatedArray.splice(index, 1);
  }
  return updatedArray;
}
function isString(value) {
  return Object.prototype.toString.call(value) === "[object String]";
}
function isFunction(value) {
  return typeof value === "function";
}
function createGenerateId(baseId) {
  return (suffix) => `${baseId()}-${suffix}`;
}
function contains$1(parent, child) {
  if (!parent) {
    return false;
  }
  return parent === child || parent.contains(child);
}
function getActiveElement(node, activeDescendant = false) {
  const { activeElement } = getDocument(node);
  if (!(activeElement == null ? void 0 : activeElement.nodeName)) {
    return null;
  }
  if (isFrame(activeElement) && activeElement.contentDocument) {
    return getActiveElement(activeElement.contentDocument.body, activeDescendant);
  }
  if (activeDescendant) {
    const id = activeElement.getAttribute("aria-activedescendant");
    if (id) {
      const element = getDocument(activeElement).getElementById(id);
      if (element) {
        return element;
      }
    }
  }
  return activeElement;
}
function getDocument(node) {
  return node ? node.ownerDocument || node : document;
}
function isFrame(element) {
  return element.tagName === "IFRAME";
}
var EventKey = /* @__PURE__ */ ((EventKey2) => {
  EventKey2["Escape"] = "Escape";
  EventKey2["Enter"] = "Enter";
  EventKey2["Tab"] = "Tab";
  EventKey2["Space"] = " ";
  EventKey2["ArrowDown"] = "ArrowDown";
  EventKey2["ArrowLeft"] = "ArrowLeft";
  EventKey2["ArrowRight"] = "ArrowRight";
  EventKey2["ArrowUp"] = "ArrowUp";
  EventKey2["End"] = "End";
  EventKey2["Home"] = "Home";
  EventKey2["PageDown"] = "PageDown";
  EventKey2["PageUp"] = "PageUp";
  return EventKey2;
})(EventKey || {});
function testPlatform(re) {
  var _a;
  return typeof window !== "undefined" && window.navigator != null ? (
    // @ts-ignore
    re.test(((_a = window.navigator["userAgentData"]) == null ? void 0 : _a.platform) || window.navigator.platform)
  ) : false;
}
function isMac() {
  return testPlatform(/^Mac/i);
}
function callHandler(event, handler) {
  if (handler) {
    if (isFunction(handler)) {
      handler(event);
    } else {
      handler[0](handler[1], event);
    }
  }
  return event == null ? void 0 : event.defaultPrevented;
}
function composeEventHandlers(handlers) {
  return (event) => {
    for (const handler of handlers) {
      callHandler(event, handler);
    }
  };
}
function isCtrlKey(e) {
  if (isMac()) {
    return e.metaKey && !e.ctrlKey;
  }
  return e.ctrlKey && !e.metaKey;
}
function focusWithoutScrolling(element) {
  if (!element) {
    return;
  }
  if (supportsPreventScroll()) {
    element.focus({ preventScroll: true });
  } else {
    const scrollableElements = getScrollableElements(element);
    element.focus();
    restoreScrollPosition(scrollableElements);
  }
}
var supportsPreventScrollCached = null;
function supportsPreventScroll() {
  if (supportsPreventScrollCached == null) {
    supportsPreventScrollCached = false;
    try {
      const focusElem = document.createElement("div");
      focusElem.focus({
        get preventScroll() {
          supportsPreventScrollCached = true;
          return true;
        }
      });
    } catch (e) {
    }
  }
  return supportsPreventScrollCached;
}
function getScrollableElements(element) {
  let parent = element.parentNode;
  const scrollableElements = [];
  const rootScrollingElement = document.scrollingElement || document.documentElement;
  while (parent instanceof HTMLElement && parent !== rootScrollingElement) {
    if (parent.offsetHeight < parent.scrollHeight || parent.offsetWidth < parent.scrollWidth) {
      scrollableElements.push({
        element: parent,
        scrollTop: parent.scrollTop,
        scrollLeft: parent.scrollLeft
      });
    }
    parent = parent.parentNode;
  }
  if (rootScrollingElement instanceof HTMLElement) {
    scrollableElements.push({
      element: rootScrollingElement,
      scrollTop: rootScrollingElement.scrollTop,
      scrollLeft: rootScrollingElement.scrollLeft
    });
  }
  return scrollableElements;
}
function restoreScrollPosition(scrollableElements) {
  for (const { element, scrollTop, scrollLeft } of scrollableElements) {
    element.scrollTop = scrollTop;
    element.scrollLeft = scrollLeft;
  }
}
var focusableElements = [
  "input:not([type='hidden']):not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "a[href]",
  "area[href]",
  "[tabindex]",
  "iframe",
  "object",
  "embed",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])"
];
var FOCUSABLE_ELEMENT_SELECTOR = focusableElements.join(":not([hidden]),") + ",[tabindex]:not([disabled]):not([hidden])";
function getAllTabbableIn(container, includeContainer) {
  const elements = Array.from(container.querySelectorAll(FOCUSABLE_ELEMENT_SELECTOR));
  const tabbableElements2 = elements.filter(isTabbable);
  if (includeContainer && isTabbable(container)) {
    tabbableElements2.unshift(container);
  }
  tabbableElements2.forEach((element, i) => {
    if (isFrame(element) && element.contentDocument) {
      const frameBody = element.contentDocument.body;
      const allFrameTabbable = getAllTabbableIn(frameBody, false);
      tabbableElements2.splice(i, 1, ...allFrameTabbable);
    }
  });
  return tabbableElements2;
}
function isTabbable(element) {
  return isFocusable(element) && !hasNegativeTabIndex(element);
}
function isFocusable(element) {
  return element.matches(FOCUSABLE_ELEMENT_SELECTOR) && isElementVisible(element);
}
function hasNegativeTabIndex(element) {
  const tabIndex = parseInt(element.getAttribute("tabindex") || "0", 10);
  return tabIndex < 0;
}
function isElementVisible(element, childElement) {
  return element.nodeName !== "#comment" && isStyleVisible(element) && isAttributeVisible(element, childElement) && (!element.parentElement || isElementVisible(element.parentElement, element));
}
function isStyleVisible(element) {
  if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) {
    return false;
  }
  const { display, visibility } = element.style;
  let isVisible = display !== "none" && visibility !== "hidden" && visibility !== "collapse";
  if (isVisible) {
    if (!element.ownerDocument.defaultView) {
      return isVisible;
    }
    const { getComputedStyle: getComputedStyle2 } = element.ownerDocument.defaultView;
    const { display: computedDisplay, visibility: computedVisibility } = getComputedStyle2(element);
    isVisible = computedDisplay !== "none" && computedVisibility !== "hidden" && computedVisibility !== "collapse";
  }
  return isVisible;
}
function isAttributeVisible(element, childElement) {
  return !element.hasAttribute("hidden") && (element.nodeName === "DETAILS" && childElement && childElement.nodeName !== "SUMMARY" ? element.hasAttribute("open") : true);
}
function noop() {
  return;
}
function mergeDefaultProps(defaultProps, props) {
  return mergeProps(defaultProps, props);
}
var transitionsByElement = /* @__PURE__ */ new Map();
var transitionCallbacks = /* @__PURE__ */ new Set();
function setupGlobalEvents() {
  if (typeof window === "undefined") {
    return;
  }
  const onTransitionStart = (e) => {
    if (!e.target) {
      return;
    }
    let transitions = transitionsByElement.get(e.target);
    if (!transitions) {
      transitions = /* @__PURE__ */ new Set();
      transitionsByElement.set(e.target, transitions);
      e.target.addEventListener("transitioncancel", onTransitionEnd);
    }
    transitions.add(e.propertyName);
  };
  const onTransitionEnd = (e) => {
    if (!e.target) {
      return;
    }
    const properties = transitionsByElement.get(e.target);
    if (!properties) {
      return;
    }
    properties.delete(e.propertyName);
    if (properties.size === 0) {
      e.target.removeEventListener("transitioncancel", onTransitionEnd);
      transitionsByElement.delete(e.target);
    }
    if (transitionsByElement.size === 0) {
      for (const cb of transitionCallbacks) {
        cb();
      }
      transitionCallbacks.clear();
    }
  };
  document.body.addEventListener("transitionrun", onTransitionStart);
  document.body.addEventListener("transitionend", onTransitionEnd);
}
if (typeof document !== "undefined") {
  if (document.readyState !== "loading") {
    setupGlobalEvents();
  } else {
    document.addEventListener("DOMContentLoaded", setupGlobalEvents);
  }
}
var visuallyHiddenStyles = {
  border: "0",
  clip: "rect(0 0 0 0)",
  "clip-path": "inset(50%)",
  height: "1px",
  margin: "0 -1px -1px 0",
  overflow: "hidden",
  padding: "0",
  position: "absolute",
  width: "1px",
  "white-space": "nowrap"
};
var DATA_TOP_LAYER_ATTR = "data-kb-top-layer";
var originalBodyPointerEvents;
var hasDisabledBodyPointerEvents = false;
var layers = [];
function indexOf(node) {
  return layers.findIndex((layer) => layer.node === node);
}
function find(node) {
  return layers[indexOf(node)];
}
function isTopMostLayer(node) {
  return layers[layers.length - 1].node === node;
}
function getPointerBlockingLayers() {
  return layers.filter((layer) => layer.isPointerBlocking);
}
function getTopMostPointerBlockingLayer() {
  return [...getPointerBlockingLayers()].slice(-1)[0];
}
function hasPointerBlockingLayer() {
  return getPointerBlockingLayers().length > 0;
}
function isBelowPointerBlockingLayer(node) {
  var _a;
  const highestBlockingIndex = indexOf((_a = getTopMostPointerBlockingLayer()) == null ? void 0 : _a.node);
  return indexOf(node) < highestBlockingIndex;
}
function addLayer(layer) {
  layers.push(layer);
}
function removeLayer(node) {
  const index = indexOf(node);
  if (index < 0) {
    return;
  }
  layers.splice(index, 1);
}
function assignPointerEventToLayers() {
  for (const {
    node
  } of layers) {
    node.style.pointerEvents = isBelowPointerBlockingLayer(node) ? "none" : "auto";
  }
}
function disableBodyPointerEvents(node) {
  if (hasPointerBlockingLayer() && !hasDisabledBodyPointerEvents) {
    const ownerDocument = getDocument(node);
    originalBodyPointerEvents = document.body.style.pointerEvents;
    ownerDocument.body.style.pointerEvents = "none";
    hasDisabledBodyPointerEvents = true;
  }
}
function restoreBodyPointerEvents(node) {
  if (hasPointerBlockingLayer()) {
    return;
  }
  const ownerDocument = getDocument(node);
  ownerDocument.body.style.pointerEvents = originalBodyPointerEvents;
  if (ownerDocument.body.style.length === 0) {
    ownerDocument.body.removeAttribute("style");
  }
  hasDisabledBodyPointerEvents = false;
}
var layerStack = {
  layers,
  isTopMostLayer,
  hasPointerBlockingLayer,
  isBelowPointerBlockingLayer,
  addLayer,
  removeLayer,
  indexOf,
  find,
  assignPointerEventToLayers,
  disableBodyPointerEvents,
  restoreBodyPointerEvents
};
var AUTOFOCUS_ON_MOUNT_EVENT = "focusScope.autoFocusOnMount";
var AUTOFOCUS_ON_UNMOUNT_EVENT = "focusScope.autoFocusOnUnmount";
var EVENT_OPTIONS = {
  bubbles: false,
  cancelable: true
};
var focusScopeStack = {
  /** A stack of focus scopes, with the active one at the top */
  stack: [],
  active() {
    return this.stack[0];
  },
  add(scope) {
    var _a;
    if (scope !== this.active()) {
      (_a = this.active()) == null ? void 0 : _a.pause();
    }
    this.stack = removeItemFromArray(this.stack, scope);
    this.stack.unshift(scope);
  },
  remove(scope) {
    var _a;
    this.stack = removeItemFromArray(this.stack, scope);
    (_a = this.active()) == null ? void 0 : _a.resume();
  }
};
function createFocusScope(props, ref) {
  const [isPaused, setIsPaused] = createSignal(false);
  const focusScope = {
    pause() {
      setIsPaused(true);
    },
    resume() {
      setIsPaused(false);
    }
  };
  let lastFocusedElement = null;
  const onMountAutoFocus = (e) => {
    var _a;
    return (_a = props.onMountAutoFocus) == null ? void 0 : _a.call(props, e);
  };
  const onUnmountAutoFocus = (e) => {
    var _a;
    return (_a = props.onUnmountAutoFocus) == null ? void 0 : _a.call(props, e);
  };
  const ownerDocument = () => getDocument(ref());
  const createSentinel = () => {
    const element = ownerDocument().createElement("span");
    element.setAttribute("data-focus-trap", "");
    element.tabIndex = 0;
    Object.assign(element.style, visuallyHiddenStyles);
    return element;
  };
  const tabbables = () => {
    const container = ref();
    if (!container) {
      return [];
    }
    return getAllTabbableIn(container, true).filter((el) => !el.hasAttribute("data-focus-trap"));
  };
  const firstTabbable = () => {
    const items = tabbables();
    return items.length > 0 ? items[0] : null;
  };
  const lastTabbable = () => {
    const items = tabbables();
    return items.length > 0 ? items[items.length - 1] : null;
  };
  const shouldPreventUnmountAutoFocus = () => {
    const container = ref();
    if (!container) {
      return false;
    }
    const activeElement = getActiveElement(container);
    if (!activeElement) {
      return false;
    }
    if (contains$1(container, activeElement)) {
      return false;
    }
    return isFocusable(activeElement);
  };
  createEffect(() => {
    const container = ref();
    if (!container) {
      return;
    }
    focusScopeStack.add(focusScope);
    const previouslyFocusedElement = getActiveElement(container);
    const hasFocusedCandidate = contains$1(container, previouslyFocusedElement);
    if (!hasFocusedCandidate) {
      const mountEvent = new CustomEvent(AUTOFOCUS_ON_MOUNT_EVENT, EVENT_OPTIONS);
      container.addEventListener(AUTOFOCUS_ON_MOUNT_EVENT, onMountAutoFocus);
      container.dispatchEvent(mountEvent);
      if (!mountEvent.defaultPrevented) {
        setTimeout(() => {
          focusWithoutScrolling(firstTabbable());
          if (getActiveElement(container) === previouslyFocusedElement) {
            focusWithoutScrolling(container);
          }
        }, 0);
      }
    }
    onCleanup(() => {
      container.removeEventListener(AUTOFOCUS_ON_MOUNT_EVENT, onMountAutoFocus);
      setTimeout(() => {
        const unmountEvent = new CustomEvent(AUTOFOCUS_ON_UNMOUNT_EVENT, EVENT_OPTIONS);
        if (shouldPreventUnmountAutoFocus()) {
          unmountEvent.preventDefault();
        }
        container.addEventListener(AUTOFOCUS_ON_UNMOUNT_EVENT, onUnmountAutoFocus);
        container.dispatchEvent(unmountEvent);
        if (!unmountEvent.defaultPrevented) {
          focusWithoutScrolling(previouslyFocusedElement ?? ownerDocument().body);
        }
        container.removeEventListener(AUTOFOCUS_ON_UNMOUNT_EVENT, onUnmountAutoFocus);
        focusScopeStack.remove(focusScope);
      }, 0);
    });
  });
  createEffect(() => {
    const container = ref();
    if (!container || !access$1(props.trapFocus) || isPaused()) {
      return;
    }
    const onFocusIn = (event) => {
      const target = event.target;
      if (target == null ? void 0 : target.closest(`[${DATA_TOP_LAYER_ATTR}]`)) {
        return;
      }
      if (contains$1(container, target)) {
        lastFocusedElement = target;
      } else {
        focusWithoutScrolling(lastFocusedElement);
      }
    };
    const onFocusOut = (event) => {
      const relatedTarget = event.relatedTarget;
      const target = relatedTarget ?? getActiveElement(container);
      if (target == null ? void 0 : target.closest(`[${DATA_TOP_LAYER_ATTR}]`)) {
        return;
      }
      if (!contains$1(container, target)) {
        focusWithoutScrolling(lastFocusedElement);
      }
    };
    ownerDocument().addEventListener("focusin", onFocusIn);
    ownerDocument().addEventListener("focusout", onFocusOut);
    onCleanup(() => {
      ownerDocument().removeEventListener("focusin", onFocusIn);
      ownerDocument().removeEventListener("focusout", onFocusOut);
    });
  });
  createEffect(() => {
    const container = ref();
    if (!container || !access$1(props.trapFocus) || isPaused()) {
      return;
    }
    const startSentinel = createSentinel();
    container.insertAdjacentElement("afterbegin", startSentinel);
    const endSentinel = createSentinel();
    container.insertAdjacentElement("beforeend", endSentinel);
    function onFocus(event) {
      const first = firstTabbable();
      const last = lastTabbable();
      if (event.relatedTarget === first) {
        focusWithoutScrolling(last);
      } else {
        focusWithoutScrolling(first);
      }
    }
    startSentinel.addEventListener("focusin", onFocus);
    endSentinel.addEventListener("focusin", onFocus);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.previousSibling === endSentinel) {
          endSentinel.remove();
          container.insertAdjacentElement("beforeend", endSentinel);
        }
        if (mutation.nextSibling === startSentinel) {
          startSentinel.remove();
          container.insertAdjacentElement("afterbegin", startSentinel);
        }
      }
    });
    observer.observe(container, {
      childList: true,
      subtree: false
    });
    onCleanup(() => {
      startSentinel.removeEventListener("focusin", onFocus);
      endSentinel.removeEventListener("focusin", onFocus);
      startSentinel.remove();
      endSentinel.remove();
      observer.disconnect();
    });
  });
}
var DATA_LIVE_ANNOUNCER_ATTR = "data-live-announcer";
function createHideOutside(props) {
  createEffect(() => {
    if (access$1(props.isDisabled)) {
      return;
    }
    onCleanup(ariaHideOutside(access$1(props.targets), access$1(props.root)));
  });
}
var refCountMap = /* @__PURE__ */ new WeakMap();
var observerStack = [];
function ariaHideOutside(targets, root = document.body) {
  const visibleNodes = new Set(targets);
  const hiddenNodes = /* @__PURE__ */ new Set();
  const walk = (root2) => {
    for (const element of root2.querySelectorAll(`[${DATA_LIVE_ANNOUNCER_ATTR}], [${DATA_TOP_LAYER_ATTR}]`)) {
      visibleNodes.add(element);
    }
    const acceptNode = (node) => {
      if (visibleNodes.has(node) || node.parentElement && hiddenNodes.has(node.parentElement) && node.parentElement.getAttribute("role") !== "row") {
        return NodeFilter.FILTER_REJECT;
      }
      for (const target of visibleNodes) {
        if (node.contains(target)) {
          return NodeFilter.FILTER_SKIP;
        }
      }
      return NodeFilter.FILTER_ACCEPT;
    };
    const walker = document.createTreeWalker(root2, NodeFilter.SHOW_ELEMENT, {
      acceptNode
    });
    const acceptRoot = acceptNode(root2);
    if (acceptRoot === NodeFilter.FILTER_ACCEPT) {
      hide(root2);
    }
    if (acceptRoot !== NodeFilter.FILTER_REJECT) {
      let node = walker.nextNode();
      while (node != null) {
        hide(node);
        node = walker.nextNode();
      }
    }
  };
  const hide = (node) => {
    const refCount = refCountMap.get(node) ?? 0;
    if (node.getAttribute("aria-hidden") === "true" && refCount === 0) {
      return;
    }
    if (refCount === 0) {
      node.setAttribute("aria-hidden", "true");
    }
    hiddenNodes.add(node);
    refCountMap.set(node, refCount + 1);
  };
  if (observerStack.length) {
    observerStack[observerStack.length - 1].disconnect();
  }
  walk(root);
  const observer = new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type !== "childList" || change.addedNodes.length === 0) {
        continue;
      }
      if (![...visibleNodes, ...hiddenNodes].some((node) => node.contains(change.target))) {
        for (const node of change.removedNodes) {
          if (node instanceof Element) {
            visibleNodes.delete(node);
            hiddenNodes.delete(node);
          }
        }
        for (const node of change.addedNodes) {
          if ((node instanceof HTMLElement || node instanceof SVGElement) && (node.dataset.liveAnnouncer === "true" || node.dataset.reactAriaTopLayer === "true")) {
            visibleNodes.add(node);
          } else if (node instanceof Element) {
            walk(node);
          }
        }
      }
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true
  });
  const observerWrapper = {
    observe() {
      observer.observe(root, {
        childList: true,
        subtree: true
      });
    },
    disconnect() {
      observer.disconnect();
    }
  };
  observerStack.push(observerWrapper);
  return () => {
    observer.disconnect();
    for (const node of hiddenNodes) {
      const count = refCountMap.get(node);
      if (count == null) {
        return;
      }
      if (count === 1) {
        node.removeAttribute("aria-hidden");
        refCountMap.delete(node);
      } else {
        refCountMap.set(node, count - 1);
      }
    }
    if (observerWrapper === observerStack[observerStack.length - 1]) {
      observerStack.pop();
      if (observerStack.length) {
        observerStack[observerStack.length - 1].observe();
      }
    } else {
      observerStack.splice(observerStack.indexOf(observerWrapper), 1);
    }
  };
}
function createEscapeKeyDown(props) {
  const handleKeyDown = (event) => {
    var _a;
    if (event.key === EventKey.Escape) {
      (_a = props.onEscapeKeyDown) == null ? void 0 : _a.call(props, event);
    }
  };
  createEffect(() => {
    var _a;
    if (access$1(props.isDisabled)) {
      return;
    }
    const document2 = ((_a = props.ownerDocument) == null ? void 0 : _a.call(props)) ?? getDocument();
    document2.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      document2.removeEventListener("keydown", handleKeyDown);
    });
  });
}
var POINTER_DOWN_OUTSIDE_EVENT = "interactOutside.pointerDownOutside";
var FOCUS_OUTSIDE_EVENT = "interactOutside.focusOutside";
function createInteractOutside(props, ref) {
  let pointerDownTimeoutId;
  let clickHandler = noop;
  const ownerDocument = () => getDocument(ref());
  const onPointerDownOutside = (e) => {
    var _a;
    return (_a = props.onPointerDownOutside) == null ? void 0 : _a.call(props, e);
  };
  const onFocusOutside = (e) => {
    var _a;
    return (_a = props.onFocusOutside) == null ? void 0 : _a.call(props, e);
  };
  const onInteractOutside = (e) => {
    var _a;
    return (_a = props.onInteractOutside) == null ? void 0 : _a.call(props, e);
  };
  const isEventOutside = (e) => {
    var _a;
    const target = e.target;
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.closest(`[${DATA_TOP_LAYER_ATTR}]`)) {
      return false;
    }
    if (!contains$1(ownerDocument(), target)) {
      return false;
    }
    if (contains$1(ref(), target)) {
      return false;
    }
    return !((_a = props.shouldExcludeElement) == null ? void 0 : _a.call(props, target));
  };
  const onPointerDown = (e) => {
    function handler() {
      const container = ref();
      const target = e.target;
      if (!container || !target || !isEventOutside(e)) {
        return;
      }
      const handler2 = composeEventHandlers([onPointerDownOutside, onInteractOutside]);
      target.addEventListener(POINTER_DOWN_OUTSIDE_EVENT, handler2, {
        once: true
      });
      const pointerDownOutsideEvent = new CustomEvent(POINTER_DOWN_OUTSIDE_EVENT, {
        bubbles: false,
        cancelable: true,
        detail: {
          originalEvent: e,
          isContextMenu: e.button === 2 || isCtrlKey(e) && e.button === 0
        }
      });
      target.dispatchEvent(pointerDownOutsideEvent);
    }
    if (e.pointerType === "touch") {
      ownerDocument().removeEventListener("click", handler);
      clickHandler = handler;
      ownerDocument().addEventListener("click", handler, {
        once: true
      });
    } else {
      handler();
    }
  };
  const onFocusIn = (e) => {
    const container = ref();
    const target = e.target;
    if (!container || !target || !isEventOutside(e)) {
      return;
    }
    const handler = composeEventHandlers([onFocusOutside, onInteractOutside]);
    target.addEventListener(FOCUS_OUTSIDE_EVENT, handler, {
      once: true
    });
    const focusOutsideEvent = new CustomEvent(FOCUS_OUTSIDE_EVENT, {
      bubbles: false,
      cancelable: true,
      detail: {
        originalEvent: e,
        isContextMenu: false
      }
    });
    target.dispatchEvent(focusOutsideEvent);
  };
  createEffect(() => {
    if (access$1(props.isDisabled)) {
      return;
    }
    pointerDownTimeoutId = window.setTimeout(() => {
      ownerDocument().addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    ownerDocument().addEventListener("focusin", onFocusIn, true);
    onCleanup(() => {
      window.clearTimeout(pointerDownTimeoutId);
      ownerDocument().removeEventListener("click", clickHandler);
      ownerDocument().removeEventListener("pointerdown", onPointerDown, true);
      ownerDocument().removeEventListener("focusin", onFocusIn, true);
    });
  });
}
function Polymorphic(props) {
  const [local, others] = splitProps(props, ["as"]);
  if (!local.as) {
    throw new Error("[kobalte]: Polymorphic is missing the required `as` prop.");
  }
  return (
    // @ts-ignore: Props are valid but not worth calculating
    createComponent(Dynamic, mergeProps({
      get component() {
        return local.as;
      }
    }, others))
  );
}
var DismissableLayerContext = createContext();
function useOptionalDismissableLayerContext() {
  return useContext(DismissableLayerContext);
}
function DismissableLayer(props) {
  let ref;
  const parentContext = useOptionalDismissableLayerContext();
  const [local, others] = splitProps(props, ["ref", "disableOutsidePointerEvents", "excludedElements", "onEscapeKeyDown", "onPointerDownOutside", "onFocusOutside", "onInteractOutside", "onDismiss", "bypassTopMostLayerCheck"]);
  const nestedLayers = /* @__PURE__ */ new Set([]);
  const registerNestedLayer = (element) => {
    nestedLayers.add(element);
    const parentUnregister = parentContext == null ? void 0 : parentContext.registerNestedLayer(element);
    return () => {
      nestedLayers.delete(element);
      parentUnregister == null ? void 0 : parentUnregister();
    };
  };
  const shouldExcludeElement = (element) => {
    var _a;
    if (!ref) {
      return false;
    }
    return ((_a = local.excludedElements) == null ? void 0 : _a.some((node) => contains$1(node(), element))) || [...nestedLayers].some((layer) => contains$1(layer, element));
  };
  const onPointerDownOutside = (e) => {
    var _a, _b, _c;
    if (!ref || layerStack.isBelowPointerBlockingLayer(ref)) {
      return;
    }
    if (!local.bypassTopMostLayerCheck && !layerStack.isTopMostLayer(ref)) {
      return;
    }
    (_a = local.onPointerDownOutside) == null ? void 0 : _a.call(local, e);
    (_b = local.onInteractOutside) == null ? void 0 : _b.call(local, e);
    if (!e.defaultPrevented) {
      (_c = local.onDismiss) == null ? void 0 : _c.call(local);
    }
  };
  const onFocusOutside = (e) => {
    var _a, _b, _c;
    (_a = local.onFocusOutside) == null ? void 0 : _a.call(local, e);
    (_b = local.onInteractOutside) == null ? void 0 : _b.call(local, e);
    if (!e.defaultPrevented) {
      (_c = local.onDismiss) == null ? void 0 : _c.call(local);
    }
  };
  createInteractOutside({
    shouldExcludeElement,
    onPointerDownOutside,
    onFocusOutside
  }, () => ref);
  createEscapeKeyDown({
    ownerDocument: () => getDocument(ref),
    onEscapeKeyDown: (e) => {
      var _a;
      if (!ref || !layerStack.isTopMostLayer(ref)) {
        return;
      }
      (_a = local.onEscapeKeyDown) == null ? void 0 : _a.call(local, e);
      if (!e.defaultPrevented && local.onDismiss) {
        e.preventDefault();
        local.onDismiss();
      }
    }
  });
  onMount(() => {
    if (!ref) {
      return;
    }
    layerStack.addLayer({
      node: ref,
      isPointerBlocking: local.disableOutsidePointerEvents,
      dismiss: local.onDismiss
    });
    const unregisterFromParentLayer = parentContext == null ? void 0 : parentContext.registerNestedLayer(ref);
    layerStack.assignPointerEventToLayers();
    layerStack.disableBodyPointerEvents(ref);
    onCleanup(() => {
      if (!ref) {
        return;
      }
      layerStack.removeLayer(ref);
      unregisterFromParentLayer == null ? void 0 : unregisterFromParentLayer();
      layerStack.assignPointerEventToLayers();
      layerStack.restoreBodyPointerEvents(ref);
    });
  });
  createEffect(on([() => ref, () => local.disableOutsidePointerEvents], ([ref2, disableOutsidePointerEvents]) => {
    if (!ref2) {
      return;
    }
    const layer = layerStack.find(ref2);
    if (layer && layer.isPointerBlocking !== disableOutsidePointerEvents) {
      layer.isPointerBlocking = disableOutsidePointerEvents;
      layerStack.assignPointerEventToLayers();
    }
    if (disableOutsidePointerEvents) {
      layerStack.disableBodyPointerEvents(ref2);
    }
    onCleanup(() => {
      layerStack.restoreBodyPointerEvents(ref2);
    });
  }, {
    defer: true
  }));
  const context = {
    registerNestedLayer
  };
  return createComponent(DismissableLayerContext.Provider, {
    value: context,
    get children() {
      return createComponent(Polymorphic, mergeProps({
        as: "div",
        ref(r$) {
          var _ref$ = mergeRefs((el) => ref = el, local.ref);
          typeof _ref$ === "function" && _ref$(r$);
        }
      }, others));
    }
  });
}
function createControllableSignal(props) {
  var _a;
  const [_value, _setValue] = createSignal((_a = props.defaultValue) == null ? void 0 : _a.call(props));
  const isControlled = createMemo(() => {
    var _a2;
    return ((_a2 = props.value) == null ? void 0 : _a2.call(props)) !== void 0;
  });
  const value = createMemo(() => {
    var _a2;
    return isControlled() ? (_a2 = props.value) == null ? void 0 : _a2.call(props) : _value();
  });
  const setValue = (next) => {
    untrack(() => {
      var _a2;
      const nextValue = accessWith(next, value());
      if (!Object.is(nextValue, value())) {
        if (!isControlled()) {
          _setValue(nextValue);
        }
        (_a2 = props.onChange) == null ? void 0 : _a2.call(props, nextValue);
      }
      return nextValue;
    });
  };
  return [value, setValue];
}
function createControllableBooleanSignal(props) {
  const [_value, setValue] = createControllableSignal(props);
  const value = () => _value() ?? false;
  return [value, setValue];
}
function createDisclosureState(props = {}) {
  const [isOpen, setIsOpen] = createControllableBooleanSignal({
    value: () => access$1(props.open),
    defaultValue: () => !!access$1(props.defaultOpen),
    onChange: (value) => {
      var _a;
      return (_a = props.onOpenChange) == null ? void 0 : _a.call(props, value);
    }
  });
  const open = () => {
    setIsOpen(true);
  };
  const close = () => {
    setIsOpen(false);
  };
  const toggle = () => {
    isOpen() ? close() : open();
  };
  return {
    isOpen,
    setIsOpen,
    open,
    close,
    toggle
  };
}
function createTagName(ref, fallback) {
  const [tagName, setTagName] = createSignal(stringOrUndefined(fallback == null ? void 0 : fallback()));
  createEffect(() => {
    var _a;
    setTagName(((_a = ref()) == null ? void 0 : _a.tagName.toLowerCase()) || stringOrUndefined(fallback == null ? void 0 : fallback()));
  });
  return tagName;
}
function stringOrUndefined(value) {
  return isString(value) ? value : void 0;
}
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all) __defProp(target, name, {
    get: all[name],
    enumerable: true
  });
};
var button_exports = {};
__export(button_exports, {
  Button: () => Button,
  Root: () => ButtonRoot
});
var BUTTON_INPUT_TYPES = ["button", "color", "file", "image", "reset", "submit"];
function isButton(element) {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "button") {
    return true;
  }
  if (tagName === "input" && element.type) {
    return BUTTON_INPUT_TYPES.indexOf(element.type) !== -1;
  }
  return false;
}
function ButtonRoot(props) {
  let ref;
  const mergedProps = mergeDefaultProps({
    type: "button"
  }, props);
  const [local, others] = splitProps(mergedProps, ["ref", "type", "disabled"]);
  const tagName = createTagName(() => ref, () => "button");
  const isNativeButton = createMemo(() => {
    const elementTagName = tagName();
    if (elementTagName == null) {
      return false;
    }
    return isButton({
      tagName: elementTagName,
      type: local.type
    });
  });
  const isNativeInput = createMemo(() => {
    return tagName() === "input";
  });
  const isNativeLink = createMemo(() => {
    return tagName() === "a" && (ref == null ? void 0 : ref.getAttribute("href")) != null;
  });
  return createComponent(Polymorphic, mergeProps({
    as: "button",
    ref(r$) {
      var _ref$ = mergeRefs((el) => ref = el, local.ref);
      typeof _ref$ === "function" && _ref$(r$);
    },
    get type() {
      return isNativeButton() || isNativeInput() ? local.type : void 0;
    },
    get role() {
      return !isNativeButton() && !isNativeLink() ? "button" : void 0;
    },
    get tabIndex() {
      return !isNativeButton() && !isNativeLink() && !local.disabled ? 0 : void 0;
    },
    get disabled() {
      return isNativeButton() || isNativeInput() ? local.disabled : void 0;
    },
    get ["aria-disabled"]() {
      return !isNativeButton() && !isNativeInput() && local.disabled ? true : void 0;
    },
    get ["data-disabled"]() {
      return local.disabled ? "" : void 0;
    }
  }, others));
}
var Button = ButtonRoot;
function createRegisterId(setter) {
  return (id) => {
    setter(id);
    return () => setter(void 0);
  };
}
var access = (v) => typeof v === "function" ? v() : v;
var activeStyles = /* @__PURE__ */ new Map();
var createStyle = (props) => {
  createEffect(() => {
    const style2 = access(props.style) ?? {};
    const properties = access(props.properties) ?? [];
    const originalStyles = {};
    for (const key in style2) {
      originalStyles[key] = props.element.style[key];
    }
    const activeStyle = activeStyles.get(props.key);
    if (activeStyle) {
      activeStyle.activeCount++;
    } else {
      activeStyles.set(props.key, {
        activeCount: 1,
        originalStyles,
        properties: properties.map((property) => property.key)
      });
    }
    Object.assign(props.element.style, props.style);
    for (const property of properties) {
      props.element.style.setProperty(property.key, property.value);
    }
    onCleanup(() => {
      var _a;
      const activeStyle2 = activeStyles.get(props.key);
      if (!activeStyle2) return;
      if (activeStyle2.activeCount !== 1) {
        activeStyle2.activeCount--;
        return;
      }
      activeStyles.delete(props.key);
      for (const [key, value] of Object.entries(activeStyle2.originalStyles)) {
        props.element.style[key] = value;
      }
      for (const property of activeStyle2.properties) {
        props.element.style.removeProperty(property);
      }
      if (props.element.style.length === 0) {
        props.element.removeAttribute("style");
      }
      (_a = props.cleanup) == null ? void 0 : _a.call(props);
    });
  });
};
var style_default = createStyle;
var getScrollDimensions = (element, axis) => {
  switch (axis) {
    case "x":
      return [element.clientWidth, element.scrollLeft, element.scrollWidth];
    case "y":
      return [element.clientHeight, element.scrollTop, element.scrollHeight];
  }
};
var isScrollContainer = (element, axis) => {
  const styles = getComputedStyle(element);
  const overflow = axis === "x" ? styles.overflowX : styles.overflowY;
  return overflow === "auto" || overflow === "scroll" || // The HTML element is a scroll container if it has overflow visible
  element.tagName === "HTML" && overflow === "visible";
};
var getScrollAtLocation = (location, axis, stopAt) => {
  const directionFactor = axis === "x" && window.getComputedStyle(location).direction === "rtl" ? -1 : 1;
  let currentElement = location;
  let availableScroll = 0;
  let availableScrollTop = 0;
  let wrapperReached = false;
  do {
    const [clientSize, scrollOffset, scrollSize] = getScrollDimensions(currentElement, axis);
    const scrolled = scrollSize - clientSize - directionFactor * scrollOffset;
    if ((scrollOffset !== 0 || scrolled !== 0) && isScrollContainer(currentElement, axis)) {
      availableScroll += scrolled;
      availableScrollTop += scrollOffset;
    }
    if (currentElement === (stopAt ?? document.documentElement)) {
      wrapperReached = true;
    } else {
      currentElement = currentElement._$host ?? currentElement.parentElement;
    }
  } while (currentElement && !wrapperReached);
  return [availableScroll, availableScrollTop];
};
var [preventScrollStack, setPreventScrollStack] = createSignal([]);
var isActive = (id) => preventScrollStack().indexOf(id) === preventScrollStack().length - 1;
var createPreventScroll = (props) => {
  const defaultedProps = mergeProps({
    element: null,
    enabled: true,
    hideScrollbar: true,
    preventScrollbarShift: true,
    preventScrollbarShiftMode: "padding",
    restoreScrollPosition: true,
    allowPinchZoom: false
  }, props);
  const preventScrollId = createUniqueId();
  let currentTouchStart = [0, 0];
  let currentTouchStartAxis = null;
  let currentTouchStartDelta = null;
  createEffect(() => {
    if (!access(defaultedProps.enabled)) return;
    setPreventScrollStack((stack) => [...stack, preventScrollId]);
    onCleanup(() => {
      setPreventScrollStack((stack) => stack.filter((id) => id !== preventScrollId));
    });
  });
  createEffect(() => {
    if (!access(defaultedProps.enabled) || !access(defaultedProps.hideScrollbar)) return;
    const {
      body
    } = document;
    const scrollbarWidth = window.innerWidth - body.offsetWidth;
    if (access(defaultedProps.preventScrollbarShift)) {
      const style2 = {
        overflow: "hidden"
      };
      const properties = [];
      if (scrollbarWidth > 0) {
        if (access(defaultedProps.preventScrollbarShiftMode) === "padding") {
          style2.paddingRight = `calc(${window.getComputedStyle(body).paddingRight} + ${scrollbarWidth}px)`;
        } else {
          style2.marginRight = `calc(${window.getComputedStyle(body).marginRight} + ${scrollbarWidth}px)`;
        }
        properties.push({
          key: "--scrollbar-width",
          value: `${scrollbarWidth}px`
        });
      }
      const offsetTop = window.scrollY;
      const offsetLeft = window.scrollX;
      style_default({
        key: "prevent-scroll",
        element: body,
        style: style2,
        properties,
        cleanup: () => {
          if (access(defaultedProps.restoreScrollPosition) && scrollbarWidth > 0) {
            window.scrollTo(offsetLeft, offsetTop);
          }
        }
      });
    } else {
      style_default({
        key: "prevent-scroll",
        element: body,
        style: {
          overflow: "hidden"
        }
      });
    }
  });
  createEffect(() => {
    if (!isActive(preventScrollId) || !access(defaultedProps.enabled)) return;
    document.addEventListener("wheel", maybePreventWheel, {
      passive: false
    });
    document.addEventListener("touchstart", logTouchStart, {
      passive: false
    });
    document.addEventListener("touchmove", maybePreventTouch, {
      passive: false
    });
    onCleanup(() => {
      document.removeEventListener("wheel", maybePreventWheel);
      document.removeEventListener("touchstart", logTouchStart);
      document.removeEventListener("touchmove", maybePreventTouch);
    });
  });
  const logTouchStart = (event) => {
    currentTouchStart = getTouchXY(event);
    currentTouchStartAxis = null;
    currentTouchStartDelta = null;
  };
  const maybePreventWheel = (event) => {
    const target = event.target;
    const wrapper = access(defaultedProps.element);
    const delta = getDeltaXY(event);
    const axis = Math.abs(delta[0]) > Math.abs(delta[1]) ? "x" : "y";
    const axisDelta = axis === "x" ? delta[0] : delta[1];
    const resultsInScroll = wouldScroll(target, axis, axisDelta, wrapper);
    let shouldCancel;
    if (wrapper && contains(wrapper, target)) {
      shouldCancel = !resultsInScroll;
    } else {
      shouldCancel = true;
    }
    if (shouldCancel && event.cancelable) {
      event.preventDefault();
    }
  };
  const maybePreventTouch = (event) => {
    const wrapper = access(defaultedProps.element);
    const target = event.target;
    let shouldCancel;
    if (event.touches.length === 2) {
      shouldCancel = !access(defaultedProps.allowPinchZoom);
    } else {
      if (currentTouchStartAxis == null || currentTouchStartDelta === null) {
        const delta = getTouchXY(event).map((touch, i) => currentTouchStart[i] - touch);
        const axis = Math.abs(delta[0]) > Math.abs(delta[1]) ? "x" : "y";
        currentTouchStartAxis = axis;
        currentTouchStartDelta = axis === "x" ? delta[0] : delta[1];
      }
      if (target.type === "range") {
        shouldCancel = false;
      } else {
        const wouldResultInScroll = wouldScroll(target, currentTouchStartAxis, currentTouchStartDelta, wrapper);
        if (wrapper && contains(wrapper, target)) {
          shouldCancel = !wouldResultInScroll;
        } else {
          shouldCancel = true;
        }
      }
    }
    if (shouldCancel && event.cancelable) {
      event.preventDefault();
    }
  };
};
var getDeltaXY = (event) => [event.deltaX, event.deltaY];
var getTouchXY = (event) => event.changedTouches[0] ? [event.changedTouches[0].clientX, event.changedTouches[0].clientY] : [0, 0];
var wouldScroll = (target, axis, delta, wrapper) => {
  const targetInWrapper = wrapper !== null && contains(wrapper, target);
  const [availableScroll, availableScrollTop] = getScrollAtLocation(target, axis, targetInWrapper ? wrapper : void 0);
  if (delta > 0 && Math.abs(availableScroll) <= 1) {
    return false;
  }
  if (delta < 0 && Math.abs(availableScrollTop) < 1) {
    return false;
  }
  return true;
};
var contains = (wrapper, target) => {
  if (wrapper.contains(target)) return true;
  let currentElement = target;
  while (currentElement) {
    if (currentElement === wrapper) return true;
    currentElement = currentElement._$host ?? currentElement.parentElement;
  }
  return false;
};
var preventScroll_default = createPreventScroll;
var src_default$1 = preventScroll_default;
var createPresence = (props) => {
  const refStyles = createMemo(() => {
    const element = access(props.element);
    if (!element) return;
    return getComputedStyle(element);
  });
  const getAnimationName = () => {
    var _a;
    return ((_a = refStyles()) == null ? void 0 : _a.animationName) ?? "none";
  };
  const [presentState, setPresentState] = createSignal(access(props.show) ? "present" : "hidden");
  let animationName = "none";
  createEffect((prevShow) => {
    const show = access(props.show);
    untrack(() => {
      var _a;
      if (prevShow === show) return show;
      const prevAnimationName = animationName;
      const currentAnimationName = getAnimationName();
      if (show) {
        setPresentState("present");
      } else if (currentAnimationName === "none" || ((_a = refStyles()) == null ? void 0 : _a.display) === "none") {
        setPresentState("hidden");
      } else {
        const isAnimating = prevAnimationName !== currentAnimationName;
        if (prevShow === true && isAnimating) {
          setPresentState("hiding");
        } else {
          setPresentState("hidden");
        }
      }
    });
    return show;
  });
  createEffect(() => {
    const element = access(props.element);
    if (!element) return;
    const handleAnimationStart = (event) => {
      if (event.target === element) {
        animationName = getAnimationName();
      }
    };
    const handleAnimationEnd = (event) => {
      const currentAnimationName = getAnimationName();
      const isCurrentAnimation = currentAnimationName.includes(event.animationName);
      if (event.target === element && isCurrentAnimation && presentState() === "hiding") {
        setPresentState("hidden");
      }
    };
    element.addEventListener("animationstart", handleAnimationStart);
    element.addEventListener("animationcancel", handleAnimationEnd);
    element.addEventListener("animationend", handleAnimationEnd);
    onCleanup(() => {
      element.removeEventListener("animationstart", handleAnimationStart);
      element.removeEventListener("animationcancel", handleAnimationEnd);
      element.removeEventListener("animationend", handleAnimationEnd);
    });
  });
  return {
    present: () => presentState() === "present" || presentState() === "hiding",
    state: presentState
  };
};
var presence_default = createPresence;
var src_default = presence_default;
var dialog_exports = {};
__export(dialog_exports, {
  CloseButton: () => DialogCloseButton,
  Content: () => DialogContent$1,
  Description: () => DialogDescription$1,
  Dialog: () => Dialog$1,
  Overlay: () => DialogOverlay,
  Portal: () => DialogPortal,
  Root: () => DialogRoot,
  Title: () => DialogTitle$1,
  Trigger: () => DialogTrigger$1
});
var DialogContext = createContext();
function useDialogContext() {
  const context = useContext(DialogContext);
  if (context === void 0) {
    throw new Error("[kobalte]: `useDialogContext` must be used within a `Dialog` component");
  }
  return context;
}
function DialogCloseButton(props) {
  const context = useDialogContext();
  const [local, others] = splitProps(props, ["aria-label", "onClick"]);
  const onClick = (e) => {
    callHandler(e, local.onClick);
    context.close();
  };
  return createComponent(ButtonRoot, mergeProps({
    get ["aria-label"]() {
      return local["aria-label"] || context.translations().dismiss;
    },
    onClick
  }, others));
}
function DialogContent$1(props) {
  let ref;
  const context = useDialogContext();
  const mergedProps = mergeDefaultProps({
    id: context.generateId("content")
  }, props);
  const [local, others] = splitProps(mergedProps, ["ref", "onOpenAutoFocus", "onCloseAutoFocus", "onPointerDownOutside", "onFocusOutside", "onInteractOutside"]);
  let hasInteractedOutside = false;
  let hasPointerDownOutside = false;
  const onPointerDownOutside = (e) => {
    var _a;
    (_a = local.onPointerDownOutside) == null ? void 0 : _a.call(local, e);
    if (context.modal() && e.detail.isContextMenu) {
      e.preventDefault();
    }
  };
  const onFocusOutside = (e) => {
    var _a;
    (_a = local.onFocusOutside) == null ? void 0 : _a.call(local, e);
    if (context.modal()) {
      e.preventDefault();
    }
  };
  const onInteractOutside = (e) => {
    var _a;
    (_a = local.onInteractOutside) == null ? void 0 : _a.call(local, e);
    if (context.modal()) {
      return;
    }
    if (!e.defaultPrevented) {
      hasInteractedOutside = true;
      if (e.detail.originalEvent.type === "pointerdown") {
        hasPointerDownOutside = true;
      }
    }
    if (contains$1(context.triggerRef(), e.target)) {
      e.preventDefault();
    }
    if (e.detail.originalEvent.type === "focusin" && hasPointerDownOutside) {
      e.preventDefault();
    }
  };
  const onCloseAutoFocus = (e) => {
    var _a;
    (_a = local.onCloseAutoFocus) == null ? void 0 : _a.call(local, e);
    if (context.modal()) {
      e.preventDefault();
      focusWithoutScrolling(context.triggerRef());
    } else {
      if (!e.defaultPrevented) {
        if (!hasInteractedOutside) {
          focusWithoutScrolling(context.triggerRef());
        }
        e.preventDefault();
      }
      hasInteractedOutside = false;
      hasPointerDownOutside = false;
    }
  };
  createHideOutside({
    isDisabled: () => !(context.isOpen() && context.modal()),
    targets: () => ref ? [ref] : []
  });
  src_default$1({
    element: () => ref ?? null,
    enabled: () => context.isOpen() && context.preventScroll()
  });
  createFocusScope({
    trapFocus: () => context.isOpen() && context.modal(),
    onMountAutoFocus: local.onOpenAutoFocus,
    onUnmountAutoFocus: onCloseAutoFocus
  }, () => ref);
  createEffect(() => onCleanup(context.registerContentId(others.id)));
  return createComponent(Show, {
    get when() {
      return context.contentPresent();
    },
    get children() {
      return createComponent(DismissableLayer, mergeProps({
        ref(r$) {
          var _ref$ = mergeRefs((el) => {
            context.setContentRef(el);
            ref = el;
          }, local.ref);
          typeof _ref$ === "function" && _ref$(r$);
        },
        role: "dialog",
        tabIndex: -1,
        get disableOutsidePointerEvents() {
          return createMemo(() => !!context.modal())() && context.isOpen();
        },
        get excludedElements() {
          return [context.triggerRef];
        },
        get ["aria-labelledby"]() {
          return context.titleId();
        },
        get ["aria-describedby"]() {
          return context.descriptionId();
        },
        get ["data-expanded"]() {
          return context.isOpen() ? "" : void 0;
        },
        get ["data-closed"]() {
          return !context.isOpen() ? "" : void 0;
        },
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        get onDismiss() {
          return context.close;
        }
      }, others));
    }
  });
}
function DialogDescription$1(props) {
  const context = useDialogContext();
  const mergedProps = mergeDefaultProps({
    id: context.generateId("description")
  }, props);
  const [local, others] = splitProps(mergedProps, ["id"]);
  createEffect(() => onCleanup(context.registerDescriptionId(local.id)));
  return createComponent(Polymorphic, mergeProps({
    as: "p",
    get id() {
      return local.id;
    }
  }, others));
}
function DialogOverlay(props) {
  const context = useDialogContext();
  const [local, others] = splitProps(props, ["ref", "style", "onPointerDown"]);
  const onPointerDown = (e) => {
    callHandler(e, local.onPointerDown);
    if (e.target === e.currentTarget) {
      e.preventDefault();
    }
  };
  return createComponent(Show, {
    get when() {
      return context.overlayPresent();
    },
    get children() {
      return createComponent(Polymorphic, mergeProps({
        as: "div",
        ref(r$) {
          var _ref$2 = mergeRefs(context.setOverlayRef, local.ref);
          typeof _ref$2 === "function" && _ref$2(r$);
        },
        get style() {
          return {
            "pointer-events": "auto",
            ...local.style
          };
        },
        get ["data-expanded"]() {
          return context.isOpen() ? "" : void 0;
        },
        get ["data-closed"]() {
          return !context.isOpen() ? "" : void 0;
        },
        onPointerDown
      }, others));
    }
  });
}
function DialogPortal(props) {
  const context = useDialogContext();
  return createComponent(Show, {
    get when() {
      return context.contentPresent() || context.overlayPresent();
    },
    get children() {
      return createComponent(Portal, props);
    }
  });
}
var DIALOG_INTL_TRANSLATIONS = {
  // `aria-label` of Dialog.CloseButton.
  dismiss: "Dismiss"
};
function DialogRoot(props) {
  const defaultId = `dialog-${createUniqueId()}`;
  const mergedProps = mergeDefaultProps({
    id: defaultId,
    modal: true,
    translations: DIALOG_INTL_TRANSLATIONS
  }, props);
  const [contentId, setContentId] = createSignal();
  const [titleId, setTitleId] = createSignal();
  const [descriptionId, setDescriptionId] = createSignal();
  const [overlayRef, setOverlayRef] = createSignal();
  const [contentRef, setContentRef] = createSignal();
  const [triggerRef, setTriggerRef] = createSignal();
  const disclosureState = createDisclosureState({
    open: () => mergedProps.open,
    defaultOpen: () => mergedProps.defaultOpen,
    onOpenChange: (isOpen) => {
      var _a;
      return (_a = mergedProps.onOpenChange) == null ? void 0 : _a.call(mergedProps, isOpen);
    }
  });
  const shouldMount = () => mergedProps.forceMount || disclosureState.isOpen();
  const {
    present: overlayPresent
  } = src_default({
    show: shouldMount,
    element: () => overlayRef() ?? null
  });
  const {
    present: contentPresent
  } = src_default({
    show: shouldMount,
    element: () => contentRef() ?? null
  });
  const context = {
    translations: () => mergedProps.translations ?? DIALOG_INTL_TRANSLATIONS,
    isOpen: disclosureState.isOpen,
    modal: () => mergedProps.modal ?? true,
    preventScroll: () => mergedProps.preventScroll ?? context.modal(),
    contentId,
    titleId,
    descriptionId,
    triggerRef,
    overlayRef,
    setOverlayRef,
    contentRef,
    setContentRef,
    overlayPresent,
    contentPresent,
    close: disclosureState.close,
    toggle: disclosureState.toggle,
    setTriggerRef,
    generateId: createGenerateId(() => mergedProps.id),
    registerContentId: createRegisterId(setContentId),
    registerTitleId: createRegisterId(setTitleId),
    registerDescriptionId: createRegisterId(setDescriptionId)
  };
  return createComponent(DialogContext.Provider, {
    value: context,
    get children() {
      return mergedProps.children;
    }
  });
}
function DialogTitle$1(props) {
  const context = useDialogContext();
  const mergedProps = mergeDefaultProps({
    id: context.generateId("title")
  }, props);
  const [local, others] = splitProps(mergedProps, ["id"]);
  createEffect(() => onCleanup(context.registerTitleId(local.id)));
  return createComponent(Polymorphic, mergeProps({
    as: "h2",
    get id() {
      return local.id;
    }
  }, others));
}
function DialogTrigger$1(props) {
  const context = useDialogContext();
  const [local, others] = splitProps(props, ["ref", "onClick"]);
  const onClick = (e) => {
    callHandler(e, local.onClick);
    context.toggle();
  };
  return createComponent(ButtonRoot, mergeProps({
    ref(r$) {
      var _ref$3 = mergeRefs(context.setTriggerRef, local.ref);
      typeof _ref$3 === "function" && _ref$3(r$);
    },
    "aria-haspopup": "dialog",
    get ["aria-expanded"]() {
      return context.isOpen();
    },
    get ["aria-controls"]() {
      return createMemo(() => !!context.isOpen())() ? context.contentId() : void 0;
    },
    get ["data-expanded"]() {
      return context.isOpen() ? "" : void 0;
    },
    get ["data-closed"]() {
      return !context.isOpen() ? "" : void 0;
    },
    onClick
  }, others));
}
var Dialog$1 = Object.assign(DialogRoot, {
  CloseButton: DialogCloseButton,
  Content: DialogContent$1,
  Description: DialogDescription$1,
  Overlay: DialogOverlay,
  Portal: DialogPortal,
  Title: DialogTitle$1,
  Trigger: DialogTrigger$1
});
const buttonVariants = {
  default: "inline-flex h-[var(--input-height)] cursor-[var(--cursor)] select-none items-center justify-center whitespace-nowrap rounded-button border-0 p-button text-[length:var(--font-ui-small)] font-[var(--input-font-weight)] text-normal outline-none bg-interactive-normal hover:bg-interactive-hover shadow-['var(--input-shadow)']",
  ghost: "bg-transparent shadow-none",
  // TODO find better width here
  outline: "bg-transparent shadow-none border-border border-[length:var(--prompt-border-width)]",
  accent: "bg-interactive-accent text-on-accent hover:bg-interactive-accent-hover hover:text-accent-hover",
  destructive: "bg-error hover:bg-error hover:opacity-70 text-on-error"
};
var _tmpl$$8 = /* @__PURE__ */ template(`<svg xmlns=http://www.w3.org/2000/svg viewBox="0 0 24 24"class="h-4 w-4"><path fill=none stroke=currentColor stroke-linecap=round stroke-linejoin=round stroke-width=2 d="M18 6L6 18M6 6l12 12">`), _tmpl$2$7 = /* @__PURE__ */ template(`<div class=twcss>`), _tmpl$3$5 = /* @__PURE__ */ template(`<div>`);
const Dialog = Dialog$1;
const DialogTrigger = Dialog$1.Trigger;
const DialogClose = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return createComponent(Dialog$1.CloseButton, mergeProps(rest, {
    get ["class"]() {
      return cn(buttonVariants.default, local.class);
    }
  }));
};
const DialogCloseX = () => createComponent(Dialog$1.CloseButton, {
  "class": "clickable-icon absolute right-4 top-4 rounded-sm p-1 opacity-70 ring-offset-background transition-[opacity,box-shadow] hover:opacity-100 focus:outline-none focus:ring-[1.5px] focus:ring-selection focus:ring-offset-2 disabled:pointer-events-none",
  get children() {
    return _tmpl$$8();
  }
});
const DialogContent = (props) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return createComponent(Dialog$1.Portal, {
    get children() {
      var _el$2 = _tmpl$2$7();
      insert(_el$2, createComponent(Dialog$1.Overlay, mergeProps({
        get ["class"]() {
          return cn("modal-bg z-50 opacity-85");
        }
      }, rest)), null);
      insert(_el$2, createComponent(Dialog$1.Content, mergeProps({
        get ["class"]() {
          return cn("prompt left-1/2 z-50 w-full -translate-x-1/2 gap-4 border-[length:var(--prompt-border-width)] border-modal p-6", local.class);
        }
      }, rest, {
        get children() {
          return [createMemo(() => local.children), createComponent(DialogCloseX, {})];
        }
      })), null);
      return _el$2;
    }
  });
};
const DialogTitle = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return createComponent(Dialog$1.Title, mergeProps({
    get ["class"]() {
      return cn("text-foreground text-lg font-semibold", local.class);
    }
  }, rest));
};
const DialogDescription = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return createComponent(Dialog$1.Description, mergeProps({
    get ["class"]() {
      return cn("text-muted-foreground text-sm", local.class);
    }
  }, rest));
};
const DialogHeader = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return (() => {
    var _el$3 = _tmpl$3$5();
    spread(_el$3, mergeProps({
      get ["class"]() {
        return cn("flex flex-col space-y-2 text-center sm:text-left", local.class);
      }
    }, rest), false, false);
    return _el$3;
  })();
};
const DialogFooter = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return (() => {
    var _el$4 = _tmpl$3$5();
    spread(_el$4, mergeProps({
      get ["class"]() {
        return cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", local.class);
      }
    }, rest), false, false);
    return _el$4;
  })();
};
var _tmpl$$7 = /* @__PURE__ */ template(`<span class=cm-link><a>`), _tmpl$2$6 = /* @__PURE__ */ template(`<span class=external-link>`);
const ExternalLink = (props) => [(() => {
  var _el$ = _tmpl$$7(), _el$2 = _el$.firstChild;
  spread(_el$2, mergeProps(props, {
    "class": "text-accent underline hover:text-accent-hover"
  }), false, false);
  return _el$;
})(), _tmpl$2$6()];
var iconNode$2 = [["path", {
  d: "M5 12h14",
  key: "1ays0h"
}]];
var Minus = (props) => createComponent(Icon_default, mergeProps(props, {
  name: "Minus",
  iconNode: iconNode$2
}));
var minus_default = Minus;
var iconNode$1 = [["path", {
  d: "M8 21s-4-3-4-9 4-9 4-9",
  key: "uto9ud"
}], ["path", {
  d: "M16 3s4 3 4 9-4 9-4 9",
  key: "4w2vsq"
}]];
var Parentheses = (props) => createComponent(Icon_default, mergeProps(props, {
  name: "Parentheses",
  iconNode: iconNode$1
}));
var parentheses_default = Parentheses;
var _tmpl$$6 = /* @__PURE__ */ template(`<input autofocus class="h-auto rounded-none border-none bg-transparent p-0 !shadow-none"type=number>`), _tmpl$2$5 = /* @__PURE__ */ template(`<div class="flex w-full items-center gap-1"><button class="clickable-icon size-fit p-1"></button><button class="clickable-icon size-fit p-1">`), _tmpl$3$4 = /* @__PURE__ */ template(`<br>`), _tmpl$4$2 = /* @__PURE__ */ template(`<code>x`), _tmpl$5$2 = /* @__PURE__ */ template(`<input autofocus class="border-border px-1"type=text placeholder="x + 2 / x * 3">`), _tmpl$6$1 = /* @__PURE__ */ template(`<span class=text-error>error`), _tmpl$7 = /* @__PURE__ */ template(`<p><span>Calculated:&nbsp;`), _tmpl$8 = /* @__PURE__ */ template(`<button class="rounded-button bg-interactive-accent p-button text-on-accent hover:bg-interactive-accent-hover">update`), _tmpl$9 = /* @__PURE__ */ template(`<span class=text-success>`);
const NumberInput = (props) => {
  var _a;
  const [size, setSize] = createSignal(((_a = props.value) == null ? void 0 : _a.toString().length) ?? 5);
  const {
    plugin
  } = props.codeBlockInfo;
  return (() => {
    var _el$ = _tmpl$$6();
    _el$.$$input = (e) => {
      setSize(e.target.value.length);
    };
    _el$.addEventListener("blur", async (e) => {
      await updateMetadataProperty(props.property, toNumber(e.target.value), props.filePath, plugin, props.value);
      props.setEditing(false);
    });
    use(autofocus, _el$, () => true);
    createRenderEffect(() => setAttribute(_el$, "size", size()));
    createRenderEffect(() => {
      var _a2;
      return _el$.value = ((_a2 = props.value) == null ? void 0 : _a2.toString()) ?? "";
    });
    return _el$;
  })();
};
const NumberButtons = (props) => (() => {
  var _el$2 = _tmpl$2$5(), _el$3 = _el$2.firstChild, _el$4 = _el$3.nextSibling;
  _el$3.$$click = async (e) => {
    e.preventDefault();
    await updateMetadataProperty(props.property, props.value - 1, props.filePath, props.plugin, props.value);
  };
  insert(_el$3, createComponent(minus_default, {
    "class": "pointer-events-none size-3"
  }));
  insert(_el$2, createComponent(NumberExpressionButton, props), _el$4);
  _el$4.$$click = async (e) => {
    e.preventDefault();
    await updateMetadataProperty(props.property, props.value + 1, props.filePath, props.plugin, props.value);
  };
  insert(_el$4, createComponent(plus_default, {
    "class": "pointer-events-none size-3"
  }));
  return _el$2;
})();
const NumberExpressionButton = (props) => {
  const [isOpen, setOpen] = createSignal(false);
  const [calculated, setCalculated] = createSignal(Number(props.value));
  const updateProperty = async (v) => {
    await updateMetadataProperty(props.property, v, props.filePath, props.plugin, props.value);
  };
  return createComponent(Dialog, {
    modal: true,
    get open() {
      return isOpen();
    },
    onOpenChange: (b) => setOpen(b),
    get children() {
      return [createComponent(DialogTrigger, {
        "class": "clickable-icon size-fit p-1",
        get children() {
          return createComponent(parentheses_default, {
            "class": "pointer-events-none size-3"
          });
        }
      }), createComponent(DialogContent, {
        get children() {
          return [createComponent(DialogHeader, {
            get children() {
              return [createComponent(DialogTitle, {
                children: "Update by expression"
              }), createComponent(DialogDescription, {
                get children() {
                  return ["Enter a valid", " ", createComponent(ExternalLink, {
                    href: "https://blacksmithgu.github.io/obsidian-dataview/reference/expressions/",
                    children: "Dataview mathematical expression"
                  }), _tmpl$3$4(), "You can use ", _tmpl$4$2(), " as the current value."];
                }
              })];
            }
          }), (() => {
            var _el$7 = _tmpl$5$2();
            _el$7.$$input = async (e) => {
              const exp = e.target.value.replaceAll("x", props.value.toString()).trim();
              const result = (
                // @ts-expect-error
                await app.plugins.plugins.dataview.api.evaluate(exp)
              );
              setCalculated(() => {
                if (result.successful) return Number(result.value);
                return NaN;
              });
            };
            _el$7.$$keydown = async (e) => {
              if (e.key === "Enter" && !Number.isNaN(calculated())) {
                await updateProperty(calculated());
                setOpen(false);
              }
            };
            use(autofocus, _el$7, () => true);
            return _el$7;
          })(), (() => {
            var _el$8 = _tmpl$7();
            _el$8.firstChild;
            insert(_el$8, createComponent(Show, {
              get when() {
                return Number.isNaN(calculated());
              },
              get fallback() {
                return (() => {
                  var _el$12 = _tmpl$9();
                  insert(_el$12, calculated);
                  return _el$12;
                })();
              },
              get children() {
                return _tmpl$6$1();
              }
            }), null);
            return _el$8;
          })(), createComponent(DialogFooter, {
            get children() {
              var _el$11 = _tmpl$8();
              _el$11.$$click = async () => {
                await updateProperty(calculated());
                setOpen(false);
              };
              createRenderEffect(() => _el$11.disabled = Number.isNaN(calculated()));
              return _el$11;
            }
          })];
        }
      })];
    }
  });
};
delegateEvents(["input", "click", "keydown"]);
var _tmpl$$5 = /* @__PURE__ */ template(`<td class="whitespace-normal text-nowrap"tabindex=0>`), _tmpl$2$4 = /* @__PURE__ */ template(`<div>`), _tmpl$3$3 = /* @__PURE__ */ template(`<div class=size-full>`);
const TableData = (props) => {
  const [isEditing, setEditing] = createSignal(false);
  const {
    plugin,
    dataviewAPI: {
      settings: {
        tableIdColumnName
      },
      luxon
    },
    config
  } = props.codeBlockInfo;
  const valueType = createMemo(() => {
    return getValueType(props.value, props.header, luxon);
  });
  const isEditableProperty = (property) => {
    const str = (property ?? "").toLowerCase();
    if (str === COMPLEX_PROPERTY_PLACEHOLDER.toLowerCase()) return false;
    if (str === tableIdColumnName.toLowerCase()) return false;
    if (str.includes("file.")) return false;
    return true;
  };
  return (() => {
    var _el$ = _tmpl$$5();
    addEventListener(_el$, "mousemove", props.onMouseMove, true);
    _el$.$$click = (e) => {
      if (e.target.tagName.toLowerCase() === "button") return;
      if (valueType() === "list") return;
      setEditing(true);
    };
    insert(_el$, createComponent(Show, {
      get when() {
        return valueType() !== "list";
      },
      get fallback() {
        return createComponent(ListTableDataWrapper, props);
      },
      get children() {
        return [createComponent(Show, {
          get when() {
            return createMemo(() => !!(!config.lockEditing && isEditing()))() && isEditableProperty(props.property);
          },
          get fallback() {
            return (() => {
              var _el$2 = _tmpl$2$4();
              addEventListener(_el$2, "click", isEditableProperty(props.property) ? void 0 : config.lockEditing ? void 0 : () => new obsidian.Notice("This is a calculated property, so you can't edit it!"), true);
              insert(_el$2, createComponent(TableDataDisplay, mergeProps(props, {
                setEditing,
                get valueType() {
                  return valueType();
                }
              })));
              return _el$2;
            })();
          },
          get children() {
            return createComponent(TableDataEdit, mergeProps(props, {
              setEditing,
              get valueType() {
                return valueType();
              }
            }));
          }
        }), createComponent(Show, {
          get when() {
            return valueType() === "number" && isEditableProperty(props.property) && !config.lockEditing;
          },
          get children() {
            return createComponent(NumberButtons, mergeProps(props, {
              plugin
            }));
          }
        })];
      }
    }));
    createRenderEffect((_$p) => style(_el$, props.style, _$p));
    return _el$;
  })();
};
const TableDataDisplay = (props) => {
  const {
    plugin,
    ctx,
    dataviewAPI: {
      settings: {
        defaultDateFormat,
        defaultDateTimeFormat
      }
    }
  } = props.codeBlockInfo;
  return [createComponent(Show, {
    get when() {
      return props.valueType === "text" || props.valueType === "number";
    },
    get children() {
      return createComponent(Markdown, {
        "class": "size-full",
        get app() {
          return plugin.app;
        },
        get markdown() {
          return tryDataviewLinkToMarkdown(props.value);
        },
        get sourcePath() {
          return ctx.sourcePath;
        }
      });
    }
  }), createComponent(Show, {
    get when() {
      return props.valueType === "checkbox";
    },
    get children() {
      return createComponent(CheckboxInput, props);
    }
  }), createComponent(Show, {
    get when() {
      return props.valueType === "date" || props.valueType === "datetime";
    },
    get children() {
      var _el$3 = _tmpl$3$3();
      insert(_el$3, () => props.value.toFormat(checkIfDateHasTime(props.value) ? defaultDateTimeFormat : defaultDateFormat));
      return _el$3;
    }
  })];
};
const TableDataEdit = (props) => {
  return [createComponent(Show, {
    get when() {
      return props.valueType === "text";
    },
    get children() {
      return createComponent(TextInput, props);
    }
  }), createComponent(Show, {
    get when() {
      return props.valueType === "number";
    },
    get children() {
      return createComponent(NumberInput, props);
    }
  }), createComponent(Show, {
    get when() {
      return props.valueType === "date" || props.valueType === "datetime";
    },
    get children() {
      return createComponent(DateDatetimeInput, props);
    }
  })];
};
delegateEvents(["click", "mousemove"]);
var _tmpl$$4 = /* @__PURE__ */ template(`<tbody>`), _tmpl$2$3 = /* @__PURE__ */ template(`<tr>`);
const highlightStyle = {
  "border-left-width": "2px",
  "border-right-width": "2px",
  "border-left-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
  "border-right-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
  "background-color": `hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 10%)`
};
const draggedOverRight = {
  "border-right-width": "2px",
  "border-right-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))"
};
const draggedOverLeft = {
  "border-left-width": "2px",
  "border-left-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))"
};
const lastCellHighlight = {
  "border-bottom-width": "2px",
  "border-bottom-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))"
};
const TableBody = (props) => {
  const {
    dataviewAPI: {
      settings: {
        tableIdColumnName
      }
    }
  } = props.codeBlockInfo;
  return (() => {
    var _el$ = _tmpl$$4();
    insert(_el$, createComponent(For, {
      get each() {
        return props.rows;
      },
      children: (row, rowIndex) => (() => {
        var _el$2 = _tmpl$2$3();
        insert(_el$2, createComponent(For, {
          each: row,
          children: (value, valueIndex) => createComponent(TableData, {
            value,
            get header() {
              return props.headers[valueIndex()];
            },
            get property() {
              return props.properties[valueIndex()];
            },
            get filePath() {
              return row[getIdColumnIndex(props.headers, tableIdColumnName)].path ?? "";
            },
            onMouseMove: () => {
              if (props.highlightIndex === -1) return;
              props.setDraggedOverIndex(valueIndex());
            },
            get style() {
              return createMemo(() => valueIndex() === props.highlightIndex)() ? rowIndex() === props.rows.length - 1 ? {
                ...highlightStyle,
                ...lastCellHighlight
              } : highlightStyle : createMemo(() => valueIndex() === props.draggedOverIndex)() ? props.highlightIndex < valueIndex() ? draggedOverRight : draggedOverLeft : {};
            },
            get codeBlockInfo() {
              return props.codeBlockInfo;
            }
          })
        }));
        return _el$2;
      })()
    }));
    return _el$;
  })();
};
var iconNode = [["circle", {
  cx: "12",
  cy: "9",
  r: "1",
  key: "124mty"
}], ["circle", {
  cx: "19",
  cy: "9",
  r: "1",
  key: "1ruzo2"
}], ["circle", {
  cx: "5",
  cy: "9",
  r: "1",
  key: "1a8b28"
}], ["circle", {
  cx: "12",
  cy: "15",
  r: "1",
  key: "1e56xg"
}], ["circle", {
  cx: "19",
  cy: "15",
  r: "1",
  key: "1a92ep"
}], ["circle", {
  cx: "5",
  cy: "15",
  r: "1",
  key: "5r1jwy"
}]];
var GripHorizontal = (props) => createComponent(Icon_default, mergeProps(props, {
  name: "GripHorizontal",
  iconNode
}));
var grip_horizontal_default = GripHorizontal;
var _tmpl$$3 = /* @__PURE__ */ template(`<thead><tr></tr><tr>`), _tmpl$2$2 = /* @__PURE__ */ template(`<th><div aria-roledescription=column-drag-handle class="flex size-full items-end justify-center">`), _tmpl$3$2 = /* @__PURE__ */ template(`<th class="relative text-nowrap">`);
const TableHead = (props) => {
  const [translateX, setTranslateX] = createSignal(0);
  let lastMousePos = 0;
  const onMouseMove = (e) => {
    if (props.highlightIndex === -1) return;
    setTranslateX(() => e.clientX - lastMousePos);
  };
  const onMouseUp = async () => {
    if (props.draggedOverIndex !== -1 && props.draggedOverIndex !== props.highlightIndex) {
      const {
        plugin,
        ctx,
        el,
        query,
        dataviewAPI: {
          settings: {
            tableIdColumnName
          }
        }
      } = props.codeBlockInfo;
      const {
        app: {
          vault
        }
      } = plugin;
      const sectionInfo = ctx.getSectionInfo(el);
      if (!sectionInfo) {
        throw new Error("This should be impossible");
      }
      const {
        lineStart,
        text: content
      } = sectionInfo;
      const file = vault.getFileByPath(ctx.sourcePath);
      if (!file) {
        throw new Error("This should be impossible");
      }
      const lines = content.split("\n");
      const {
        line: preTableLine,
        index
      } = getTableLine(query);
      const tableLineIndex = lineStart + index + 1;
      const isWithoutId = new RegExp(/TABLE\s+WITHOUT\s+ID/gim).test(preTableLine);
      const isDraggingDefaultId = (
        // if query has 'WITHOUT ID' we don't care
        !isWithoutId && // default id col is always first
        props.highlightIndex === 0 && // the header will always be the name from dataview settings
        props.headers[props.highlightIndex] === tableIdColumnName
      );
      const isDraggedOverDefaultId = !isWithoutId && props.draggedOverIndex === 0 && props.headers[props.draggedOverIndex] === tableIdColumnName;
      const isRelatingToDefaultId = isDraggingDefaultId || isDraggedOverDefaultId;
      const tableLine = isRelatingToDefaultId ? (
        // to 'move' the default id col, we have to modify the query to have this and a file.link col
        preTableLine.replace(/table/i, "TABLE WITHOUT ID")
      ) : preTableLine;
      const tableKeyword = tableLine.slice(0, isWithoutId || isRelatingToDefaultId ? 16 : 5).trim();
      const preCols = tableLine.slice(isWithoutId || isRelatingToDefaultId ? 17 : 6).split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) => c.trim());
      const cols = isRelatingToDefaultId ? (
        // this is how we allow the default id col to be 'moved'
        ["file.link AS " + tableIdColumnName, ...preCols]
      ) : preCols;
      const highlightIndex = props.highlightIndex - (isWithoutId || isRelatingToDefaultId ? 0 : 1);
      const draggedIndex = props.draggedOverIndex - (isWithoutId || isRelatingToDefaultId ? 0 : 1);
      const colsWithoutHighlight = cols.toSpliced(highlightIndex, 1);
      const newCols = colsWithoutHighlight.toSpliced(draggedIndex, 0, cols[highlightIndex]);
      lines[tableLineIndex] = tableKeyword + " " + newCols.join(", ");
      const newContent = lines.join("\n");
      await vault.modify(file, newContent);
    }
    props.setHighlightIndex(-1);
    props.setDraggedOverIndex(-1);
    setTranslateX(0);
    lastMousePos = 0;
    window.removeEventListener("mousemove", onMouseMove);
  };
  window.addEventListener("mouseup", onMouseUp);
  onCleanup(() => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  });
  return (() => {
    var _el$ = _tmpl$$3(), _el$2 = _el$.firstChild, _el$3 = _el$2.nextSibling;
    insert(_el$2, createComponent(For, {
      get each() {
        return props.headers;
      },
      children: (_, index) => (() => {
        var _el$4 = _tmpl$2$2(), _el$5 = _el$4.firstChild;
        _el$4.$$mousemove = () => {
          if (props.highlightIndex === -1) return;
          props.setDraggedOverIndex(index());
        };
        _el$4.$$mousedown = (e) => {
          props.setHighlightIndex(index());
          setTranslateX(0);
          lastMousePos = e.clientX;
          window.addEventListener("mousemove", onMouseMove);
        };
        insert(_el$5, createComponent(grip_horizontal_default, {
          size: "1rem"
        }));
        createRenderEffect((_p$) => {
          var _v$ = `relative m-0 cursor-grab overflow-visible border-x-transparent border-t-transparent p-0 text-muted active:cursor-grabbing ${index() === props.highlightIndex ? "opacity-100" : "opacity-0"} ${props.highlightIndex === -1 ? "hover:opacity-100" : ""}`, _v$2 = index() === props.highlightIndex ? {
            background: "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
            "border-radius": "var(--radius-s) var(--radius-s) 0 0",
            translate: translateX() + "px 0",
            "pointer-events": "none"
          } : props.highlightIndex !== -1 ? {
            cursor: "grabbing"
          } : {};
          _v$ !== _p$.e && className(_el$4, _p$.e = _v$);
          _p$.t = style(_el$5, _v$2, _p$.t);
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        return _el$4;
      })()
    }));
    insert(_el$3, createComponent(For, {
      get each() {
        return props.headers;
      },
      children: (h, index) => (() => {
        var _el$6 = _tmpl$3$2();
        _el$6.$$mousemove = () => {
          if (props.highlightIndex === -1) return;
          props.setDraggedOverIndex(index());
        };
        insert(_el$6, createComponent(Markdown, {
          get app() {
            return props.codeBlockInfo.plugin.app;
          },
          markdown: h,
          get sourcePath() {
            return props.codeBlockInfo.ctx.sourcePath;
          }
        }));
        createRenderEffect((_$p) => style(_el$6, index() === props.highlightIndex ? {
          "border-top-width": "2px",
          "border-left-width": "2px",
          "border-right-width": "2px",
          "border-top-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
          "border-left-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
          "border-right-color": "hsl(var(--accent-h) var(--accent-s) var(--accent-l))",
          "background-color": `hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 10%)`
        } : props.highlightIndex !== -1 && index() === props.draggedOverIndex ? props.highlightIndex < index() ? draggedOverRight : draggedOverLeft : {}, _$p));
        return _el$6;
      })()
    }));
    return _el$;
  })();
};
delegateEvents(["mousedown", "mousemove"]);
var _tmpl$$2 = /* @__PURE__ */ template(`<div class="relative mb-4 mr-4 h-fit w-fit"><table></table><span aria-label="Add row after"class="absolute bottom-[-1rem] left-0 flex w-full cursor-ns-resize items-center justify-center rounded-[1px] border border-t-0 border-border opacity-0 hover:opacity-50">`), _tmpl$2$1 = /* @__PURE__ */ template(`<div><h2>Dataview error</h2><p>`), _tmpl$3$1 = /* @__PURE__ */ template(`<div class="flex w-full items-center justify-between"><label for=property-input>Property: </label><input autofocus name=property-input id=property-input type=text list=properties-datalist><datalist id=properties-datalist>`), _tmpl$4$1 = /* @__PURE__ */ template(`<div class="flex w-full items-center justify-between"><label for=alias-input>Alias (optional): </label><input name=alias-input id=alias-input type=text>`), _tmpl$5$1 = /* @__PURE__ */ template(`<div class=w-full><button class="float-right bg-interactive-accent p-button text-on-accent hover:bg-interactive-accent-hover hover:text-accent-hover disabled:cursor-not-allowed">add`), _tmpl$6 = /* @__PURE__ */ template(`<option>`);
const Table = (props) => {
  const [highlightIndex, setHighlightIndex] = createSignal(-1);
  const [draggedOverIndex, setDraggedOverIndex] = createSignal(-1);
  const [isAddColumnDialogOpen, setAddColumnDialogOpen] = createSignal(false);
  return createComponent(Show, {
    get when() {
      return props.queryResults.successful;
    },
    get fallback() {
      return createComponent(TableFallback, {
        get queryResults() {
          return props.queryResults;
        }
      });
    },
    get children() {
      var _el$ = _tmpl$$2(), _el$2 = _el$.firstChild, _el$3 = _el$2.nextSibling;
      insert(_el$2, createComponent(TableHead, {
        get headers() {
          return props.queryResults.value.headers;
        },
        get properties() {
          return props.queryResults.truePropertyNames;
        },
        get highlightIndex() {
          return highlightIndex();
        },
        setHighlightIndex,
        get draggedOverIndex() {
          return draggedOverIndex();
        },
        setDraggedOverIndex,
        get codeBlockInfo() {
          return props.codeBlockInfo;
        }
      }), null);
      insert(_el$2, createComponent(TableBody, {
        get headers() {
          return props.queryResults.value.headers;
        },
        get properties() {
          return props.queryResults.truePropertyNames;
        },
        get rows() {
          return props.queryResults.value.values;
        },
        get highlightIndex() {
          return highlightIndex();
        },
        setHighlightIndex,
        get draggedOverIndex() {
          return draggedOverIndex();
        },
        setDraggedOverIndex,
        get codeBlockInfo() {
          return props.codeBlockInfo;
        }
      }), null);
      insert(_el$, createComponent(AddColumnButton, {
        get open() {
          return isAddColumnDialogOpen();
        },
        setOpen: setAddColumnDialogOpen,
        get codeBlockInfo() {
          return props.codeBlockInfo;
        }
      }), _el$3);
      insert(_el$3, createComponent(plus_default, {
        size: "1rem"
      }));
      createRenderEffect((_$p) => style(_el$2, highlightIndex() !== -1 ? {
        "user-select": "none"
      } : {}, _$p));
      return _el$;
    }
  });
};
const TableFallback = (props) => {
  return (() => {
    var _el$4 = _tmpl$2$1(), _el$5 = _el$4.firstChild, _el$6 = _el$5.nextSibling;
    insert(_el$6, () => props.queryResults.error);
    return _el$4;
  })();
};
const AddColumnButton = (props) => {
  const {
    plugin: {
      app: app2
    },
    ctx,
    el,
    query
  } = props.codeBlockInfo;
  const sectionInfo = ctx.getSectionInfo(el);
  if (!sectionInfo) {
    throw new Error("This should be impossible");
  }
  const {
    lineStart,
    text
  } = sectionInfo;
  const [propertyValue, setPropertyValue] = createSignal("");
  const [aliasValue, setAliasValue] = createSignal("");
  const markdown = createMemo(() => {
    const prop = propertyValue().trim();
    const lines = ("```dataview\n" + query + "\n```").split("\n");
    if (!prop) return lines.join("\n");
    const alias = aliasValue();
    const aliasStr = alias ? " AS " + (alias.includes(" ") ? '"' + alias + '"' : alias) : "";
    const {
      index
    } = getTableLine(query);
    lines[index + 1] += ", " + prop + aliasStr;
    return lines.join("\n");
  });
  const addCol = async (markdown2) => {
    const {
      vault
    } = app2;
    const file = vault.getFileByPath(ctx.sourcePath);
    if (!file) {
      throw new Error("This should be impossible");
    }
    const content = text;
    const lines = content.split("\n");
    lines[lineStart + 1] = markdown2.split("\n")[1];
    const newContent = lines.join("\n");
    await vault.modify(file, newContent);
  };
  const properties = getExistingProperties(app2);
  const propertyNames = Object.keys(properties).sort();
  return createComponent(Dialog, {
    get open() {
      return props.open;
    },
    onOpenChange: (b) => props.setOpen(b),
    get children() {
      return [createComponent(DialogTrigger, {
        "aria-label": "Add column after",
        "class": "absolute right-[-1rem] top-[calc(1rem+var(--border-width))] m-0 flex size-fit h-[calc(100%-1rem-var(--border-width))] cursor-ew-resize items-center justify-center rounded-none border border-l-0 border-border bg-transparent p-0 opacity-0 shadow-none hover:opacity-50",
        get children() {
          return createComponent(plus_default, {
            size: "1rem"
          });
        }
      }), createComponent(DialogContent, {
        get children() {
          return [createComponent(DialogTitle, {
            children: "Add column"
          }), (() => {
            var _el$7 = _tmpl$3$1(), _el$8 = _el$7.firstChild, _el$9 = _el$8.nextSibling, _el$10 = _el$9.nextSibling;
            _el$9.$$input = (e) => setPropertyValue(e.target.value);
            use(autofocus, _el$9, () => true);
            insert(_el$10, createComponent(For, {
              each: propertyNames,
              children: (prop) => (() => {
                var _el$16 = _tmpl$6();
                _el$16.value = prop;
                insert(_el$16, () => properties[prop].type);
                return _el$16;
              })()
            }));
            createRenderEffect(() => _el$9.value = propertyValue());
            return _el$7;
          })(), (() => {
            var _el$11 = _tmpl$4$1(), _el$12 = _el$11.firstChild, _el$13 = _el$12.nextSibling;
            _el$13.$$input = (e) => setAliasValue(e.target.value);
            createRenderEffect(() => _el$13.value = aliasValue());
            return _el$11;
          })(), createComponent(Markdown, {
            app: app2,
            get markdown() {
              return markdown();
            },
            get sourcePath() {
              return ctx.sourcePath;
            }
          }), (() => {
            var _el$14 = _tmpl$5$1(), _el$15 = _el$14.firstChild;
            _el$15.$$click = async () => {
              await addCol(markdown());
              props.setOpen(false);
            };
            createRenderEffect(() => _el$15.disabled = !propertyValue());
            return _el$14;
          })()];
        }
      })];
    }
  });
};
delegateEvents(["input", "click"]);
var _tmpl$$1 = /* @__PURE__ */ template(`<div><input type=checkbox>`);
const Toggle = (props) => {
  const [local, rest] = splitProps(props, ["containerClass", "onCheckedChange"]);
  const [isChecked, setChecked] = createSignal(!!rest.checked);
  return (() => {
    var _el$ = _tmpl$$1(), _el$2 = _el$.firstChild;
    _el$.$$click = () => {
      setChecked((prev) => {
        if (local.onCheckedChange) local.onCheckedChange(!prev);
        return !prev;
      });
    };
    spread(_el$2, mergeProps(rest, {
      get checked() {
        return isChecked();
      }
    }), false, false);
    createRenderEffect(() => className(_el$, `checkbox-container ${isChecked() ? "is-enabled" : " "}`));
    return _el$;
  })();
};
delegateEvents(["click"]);
var _tmpl$ = /* @__PURE__ */ template(`<div class="h-fit w-full overflow-x-scroll">`), _tmpl$2 = /* @__PURE__ */ template(`<div class="flex items-center gap-2">`), _tmpl$3 = /* @__PURE__ */ template(`<div class=clickable-icon>`), _tmpl$4 = /* @__PURE__ */ template(`<div class="flex size-full max-h-[90%] flex-col gap-2 overflow-y-auto pr-2">`), _tmpl$5 = /* @__PURE__ */ template(`<div class="flex w-full items-center justify-between border-0 border-t-[1px] border-solid border-t-[var(--background-modifier-border)] pt-2"><div><div class=setting-item-name></div><div class=setting-item-description>`);
function App(props) {
  console.log("got source: ", props.source);
  const queryResults = createMemo(() => {
    props.queryResultStore[0];
    return props.queryResultStore[props.uid] ?? {
      successful: false,
      error: "init"
    };
  });
  createEffect(() => {
    console.log("eff source: ", props.source);
    console.log("eff: query results: ", queryResults());
  });
  createEffect(() => {
    props.queryResultStore[0];
    console.log("queryResultStore changed: ", props.queryResultStore);
  });
  const updateQueryResults = async () => {
    const truePropertyNames = getColumnPropertyNames(props.query);
    const result = await props.dataviewAPI.query(props.query);
    if (!result.successful) {
      console.log("dv result unsuccessful");
      props.setQueryResultStore(props.uid, {
        ...result,
        truePropertyNames
      });
      return;
    }
    result.value.values = result.value.values.map((arr) => arr.map((v) => tryDataviewArrayToArray(v)));
    console.log(performance.now());
    console.log(props.source);
    console.log("result: ", result);
    props.setQueryResultStore(props.uid, {
      ...result,
      truePropertyNames
    });
  };
  updateQueryResults();
  registerDataviewEvents(props.plugin, updateQueryResults);
  onCleanup(() => {
    unregisterDataviewEvents(props.plugin, updateQueryResults);
  });
  return [(() => {
    var _el$ = _tmpl$();
    insert(_el$, createComponent(Table, {
      get queryResults() {
        return queryResults();
      },
      codeBlockInfo: props
    }));
    return _el$;
  })(), (() => {
    var _el$2 = _tmpl$2();
    insert(_el$2, createComponent(Toolbar, {
      get config() {
        return props.config;
      },
      codeBlockInfo: props
    }));
    return _el$2;
  })()];
}
const Toolbar = (props) => {
  const dataEditInfos = props.codeBlockInfo;
  const [isConfigOpen, setConfigOpen] = createSignal(false);
  const updateConfig = async (key, value) => {
    await updateBlockConfig(key, value, dataEditInfos);
  };
  return [createComponent(BlockConfigModal, {
    get config() {
      return props.config;
    },
    get codeBlockInfo() {
      return props.codeBlockInfo;
    },
    get open() {
      return isConfigOpen();
    },
    setOpen: setConfigOpen
  }), (() => {
    var _el$3 = _tmpl$3();
    _el$3.$$click = () => setConfigOpen((prev) => !prev);
    insert(_el$3, createComponent(settings_default, {
      size: "1rem"
    }));
    return _el$3;
  })(), createComponent(For, {
    get each() {
      return Object.keys(props.config);
    },
    children: (key) => {
      const value = props.config[key];
      return createComponent(Switch, {
        get children() {
          return createComponent(Match, {
            when: key === "lockEditing",
            get children() {
              var _el$4 = _tmpl$3();
              _el$4.$$click = async () => await updateConfig(key, !value);
              insert(_el$4, createComponent(Show, {
                when: value === true,
                get fallback() {
                  return createComponent(lock_open_default, {
                    size: "1rem"
                  });
                },
                get children() {
                  return createComponent(lock_default, {
                    size: "1rem"
                  });
                }
              }));
              return _el$4;
            }
          });
        }
      });
    }
  })];
};
const BlockConfigModal = (props) => {
  const [form, setForm] = createStore(props.config);
  const updateForm = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value
    }));
  };
  return createComponent(Dialog, {
    get open() {
      return props.open;
    },
    get onOpenChange() {
      return props.setOpen;
    },
    get children() {
      return [createComponent(Show, {
        get when() {
          return props.trigger;
        },
        get children() {
          return createComponent(DialogTrigger, {
            get children() {
              return props.trigger;
            }
          });
        }
      }), createComponent(DialogContent, {
        get children() {
          return [createComponent(DialogTitle, {
            children: "Block configuration"
          }), createComponent(DialogDescription, {
            get children() {
              return ["see the docs", " ", createComponent(ExternalLink, {
                href: "https://github.com/unxok/obsidian-dataedit",
                children: "here"
              }), " ", "for more information"];
            }
          }), (() => {
            var _el$5 = _tmpl$4();
            insert(_el$5, createComponent(Setting, {
              title: "Lock editing",
              description: "prevents editing in all cells which makes links and tags\r\n                clickable.",
              get children() {
                return createComponent(Toggle, {
                  get checked() {
                    return form.lockEditing;
                  },
                  onCheckedChange: (b) => updateForm("lockEditing", b)
                });
              }
            }));
            return _el$5;
          })(), createComponent(DialogFooter, {
            get children() {
              return [createComponent(
                DialogClose,
                {
                  get ["class"]() {
                    return buttonVariants.outline;
                  },
                  onClick: async () => {
                    await setBlockConfig(defaultDataEditBlockConfig, props.codeBlockInfo);
                  },
                  children: "reset"
                }
              ), createComponent(
                DialogClose,
                {
                  get ["class"]() {
                    return buttonVariants.ghost;
                  },
                  onClick: () => props.setOpen && props.setOpen(false),
                  children: "cancel"
                }
              ), createComponent(
                DialogClose,
                {
                  get ["class"]() {
                    return buttonVariants.accent;
                  },
                  onClick: async () => {
                    await setBlockConfig(form, props.codeBlockInfo);
                    if (!props.setOpen) return;
                    props.setOpen(false);
                  },
                  children: "save"
                }
              )];
            }
          })];
        }
      })];
    }
  });
};
const Setting = (props) => (() => {
  var _el$6 = _tmpl$5(), _el$7 = _el$6.firstChild, _el$8 = _el$7.firstChild, _el$9 = _el$8.nextSibling;
  insert(_el$8, () => props.title);
  insert(_el$9, () => props.description);
  insert(_el$6, () => props.children, null);
  return _el$6;
})();
delegateEvents(["click"]);
const getDataviewAPI = (pApp) => {
  if (pApp) {
    const {
      plugins
    } = pApp.plugins;
    if (plugins.hasOwnProperty("dataview")) {
      return plugins.dataview.api;
    }
  }
  const gPlugins = app.plugins.plugins;
  if (gPlugins.hasOwnProperty("dataview")) {
    return gPlugins.dataview.api;
  }
  const msg = "Failed to get Dataview API. Is Dataview installed & enabled?";
  new obsidian.Notice(msg);
  throw new Error(msg);
};
class DataEdit extends obsidian.Plugin {
  async onload() {
    await app.plugins.loadPlugin("dataview");
    this.registerMarkdownCodeBlockProcessor("dataedit", (source, el, ctx) => {
      const dataviewAPI = getDataviewAPI(this.app);
      el.empty();
      el.classList.toggle("twcss", true);
      el.parentElement.style.boxShadow = "none";
      const {
        query,
        config
      } = splitQueryOnConfig(source);
      const uid = createUniqueId();
      const [queryResultStore, setQueryResultStore] = createStore({});
      const dispose2 = render(() => {
        const _self$ = this;
        return createComponent(App, {
          plugin: _self$,
          el,
          source,
          query,
          config,
          ctx,
          dataviewAPI,
          uid,
          queryResultStore,
          setQueryResultStore
        });
      }, el);
      const mdChild = new obsidian.MarkdownRenderChild(el);
      mdChild.register(() => {
        dispose2();
        setQueryResultStore((prev) => {
          delete prev[uid];
          return prev;
        });
      });
      ctx.addChild(mdChild);
    });
  }
}
module.exports = DataEdit;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibm9kZV9tb2R1bGVzL3NvbGlkLWpzL2Rpc3Qvc29saWQuanMiLCJub2RlX21vZHVsZXMvc29saWQtanMvd2ViL2Rpc3Qvd2ViLmpzIiwibm9kZV9tb2R1bGVzL3NvbGlkLWpzL3N0b3JlL2Rpc3Qvc3RvcmUuanMiLCJzcmMvbGliL2NvbnN0YW50cy50cyIsInNyYy9saWIvdXRpbC50cyIsIm5vZGVfbW9kdWxlcy9sdWNpZGUtc29saWQvZGlzdC9zb3VyY2UvZGVmYXVsdEF0dHJpYnV0ZXMuanN4Iiwibm9kZV9tb2R1bGVzL2x1Y2lkZS1zb2xpZC9kaXN0L3NvdXJjZS9JY29uLmpzeCIsIm5vZGVfbW9kdWxlcy9sdWNpZGUtc29saWQvZGlzdC9zb3VyY2UvaWNvbnMvbG9jay5qc3giLCJub2RlX21vZHVsZXMvbHVjaWRlLXNvbGlkL2Rpc3Qvc291cmNlL2ljb25zL2xvY2stb3Blbi5qc3giLCJub2RlX21vZHVsZXMvbHVjaWRlLXNvbGlkL2Rpc3Qvc291cmNlL2ljb25zL3NldHRpbmdzLmpzeCIsInNyYy9jb21wb25lbnRzL01hcmtkb3duL2luZGV4LnRzeCIsInNyYy9jb21wb25lbnRzL0lucHV0cy9jaGVja2JveC50c3giLCJub2RlX21vZHVsZXMvQHNvbGlkLXByaW1pdGl2ZXMvYXV0b2ZvY3VzL2Rpc3QvaW5kZXguanMiLCJzcmMvY29tcG9uZW50cy9JbnB1dHMvZGF0ZWRhdGV0aW1lLnRzeCIsIm5vZGVfbW9kdWxlcy9sdWNpZGUtc29saWQvZGlzdC9zb3VyY2UvaWNvbnMvcGx1cy5qc3giLCJzcmMvY29tcG9uZW50cy9JbnB1dHMvdGV4dC50c3giLCJzcmMvY29tcG9uZW50cy9JbnB1dHMvbGlzdC50c3giLCJub2RlX21vZHVsZXMvY2xzeC9kaXN0L2Nsc3gubWpzIiwibm9kZV9tb2R1bGVzL3RhaWx3aW5kLW1lcmdlL2Rpc3QvYnVuZGxlLW1qcy5tanMiLCJzcmMvbGlicy9jbi50cyIsIm5vZGVfbW9kdWxlcy9Ac29saWQtcHJpbWl0aXZlcy91dGlscy9kaXN0L2NodW5rL1I1Njc1WU1VLmpzIiwibm9kZV9tb2R1bGVzL0Bzb2xpZC1wcmltaXRpdmVzL3JlZnMvZGlzdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9Aa29iYWx0ZS91dGlscy9kaXN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL0Brb2JhbHRlL2NvcmUvZGlzdC9jaHVuay8zTkk2RlRBMi5qc3giLCJub2RlX21vZHVsZXMvQGtvYmFsdGUvY29yZS9kaXN0L2NodW5rLzdBM0dERjRZLmpzeCIsIm5vZGVfbW9kdWxlcy9Aa29iYWx0ZS9jb3JlL2Rpc3QvY2h1bmsvSkhNTldPTFkuanN4Iiwibm9kZV9tb2R1bGVzL0Brb2JhbHRlL2NvcmUvZGlzdC9jaHVuay9QNlhVNzVaRy5qc3giLCJub2RlX21vZHVsZXMvQGtvYmFsdGUvY29yZS9kaXN0L2NodW5rL1dOUkFONUdWLmpzeCIsIm5vZGVfbW9kdWxlcy9Aa29iYWx0ZS9jb3JlL2Rpc3QvY2h1bmsvQk1NQ1E3WUouanN4Iiwibm9kZV9tb2R1bGVzL0Brb2JhbHRlL2NvcmUvZGlzdC9jaHVuay9FNzNQS0ZCMy5qc3giLCJub2RlX21vZHVsZXMvQGtvYmFsdGUvY29yZS9kaXN0L2NodW5rL05OR01SWTJPLmpzeCIsIm5vZGVfbW9kdWxlcy9Aa29iYWx0ZS9jb3JlL2Rpc3QvY2h1bmsvRk42RUlDR08uanN4Iiwibm9kZV9tb2R1bGVzL0Brb2JhbHRlL2NvcmUvZGlzdC9jaHVuay9FNTNEQjdCUy5qc3giLCJub2RlX21vZHVsZXMvQGtvYmFsdGUvY29yZS9kaXN0L2NodW5rL0NXQ0I0NDdGLmpzeCIsIm5vZGVfbW9kdWxlcy9Aa29iYWx0ZS9jb3JlL2Rpc3QvY2h1bmsvNVdYSEpEQ1ouanN4Iiwibm9kZV9tb2R1bGVzL0Brb2JhbHRlL2NvcmUvZGlzdC9jaHVuay9TQTI3VjVZSi5qc3giLCJub2RlX21vZHVsZXMvQGtvYmFsdGUvY29yZS9kaXN0L2NodW5rL0pOQ0NGNk1QLmpzeCIsIm5vZGVfbW9kdWxlcy9AY29ydnUvdXRpbHMvZGlzdC9jaHVuay9VNDJFQ01ORC5qc3giLCJub2RlX21vZHVsZXMvQGNvcnZ1L3V0aWxzL2Rpc3QvY2h1bmsvVkRMRVhGNkMuanN4Iiwibm9kZV9tb2R1bGVzL0Bjb3J2dS91dGlscy9kaXN0L3Njcm9sbC9pbmRleC5qc3giLCJub2RlX21vZHVsZXMvc29saWQtcHJldmVudC1zY3JvbGwvZGlzdC9pbmRleC5qc3giLCJub2RlX21vZHVsZXMvc29saWQtcHJlc2VuY2UvZGlzdC9pbmRleC5qc3giLCJub2RlX21vZHVsZXMvQGtvYmFsdGUvY29yZS9kaXN0L2NodW5rLzQ2U0Y2NUFDLmpzeCIsInNyYy9jb21wb25lbnRzL3VpL2J1dHRvbi50c3giLCJzcmMvY29tcG9uZW50cy91aS9kaWFsb2cudHN4Iiwic3JjL2NvbXBvbmVudHMvdWkvZXh0ZXJuYWwtbGluay50c3giLCJub2RlX21vZHVsZXMvbHVjaWRlLXNvbGlkL2Rpc3Qvc291cmNlL2ljb25zL21pbnVzLmpzeCIsIm5vZGVfbW9kdWxlcy9sdWNpZGUtc29saWQvZGlzdC9zb3VyY2UvaWNvbnMvcGFyZW50aGVzZXMuanN4Iiwic3JjL2NvbXBvbmVudHMvSW5wdXRzL251bWJlci50c3giLCJzcmMvY29tcG9uZW50cy9UYWJsZS9UYWJsZURhdGEvaW5kZXgudHN4Iiwic3JjL2NvbXBvbmVudHMvVGFibGUvVGFibGVCb2R5L2luZGV4LnRzeCIsIm5vZGVfbW9kdWxlcy9sdWNpZGUtc29saWQvZGlzdC9zb3VyY2UvaWNvbnMvZ3JpcC1ob3Jpem9udGFsLmpzeCIsInNyYy9jb21wb25lbnRzL1RhYmxlL1RhYmxlSGVhZC9pbmRleC50c3giLCJzcmMvY29tcG9uZW50cy9UYWJsZS9pbmRleC50c3giLCJzcmMvY29tcG9uZW50cy91aS90b2dnbGUudHN4Iiwic3JjL0FwcC50c3giLCJzcmMvbWFpbi50c3giXSwic291cmNlc0NvbnRlbnQiOlsibGV0IHRhc2tJZENvdW50ZXIgPSAxLFxuICBpc0NhbGxiYWNrU2NoZWR1bGVkID0gZmFsc2UsXG4gIGlzUGVyZm9ybWluZ1dvcmsgPSBmYWxzZSxcbiAgdGFza1F1ZXVlID0gW10sXG4gIGN1cnJlbnRUYXNrID0gbnVsbCxcbiAgc2hvdWxkWWllbGRUb0hvc3QgPSBudWxsLFxuICB5aWVsZEludGVydmFsID0gNSxcbiAgZGVhZGxpbmUgPSAwLFxuICBtYXhZaWVsZEludGVydmFsID0gMzAwLFxuICBzY2hlZHVsZUNhbGxiYWNrID0gbnVsbCxcbiAgc2NoZWR1bGVkQ2FsbGJhY2sgPSBudWxsO1xuY29uc3QgbWF4U2lnbmVkMzFCaXRJbnQgPSAxMDczNzQxODIzO1xuZnVuY3Rpb24gc2V0dXBTY2hlZHVsZXIoKSB7XG4gIGNvbnN0IGNoYW5uZWwgPSBuZXcgTWVzc2FnZUNoYW5uZWwoKSxcbiAgICBwb3J0ID0gY2hhbm5lbC5wb3J0MjtcbiAgc2NoZWR1bGVDYWxsYmFjayA9ICgpID0+IHBvcnQucG9zdE1lc3NhZ2UobnVsbCk7XG4gIGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gKCkgPT4ge1xuICAgIGlmIChzY2hlZHVsZWRDYWxsYmFjayAhPT0gbnVsbCkge1xuICAgICAgY29uc3QgY3VycmVudFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAgIGRlYWRsaW5lID0gY3VycmVudFRpbWUgKyB5aWVsZEludGVydmFsO1xuICAgICAgY29uc3QgaGFzVGltZVJlbWFpbmluZyA9IHRydWU7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBoYXNNb3JlV29yayA9IHNjaGVkdWxlZENhbGxiYWNrKGhhc1RpbWVSZW1haW5pbmcsIGN1cnJlbnRUaW1lKTtcbiAgICAgICAgaWYgKCFoYXNNb3JlV29yaykge1xuICAgICAgICAgIHNjaGVkdWxlZENhbGxiYWNrID0gbnVsbDtcbiAgICAgICAgfSBlbHNlIHBvcnQucG9zdE1lc3NhZ2UobnVsbCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKG51bGwpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIGlmIChuYXZpZ2F0b3IgJiYgbmF2aWdhdG9yLnNjaGVkdWxpbmcgJiYgbmF2aWdhdG9yLnNjaGVkdWxpbmcuaXNJbnB1dFBlbmRpbmcpIHtcbiAgICBjb25zdCBzY2hlZHVsaW5nID0gbmF2aWdhdG9yLnNjaGVkdWxpbmc7XG4gICAgc2hvdWxkWWllbGRUb0hvc3QgPSAoKSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgICAgaWYgKGN1cnJlbnRUaW1lID49IGRlYWRsaW5lKSB7XG4gICAgICAgIGlmIChzY2hlZHVsaW5nLmlzSW5wdXRQZW5kaW5nKCkpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY3VycmVudFRpbWUgPj0gbWF4WWllbGRJbnRlcnZhbDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHNob3VsZFlpZWxkVG9Ib3N0ID0gKCkgPT4gcGVyZm9ybWFuY2Uubm93KCkgPj0gZGVhZGxpbmU7XG4gIH1cbn1cbmZ1bmN0aW9uIGVucXVldWUodGFza1F1ZXVlLCB0YXNrKSB7XG4gIGZ1bmN0aW9uIGZpbmRJbmRleCgpIHtcbiAgICBsZXQgbSA9IDA7XG4gICAgbGV0IG4gPSB0YXNrUXVldWUubGVuZ3RoIC0gMTtcbiAgICB3aGlsZSAobSA8PSBuKSB7XG4gICAgICBjb25zdCBrID0gKG4gKyBtKSA+PiAxO1xuICAgICAgY29uc3QgY21wID0gdGFzay5leHBpcmF0aW9uVGltZSAtIHRhc2tRdWV1ZVtrXS5leHBpcmF0aW9uVGltZTtcbiAgICAgIGlmIChjbXAgPiAwKSBtID0gayArIDE7XG4gICAgICBlbHNlIGlmIChjbXAgPCAwKSBuID0gayAtIDE7XG4gICAgICBlbHNlIHJldHVybiBrO1xuICAgIH1cbiAgICByZXR1cm4gbTtcbiAgfVxuICB0YXNrUXVldWUuc3BsaWNlKGZpbmRJbmRleCgpLCAwLCB0YXNrKTtcbn1cbmZ1bmN0aW9uIHJlcXVlc3RDYWxsYmFjayhmbiwgb3B0aW9ucykge1xuICBpZiAoIXNjaGVkdWxlQ2FsbGJhY2spIHNldHVwU2NoZWR1bGVyKCk7XG4gIGxldCBzdGFydFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKSxcbiAgICB0aW1lb3V0ID0gbWF4U2lnbmVkMzFCaXRJbnQ7XG4gIGlmIChvcHRpb25zICYmIG9wdGlvbnMudGltZW91dCkgdGltZW91dCA9IG9wdGlvbnMudGltZW91dDtcbiAgY29uc3QgbmV3VGFzayA9IHtcbiAgICBpZDogdGFza0lkQ291bnRlcisrLFxuICAgIGZuLFxuICAgIHN0YXJ0VGltZSxcbiAgICBleHBpcmF0aW9uVGltZTogc3RhcnRUaW1lICsgdGltZW91dFxuICB9O1xuICBlbnF1ZXVlKHRhc2tRdWV1ZSwgbmV3VGFzayk7XG4gIGlmICghaXNDYWxsYmFja1NjaGVkdWxlZCAmJiAhaXNQZXJmb3JtaW5nV29yaykge1xuICAgIGlzQ2FsbGJhY2tTY2hlZHVsZWQgPSB0cnVlO1xuICAgIHNjaGVkdWxlZENhbGxiYWNrID0gZmx1c2hXb3JrO1xuICAgIHNjaGVkdWxlQ2FsbGJhY2soKTtcbiAgfVxuICByZXR1cm4gbmV3VGFzaztcbn1cbmZ1bmN0aW9uIGNhbmNlbENhbGxiYWNrKHRhc2spIHtcbiAgdGFzay5mbiA9IG51bGw7XG59XG5mdW5jdGlvbiBmbHVzaFdvcmsoaGFzVGltZVJlbWFpbmluZywgaW5pdGlhbFRpbWUpIHtcbiAgaXNDYWxsYmFja1NjaGVkdWxlZCA9IGZhbHNlO1xuICBpc1BlcmZvcm1pbmdXb3JrID0gdHJ1ZTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gd29ya0xvb3AoaGFzVGltZVJlbWFpbmluZywgaW5pdGlhbFRpbWUpO1xuICB9IGZpbmFsbHkge1xuICAgIGN1cnJlbnRUYXNrID0gbnVsbDtcbiAgICBpc1BlcmZvcm1pbmdXb3JrID0gZmFsc2U7XG4gIH1cbn1cbmZ1bmN0aW9uIHdvcmtMb29wKGhhc1RpbWVSZW1haW5pbmcsIGluaXRpYWxUaW1lKSB7XG4gIGxldCBjdXJyZW50VGltZSA9IGluaXRpYWxUaW1lO1xuICBjdXJyZW50VGFzayA9IHRhc2tRdWV1ZVswXSB8fCBudWxsO1xuICB3aGlsZSAoY3VycmVudFRhc2sgIT09IG51bGwpIHtcbiAgICBpZiAoY3VycmVudFRhc2suZXhwaXJhdGlvblRpbWUgPiBjdXJyZW50VGltZSAmJiAoIWhhc1RpbWVSZW1haW5pbmcgfHwgc2hvdWxkWWllbGRUb0hvc3QoKSkpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjb25zdCBjYWxsYmFjayA9IGN1cnJlbnRUYXNrLmZuO1xuICAgIGlmIChjYWxsYmFjayAhPT0gbnVsbCkge1xuICAgICAgY3VycmVudFRhc2suZm4gPSBudWxsO1xuICAgICAgY29uc3QgZGlkVXNlckNhbGxiYWNrVGltZW91dCA9IGN1cnJlbnRUYXNrLmV4cGlyYXRpb25UaW1lIDw9IGN1cnJlbnRUaW1lO1xuICAgICAgY2FsbGJhY2soZGlkVXNlckNhbGxiYWNrVGltZW91dCk7XG4gICAgICBjdXJyZW50VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgICAgaWYgKGN1cnJlbnRUYXNrID09PSB0YXNrUXVldWVbMF0pIHtcbiAgICAgICAgdGFza1F1ZXVlLnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHRhc2tRdWV1ZS5zaGlmdCgpO1xuICAgIGN1cnJlbnRUYXNrID0gdGFza1F1ZXVlWzBdIHx8IG51bGw7XG4gIH1cbiAgcmV0dXJuIGN1cnJlbnRUYXNrICE9PSBudWxsO1xufVxuXG5jb25zdCBzaGFyZWRDb25maWcgPSB7XG4gIGNvbnRleHQ6IHVuZGVmaW5lZCxcbiAgcmVnaXN0cnk6IHVuZGVmaW5lZFxufTtcbmZ1bmN0aW9uIHNldEh5ZHJhdGVDb250ZXh0KGNvbnRleHQpIHtcbiAgc2hhcmVkQ29uZmlnLmNvbnRleHQgPSBjb250ZXh0O1xufVxuZnVuY3Rpb24gbmV4dEh5ZHJhdGVDb250ZXh0KCkge1xuICByZXR1cm4ge1xuICAgIC4uLnNoYXJlZENvbmZpZy5jb250ZXh0LFxuICAgIGlkOiBgJHtzaGFyZWRDb25maWcuY29udGV4dC5pZH0ke3NoYXJlZENvbmZpZy5jb250ZXh0LmNvdW50Kyt9LWAsXG4gICAgY291bnQ6IDBcbiAgfTtcbn1cblxuY29uc3QgZXF1YWxGbiA9IChhLCBiKSA9PiBhID09PSBiO1xuY29uc3QgJFBST1hZID0gU3ltYm9sKFwic29saWQtcHJveHlcIik7XG5jb25zdCAkVFJBQ0sgPSBTeW1ib2woXCJzb2xpZC10cmFja1wiKTtcbmNvbnN0ICRERVZDT01QID0gU3ltYm9sKFwic29saWQtZGV2LWNvbXBvbmVudFwiKTtcbmNvbnN0IHNpZ25hbE9wdGlvbnMgPSB7XG4gIGVxdWFsczogZXF1YWxGblxufTtcbmxldCBFUlJPUiA9IG51bGw7XG5sZXQgcnVuRWZmZWN0cyA9IHJ1blF1ZXVlO1xuY29uc3QgU1RBTEUgPSAxO1xuY29uc3QgUEVORElORyA9IDI7XG5jb25zdCBVTk9XTkVEID0ge1xuICBvd25lZDogbnVsbCxcbiAgY2xlYW51cHM6IG51bGwsXG4gIGNvbnRleHQ6IG51bGwsXG4gIG93bmVyOiBudWxsXG59O1xuY29uc3QgTk9fSU5JVCA9IHt9O1xudmFyIE93bmVyID0gbnVsbDtcbmxldCBUcmFuc2l0aW9uID0gbnVsbDtcbmxldCBTY2hlZHVsZXIgPSBudWxsO1xubGV0IEV4dGVybmFsU291cmNlQ29uZmlnID0gbnVsbDtcbmxldCBMaXN0ZW5lciA9IG51bGw7XG5sZXQgVXBkYXRlcyA9IG51bGw7XG5sZXQgRWZmZWN0cyA9IG51bGw7XG5sZXQgRXhlY0NvdW50ID0gMDtcbmZ1bmN0aW9uIGNyZWF0ZVJvb3QoZm4sIGRldGFjaGVkT3duZXIpIHtcbiAgY29uc3QgbGlzdGVuZXIgPSBMaXN0ZW5lcixcbiAgICBvd25lciA9IE93bmVyLFxuICAgIHVub3duZWQgPSBmbi5sZW5ndGggPT09IDAsXG4gICAgY3VycmVudCA9IGRldGFjaGVkT3duZXIgPT09IHVuZGVmaW5lZCA/IG93bmVyIDogZGV0YWNoZWRPd25lcixcbiAgICByb290ID0gdW5vd25lZFxuICAgICAgPyBVTk9XTkVEXG4gICAgICA6IHtcbiAgICAgICAgICBvd25lZDogbnVsbCxcbiAgICAgICAgICBjbGVhbnVwczogbnVsbCxcbiAgICAgICAgICBjb250ZXh0OiBjdXJyZW50ID8gY3VycmVudC5jb250ZXh0IDogbnVsbCxcbiAgICAgICAgICBvd25lcjogY3VycmVudFxuICAgICAgICB9LFxuICAgIHVwZGF0ZUZuID0gdW5vd25lZCA/IGZuIDogKCkgPT4gZm4oKCkgPT4gdW50cmFjaygoKSA9PiBjbGVhbk5vZGUocm9vdCkpKTtcbiAgT3duZXIgPSByb290O1xuICBMaXN0ZW5lciA9IG51bGw7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHJ1blVwZGF0ZXModXBkYXRlRm4sIHRydWUpO1xuICB9IGZpbmFsbHkge1xuICAgIExpc3RlbmVyID0gbGlzdGVuZXI7XG4gICAgT3duZXIgPSBvd25lcjtcbiAgfVxufVxuZnVuY3Rpb24gY3JlYXRlU2lnbmFsKHZhbHVlLCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zID8gT2JqZWN0LmFzc2lnbih7fSwgc2lnbmFsT3B0aW9ucywgb3B0aW9ucykgOiBzaWduYWxPcHRpb25zO1xuICBjb25zdCBzID0ge1xuICAgIHZhbHVlLFxuICAgIG9ic2VydmVyczogbnVsbCxcbiAgICBvYnNlcnZlclNsb3RzOiBudWxsLFxuICAgIGNvbXBhcmF0b3I6IG9wdGlvbnMuZXF1YWxzIHx8IHVuZGVmaW5lZFxuICB9O1xuICBjb25zdCBzZXR0ZXIgPSB2YWx1ZSA9PiB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICBpZiAoVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcgJiYgVHJhbnNpdGlvbi5zb3VyY2VzLmhhcyhzKSkgdmFsdWUgPSB2YWx1ZShzLnRWYWx1ZSk7XG4gICAgICBlbHNlIHZhbHVlID0gdmFsdWUocy52YWx1ZSk7XG4gICAgfVxuICAgIHJldHVybiB3cml0ZVNpZ25hbChzLCB2YWx1ZSk7XG4gIH07XG4gIHJldHVybiBbcmVhZFNpZ25hbC5iaW5kKHMpLCBzZXR0ZXJdO1xufVxuZnVuY3Rpb24gY3JlYXRlQ29tcHV0ZWQoZm4sIHZhbHVlLCBvcHRpb25zKSB7XG4gIGNvbnN0IGMgPSBjcmVhdGVDb21wdXRhdGlvbihmbiwgdmFsdWUsIHRydWUsIFNUQUxFKTtcbiAgaWYgKFNjaGVkdWxlciAmJiBUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZykgVXBkYXRlcy5wdXNoKGMpO1xuICBlbHNlIHVwZGF0ZUNvbXB1dGF0aW9uKGMpO1xufVxuZnVuY3Rpb24gY3JlYXRlUmVuZGVyRWZmZWN0KGZuLCB2YWx1ZSwgb3B0aW9ucykge1xuICBjb25zdCBjID0gY3JlYXRlQ29tcHV0YXRpb24oZm4sIHZhbHVlLCBmYWxzZSwgU1RBTEUpO1xuICBpZiAoU2NoZWR1bGVyICYmIFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nKSBVcGRhdGVzLnB1c2goYyk7XG4gIGVsc2UgdXBkYXRlQ29tcHV0YXRpb24oYyk7XG59XG5mdW5jdGlvbiBjcmVhdGVFZmZlY3QoZm4sIHZhbHVlLCBvcHRpb25zKSB7XG4gIHJ1bkVmZmVjdHMgPSBydW5Vc2VyRWZmZWN0cztcbiAgY29uc3QgYyA9IGNyZWF0ZUNvbXB1dGF0aW9uKGZuLCB2YWx1ZSwgZmFsc2UsIFNUQUxFKSxcbiAgICBzID0gU3VzcGVuc2VDb250ZXh0ICYmIHVzZUNvbnRleHQoU3VzcGVuc2VDb250ZXh0KTtcbiAgaWYgKHMpIGMuc3VzcGVuc2UgPSBzO1xuICBpZiAoIW9wdGlvbnMgfHwgIW9wdGlvbnMucmVuZGVyKSBjLnVzZXIgPSB0cnVlO1xuICBFZmZlY3RzID8gRWZmZWN0cy5wdXNoKGMpIDogdXBkYXRlQ29tcHV0YXRpb24oYyk7XG59XG5mdW5jdGlvbiBjcmVhdGVSZWFjdGlvbihvbkludmFsaWRhdGUsIG9wdGlvbnMpIHtcbiAgbGV0IGZuO1xuICBjb25zdCBjID0gY3JlYXRlQ29tcHV0YXRpb24oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGZuID8gZm4oKSA6IHVudHJhY2sob25JbnZhbGlkYXRlKTtcbiAgICAgICAgZm4gPSB1bmRlZmluZWQ7XG4gICAgICB9LFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgZmFsc2UsXG4gICAgICAwXG4gICAgKSxcbiAgICBzID0gU3VzcGVuc2VDb250ZXh0ICYmIHVzZUNvbnRleHQoU3VzcGVuc2VDb250ZXh0KTtcbiAgaWYgKHMpIGMuc3VzcGVuc2UgPSBzO1xuICBjLnVzZXIgPSB0cnVlO1xuICByZXR1cm4gdHJhY2tpbmcgPT4ge1xuICAgIGZuID0gdHJhY2tpbmc7XG4gICAgdXBkYXRlQ29tcHV0YXRpb24oYyk7XG4gIH07XG59XG5mdW5jdGlvbiBjcmVhdGVNZW1vKGZuLCB2YWx1ZSwgb3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyA/IE9iamVjdC5hc3NpZ24oe30sIHNpZ25hbE9wdGlvbnMsIG9wdGlvbnMpIDogc2lnbmFsT3B0aW9ucztcbiAgY29uc3QgYyA9IGNyZWF0ZUNvbXB1dGF0aW9uKGZuLCB2YWx1ZSwgdHJ1ZSwgMCk7XG4gIGMub2JzZXJ2ZXJzID0gbnVsbDtcbiAgYy5vYnNlcnZlclNsb3RzID0gbnVsbDtcbiAgYy5jb21wYXJhdG9yID0gb3B0aW9ucy5lcXVhbHMgfHwgdW5kZWZpbmVkO1xuICBpZiAoU2NoZWR1bGVyICYmIFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nKSB7XG4gICAgYy50U3RhdGUgPSBTVEFMRTtcbiAgICBVcGRhdGVzLnB1c2goYyk7XG4gIH0gZWxzZSB1cGRhdGVDb21wdXRhdGlvbihjKTtcbiAgcmV0dXJuIHJlYWRTaWduYWwuYmluZChjKTtcbn1cbmZ1bmN0aW9uIGlzUHJvbWlzZSh2KSB7XG4gIHJldHVybiB2ICYmIHR5cGVvZiB2ID09PSBcIm9iamVjdFwiICYmIFwidGhlblwiIGluIHY7XG59XG5mdW5jdGlvbiBjcmVhdGVSZXNvdXJjZShwU291cmNlLCBwRmV0Y2hlciwgcE9wdGlvbnMpIHtcbiAgbGV0IHNvdXJjZTtcbiAgbGV0IGZldGNoZXI7XG4gIGxldCBvcHRpb25zO1xuICBpZiAoKGFyZ3VtZW50cy5sZW5ndGggPT09IDIgJiYgdHlwZW9mIHBGZXRjaGVyID09PSBcIm9iamVjdFwiKSB8fCBhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgc291cmNlID0gdHJ1ZTtcbiAgICBmZXRjaGVyID0gcFNvdXJjZTtcbiAgICBvcHRpb25zID0gcEZldGNoZXIgfHwge307XG4gIH0gZWxzZSB7XG4gICAgc291cmNlID0gcFNvdXJjZTtcbiAgICBmZXRjaGVyID0gcEZldGNoZXI7XG4gICAgb3B0aW9ucyA9IHBPcHRpb25zIHx8IHt9O1xuICB9XG4gIGxldCBwciA9IG51bGwsXG4gICAgaW5pdFAgPSBOT19JTklULFxuICAgIGlkID0gbnVsbCxcbiAgICBsb2FkZWRVbmRlclRyYW5zaXRpb24gPSBmYWxzZSxcbiAgICBzY2hlZHVsZWQgPSBmYWxzZSxcbiAgICByZXNvbHZlZCA9IFwiaW5pdGlhbFZhbHVlXCIgaW4gb3B0aW9ucyxcbiAgICBkeW5hbWljID0gdHlwZW9mIHNvdXJjZSA9PT0gXCJmdW5jdGlvblwiICYmIGNyZWF0ZU1lbW8oc291cmNlKTtcbiAgY29uc3QgY29udGV4dHMgPSBuZXcgU2V0KCksXG4gICAgW3ZhbHVlLCBzZXRWYWx1ZV0gPSAob3B0aW9ucy5zdG9yYWdlIHx8IGNyZWF0ZVNpZ25hbCkob3B0aW9ucy5pbml0aWFsVmFsdWUpLFxuICAgIFtlcnJvciwgc2V0RXJyb3JdID0gY3JlYXRlU2lnbmFsKHVuZGVmaW5lZCksXG4gICAgW3RyYWNrLCB0cmlnZ2VyXSA9IGNyZWF0ZVNpZ25hbCh1bmRlZmluZWQsIHtcbiAgICAgIGVxdWFsczogZmFsc2VcbiAgICB9KSxcbiAgICBbc3RhdGUsIHNldFN0YXRlXSA9IGNyZWF0ZVNpZ25hbChyZXNvbHZlZCA/IFwicmVhZHlcIiA6IFwidW5yZXNvbHZlZFwiKTtcbiAgaWYgKHNoYXJlZENvbmZpZy5jb250ZXh0KSB7XG4gICAgaWQgPSBgJHtzaGFyZWRDb25maWcuY29udGV4dC5pZH0ke3NoYXJlZENvbmZpZy5jb250ZXh0LmNvdW50Kyt9YDtcbiAgICBsZXQgdjtcbiAgICBpZiAob3B0aW9ucy5zc3JMb2FkRnJvbSA9PT0gXCJpbml0aWFsXCIpIGluaXRQID0gb3B0aW9ucy5pbml0aWFsVmFsdWU7XG4gICAgZWxzZSBpZiAoc2hhcmVkQ29uZmlnLmxvYWQgJiYgKHYgPSBzaGFyZWRDb25maWcubG9hZChpZCkpKSBpbml0UCA9IHY7XG4gIH1cbiAgZnVuY3Rpb24gbG9hZEVuZChwLCB2LCBlcnJvciwga2V5KSB7XG4gICAgaWYgKHByID09PSBwKSB7XG4gICAgICBwciA9IG51bGw7XG4gICAgICBrZXkgIT09IHVuZGVmaW5lZCAmJiAocmVzb2x2ZWQgPSB0cnVlKTtcbiAgICAgIGlmICgocCA9PT0gaW5pdFAgfHwgdiA9PT0gaW5pdFApICYmIG9wdGlvbnMub25IeWRyYXRlZClcbiAgICAgICAgcXVldWVNaWNyb3Rhc2soKCkgPT5cbiAgICAgICAgICBvcHRpb25zLm9uSHlkcmF0ZWQoa2V5LCB7XG4gICAgICAgICAgICB2YWx1ZTogdlxuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICBpbml0UCA9IE5PX0lOSVQ7XG4gICAgICBpZiAoVHJhbnNpdGlvbiAmJiBwICYmIGxvYWRlZFVuZGVyVHJhbnNpdGlvbikge1xuICAgICAgICBUcmFuc2l0aW9uLnByb21pc2VzLmRlbGV0ZShwKTtcbiAgICAgICAgbG9hZGVkVW5kZXJUcmFuc2l0aW9uID0gZmFsc2U7XG4gICAgICAgIHJ1blVwZGF0ZXMoKCkgPT4ge1xuICAgICAgICAgIFRyYW5zaXRpb24ucnVubmluZyA9IHRydWU7XG4gICAgICAgICAgY29tcGxldGVMb2FkKHYsIGVycm9yKTtcbiAgICAgICAgfSwgZmFsc2UpO1xuICAgICAgfSBlbHNlIGNvbXBsZXRlTG9hZCh2LCBlcnJvcik7XG4gICAgfVxuICAgIHJldHVybiB2O1xuICB9XG4gIGZ1bmN0aW9uIGNvbXBsZXRlTG9hZCh2LCBlcnIpIHtcbiAgICBydW5VcGRhdGVzKCgpID0+IHtcbiAgICAgIGlmIChlcnIgPT09IHVuZGVmaW5lZCkgc2V0VmFsdWUoKCkgPT4gdik7XG4gICAgICBzZXRTdGF0ZShlcnIgIT09IHVuZGVmaW5lZCA/IFwiZXJyb3JlZFwiIDogcmVzb2x2ZWQgPyBcInJlYWR5XCIgOiBcInVucmVzb2x2ZWRcIik7XG4gICAgICBzZXRFcnJvcihlcnIpO1xuICAgICAgZm9yIChjb25zdCBjIG9mIGNvbnRleHRzLmtleXMoKSkgYy5kZWNyZW1lbnQoKTtcbiAgICAgIGNvbnRleHRzLmNsZWFyKCk7XG4gICAgfSwgZmFsc2UpO1xuICB9XG4gIGZ1bmN0aW9uIHJlYWQoKSB7XG4gICAgY29uc3QgYyA9IFN1c3BlbnNlQ29udGV4dCAmJiB1c2VDb250ZXh0KFN1c3BlbnNlQ29udGV4dCksXG4gICAgICB2ID0gdmFsdWUoKSxcbiAgICAgIGVyciA9IGVycm9yKCk7XG4gICAgaWYgKGVyciAhPT0gdW5kZWZpbmVkICYmICFwcikgdGhyb3cgZXJyO1xuICAgIGlmIChMaXN0ZW5lciAmJiAhTGlzdGVuZXIudXNlciAmJiBjKSB7XG4gICAgICBjcmVhdGVDb21wdXRlZCgoKSA9PiB7XG4gICAgICAgIHRyYWNrKCk7XG4gICAgICAgIGlmIChwcikge1xuICAgICAgICAgIGlmIChjLnJlc29sdmVkICYmIFRyYW5zaXRpb24gJiYgbG9hZGVkVW5kZXJUcmFuc2l0aW9uKSBUcmFuc2l0aW9uLnByb21pc2VzLmFkZChwcik7XG4gICAgICAgICAgZWxzZSBpZiAoIWNvbnRleHRzLmhhcyhjKSkge1xuICAgICAgICAgICAgYy5pbmNyZW1lbnQoKTtcbiAgICAgICAgICAgIGNvbnRleHRzLmFkZChjKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gdjtcbiAgfVxuICBmdW5jdGlvbiBsb2FkKHJlZmV0Y2hpbmcgPSB0cnVlKSB7XG4gICAgaWYgKHJlZmV0Y2hpbmcgIT09IGZhbHNlICYmIHNjaGVkdWxlZCkgcmV0dXJuO1xuICAgIHNjaGVkdWxlZCA9IGZhbHNlO1xuICAgIGNvbnN0IGxvb2t1cCA9IGR5bmFtaWMgPyBkeW5hbWljKCkgOiBzb3VyY2U7XG4gICAgbG9hZGVkVW5kZXJUcmFuc2l0aW9uID0gVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmc7XG4gICAgaWYgKGxvb2t1cCA9PSBudWxsIHx8IGxvb2t1cCA9PT0gZmFsc2UpIHtcbiAgICAgIGxvYWRFbmQocHIsIHVudHJhY2sodmFsdWUpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKFRyYW5zaXRpb24gJiYgcHIpIFRyYW5zaXRpb24ucHJvbWlzZXMuZGVsZXRlKHByKTtcbiAgICBjb25zdCBwID1cbiAgICAgIGluaXRQICE9PSBOT19JTklUXG4gICAgICAgID8gaW5pdFBcbiAgICAgICAgOiB1bnRyYWNrKCgpID0+XG4gICAgICAgICAgICBmZXRjaGVyKGxvb2t1cCwge1xuICAgICAgICAgICAgICB2YWx1ZTogdmFsdWUoKSxcbiAgICAgICAgICAgICAgcmVmZXRjaGluZ1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICApO1xuICAgIGlmICghaXNQcm9taXNlKHApKSB7XG4gICAgICBsb2FkRW5kKHByLCBwLCB1bmRlZmluZWQsIGxvb2t1cCk7XG4gICAgICByZXR1cm4gcDtcbiAgICB9XG4gICAgcHIgPSBwO1xuICAgIGlmIChcInZhbHVlXCIgaW4gcCkge1xuICAgICAgaWYgKHAuc3RhdHVzID09PSBcInN1Y2Nlc3NcIikgbG9hZEVuZChwciwgcC52YWx1ZSwgdW5kZWZpbmVkLCBsb29rdXApO1xuICAgICAgZWxzZSBsb2FkRW5kKHByLCB1bmRlZmluZWQsIGNhc3RFcnJvcihwLnZhbHVlKSwgbG9va3VwKTtcbiAgICAgIHJldHVybiBwO1xuICAgIH1cbiAgICBzY2hlZHVsZWQgPSB0cnVlO1xuICAgIHF1ZXVlTWljcm90YXNrKCgpID0+IChzY2hlZHVsZWQgPSBmYWxzZSkpO1xuICAgIHJ1blVwZGF0ZXMoKCkgPT4ge1xuICAgICAgc2V0U3RhdGUocmVzb2x2ZWQgPyBcInJlZnJlc2hpbmdcIiA6IFwicGVuZGluZ1wiKTtcbiAgICAgIHRyaWdnZXIoKTtcbiAgICB9LCBmYWxzZSk7XG4gICAgcmV0dXJuIHAudGhlbihcbiAgICAgIHYgPT4gbG9hZEVuZChwLCB2LCB1bmRlZmluZWQsIGxvb2t1cCksXG4gICAgICBlID0+IGxvYWRFbmQocCwgdW5kZWZpbmVkLCBjYXN0RXJyb3IoZSksIGxvb2t1cClcbiAgICApO1xuICB9XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHJlYWQsIHtcbiAgICBzdGF0ZToge1xuICAgICAgZ2V0OiAoKSA9PiBzdGF0ZSgpXG4gICAgfSxcbiAgICBlcnJvcjoge1xuICAgICAgZ2V0OiAoKSA9PiBlcnJvcigpXG4gICAgfSxcbiAgICBsb2FkaW5nOiB7XG4gICAgICBnZXQoKSB7XG4gICAgICAgIGNvbnN0IHMgPSBzdGF0ZSgpO1xuICAgICAgICByZXR1cm4gcyA9PT0gXCJwZW5kaW5nXCIgfHwgcyA9PT0gXCJyZWZyZXNoaW5nXCI7XG4gICAgICB9XG4gICAgfSxcbiAgICBsYXRlc3Q6IHtcbiAgICAgIGdldCgpIHtcbiAgICAgICAgaWYgKCFyZXNvbHZlZCkgcmV0dXJuIHJlYWQoKTtcbiAgICAgICAgY29uc3QgZXJyID0gZXJyb3IoKTtcbiAgICAgICAgaWYgKGVyciAmJiAhcHIpIHRocm93IGVycjtcbiAgICAgICAgcmV0dXJuIHZhbHVlKCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgaWYgKGR5bmFtaWMpIGNyZWF0ZUNvbXB1dGVkKCgpID0+IGxvYWQoZmFsc2UpKTtcbiAgZWxzZSBsb2FkKGZhbHNlKTtcbiAgcmV0dXJuIFtcbiAgICByZWFkLFxuICAgIHtcbiAgICAgIHJlZmV0Y2g6IGxvYWQsXG4gICAgICBtdXRhdGU6IHNldFZhbHVlXG4gICAgfVxuICBdO1xufVxuZnVuY3Rpb24gY3JlYXRlRGVmZXJyZWQoc291cmNlLCBvcHRpb25zKSB7XG4gIGxldCB0LFxuICAgIHRpbWVvdXQgPSBvcHRpb25zID8gb3B0aW9ucy50aW1lb3V0TXMgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IG5vZGUgPSBjcmVhdGVDb21wdXRhdGlvbihcbiAgICAoKSA9PiB7XG4gICAgICBpZiAoIXQgfHwgIXQuZm4pXG4gICAgICAgIHQgPSByZXF1ZXN0Q2FsbGJhY2soXG4gICAgICAgICAgKCkgPT4gc2V0RGVmZXJyZWQoKCkgPT4gbm9kZS52YWx1ZSksXG4gICAgICAgICAgdGltZW91dCAhPT0gdW5kZWZpbmVkXG4gICAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgICB0aW1lb3V0XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIDogdW5kZWZpbmVkXG4gICAgICAgICk7XG4gICAgICByZXR1cm4gc291cmNlKCk7XG4gICAgfSxcbiAgICB1bmRlZmluZWQsXG4gICAgdHJ1ZVxuICApO1xuICBjb25zdCBbZGVmZXJyZWQsIHNldERlZmVycmVkXSA9IGNyZWF0ZVNpZ25hbChcbiAgICBUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZyAmJiBUcmFuc2l0aW9uLnNvdXJjZXMuaGFzKG5vZGUpID8gbm9kZS50VmFsdWUgOiBub2RlLnZhbHVlLFxuICAgIG9wdGlvbnNcbiAgKTtcbiAgdXBkYXRlQ29tcHV0YXRpb24obm9kZSk7XG4gIHNldERlZmVycmVkKCgpID0+XG4gICAgVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcgJiYgVHJhbnNpdGlvbi5zb3VyY2VzLmhhcyhub2RlKSA/IG5vZGUudFZhbHVlIDogbm9kZS52YWx1ZVxuICApO1xuICByZXR1cm4gZGVmZXJyZWQ7XG59XG5mdW5jdGlvbiBjcmVhdGVTZWxlY3Rvcihzb3VyY2UsIGZuID0gZXF1YWxGbiwgb3B0aW9ucykge1xuICBjb25zdCBzdWJzID0gbmV3IE1hcCgpO1xuICBjb25zdCBub2RlID0gY3JlYXRlQ29tcHV0YXRpb24oXG4gICAgcCA9PiB7XG4gICAgICBjb25zdCB2ID0gc291cmNlKCk7XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbF0gb2Ygc3Vicy5lbnRyaWVzKCkpXG4gICAgICAgIGlmIChmbihrZXksIHYpICE9PSBmbihrZXksIHApKSB7XG4gICAgICAgICAgZm9yIChjb25zdCBjIG9mIHZhbC52YWx1ZXMoKSkge1xuICAgICAgICAgICAgYy5zdGF0ZSA9IFNUQUxFO1xuICAgICAgICAgICAgaWYgKGMucHVyZSkgVXBkYXRlcy5wdXNoKGMpO1xuICAgICAgICAgICAgZWxzZSBFZmZlY3RzLnB1c2goYyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICByZXR1cm4gdjtcbiAgICB9LFxuICAgIHVuZGVmaW5lZCxcbiAgICB0cnVlLFxuICAgIFNUQUxFXG4gICk7XG4gIHVwZGF0ZUNvbXB1dGF0aW9uKG5vZGUpO1xuICByZXR1cm4ga2V5ID0+IHtcbiAgICBjb25zdCBsaXN0ZW5lciA9IExpc3RlbmVyO1xuICAgIGlmIChsaXN0ZW5lcikge1xuICAgICAgbGV0IGw7XG4gICAgICBpZiAoKGwgPSBzdWJzLmdldChrZXkpKSkgbC5hZGQobGlzdGVuZXIpO1xuICAgICAgZWxzZSBzdWJzLnNldChrZXksIChsID0gbmV3IFNldChbbGlzdGVuZXJdKSkpO1xuICAgICAgb25DbGVhbnVwKCgpID0+IHtcbiAgICAgICAgbC5kZWxldGUobGlzdGVuZXIpO1xuICAgICAgICAhbC5zaXplICYmIHN1YnMuZGVsZXRlKGtleSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIGZuKFxuICAgICAga2V5LFxuICAgICAgVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcgJiYgVHJhbnNpdGlvbi5zb3VyY2VzLmhhcyhub2RlKSA/IG5vZGUudFZhbHVlIDogbm9kZS52YWx1ZVxuICAgICk7XG4gIH07XG59XG5mdW5jdGlvbiBiYXRjaChmbikge1xuICByZXR1cm4gcnVuVXBkYXRlcyhmbiwgZmFsc2UpO1xufVxuZnVuY3Rpb24gdW50cmFjayhmbikge1xuICBpZiAoIUV4dGVybmFsU291cmNlQ29uZmlnICYmIExpc3RlbmVyID09PSBudWxsKSByZXR1cm4gZm4oKTtcbiAgY29uc3QgbGlzdGVuZXIgPSBMaXN0ZW5lcjtcbiAgTGlzdGVuZXIgPSBudWxsO1xuICB0cnkge1xuICAgIGlmIChFeHRlcm5hbFNvdXJjZUNvbmZpZykgcmV0dXJuIEV4dGVybmFsU291cmNlQ29uZmlnLnVudHJhY2soZm4pO1xuICAgIHJldHVybiBmbigpO1xuICB9IGZpbmFsbHkge1xuICAgIExpc3RlbmVyID0gbGlzdGVuZXI7XG4gIH1cbn1cbmZ1bmN0aW9uIG9uKGRlcHMsIGZuLCBvcHRpb25zKSB7XG4gIGNvbnN0IGlzQXJyYXkgPSBBcnJheS5pc0FycmF5KGRlcHMpO1xuICBsZXQgcHJldklucHV0O1xuICBsZXQgZGVmZXIgPSBvcHRpb25zICYmIG9wdGlvbnMuZGVmZXI7XG4gIHJldHVybiBwcmV2VmFsdWUgPT4ge1xuICAgIGxldCBpbnB1dDtcbiAgICBpZiAoaXNBcnJheSkge1xuICAgICAgaW5wdXQgPSBBcnJheShkZXBzLmxlbmd0aCk7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRlcHMubGVuZ3RoOyBpKyspIGlucHV0W2ldID0gZGVwc1tpXSgpO1xuICAgIH0gZWxzZSBpbnB1dCA9IGRlcHMoKTtcbiAgICBpZiAoZGVmZXIpIHtcbiAgICAgIGRlZmVyID0gZmFsc2U7XG4gICAgICByZXR1cm4gcHJldlZhbHVlO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSB1bnRyYWNrKCgpID0+IGZuKGlucHV0LCBwcmV2SW5wdXQsIHByZXZWYWx1ZSkpO1xuICAgIHByZXZJbnB1dCA9IGlucHV0O1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG59XG5mdW5jdGlvbiBvbk1vdW50KGZuKSB7XG4gIGNyZWF0ZUVmZmVjdCgoKSA9PiB1bnRyYWNrKGZuKSk7XG59XG5mdW5jdGlvbiBvbkNsZWFudXAoZm4pIHtcbiAgaWYgKE93bmVyID09PSBudWxsKTtcbiAgZWxzZSBpZiAoT3duZXIuY2xlYW51cHMgPT09IG51bGwpIE93bmVyLmNsZWFudXBzID0gW2ZuXTtcbiAgZWxzZSBPd25lci5jbGVhbnVwcy5wdXNoKGZuKTtcbiAgcmV0dXJuIGZuO1xufVxuZnVuY3Rpb24gY2F0Y2hFcnJvcihmbiwgaGFuZGxlcikge1xuICBFUlJPUiB8fCAoRVJST1IgPSBTeW1ib2woXCJlcnJvclwiKSk7XG4gIE93bmVyID0gY3JlYXRlQ29tcHV0YXRpb24odW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuICBPd25lci5jb250ZXh0ID0ge1xuICAgIC4uLk93bmVyLmNvbnRleHQsXG4gICAgW0VSUk9SXTogW2hhbmRsZXJdXG4gIH07XG4gIGlmIChUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZykgVHJhbnNpdGlvbi5zb3VyY2VzLmFkZChPd25lcik7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGZuKCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGhhbmRsZUVycm9yKGVycik7XG4gIH0gZmluYWxseSB7XG4gICAgT3duZXIgPSBPd25lci5vd25lcjtcbiAgfVxufVxuZnVuY3Rpb24gZ2V0TGlzdGVuZXIoKSB7XG4gIHJldHVybiBMaXN0ZW5lcjtcbn1cbmZ1bmN0aW9uIGdldE93bmVyKCkge1xuICByZXR1cm4gT3duZXI7XG59XG5mdW5jdGlvbiBydW5XaXRoT3duZXIobywgZm4pIHtcbiAgY29uc3QgcHJldiA9IE93bmVyO1xuICBjb25zdCBwcmV2TGlzdGVuZXIgPSBMaXN0ZW5lcjtcbiAgT3duZXIgPSBvO1xuICBMaXN0ZW5lciA9IG51bGw7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHJ1blVwZGF0ZXMoZm4sIHRydWUpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBoYW5kbGVFcnJvcihlcnIpO1xuICB9IGZpbmFsbHkge1xuICAgIE93bmVyID0gcHJldjtcbiAgICBMaXN0ZW5lciA9IHByZXZMaXN0ZW5lcjtcbiAgfVxufVxuZnVuY3Rpb24gZW5hYmxlU2NoZWR1bGluZyhzY2hlZHVsZXIgPSByZXF1ZXN0Q2FsbGJhY2spIHtcbiAgU2NoZWR1bGVyID0gc2NoZWR1bGVyO1xufVxuZnVuY3Rpb24gc3RhcnRUcmFuc2l0aW9uKGZuKSB7XG4gIGlmIChUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZykge1xuICAgIGZuKCk7XG4gICAgcmV0dXJuIFRyYW5zaXRpb24uZG9uZTtcbiAgfVxuICBjb25zdCBsID0gTGlzdGVuZXI7XG4gIGNvbnN0IG8gPSBPd25lcjtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oKCkgPT4ge1xuICAgIExpc3RlbmVyID0gbDtcbiAgICBPd25lciA9IG87XG4gICAgbGV0IHQ7XG4gICAgaWYgKFNjaGVkdWxlciB8fCBTdXNwZW5zZUNvbnRleHQpIHtcbiAgICAgIHQgPVxuICAgICAgICBUcmFuc2l0aW9uIHx8XG4gICAgICAgIChUcmFuc2l0aW9uID0ge1xuICAgICAgICAgIHNvdXJjZXM6IG5ldyBTZXQoKSxcbiAgICAgICAgICBlZmZlY3RzOiBbXSxcbiAgICAgICAgICBwcm9taXNlczogbmV3IFNldCgpLFxuICAgICAgICAgIGRpc3Bvc2VkOiBuZXcgU2V0KCksXG4gICAgICAgICAgcXVldWU6IG5ldyBTZXQoKSxcbiAgICAgICAgICBydW5uaW5nOiB0cnVlXG4gICAgICAgIH0pO1xuICAgICAgdC5kb25lIHx8ICh0LmRvbmUgPSBuZXcgUHJvbWlzZShyZXMgPT4gKHQucmVzb2x2ZSA9IHJlcykpKTtcbiAgICAgIHQucnVubmluZyA9IHRydWU7XG4gICAgfVxuICAgIHJ1blVwZGF0ZXMoZm4sIGZhbHNlKTtcbiAgICBMaXN0ZW5lciA9IE93bmVyID0gbnVsbDtcbiAgICByZXR1cm4gdCA/IHQuZG9uZSA6IHVuZGVmaW5lZDtcbiAgfSk7XG59XG5jb25zdCBbdHJhbnNQZW5kaW5nLCBzZXRUcmFuc1BlbmRpbmddID0gLypAX19QVVJFX18qLyBjcmVhdGVTaWduYWwoZmFsc2UpO1xuZnVuY3Rpb24gdXNlVHJhbnNpdGlvbigpIHtcbiAgcmV0dXJuIFt0cmFuc1BlbmRpbmcsIHN0YXJ0VHJhbnNpdGlvbl07XG59XG5mdW5jdGlvbiByZXN1bWVFZmZlY3RzKGUpIHtcbiAgRWZmZWN0cy5wdXNoLmFwcGx5KEVmZmVjdHMsIGUpO1xuICBlLmxlbmd0aCA9IDA7XG59XG5mdW5jdGlvbiBjcmVhdGVDb250ZXh0KGRlZmF1bHRWYWx1ZSwgb3B0aW9ucykge1xuICBjb25zdCBpZCA9IFN5bWJvbChcImNvbnRleHRcIik7XG4gIHJldHVybiB7XG4gICAgaWQsXG4gICAgUHJvdmlkZXI6IGNyZWF0ZVByb3ZpZGVyKGlkKSxcbiAgICBkZWZhdWx0VmFsdWVcbiAgfTtcbn1cbmZ1bmN0aW9uIHVzZUNvbnRleHQoY29udGV4dCkge1xuICByZXR1cm4gT3duZXIgJiYgT3duZXIuY29udGV4dCAmJiBPd25lci5jb250ZXh0W2NvbnRleHQuaWRdICE9PSB1bmRlZmluZWRcbiAgICA/IE93bmVyLmNvbnRleHRbY29udGV4dC5pZF1cbiAgICA6IGNvbnRleHQuZGVmYXVsdFZhbHVlO1xufVxuZnVuY3Rpb24gY2hpbGRyZW4oZm4pIHtcbiAgY29uc3QgY2hpbGRyZW4gPSBjcmVhdGVNZW1vKGZuKTtcbiAgY29uc3QgbWVtbyA9IGNyZWF0ZU1lbW8oKCkgPT4gcmVzb2x2ZUNoaWxkcmVuKGNoaWxkcmVuKCkpKTtcbiAgbWVtby50b0FycmF5ID0gKCkgPT4ge1xuICAgIGNvbnN0IGMgPSBtZW1vKCk7XG4gICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYykgPyBjIDogYyAhPSBudWxsID8gW2NdIDogW107XG4gIH07XG4gIHJldHVybiBtZW1vO1xufVxubGV0IFN1c3BlbnNlQ29udGV4dDtcbmZ1bmN0aW9uIGdldFN1c3BlbnNlQ29udGV4dCgpIHtcbiAgcmV0dXJuIFN1c3BlbnNlQ29udGV4dCB8fCAoU3VzcGVuc2VDb250ZXh0ID0gY3JlYXRlQ29udGV4dCgpKTtcbn1cbmZ1bmN0aW9uIGVuYWJsZUV4dGVybmFsU291cmNlKGZhY3RvcnksIHVudHJhY2sgPSBmbiA9PiBmbigpKSB7XG4gIGlmIChFeHRlcm5hbFNvdXJjZUNvbmZpZykge1xuICAgIGNvbnN0IHsgZmFjdG9yeTogb2xkRmFjdG9yeSwgdW50cmFjazogb2xkVW50cmFjayB9ID0gRXh0ZXJuYWxTb3VyY2VDb25maWc7XG4gICAgRXh0ZXJuYWxTb3VyY2VDb25maWcgPSB7XG4gICAgICBmYWN0b3J5OiAoZm4sIHRyaWdnZXIpID0+IHtcbiAgICAgICAgY29uc3Qgb2xkU291cmNlID0gb2xkRmFjdG9yeShmbiwgdHJpZ2dlcik7XG4gICAgICAgIGNvbnN0IHNvdXJjZSA9IGZhY3RvcnkoeCA9PiBvbGRTb3VyY2UudHJhY2soeCksIHRyaWdnZXIpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHRyYWNrOiB4ID0+IHNvdXJjZS50cmFjayh4KSxcbiAgICAgICAgICBkaXNwb3NlKCkge1xuICAgICAgICAgICAgc291cmNlLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgIG9sZFNvdXJjZS5kaXNwb3NlKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIHVudHJhY2s6IGZuID0+IG9sZFVudHJhY2soKCkgPT4gdW50cmFjayhmbikpXG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICBFeHRlcm5hbFNvdXJjZUNvbmZpZyA9IHtcbiAgICAgIGZhY3RvcnksXG4gICAgICB1bnRyYWNrXG4gICAgfTtcbiAgfVxufVxuZnVuY3Rpb24gcmVhZFNpZ25hbCgpIHtcbiAgY29uc3QgcnVubmluZ1RyYW5zaXRpb24gPSBUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZztcbiAgaWYgKHRoaXMuc291cmNlcyAmJiAocnVubmluZ1RyYW5zaXRpb24gPyB0aGlzLnRTdGF0ZSA6IHRoaXMuc3RhdGUpKSB7XG4gICAgaWYgKChydW5uaW5nVHJhbnNpdGlvbiA/IHRoaXMudFN0YXRlIDogdGhpcy5zdGF0ZSkgPT09IFNUQUxFKSB1cGRhdGVDb21wdXRhdGlvbih0aGlzKTtcbiAgICBlbHNlIHtcbiAgICAgIGNvbnN0IHVwZGF0ZXMgPSBVcGRhdGVzO1xuICAgICAgVXBkYXRlcyA9IG51bGw7XG4gICAgICBydW5VcGRhdGVzKCgpID0+IGxvb2tVcHN0cmVhbSh0aGlzKSwgZmFsc2UpO1xuICAgICAgVXBkYXRlcyA9IHVwZGF0ZXM7XG4gICAgfVxuICB9XG4gIGlmIChMaXN0ZW5lcikge1xuICAgIGNvbnN0IHNTbG90ID0gdGhpcy5vYnNlcnZlcnMgPyB0aGlzLm9ic2VydmVycy5sZW5ndGggOiAwO1xuICAgIGlmICghTGlzdGVuZXIuc291cmNlcykge1xuICAgICAgTGlzdGVuZXIuc291cmNlcyA9IFt0aGlzXTtcbiAgICAgIExpc3RlbmVyLnNvdXJjZVNsb3RzID0gW3NTbG90XTtcbiAgICB9IGVsc2Uge1xuICAgICAgTGlzdGVuZXIuc291cmNlcy5wdXNoKHRoaXMpO1xuICAgICAgTGlzdGVuZXIuc291cmNlU2xvdHMucHVzaChzU2xvdCk7XG4gICAgfVxuICAgIGlmICghdGhpcy5vYnNlcnZlcnMpIHtcbiAgICAgIHRoaXMub2JzZXJ2ZXJzID0gW0xpc3RlbmVyXTtcbiAgICAgIHRoaXMub2JzZXJ2ZXJTbG90cyA9IFtMaXN0ZW5lci5zb3VyY2VzLmxlbmd0aCAtIDFdO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLm9ic2VydmVycy5wdXNoKExpc3RlbmVyKTtcbiAgICAgIHRoaXMub2JzZXJ2ZXJTbG90cy5wdXNoKExpc3RlbmVyLnNvdXJjZXMubGVuZ3RoIC0gMSk7XG4gICAgfVxuICB9XG4gIGlmIChydW5uaW5nVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnNvdXJjZXMuaGFzKHRoaXMpKSByZXR1cm4gdGhpcy50VmFsdWU7XG4gIHJldHVybiB0aGlzLnZhbHVlO1xufVxuZnVuY3Rpb24gd3JpdGVTaWduYWwobm9kZSwgdmFsdWUsIGlzQ29tcCkge1xuICBsZXQgY3VycmVudCA9XG4gICAgVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcgJiYgVHJhbnNpdGlvbi5zb3VyY2VzLmhhcyhub2RlKSA/IG5vZGUudFZhbHVlIDogbm9kZS52YWx1ZTtcbiAgaWYgKCFub2RlLmNvbXBhcmF0b3IgfHwgIW5vZGUuY29tcGFyYXRvcihjdXJyZW50LCB2YWx1ZSkpIHtcbiAgICBpZiAoVHJhbnNpdGlvbikge1xuICAgICAgY29uc3QgVHJhbnNpdGlvblJ1bm5pbmcgPSBUcmFuc2l0aW9uLnJ1bm5pbmc7XG4gICAgICBpZiAoVHJhbnNpdGlvblJ1bm5pbmcgfHwgKCFpc0NvbXAgJiYgVHJhbnNpdGlvbi5zb3VyY2VzLmhhcyhub2RlKSkpIHtcbiAgICAgICAgVHJhbnNpdGlvbi5zb3VyY2VzLmFkZChub2RlKTtcbiAgICAgICAgbm9kZS50VmFsdWUgPSB2YWx1ZTtcbiAgICAgIH1cbiAgICAgIGlmICghVHJhbnNpdGlvblJ1bm5pbmcpIG5vZGUudmFsdWUgPSB2YWx1ZTtcbiAgICB9IGVsc2Ugbm9kZS52YWx1ZSA9IHZhbHVlO1xuICAgIGlmIChub2RlLm9ic2VydmVycyAmJiBub2RlLm9ic2VydmVycy5sZW5ndGgpIHtcbiAgICAgIHJ1blVwZGF0ZXMoKCkgPT4ge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG5vZGUub2JzZXJ2ZXJzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgY29uc3QgbyA9IG5vZGUub2JzZXJ2ZXJzW2ldO1xuICAgICAgICAgIGNvbnN0IFRyYW5zaXRpb25SdW5uaW5nID0gVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmc7XG4gICAgICAgICAgaWYgKFRyYW5zaXRpb25SdW5uaW5nICYmIFRyYW5zaXRpb24uZGlzcG9zZWQuaGFzKG8pKSBjb250aW51ZTtcbiAgICAgICAgICBpZiAoVHJhbnNpdGlvblJ1bm5pbmcgPyAhby50U3RhdGUgOiAhby5zdGF0ZSkge1xuICAgICAgICAgICAgaWYgKG8ucHVyZSkgVXBkYXRlcy5wdXNoKG8pO1xuICAgICAgICAgICAgZWxzZSBFZmZlY3RzLnB1c2gobyk7XG4gICAgICAgICAgICBpZiAoby5vYnNlcnZlcnMpIG1hcmtEb3duc3RyZWFtKG8pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIVRyYW5zaXRpb25SdW5uaW5nKSBvLnN0YXRlID0gU1RBTEU7XG4gICAgICAgICAgZWxzZSBvLnRTdGF0ZSA9IFNUQUxFO1xuICAgICAgICB9XG4gICAgICAgIGlmIChVcGRhdGVzLmxlbmd0aCA+IDEwZTUpIHtcbiAgICAgICAgICBVcGRhdGVzID0gW107XG4gICAgICAgICAgaWYgKGZhbHNlKTtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoKTtcbiAgICAgICAgfVxuICAgICAgfSwgZmFsc2UpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG5mdW5jdGlvbiB1cGRhdGVDb21wdXRhdGlvbihub2RlKSB7XG4gIGlmICghbm9kZS5mbikgcmV0dXJuO1xuICBjbGVhbk5vZGUobm9kZSk7XG4gIGNvbnN0IHRpbWUgPSBFeGVjQ291bnQ7XG4gIHJ1bkNvbXB1dGF0aW9uKFxuICAgIG5vZGUsXG4gICAgVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcgJiYgVHJhbnNpdGlvbi5zb3VyY2VzLmhhcyhub2RlKSA/IG5vZGUudFZhbHVlIDogbm9kZS52YWx1ZSxcbiAgICB0aW1lXG4gICk7XG4gIGlmIChUcmFuc2l0aW9uICYmICFUcmFuc2l0aW9uLnJ1bm5pbmcgJiYgVHJhbnNpdGlvbi5zb3VyY2VzLmhhcyhub2RlKSkge1xuICAgIHF1ZXVlTWljcm90YXNrKCgpID0+IHtcbiAgICAgIHJ1blVwZGF0ZXMoKCkgPT4ge1xuICAgICAgICBUcmFuc2l0aW9uICYmIChUcmFuc2l0aW9uLnJ1bm5pbmcgPSB0cnVlKTtcbiAgICAgICAgTGlzdGVuZXIgPSBPd25lciA9IG5vZGU7XG4gICAgICAgIHJ1bkNvbXB1dGF0aW9uKG5vZGUsIG5vZGUudFZhbHVlLCB0aW1lKTtcbiAgICAgICAgTGlzdGVuZXIgPSBPd25lciA9IG51bGw7XG4gICAgICB9LCBmYWxzZSk7XG4gICAgfSk7XG4gIH1cbn1cbmZ1bmN0aW9uIHJ1bkNvbXB1dGF0aW9uKG5vZGUsIHZhbHVlLCB0aW1lKSB7XG4gIGxldCBuZXh0VmFsdWU7XG4gIGNvbnN0IG93bmVyID0gT3duZXIsXG4gICAgbGlzdGVuZXIgPSBMaXN0ZW5lcjtcbiAgTGlzdGVuZXIgPSBPd25lciA9IG5vZGU7XG4gIHRyeSB7XG4gICAgbmV4dFZhbHVlID0gbm9kZS5mbih2YWx1ZSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChub2RlLnB1cmUpIHtcbiAgICAgIGlmIChUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZykge1xuICAgICAgICBub2RlLnRTdGF0ZSA9IFNUQUxFO1xuICAgICAgICBub2RlLnRPd25lZCAmJiBub2RlLnRPd25lZC5mb3JFYWNoKGNsZWFuTm9kZSk7XG4gICAgICAgIG5vZGUudE93bmVkID0gdW5kZWZpbmVkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbm9kZS5zdGF0ZSA9IFNUQUxFO1xuICAgICAgICBub2RlLm93bmVkICYmIG5vZGUub3duZWQuZm9yRWFjaChjbGVhbk5vZGUpO1xuICAgICAgICBub2RlLm93bmVkID0gbnVsbDtcbiAgICAgIH1cbiAgICB9XG4gICAgbm9kZS51cGRhdGVkQXQgPSB0aW1lICsgMTtcbiAgICByZXR1cm4gaGFuZGxlRXJyb3IoZXJyKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBMaXN0ZW5lciA9IGxpc3RlbmVyO1xuICAgIE93bmVyID0gb3duZXI7XG4gIH1cbiAgaWYgKCFub2RlLnVwZGF0ZWRBdCB8fCBub2RlLnVwZGF0ZWRBdCA8PSB0aW1lKSB7XG4gICAgaWYgKG5vZGUudXBkYXRlZEF0ICE9IG51bGwgJiYgXCJvYnNlcnZlcnNcIiBpbiBub2RlKSB7XG4gICAgICB3cml0ZVNpZ25hbChub2RlLCBuZXh0VmFsdWUsIHRydWUpO1xuICAgIH0gZWxzZSBpZiAoVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcgJiYgbm9kZS5wdXJlKSB7XG4gICAgICBUcmFuc2l0aW9uLnNvdXJjZXMuYWRkKG5vZGUpO1xuICAgICAgbm9kZS50VmFsdWUgPSBuZXh0VmFsdWU7XG4gICAgfSBlbHNlIG5vZGUudmFsdWUgPSBuZXh0VmFsdWU7XG4gICAgbm9kZS51cGRhdGVkQXQgPSB0aW1lO1xuICB9XG59XG5mdW5jdGlvbiBjcmVhdGVDb21wdXRhdGlvbihmbiwgaW5pdCwgcHVyZSwgc3RhdGUgPSBTVEFMRSwgb3B0aW9ucykge1xuICBjb25zdCBjID0ge1xuICAgIGZuLFxuICAgIHN0YXRlOiBzdGF0ZSxcbiAgICB1cGRhdGVkQXQ6IG51bGwsXG4gICAgb3duZWQ6IG51bGwsXG4gICAgc291cmNlczogbnVsbCxcbiAgICBzb3VyY2VTbG90czogbnVsbCxcbiAgICBjbGVhbnVwczogbnVsbCxcbiAgICB2YWx1ZTogaW5pdCxcbiAgICBvd25lcjogT3duZXIsXG4gICAgY29udGV4dDogT3duZXIgPyBPd25lci5jb250ZXh0IDogbnVsbCxcbiAgICBwdXJlXG4gIH07XG4gIGlmIChUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZykge1xuICAgIGMuc3RhdGUgPSAwO1xuICAgIGMudFN0YXRlID0gc3RhdGU7XG4gIH1cbiAgaWYgKE93bmVyID09PSBudWxsKTtcbiAgZWxzZSBpZiAoT3duZXIgIT09IFVOT1dORUQpIHtcbiAgICBpZiAoVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcgJiYgT3duZXIucHVyZSkge1xuICAgICAgaWYgKCFPd25lci50T3duZWQpIE93bmVyLnRPd25lZCA9IFtjXTtcbiAgICAgIGVsc2UgT3duZXIudE93bmVkLnB1c2goYyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghT3duZXIub3duZWQpIE93bmVyLm93bmVkID0gW2NdO1xuICAgICAgZWxzZSBPd25lci5vd25lZC5wdXNoKGMpO1xuICAgIH1cbiAgfVxuICBpZiAoRXh0ZXJuYWxTb3VyY2VDb25maWcgJiYgYy5mbikge1xuICAgIGNvbnN0IFt0cmFjaywgdHJpZ2dlcl0gPSBjcmVhdGVTaWduYWwodW5kZWZpbmVkLCB7XG4gICAgICBlcXVhbHM6IGZhbHNlXG4gICAgfSk7XG4gICAgY29uc3Qgb3JkaW5hcnkgPSBFeHRlcm5hbFNvdXJjZUNvbmZpZy5mYWN0b3J5KGMuZm4sIHRyaWdnZXIpO1xuICAgIG9uQ2xlYW51cCgoKSA9PiBvcmRpbmFyeS5kaXNwb3NlKCkpO1xuICAgIGNvbnN0IHRyaWdnZXJJblRyYW5zaXRpb24gPSAoKSA9PiBzdGFydFRyYW5zaXRpb24odHJpZ2dlcikudGhlbigoKSA9PiBpblRyYW5zaXRpb24uZGlzcG9zZSgpKTtcbiAgICBjb25zdCBpblRyYW5zaXRpb24gPSBFeHRlcm5hbFNvdXJjZUNvbmZpZy5mYWN0b3J5KGMuZm4sIHRyaWdnZXJJblRyYW5zaXRpb24pO1xuICAgIGMuZm4gPSB4ID0+IHtcbiAgICAgIHRyYWNrKCk7XG4gICAgICByZXR1cm4gVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcgPyBpblRyYW5zaXRpb24udHJhY2soeCkgOiBvcmRpbmFyeS50cmFjayh4KTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBjO1xufVxuZnVuY3Rpb24gcnVuVG9wKG5vZGUpIHtcbiAgY29uc3QgcnVubmluZ1RyYW5zaXRpb24gPSBUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZztcbiAgaWYgKChydW5uaW5nVHJhbnNpdGlvbiA/IG5vZGUudFN0YXRlIDogbm9kZS5zdGF0ZSkgPT09IDApIHJldHVybjtcbiAgaWYgKChydW5uaW5nVHJhbnNpdGlvbiA/IG5vZGUudFN0YXRlIDogbm9kZS5zdGF0ZSkgPT09IFBFTkRJTkcpIHJldHVybiBsb29rVXBzdHJlYW0obm9kZSk7XG4gIGlmIChub2RlLnN1c3BlbnNlICYmIHVudHJhY2sobm9kZS5zdXNwZW5zZS5pbkZhbGxiYWNrKSkgcmV0dXJuIG5vZGUuc3VzcGVuc2UuZWZmZWN0cy5wdXNoKG5vZGUpO1xuICBjb25zdCBhbmNlc3RvcnMgPSBbbm9kZV07XG4gIHdoaWxlICgobm9kZSA9IG5vZGUub3duZXIpICYmICghbm9kZS51cGRhdGVkQXQgfHwgbm9kZS51cGRhdGVkQXQgPCBFeGVjQ291bnQpKSB7XG4gICAgaWYgKHJ1bm5pbmdUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24uZGlzcG9zZWQuaGFzKG5vZGUpKSByZXR1cm47XG4gICAgaWYgKHJ1bm5pbmdUcmFuc2l0aW9uID8gbm9kZS50U3RhdGUgOiBub2RlLnN0YXRlKSBhbmNlc3RvcnMucHVzaChub2RlKTtcbiAgfVxuICBmb3IgKGxldCBpID0gYW5jZXN0b3JzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgbm9kZSA9IGFuY2VzdG9yc1tpXTtcbiAgICBpZiAocnVubmluZ1RyYW5zaXRpb24pIHtcbiAgICAgIGxldCB0b3AgPSBub2RlLFxuICAgICAgICBwcmV2ID0gYW5jZXN0b3JzW2kgKyAxXTtcbiAgICAgIHdoaWxlICgodG9wID0gdG9wLm93bmVyKSAmJiB0b3AgIT09IHByZXYpIHtcbiAgICAgICAgaWYgKFRyYW5zaXRpb24uZGlzcG9zZWQuaGFzKHRvcCkpIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKChydW5uaW5nVHJhbnNpdGlvbiA/IG5vZGUudFN0YXRlIDogbm9kZS5zdGF0ZSkgPT09IFNUQUxFKSB7XG4gICAgICB1cGRhdGVDb21wdXRhdGlvbihub2RlKTtcbiAgICB9IGVsc2UgaWYgKChydW5uaW5nVHJhbnNpdGlvbiA/IG5vZGUudFN0YXRlIDogbm9kZS5zdGF0ZSkgPT09IFBFTkRJTkcpIHtcbiAgICAgIGNvbnN0IHVwZGF0ZXMgPSBVcGRhdGVzO1xuICAgICAgVXBkYXRlcyA9IG51bGw7XG4gICAgICBydW5VcGRhdGVzKCgpID0+IGxvb2tVcHN0cmVhbShub2RlLCBhbmNlc3RvcnNbMF0pLCBmYWxzZSk7XG4gICAgICBVcGRhdGVzID0gdXBkYXRlcztcbiAgICB9XG4gIH1cbn1cbmZ1bmN0aW9uIHJ1blVwZGF0ZXMoZm4sIGluaXQpIHtcbiAgaWYgKFVwZGF0ZXMpIHJldHVybiBmbigpO1xuICBsZXQgd2FpdCA9IGZhbHNlO1xuICBpZiAoIWluaXQpIFVwZGF0ZXMgPSBbXTtcbiAgaWYgKEVmZmVjdHMpIHdhaXQgPSB0cnVlO1xuICBlbHNlIEVmZmVjdHMgPSBbXTtcbiAgRXhlY0NvdW50Kys7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzID0gZm4oKTtcbiAgICBjb21wbGV0ZVVwZGF0ZXMod2FpdCk7XG4gICAgcmV0dXJuIHJlcztcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgaWYgKCF3YWl0KSBFZmZlY3RzID0gbnVsbDtcbiAgICBVcGRhdGVzID0gbnVsbDtcbiAgICBoYW5kbGVFcnJvcihlcnIpO1xuICB9XG59XG5mdW5jdGlvbiBjb21wbGV0ZVVwZGF0ZXMod2FpdCkge1xuICBpZiAoVXBkYXRlcykge1xuICAgIGlmIChTY2hlZHVsZXIgJiYgVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcpIHNjaGVkdWxlUXVldWUoVXBkYXRlcyk7XG4gICAgZWxzZSBydW5RdWV1ZShVcGRhdGVzKTtcbiAgICBVcGRhdGVzID0gbnVsbDtcbiAgfVxuICBpZiAod2FpdCkgcmV0dXJuO1xuICBsZXQgcmVzO1xuICBpZiAoVHJhbnNpdGlvbikge1xuICAgIGlmICghVHJhbnNpdGlvbi5wcm9taXNlcy5zaXplICYmICFUcmFuc2l0aW9uLnF1ZXVlLnNpemUpIHtcbiAgICAgIGNvbnN0IHNvdXJjZXMgPSBUcmFuc2l0aW9uLnNvdXJjZXM7XG4gICAgICBjb25zdCBkaXNwb3NlZCA9IFRyYW5zaXRpb24uZGlzcG9zZWQ7XG4gICAgICBFZmZlY3RzLnB1c2guYXBwbHkoRWZmZWN0cywgVHJhbnNpdGlvbi5lZmZlY3RzKTtcbiAgICAgIHJlcyA9IFRyYW5zaXRpb24ucmVzb2x2ZTtcbiAgICAgIGZvciAoY29uc3QgZSBvZiBFZmZlY3RzKSB7XG4gICAgICAgIFwidFN0YXRlXCIgaW4gZSAmJiAoZS5zdGF0ZSA9IGUudFN0YXRlKTtcbiAgICAgICAgZGVsZXRlIGUudFN0YXRlO1xuICAgICAgfVxuICAgICAgVHJhbnNpdGlvbiA9IG51bGw7XG4gICAgICBydW5VcGRhdGVzKCgpID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBkIG9mIGRpc3Bvc2VkKSBjbGVhbk5vZGUoZCk7XG4gICAgICAgIGZvciAoY29uc3QgdiBvZiBzb3VyY2VzKSB7XG4gICAgICAgICAgdi52YWx1ZSA9IHYudFZhbHVlO1xuICAgICAgICAgIGlmICh2Lm93bmVkKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gdi5vd25lZC5sZW5ndGg7IGkgPCBsZW47IGkrKykgY2xlYW5Ob2RlKHYub3duZWRbaV0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodi50T3duZWQpIHYub3duZWQgPSB2LnRPd25lZDtcbiAgICAgICAgICBkZWxldGUgdi50VmFsdWU7XG4gICAgICAgICAgZGVsZXRlIHYudE93bmVkO1xuICAgICAgICAgIHYudFN0YXRlID0gMDtcbiAgICAgICAgfVxuICAgICAgICBzZXRUcmFuc1BlbmRpbmcoZmFsc2UpO1xuICAgICAgfSwgZmFsc2UpO1xuICAgIH0gZWxzZSBpZiAoVHJhbnNpdGlvbi5ydW5uaW5nKSB7XG4gICAgICBUcmFuc2l0aW9uLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgIFRyYW5zaXRpb24uZWZmZWN0cy5wdXNoLmFwcGx5KFRyYW5zaXRpb24uZWZmZWN0cywgRWZmZWN0cyk7XG4gICAgICBFZmZlY3RzID0gbnVsbDtcbiAgICAgIHNldFRyYW5zUGVuZGluZyh0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cbiAgY29uc3QgZSA9IEVmZmVjdHM7XG4gIEVmZmVjdHMgPSBudWxsO1xuICBpZiAoZS5sZW5ndGgpIHJ1blVwZGF0ZXMoKCkgPT4gcnVuRWZmZWN0cyhlKSwgZmFsc2UpO1xuICBpZiAocmVzKSByZXMoKTtcbn1cbmZ1bmN0aW9uIHJ1blF1ZXVlKHF1ZXVlKSB7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcXVldWUubGVuZ3RoOyBpKyspIHJ1blRvcChxdWV1ZVtpXSk7XG59XG5mdW5jdGlvbiBzY2hlZHVsZVF1ZXVlKHF1ZXVlKSB7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcXVldWUubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBpdGVtID0gcXVldWVbaV07XG4gICAgY29uc3QgdGFza3MgPSBUcmFuc2l0aW9uLnF1ZXVlO1xuICAgIGlmICghdGFza3MuaGFzKGl0ZW0pKSB7XG4gICAgICB0YXNrcy5hZGQoaXRlbSk7XG4gICAgICBTY2hlZHVsZXIoKCkgPT4ge1xuICAgICAgICB0YXNrcy5kZWxldGUoaXRlbSk7XG4gICAgICAgIHJ1blVwZGF0ZXMoKCkgPT4ge1xuICAgICAgICAgIFRyYW5zaXRpb24ucnVubmluZyA9IHRydWU7XG4gICAgICAgICAgcnVuVG9wKGl0ZW0pO1xuICAgICAgICB9LCBmYWxzZSk7XG4gICAgICAgIFRyYW5zaXRpb24gJiYgKFRyYW5zaXRpb24ucnVubmluZyA9IGZhbHNlKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxufVxuZnVuY3Rpb24gcnVuVXNlckVmZmVjdHMocXVldWUpIHtcbiAgbGV0IGksXG4gICAgdXNlckxlbmd0aCA9IDA7XG4gIGZvciAoaSA9IDA7IGkgPCBxdWV1ZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGUgPSBxdWV1ZVtpXTtcbiAgICBpZiAoIWUudXNlcikgcnVuVG9wKGUpO1xuICAgIGVsc2UgcXVldWVbdXNlckxlbmd0aCsrXSA9IGU7XG4gIH1cbiAgaWYgKHNoYXJlZENvbmZpZy5jb250ZXh0KSB7XG4gICAgaWYgKHNoYXJlZENvbmZpZy5jb3VudCkge1xuICAgICAgc2hhcmVkQ29uZmlnLmVmZmVjdHMgfHwgKHNoYXJlZENvbmZpZy5lZmZlY3RzID0gW10pO1xuICAgICAgc2hhcmVkQ29uZmlnLmVmZmVjdHMucHVzaCguLi5xdWV1ZS5zbGljZSgwLCB1c2VyTGVuZ3RoKSk7XG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIGlmIChzaGFyZWRDb25maWcuZWZmZWN0cykge1xuICAgICAgcXVldWUgPSBbLi4uc2hhcmVkQ29uZmlnLmVmZmVjdHMsIC4uLnF1ZXVlXTtcbiAgICAgIHVzZXJMZW5ndGggKz0gc2hhcmVkQ29uZmlnLmVmZmVjdHMubGVuZ3RoO1xuICAgICAgZGVsZXRlIHNoYXJlZENvbmZpZy5lZmZlY3RzO1xuICAgIH1cbiAgICBzZXRIeWRyYXRlQ29udGV4dCgpO1xuICB9XG4gIGZvciAoaSA9IDA7IGkgPCB1c2VyTGVuZ3RoOyBpKyspIHJ1blRvcChxdWV1ZVtpXSk7XG59XG5mdW5jdGlvbiBsb29rVXBzdHJlYW0obm9kZSwgaWdub3JlKSB7XG4gIGNvbnN0IHJ1bm5pbmdUcmFuc2l0aW9uID0gVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmc7XG4gIGlmIChydW5uaW5nVHJhbnNpdGlvbikgbm9kZS50U3RhdGUgPSAwO1xuICBlbHNlIG5vZGUuc3RhdGUgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG5vZGUuc291cmNlcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGNvbnN0IHNvdXJjZSA9IG5vZGUuc291cmNlc1tpXTtcbiAgICBpZiAoc291cmNlLnNvdXJjZXMpIHtcbiAgICAgIGNvbnN0IHN0YXRlID0gcnVubmluZ1RyYW5zaXRpb24gPyBzb3VyY2UudFN0YXRlIDogc291cmNlLnN0YXRlO1xuICAgICAgaWYgKHN0YXRlID09PSBTVEFMRSkge1xuICAgICAgICBpZiAoc291cmNlICE9PSBpZ25vcmUgJiYgKCFzb3VyY2UudXBkYXRlZEF0IHx8IHNvdXJjZS51cGRhdGVkQXQgPCBFeGVjQ291bnQpKVxuICAgICAgICAgIHJ1blRvcChzb3VyY2UpO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gUEVORElORykgbG9va1Vwc3RyZWFtKHNvdXJjZSwgaWdub3JlKTtcbiAgICB9XG4gIH1cbn1cbmZ1bmN0aW9uIG1hcmtEb3duc3RyZWFtKG5vZGUpIHtcbiAgY29uc3QgcnVubmluZ1RyYW5zaXRpb24gPSBUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZztcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBub2RlLm9ic2VydmVycy5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGNvbnN0IG8gPSBub2RlLm9ic2VydmVyc1tpXTtcbiAgICBpZiAocnVubmluZ1RyYW5zaXRpb24gPyAhby50U3RhdGUgOiAhby5zdGF0ZSkge1xuICAgICAgaWYgKHJ1bm5pbmdUcmFuc2l0aW9uKSBvLnRTdGF0ZSA9IFBFTkRJTkc7XG4gICAgICBlbHNlIG8uc3RhdGUgPSBQRU5ESU5HO1xuICAgICAgaWYgKG8ucHVyZSkgVXBkYXRlcy5wdXNoKG8pO1xuICAgICAgZWxzZSBFZmZlY3RzLnB1c2gobyk7XG4gICAgICBvLm9ic2VydmVycyAmJiBtYXJrRG93bnN0cmVhbShvKTtcbiAgICB9XG4gIH1cbn1cbmZ1bmN0aW9uIGNsZWFuTm9kZShub2RlKSB7XG4gIGxldCBpO1xuICBpZiAobm9kZS5zb3VyY2VzKSB7XG4gICAgd2hpbGUgKG5vZGUuc291cmNlcy5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IHNvdXJjZSA9IG5vZGUuc291cmNlcy5wb3AoKSxcbiAgICAgICAgaW5kZXggPSBub2RlLnNvdXJjZVNsb3RzLnBvcCgpLFxuICAgICAgICBvYnMgPSBzb3VyY2Uub2JzZXJ2ZXJzO1xuICAgICAgaWYgKG9icyAmJiBvYnMubGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IG4gPSBvYnMucG9wKCksXG4gICAgICAgICAgcyA9IHNvdXJjZS5vYnNlcnZlclNsb3RzLnBvcCgpO1xuICAgICAgICBpZiAoaW5kZXggPCBvYnMubGVuZ3RoKSB7XG4gICAgICAgICAgbi5zb3VyY2VTbG90c1tzXSA9IGluZGV4O1xuICAgICAgICAgIG9ic1tpbmRleF0gPSBuO1xuICAgICAgICAgIHNvdXJjZS5vYnNlcnZlclNsb3RzW2luZGV4XSA9IHM7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nICYmIG5vZGUucHVyZSkge1xuICAgIGlmIChub2RlLnRPd25lZCkge1xuICAgICAgZm9yIChpID0gbm9kZS50T3duZWQubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIGNsZWFuTm9kZShub2RlLnRPd25lZFtpXSk7XG4gICAgICBkZWxldGUgbm9kZS50T3duZWQ7XG4gICAgfVxuICAgIHJlc2V0KG5vZGUsIHRydWUpO1xuICB9IGVsc2UgaWYgKG5vZGUub3duZWQpIHtcbiAgICBmb3IgKGkgPSBub2RlLm93bmVkLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSBjbGVhbk5vZGUobm9kZS5vd25lZFtpXSk7XG4gICAgbm9kZS5vd25lZCA9IG51bGw7XG4gIH1cbiAgaWYgKG5vZGUuY2xlYW51cHMpIHtcbiAgICBmb3IgKGkgPSBub2RlLmNsZWFudXBzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSBub2RlLmNsZWFudXBzW2ldKCk7XG4gICAgbm9kZS5jbGVhbnVwcyA9IG51bGw7XG4gIH1cbiAgaWYgKFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nKSBub2RlLnRTdGF0ZSA9IDA7XG4gIGVsc2Ugbm9kZS5zdGF0ZSA9IDA7XG59XG5mdW5jdGlvbiByZXNldChub2RlLCB0b3ApIHtcbiAgaWYgKCF0b3ApIHtcbiAgICBub2RlLnRTdGF0ZSA9IDA7XG4gICAgVHJhbnNpdGlvbi5kaXNwb3NlZC5hZGQobm9kZSk7XG4gIH1cbiAgaWYgKG5vZGUub3duZWQpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG5vZGUub3duZWQubGVuZ3RoOyBpKyspIHJlc2V0KG5vZGUub3duZWRbaV0pO1xuICB9XG59XG5mdW5jdGlvbiBjYXN0RXJyb3IoZXJyKSB7XG4gIGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvcikgcmV0dXJuIGVycjtcbiAgcmV0dXJuIG5ldyBFcnJvcih0eXBlb2YgZXJyID09PSBcInN0cmluZ1wiID8gZXJyIDogXCJVbmtub3duIGVycm9yXCIsIHtcbiAgICBjYXVzZTogZXJyXG4gIH0pO1xufVxuZnVuY3Rpb24gcnVuRXJyb3JzKGVyciwgZm5zLCBvd25lcikge1xuICB0cnkge1xuICAgIGZvciAoY29uc3QgZiBvZiBmbnMpIGYoZXJyKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGhhbmRsZUVycm9yKGUsIChvd25lciAmJiBvd25lci5vd25lcikgfHwgbnVsbCk7XG4gIH1cbn1cbmZ1bmN0aW9uIGhhbmRsZUVycm9yKGVyciwgb3duZXIgPSBPd25lcikge1xuICBjb25zdCBmbnMgPSBFUlJPUiAmJiBvd25lciAmJiBvd25lci5jb250ZXh0ICYmIG93bmVyLmNvbnRleHRbRVJST1JdO1xuICBjb25zdCBlcnJvciA9IGNhc3RFcnJvcihlcnIpO1xuICBpZiAoIWZucykgdGhyb3cgZXJyb3I7XG4gIGlmIChFZmZlY3RzKVxuICAgIEVmZmVjdHMucHVzaCh7XG4gICAgICBmbigpIHtcbiAgICAgICAgcnVuRXJyb3JzKGVycm9yLCBmbnMsIG93bmVyKTtcbiAgICAgIH0sXG4gICAgICBzdGF0ZTogU1RBTEVcbiAgICB9KTtcbiAgZWxzZSBydW5FcnJvcnMoZXJyb3IsIGZucywgb3duZXIpO1xufVxuZnVuY3Rpb24gcmVzb2x2ZUNoaWxkcmVuKGNoaWxkcmVuKSB7XG4gIGlmICh0eXBlb2YgY2hpbGRyZW4gPT09IFwiZnVuY3Rpb25cIiAmJiAhY2hpbGRyZW4ubGVuZ3RoKSByZXR1cm4gcmVzb2x2ZUNoaWxkcmVuKGNoaWxkcmVuKCkpO1xuICBpZiAoQXJyYXkuaXNBcnJheShjaGlsZHJlbikpIHtcbiAgICBjb25zdCByZXN1bHRzID0gW107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcmVzdWx0ID0gcmVzb2x2ZUNoaWxkcmVuKGNoaWxkcmVuW2ldKTtcbiAgICAgIEFycmF5LmlzQXJyYXkocmVzdWx0KSA/IHJlc3VsdHMucHVzaC5hcHBseShyZXN1bHRzLCByZXN1bHQpIDogcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9XG4gIHJldHVybiBjaGlsZHJlbjtcbn1cbmZ1bmN0aW9uIGNyZWF0ZVByb3ZpZGVyKGlkLCBvcHRpb25zKSB7XG4gIHJldHVybiBmdW5jdGlvbiBwcm92aWRlcihwcm9wcykge1xuICAgIGxldCByZXM7XG4gICAgY3JlYXRlUmVuZGVyRWZmZWN0KFxuICAgICAgKCkgPT5cbiAgICAgICAgKHJlcyA9IHVudHJhY2soKCkgPT4ge1xuICAgICAgICAgIE93bmVyLmNvbnRleHQgPSB7XG4gICAgICAgICAgICAuLi5Pd25lci5jb250ZXh0LFxuICAgICAgICAgICAgW2lkXTogcHJvcHMudmFsdWVcbiAgICAgICAgICB9O1xuICAgICAgICAgIHJldHVybiBjaGlsZHJlbigoKSA9PiBwcm9wcy5jaGlsZHJlbik7XG4gICAgICAgIH0pKSxcbiAgICAgIHVuZGVmaW5lZFxuICAgICk7XG4gICAgcmV0dXJuIHJlcztcbiAgfTtcbn1cbmZ1bmN0aW9uIG9uRXJyb3IoZm4pIHtcbiAgRVJST1IgfHwgKEVSUk9SID0gU3ltYm9sKFwiZXJyb3JcIikpO1xuICBpZiAoT3duZXIgPT09IG51bGwpO1xuICBlbHNlIGlmIChPd25lci5jb250ZXh0ID09PSBudWxsIHx8ICFPd25lci5jb250ZXh0W0VSUk9SXSkge1xuICAgIE93bmVyLmNvbnRleHQgPSB7XG4gICAgICAuLi5Pd25lci5jb250ZXh0LFxuICAgICAgW0VSUk9SXTogW2ZuXVxuICAgIH07XG4gICAgbXV0YXRlQ29udGV4dChPd25lciwgRVJST1IsIFtmbl0pO1xuICB9IGVsc2UgT3duZXIuY29udGV4dFtFUlJPUl0ucHVzaChmbik7XG59XG5mdW5jdGlvbiBtdXRhdGVDb250ZXh0KG8sIGtleSwgdmFsdWUpIHtcbiAgaWYgKG8ub3duZWQpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG8ub3duZWQubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChvLm93bmVkW2ldLmNvbnRleHQgPT09IG8uY29udGV4dCkgbXV0YXRlQ29udGV4dChvLm93bmVkW2ldLCBrZXksIHZhbHVlKTtcbiAgICAgIGlmICghby5vd25lZFtpXS5jb250ZXh0KSB7XG4gICAgICAgIG8ub3duZWRbaV0uY29udGV4dCA9IG8uY29udGV4dDtcbiAgICAgICAgbXV0YXRlQ29udGV4dChvLm93bmVkW2ldLCBrZXksIHZhbHVlKTtcbiAgICAgIH0gZWxzZSBpZiAoIW8ub3duZWRbaV0uY29udGV4dFtrZXldKSB7XG4gICAgICAgIG8ub3duZWRbaV0uY29udGV4dFtrZXldID0gdmFsdWU7XG4gICAgICAgIG11dGF0ZUNvbnRleHQoby5vd25lZFtpXSwga2V5LCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIG9ic2VydmFibGUoaW5wdXQpIHtcbiAgcmV0dXJuIHtcbiAgICBzdWJzY3JpYmUob2JzZXJ2ZXIpIHtcbiAgICAgIGlmICghKG9ic2VydmVyIGluc3RhbmNlb2YgT2JqZWN0KSB8fCBvYnNlcnZlciA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJFeHBlY3RlZCB0aGUgb2JzZXJ2ZXIgdG8gYmUgYW4gb2JqZWN0LlwiKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGhhbmRsZXIgPVxuICAgICAgICB0eXBlb2Ygb2JzZXJ2ZXIgPT09IFwiZnVuY3Rpb25cIiA/IG9ic2VydmVyIDogb2JzZXJ2ZXIubmV4dCAmJiBvYnNlcnZlci5uZXh0LmJpbmQob2JzZXJ2ZXIpO1xuICAgICAgaWYgKCFoYW5kbGVyKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdW5zdWJzY3JpYmUoKSB7fVxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgY29uc3QgZGlzcG9zZSA9IGNyZWF0ZVJvb3QoZGlzcG9zZXIgPT4ge1xuICAgICAgICBjcmVhdGVFZmZlY3QoKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHYgPSBpbnB1dCgpO1xuICAgICAgICAgIHVudHJhY2soKCkgPT4gaGFuZGxlcih2KSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZGlzcG9zZXI7XG4gICAgICB9KTtcbiAgICAgIGlmIChnZXRPd25lcigpKSBvbkNsZWFudXAoZGlzcG9zZSk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB1bnN1YnNjcmliZSgpIHtcbiAgICAgICAgICBkaXNwb3NlKCk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfSxcbiAgICBbU3ltYm9sLm9ic2VydmFibGUgfHwgXCJAQG9ic2VydmFibGVcIl0oKSB7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gIH07XG59XG5mdW5jdGlvbiBmcm9tKHByb2R1Y2VyKSB7XG4gIGNvbnN0IFtzLCBzZXRdID0gY3JlYXRlU2lnbmFsKHVuZGVmaW5lZCwge1xuICAgIGVxdWFsczogZmFsc2VcbiAgfSk7XG4gIGlmIChcInN1YnNjcmliZVwiIGluIHByb2R1Y2VyKSB7XG4gICAgY29uc3QgdW5zdWIgPSBwcm9kdWNlci5zdWJzY3JpYmUodiA9PiBzZXQoKCkgPT4gdikpO1xuICAgIG9uQ2xlYW51cCgoKSA9PiAoXCJ1bnN1YnNjcmliZVwiIGluIHVuc3ViID8gdW5zdWIudW5zdWJzY3JpYmUoKSA6IHVuc3ViKCkpKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBjbGVhbiA9IHByb2R1Y2VyKHNldCk7XG4gICAgb25DbGVhbnVwKGNsZWFuKTtcbiAgfVxuICByZXR1cm4gcztcbn1cblxuY29uc3QgRkFMTEJBQ0sgPSBTeW1ib2woXCJmYWxsYmFja1wiKTtcbmZ1bmN0aW9uIGRpc3Bvc2UoZCkge1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGQubGVuZ3RoOyBpKyspIGRbaV0oKTtcbn1cbmZ1bmN0aW9uIG1hcEFycmF5KGxpc3QsIG1hcEZuLCBvcHRpb25zID0ge30pIHtcbiAgbGV0IGl0ZW1zID0gW10sXG4gICAgbWFwcGVkID0gW10sXG4gICAgZGlzcG9zZXJzID0gW10sXG4gICAgbGVuID0gMCxcbiAgICBpbmRleGVzID0gbWFwRm4ubGVuZ3RoID4gMSA/IFtdIDogbnVsbDtcbiAgb25DbGVhbnVwKCgpID0+IGRpc3Bvc2UoZGlzcG9zZXJzKSk7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgbGV0IG5ld0l0ZW1zID0gbGlzdCgpIHx8IFtdLFxuICAgICAgaSxcbiAgICAgIGo7XG4gICAgbmV3SXRlbXNbJFRSQUNLXTtcbiAgICByZXR1cm4gdW50cmFjaygoKSA9PiB7XG4gICAgICBsZXQgbmV3TGVuID0gbmV3SXRlbXMubGVuZ3RoLFxuICAgICAgICBuZXdJbmRpY2VzLFxuICAgICAgICBuZXdJbmRpY2VzTmV4dCxcbiAgICAgICAgdGVtcCxcbiAgICAgICAgdGVtcGRpc3Bvc2VycyxcbiAgICAgICAgdGVtcEluZGV4ZXMsXG4gICAgICAgIHN0YXJ0LFxuICAgICAgICBlbmQsXG4gICAgICAgIG5ld0VuZCxcbiAgICAgICAgaXRlbTtcbiAgICAgIGlmIChuZXdMZW4gPT09IDApIHtcbiAgICAgICAgaWYgKGxlbiAhPT0gMCkge1xuICAgICAgICAgIGRpc3Bvc2UoZGlzcG9zZXJzKTtcbiAgICAgICAgICBkaXNwb3NlcnMgPSBbXTtcbiAgICAgICAgICBpdGVtcyA9IFtdO1xuICAgICAgICAgIG1hcHBlZCA9IFtdO1xuICAgICAgICAgIGxlbiA9IDA7XG4gICAgICAgICAgaW5kZXhlcyAmJiAoaW5kZXhlcyA9IFtdKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0aW9ucy5mYWxsYmFjaykge1xuICAgICAgICAgIGl0ZW1zID0gW0ZBTExCQUNLXTtcbiAgICAgICAgICBtYXBwZWRbMF0gPSBjcmVhdGVSb290KGRpc3Bvc2VyID0+IHtcbiAgICAgICAgICAgIGRpc3Bvc2Vyc1swXSA9IGRpc3Bvc2VyO1xuICAgICAgICAgICAgcmV0dXJuIG9wdGlvbnMuZmFsbGJhY2soKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsZW4gPSAxO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgICBtYXBwZWQgPSBuZXcgQXJyYXkobmV3TGVuKTtcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IG5ld0xlbjsgaisrKSB7XG4gICAgICAgICAgaXRlbXNbal0gPSBuZXdJdGVtc1tqXTtcbiAgICAgICAgICBtYXBwZWRbal0gPSBjcmVhdGVSb290KG1hcHBlcik7XG4gICAgICAgIH1cbiAgICAgICAgbGVuID0gbmV3TGVuO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGVtcCA9IG5ldyBBcnJheShuZXdMZW4pO1xuICAgICAgICB0ZW1wZGlzcG9zZXJzID0gbmV3IEFycmF5KG5ld0xlbik7XG4gICAgICAgIGluZGV4ZXMgJiYgKHRlbXBJbmRleGVzID0gbmV3IEFycmF5KG5ld0xlbikpO1xuICAgICAgICBmb3IgKFxuICAgICAgICAgIHN0YXJ0ID0gMCwgZW5kID0gTWF0aC5taW4obGVuLCBuZXdMZW4pO1xuICAgICAgICAgIHN0YXJ0IDwgZW5kICYmIGl0ZW1zW3N0YXJ0XSA9PT0gbmV3SXRlbXNbc3RhcnRdO1xuICAgICAgICAgIHN0YXJ0KytcbiAgICAgICAgKTtcbiAgICAgICAgZm9yIChcbiAgICAgICAgICBlbmQgPSBsZW4gLSAxLCBuZXdFbmQgPSBuZXdMZW4gLSAxO1xuICAgICAgICAgIGVuZCA+PSBzdGFydCAmJiBuZXdFbmQgPj0gc3RhcnQgJiYgaXRlbXNbZW5kXSA9PT0gbmV3SXRlbXNbbmV3RW5kXTtcbiAgICAgICAgICBlbmQtLSwgbmV3RW5kLS1cbiAgICAgICAgKSB7XG4gICAgICAgICAgdGVtcFtuZXdFbmRdID0gbWFwcGVkW2VuZF07XG4gICAgICAgICAgdGVtcGRpc3Bvc2Vyc1tuZXdFbmRdID0gZGlzcG9zZXJzW2VuZF07XG4gICAgICAgICAgaW5kZXhlcyAmJiAodGVtcEluZGV4ZXNbbmV3RW5kXSA9IGluZGV4ZXNbZW5kXSk7XG4gICAgICAgIH1cbiAgICAgICAgbmV3SW5kaWNlcyA9IG5ldyBNYXAoKTtcbiAgICAgICAgbmV3SW5kaWNlc05leHQgPSBuZXcgQXJyYXkobmV3RW5kICsgMSk7XG4gICAgICAgIGZvciAoaiA9IG5ld0VuZDsgaiA+PSBzdGFydDsgai0tKSB7XG4gICAgICAgICAgaXRlbSA9IG5ld0l0ZW1zW2pdO1xuICAgICAgICAgIGkgPSBuZXdJbmRpY2VzLmdldChpdGVtKTtcbiAgICAgICAgICBuZXdJbmRpY2VzTmV4dFtqXSA9IGkgPT09IHVuZGVmaW5lZCA/IC0xIDogaTtcbiAgICAgICAgICBuZXdJbmRpY2VzLnNldChpdGVtLCBqKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGkgPSBzdGFydDsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICAgIGl0ZW0gPSBpdGVtc1tpXTtcbiAgICAgICAgICBqID0gbmV3SW5kaWNlcy5nZXQoaXRlbSk7XG4gICAgICAgICAgaWYgKGogIT09IHVuZGVmaW5lZCAmJiBqICE9PSAtMSkge1xuICAgICAgICAgICAgdGVtcFtqXSA9IG1hcHBlZFtpXTtcbiAgICAgICAgICAgIHRlbXBkaXNwb3NlcnNbal0gPSBkaXNwb3NlcnNbaV07XG4gICAgICAgICAgICBpbmRleGVzICYmICh0ZW1wSW5kZXhlc1tqXSA9IGluZGV4ZXNbaV0pO1xuICAgICAgICAgICAgaiA9IG5ld0luZGljZXNOZXh0W2pdO1xuICAgICAgICAgICAgbmV3SW5kaWNlcy5zZXQoaXRlbSwgaik7XG4gICAgICAgICAgfSBlbHNlIGRpc3Bvc2Vyc1tpXSgpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoaiA9IHN0YXJ0OyBqIDwgbmV3TGVuOyBqKyspIHtcbiAgICAgICAgICBpZiAoaiBpbiB0ZW1wKSB7XG4gICAgICAgICAgICBtYXBwZWRbal0gPSB0ZW1wW2pdO1xuICAgICAgICAgICAgZGlzcG9zZXJzW2pdID0gdGVtcGRpc3Bvc2Vyc1tqXTtcbiAgICAgICAgICAgIGlmIChpbmRleGVzKSB7XG4gICAgICAgICAgICAgIGluZGV4ZXNbal0gPSB0ZW1wSW5kZXhlc1tqXTtcbiAgICAgICAgICAgICAgaW5kZXhlc1tqXShqKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgbWFwcGVkW2pdID0gY3JlYXRlUm9vdChtYXBwZXIpO1xuICAgICAgICB9XG4gICAgICAgIG1hcHBlZCA9IG1hcHBlZC5zbGljZSgwLCAobGVuID0gbmV3TGVuKSk7XG4gICAgICAgIGl0ZW1zID0gbmV3SXRlbXMuc2xpY2UoMCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbWFwcGVkO1xuICAgIH0pO1xuICAgIGZ1bmN0aW9uIG1hcHBlcihkaXNwb3Nlcikge1xuICAgICAgZGlzcG9zZXJzW2pdID0gZGlzcG9zZXI7XG4gICAgICBpZiAoaW5kZXhlcykge1xuICAgICAgICBjb25zdCBbcywgc2V0XSA9IGNyZWF0ZVNpZ25hbChqKTtcbiAgICAgICAgaW5kZXhlc1tqXSA9IHNldDtcbiAgICAgICAgcmV0dXJuIG1hcEZuKG5ld0l0ZW1zW2pdLCBzKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXBGbihuZXdJdGVtc1tqXSk7XG4gICAgfVxuICB9O1xufVxuZnVuY3Rpb24gaW5kZXhBcnJheShsaXN0LCBtYXBGbiwgb3B0aW9ucyA9IHt9KSB7XG4gIGxldCBpdGVtcyA9IFtdLFxuICAgIG1hcHBlZCA9IFtdLFxuICAgIGRpc3Bvc2VycyA9IFtdLFxuICAgIHNpZ25hbHMgPSBbXSxcbiAgICBsZW4gPSAwLFxuICAgIGk7XG4gIG9uQ2xlYW51cCgoKSA9PiBkaXNwb3NlKGRpc3Bvc2VycykpO1xuICByZXR1cm4gKCkgPT4ge1xuICAgIGNvbnN0IG5ld0l0ZW1zID0gbGlzdCgpIHx8IFtdO1xuICAgIG5ld0l0ZW1zWyRUUkFDS107XG4gICAgcmV0dXJuIHVudHJhY2soKCkgPT4ge1xuICAgICAgaWYgKG5ld0l0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBpZiAobGVuICE9PSAwKSB7XG4gICAgICAgICAgZGlzcG9zZShkaXNwb3NlcnMpO1xuICAgICAgICAgIGRpc3Bvc2VycyA9IFtdO1xuICAgICAgICAgIGl0ZW1zID0gW107XG4gICAgICAgICAgbWFwcGVkID0gW107XG4gICAgICAgICAgbGVuID0gMDtcbiAgICAgICAgICBzaWduYWxzID0gW107XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdGlvbnMuZmFsbGJhY2spIHtcbiAgICAgICAgICBpdGVtcyA9IFtGQUxMQkFDS107XG4gICAgICAgICAgbWFwcGVkWzBdID0gY3JlYXRlUm9vdChkaXNwb3NlciA9PiB7XG4gICAgICAgICAgICBkaXNwb3NlcnNbMF0gPSBkaXNwb3NlcjtcbiAgICAgICAgICAgIHJldHVybiBvcHRpb25zLmZhbGxiYWNrKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgbGVuID0gMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWFwcGVkO1xuICAgICAgfVxuICAgICAgaWYgKGl0ZW1zWzBdID09PSBGQUxMQkFDSykge1xuICAgICAgICBkaXNwb3NlcnNbMF0oKTtcbiAgICAgICAgZGlzcG9zZXJzID0gW107XG4gICAgICAgIGl0ZW1zID0gW107XG4gICAgICAgIG1hcHBlZCA9IFtdO1xuICAgICAgICBsZW4gPSAwO1xuICAgICAgfVxuICAgICAgZm9yIChpID0gMDsgaSA8IG5ld0l0ZW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChpIDwgaXRlbXMubGVuZ3RoICYmIGl0ZW1zW2ldICE9PSBuZXdJdGVtc1tpXSkge1xuICAgICAgICAgIHNpZ25hbHNbaV0oKCkgPT4gbmV3SXRlbXNbaV0pO1xuICAgICAgICB9IGVsc2UgaWYgKGkgPj0gaXRlbXMubGVuZ3RoKSB7XG4gICAgICAgICAgbWFwcGVkW2ldID0gY3JlYXRlUm9vdChtYXBwZXIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBmb3IgKDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGRpc3Bvc2Vyc1tpXSgpO1xuICAgICAgfVxuICAgICAgbGVuID0gc2lnbmFscy5sZW5ndGggPSBkaXNwb3NlcnMubGVuZ3RoID0gbmV3SXRlbXMubGVuZ3RoO1xuICAgICAgaXRlbXMgPSBuZXdJdGVtcy5zbGljZSgwKTtcbiAgICAgIHJldHVybiAobWFwcGVkID0gbWFwcGVkLnNsaWNlKDAsIGxlbikpO1xuICAgIH0pO1xuICAgIGZ1bmN0aW9uIG1hcHBlcihkaXNwb3Nlcikge1xuICAgICAgZGlzcG9zZXJzW2ldID0gZGlzcG9zZXI7XG4gICAgICBjb25zdCBbcywgc2V0XSA9IGNyZWF0ZVNpZ25hbChuZXdJdGVtc1tpXSk7XG4gICAgICBzaWduYWxzW2ldID0gc2V0O1xuICAgICAgcmV0dXJuIG1hcEZuKHMsIGkpO1xuICAgIH1cbiAgfTtcbn1cblxubGV0IGh5ZHJhdGlvbkVuYWJsZWQgPSBmYWxzZTtcbmZ1bmN0aW9uIGVuYWJsZUh5ZHJhdGlvbigpIHtcbiAgaHlkcmF0aW9uRW5hYmxlZCA9IHRydWU7XG59XG5mdW5jdGlvbiBjcmVhdGVDb21wb25lbnQoQ29tcCwgcHJvcHMpIHtcbiAgaWYgKGh5ZHJhdGlvbkVuYWJsZWQpIHtcbiAgICBpZiAoc2hhcmVkQ29uZmlnLmNvbnRleHQpIHtcbiAgICAgIGNvbnN0IGMgPSBzaGFyZWRDb25maWcuY29udGV4dDtcbiAgICAgIHNldEh5ZHJhdGVDb250ZXh0KG5leHRIeWRyYXRlQ29udGV4dCgpKTtcbiAgICAgIGNvbnN0IHIgPSB1bnRyYWNrKCgpID0+IENvbXAocHJvcHMgfHwge30pKTtcbiAgICAgIHNldEh5ZHJhdGVDb250ZXh0KGMpO1xuICAgICAgcmV0dXJuIHI7XG4gICAgfVxuICB9XG4gIHJldHVybiB1bnRyYWNrKCgpID0+IENvbXAocHJvcHMgfHwge30pKTtcbn1cbmZ1bmN0aW9uIHRydWVGbigpIHtcbiAgcmV0dXJuIHRydWU7XG59XG5jb25zdCBwcm9wVHJhcHMgPSB7XG4gIGdldChfLCBwcm9wZXJ0eSwgcmVjZWl2ZXIpIHtcbiAgICBpZiAocHJvcGVydHkgPT09ICRQUk9YWSkgcmV0dXJuIHJlY2VpdmVyO1xuICAgIHJldHVybiBfLmdldChwcm9wZXJ0eSk7XG4gIH0sXG4gIGhhcyhfLCBwcm9wZXJ0eSkge1xuICAgIGlmIChwcm9wZXJ0eSA9PT0gJFBST1hZKSByZXR1cm4gdHJ1ZTtcbiAgICByZXR1cm4gXy5oYXMocHJvcGVydHkpO1xuICB9LFxuICBzZXQ6IHRydWVGbixcbiAgZGVsZXRlUHJvcGVydHk6IHRydWVGbixcbiAgZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKF8sIHByb3BlcnR5KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICBnZXQoKSB7XG4gICAgICAgIHJldHVybiBfLmdldChwcm9wZXJ0eSk7XG4gICAgICB9LFxuICAgICAgc2V0OiB0cnVlRm4sXG4gICAgICBkZWxldGVQcm9wZXJ0eTogdHJ1ZUZuXG4gICAgfTtcbiAgfSxcbiAgb3duS2V5cyhfKSB7XG4gICAgcmV0dXJuIF8ua2V5cygpO1xuICB9XG59O1xuZnVuY3Rpb24gcmVzb2x2ZVNvdXJjZShzKSB7XG4gIHJldHVybiAhKHMgPSB0eXBlb2YgcyA9PT0gXCJmdW5jdGlvblwiID8gcygpIDogcykgPyB7fSA6IHM7XG59XG5mdW5jdGlvbiByZXNvbHZlU291cmNlcygpIHtcbiAgZm9yIChsZXQgaSA9IDAsIGxlbmd0aCA9IHRoaXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBjb25zdCB2ID0gdGhpc1tpXSgpO1xuICAgIGlmICh2ICE9PSB1bmRlZmluZWQpIHJldHVybiB2O1xuICB9XG59XG5mdW5jdGlvbiBtZXJnZVByb3BzKC4uLnNvdXJjZXMpIHtcbiAgbGV0IHByb3h5ID0gZmFsc2U7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc291cmNlcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHMgPSBzb3VyY2VzW2ldO1xuICAgIHByb3h5ID0gcHJveHkgfHwgKCEhcyAmJiAkUFJPWFkgaW4gcyk7XG4gICAgc291cmNlc1tpXSA9IHR5cGVvZiBzID09PSBcImZ1bmN0aW9uXCIgPyAoKHByb3h5ID0gdHJ1ZSksIGNyZWF0ZU1lbW8ocykpIDogcztcbiAgfVxuICBpZiAocHJveHkpIHtcbiAgICByZXR1cm4gbmV3IFByb3h5KFxuICAgICAge1xuICAgICAgICBnZXQocHJvcGVydHkpIHtcbiAgICAgICAgICBmb3IgKGxldCBpID0gc291cmNlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgY29uc3QgdiA9IHJlc29sdmVTb3VyY2Uoc291cmNlc1tpXSlbcHJvcGVydHldO1xuICAgICAgICAgICAgaWYgKHYgIT09IHVuZGVmaW5lZCkgcmV0dXJuIHY7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBoYXMocHJvcGVydHkpIHtcbiAgICAgICAgICBmb3IgKGxldCBpID0gc291cmNlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5IGluIHJlc29sdmVTb3VyY2Uoc291cmNlc1tpXSkpIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG4gICAgICAgIGtleXMoKSB7XG4gICAgICAgICAgY29uc3Qga2V5cyA9IFtdO1xuICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc291cmNlcy5sZW5ndGg7IGkrKylcbiAgICAgICAgICAgIGtleXMucHVzaCguLi5PYmplY3Qua2V5cyhyZXNvbHZlU291cmNlKHNvdXJjZXNbaV0pKSk7XG4gICAgICAgICAgcmV0dXJuIFsuLi5uZXcgU2V0KGtleXMpXTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIHByb3BUcmFwc1xuICAgICk7XG4gIH1cbiAgY29uc3Qgc291cmNlc01hcCA9IHt9O1xuICBjb25zdCBkZWZpbmVkID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgZm9yIChsZXQgaSA9IHNvdXJjZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBjb25zdCBzb3VyY2UgPSBzb3VyY2VzW2ldO1xuICAgIGlmICghc291cmNlKSBjb250aW51ZTtcbiAgICBjb25zdCBzb3VyY2VLZXlzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMoc291cmNlKTtcbiAgICBmb3IgKGxldCBpID0gc291cmNlS2V5cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgY29uc3Qga2V5ID0gc291cmNlS2V5c1tpXTtcbiAgICAgIGlmIChrZXkgPT09IFwiX19wcm90b19fXCIgfHwga2V5ID09PSBcImNvbnN0cnVjdG9yXCIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3Ioc291cmNlLCBrZXkpO1xuICAgICAgaWYgKCFkZWZpbmVkW2tleV0pIHtcbiAgICAgICAgZGVmaW5lZFtrZXldID0gZGVzYy5nZXRcbiAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICBnZXQ6IHJlc29sdmVTb3VyY2VzLmJpbmQoKHNvdXJjZXNNYXBba2V5XSA9IFtkZXNjLmdldC5iaW5kKHNvdXJjZSldKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICA6IGRlc2MudmFsdWUgIT09IHVuZGVmaW5lZFxuICAgICAgICAgID8gZGVzY1xuICAgICAgICAgIDogdW5kZWZpbmVkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3Qgc291cmNlcyA9IHNvdXJjZXNNYXBba2V5XTtcbiAgICAgICAgaWYgKHNvdXJjZXMpIHtcbiAgICAgICAgICBpZiAoZGVzYy5nZXQpIHNvdXJjZXMucHVzaChkZXNjLmdldC5iaW5kKHNvdXJjZSkpO1xuICAgICAgICAgIGVsc2UgaWYgKGRlc2MudmFsdWUgIT09IHVuZGVmaW5lZCkgc291cmNlcy5wdXNoKCgpID0+IGRlc2MudmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGNvbnN0IHRhcmdldCA9IHt9O1xuICBjb25zdCBkZWZpbmVkS2V5cyA9IE9iamVjdC5rZXlzKGRlZmluZWQpO1xuICBmb3IgKGxldCBpID0gZGVmaW5lZEtleXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBjb25zdCBrZXkgPSBkZWZpbmVkS2V5c1tpXSxcbiAgICAgIGRlc2MgPSBkZWZpbmVkW2tleV07XG4gICAgaWYgKGRlc2MgJiYgZGVzYy5nZXQpIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIGtleSwgZGVzYyk7XG4gICAgZWxzZSB0YXJnZXRba2V5XSA9IGRlc2MgPyBkZXNjLnZhbHVlIDogdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiB0YXJnZXQ7XG59XG5mdW5jdGlvbiBzcGxpdFByb3BzKHByb3BzLCAuLi5rZXlzKSB7XG4gIGlmICgkUFJPWFkgaW4gcHJvcHMpIHtcbiAgICBjb25zdCBibG9ja2VkID0gbmV3IFNldChrZXlzLmxlbmd0aCA+IDEgPyBrZXlzLmZsYXQoKSA6IGtleXNbMF0pO1xuICAgIGNvbnN0IHJlcyA9IGtleXMubWFwKGsgPT4ge1xuICAgICAgcmV0dXJuIG5ldyBQcm94eShcbiAgICAgICAge1xuICAgICAgICAgIGdldChwcm9wZXJ0eSkge1xuICAgICAgICAgICAgcmV0dXJuIGsuaW5jbHVkZXMocHJvcGVydHkpID8gcHJvcHNbcHJvcGVydHldIDogdW5kZWZpbmVkO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgaGFzKHByb3BlcnR5KSB7XG4gICAgICAgICAgICByZXR1cm4gay5pbmNsdWRlcyhwcm9wZXJ0eSkgJiYgcHJvcGVydHkgaW4gcHJvcHM7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBrZXlzKCkge1xuICAgICAgICAgICAgcmV0dXJuIGsuZmlsdGVyKHByb3BlcnR5ID0+IHByb3BlcnR5IGluIHByb3BzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHByb3BUcmFwc1xuICAgICAgKTtcbiAgICB9KTtcbiAgICByZXMucHVzaChcbiAgICAgIG5ldyBQcm94eShcbiAgICAgICAge1xuICAgICAgICAgIGdldChwcm9wZXJ0eSkge1xuICAgICAgICAgICAgcmV0dXJuIGJsb2NrZWQuaGFzKHByb3BlcnR5KSA/IHVuZGVmaW5lZCA6IHByb3BzW3Byb3BlcnR5XTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGhhcyhwcm9wZXJ0eSkge1xuICAgICAgICAgICAgcmV0dXJuIGJsb2NrZWQuaGFzKHByb3BlcnR5KSA/IGZhbHNlIDogcHJvcGVydHkgaW4gcHJvcHM7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBrZXlzKCkge1xuICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHByb3BzKS5maWx0ZXIoayA9PiAhYmxvY2tlZC5oYXMoaykpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcHJvcFRyYXBzXG4gICAgICApXG4gICAgKTtcbiAgICByZXR1cm4gcmVzO1xuICB9XG4gIGNvbnN0IG90aGVyT2JqZWN0ID0ge307XG4gIGNvbnN0IG9iamVjdHMgPSBrZXlzLm1hcCgoKSA9PiAoe30pKTtcbiAgZm9yIChjb25zdCBwcm9wTmFtZSBvZiBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhwcm9wcykpIHtcbiAgICBjb25zdCBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihwcm9wcywgcHJvcE5hbWUpO1xuICAgIGNvbnN0IGlzRGVmYXVsdERlc2MgPVxuICAgICAgIWRlc2MuZ2V0ICYmICFkZXNjLnNldCAmJiBkZXNjLmVudW1lcmFibGUgJiYgZGVzYy53cml0YWJsZSAmJiBkZXNjLmNvbmZpZ3VyYWJsZTtcbiAgICBsZXQgYmxvY2tlZCA9IGZhbHNlO1xuICAgIGxldCBvYmplY3RJbmRleCA9IDA7XG4gICAgZm9yIChjb25zdCBrIG9mIGtleXMpIHtcbiAgICAgIGlmIChrLmluY2x1ZGVzKHByb3BOYW1lKSkge1xuICAgICAgICBibG9ja2VkID0gdHJ1ZTtcbiAgICAgICAgaXNEZWZhdWx0RGVzY1xuICAgICAgICAgID8gKG9iamVjdHNbb2JqZWN0SW5kZXhdW3Byb3BOYW1lXSA9IGRlc2MudmFsdWUpXG4gICAgICAgICAgOiBPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqZWN0c1tvYmplY3RJbmRleF0sIHByb3BOYW1lLCBkZXNjKTtcbiAgICAgIH1cbiAgICAgICsrb2JqZWN0SW5kZXg7XG4gICAgfVxuICAgIGlmICghYmxvY2tlZCkge1xuICAgICAgaXNEZWZhdWx0RGVzY1xuICAgICAgICA/IChvdGhlck9iamVjdFtwcm9wTmFtZV0gPSBkZXNjLnZhbHVlKVxuICAgICAgICA6IE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvdGhlck9iamVjdCwgcHJvcE5hbWUsIGRlc2MpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gWy4uLm9iamVjdHMsIG90aGVyT2JqZWN0XTtcbn1cbmZ1bmN0aW9uIGxhenkoZm4pIHtcbiAgbGV0IGNvbXA7XG4gIGxldCBwO1xuICBjb25zdCB3cmFwID0gcHJvcHMgPT4ge1xuICAgIGNvbnN0IGN0eCA9IHNoYXJlZENvbmZpZy5jb250ZXh0O1xuICAgIGlmIChjdHgpIHtcbiAgICAgIGNvbnN0IFtzLCBzZXRdID0gY3JlYXRlU2lnbmFsKCk7XG4gICAgICBzaGFyZWRDb25maWcuY291bnQgfHwgKHNoYXJlZENvbmZpZy5jb3VudCA9IDApO1xuICAgICAgc2hhcmVkQ29uZmlnLmNvdW50Kys7XG4gICAgICAocCB8fCAocCA9IGZuKCkpKS50aGVuKG1vZCA9PiB7XG4gICAgICAgIHNldEh5ZHJhdGVDb250ZXh0KGN0eCk7XG4gICAgICAgIHNoYXJlZENvbmZpZy5jb3VudC0tO1xuICAgICAgICBzZXQoKCkgPT4gbW9kLmRlZmF1bHQpO1xuICAgICAgICBzZXRIeWRyYXRlQ29udGV4dCgpO1xuICAgICAgfSk7XG4gICAgICBjb21wID0gcztcbiAgICB9IGVsc2UgaWYgKCFjb21wKSB7XG4gICAgICBjb25zdCBbc10gPSBjcmVhdGVSZXNvdXJjZSgoKSA9PiAocCB8fCAocCA9IGZuKCkpKS50aGVuKG1vZCA9PiBtb2QuZGVmYXVsdCkpO1xuICAgICAgY29tcCA9IHM7XG4gICAgfVxuICAgIGxldCBDb21wO1xuICAgIHJldHVybiBjcmVhdGVNZW1vKFxuICAgICAgKCkgPT5cbiAgICAgICAgKENvbXAgPSBjb21wKCkpICYmXG4gICAgICAgIHVudHJhY2soKCkgPT4ge1xuICAgICAgICAgIGlmIChmYWxzZSk7XG4gICAgICAgICAgaWYgKCFjdHgpIHJldHVybiBDb21wKHByb3BzKTtcbiAgICAgICAgICBjb25zdCBjID0gc2hhcmVkQ29uZmlnLmNvbnRleHQ7XG4gICAgICAgICAgc2V0SHlkcmF0ZUNvbnRleHQoY3R4KTtcbiAgICAgICAgICBjb25zdCByID0gQ29tcChwcm9wcyk7XG4gICAgICAgICAgc2V0SHlkcmF0ZUNvbnRleHQoYyk7XG4gICAgICAgICAgcmV0dXJuIHI7XG4gICAgICAgIH0pXG4gICAgKTtcbiAgfTtcbiAgd3JhcC5wcmVsb2FkID0gKCkgPT4gcCB8fCAoKHAgPSBmbigpKS50aGVuKG1vZCA9PiAoY29tcCA9ICgpID0+IG1vZC5kZWZhdWx0KSksIHApO1xuICByZXR1cm4gd3JhcDtcbn1cbmxldCBjb3VudGVyID0gMDtcbmZ1bmN0aW9uIGNyZWF0ZVVuaXF1ZUlkKCkge1xuICBjb25zdCBjdHggPSBzaGFyZWRDb25maWcuY29udGV4dDtcbiAgcmV0dXJuIGN0eCA/IGAke2N0eC5pZH0ke2N0eC5jb3VudCsrfWAgOiBgY2wtJHtjb3VudGVyKyt9YDtcbn1cblxuY29uc3QgbmFycm93ZWRFcnJvciA9IG5hbWUgPT4gYFN0YWxlIHJlYWQgZnJvbSA8JHtuYW1lfT4uYDtcbmZ1bmN0aW9uIEZvcihwcm9wcykge1xuICBjb25zdCBmYWxsYmFjayA9IFwiZmFsbGJhY2tcIiBpbiBwcm9wcyAmJiB7XG4gICAgZmFsbGJhY2s6ICgpID0+IHByb3BzLmZhbGxiYWNrXG4gIH07XG4gIHJldHVybiBjcmVhdGVNZW1vKG1hcEFycmF5KCgpID0+IHByb3BzLmVhY2gsIHByb3BzLmNoaWxkcmVuLCBmYWxsYmFjayB8fCB1bmRlZmluZWQpKTtcbn1cbmZ1bmN0aW9uIEluZGV4KHByb3BzKSB7XG4gIGNvbnN0IGZhbGxiYWNrID0gXCJmYWxsYmFja1wiIGluIHByb3BzICYmIHtcbiAgICBmYWxsYmFjazogKCkgPT4gcHJvcHMuZmFsbGJhY2tcbiAgfTtcbiAgcmV0dXJuIGNyZWF0ZU1lbW8oaW5kZXhBcnJheSgoKSA9PiBwcm9wcy5lYWNoLCBwcm9wcy5jaGlsZHJlbiwgZmFsbGJhY2sgfHwgdW5kZWZpbmVkKSk7XG59XG5mdW5jdGlvbiBTaG93KHByb3BzKSB7XG4gIGNvbnN0IGtleWVkID0gcHJvcHMua2V5ZWQ7XG4gIGNvbnN0IGNvbmRpdGlvbiA9IGNyZWF0ZU1lbW8oKCkgPT4gcHJvcHMud2hlbiwgdW5kZWZpbmVkLCB7XG4gICAgZXF1YWxzOiAoYSwgYikgPT4gKGtleWVkID8gYSA9PT0gYiA6ICFhID09PSAhYilcbiAgfSk7XG4gIHJldHVybiBjcmVhdGVNZW1vKFxuICAgICgpID0+IHtcbiAgICAgIGNvbnN0IGMgPSBjb25kaXRpb24oKTtcbiAgICAgIGlmIChjKSB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gcHJvcHMuY2hpbGRyZW47XG4gICAgICAgIGNvbnN0IGZuID0gdHlwZW9mIGNoaWxkID09PSBcImZ1bmN0aW9uXCIgJiYgY2hpbGQubGVuZ3RoID4gMDtcbiAgICAgICAgcmV0dXJuIGZuXG4gICAgICAgICAgPyB1bnRyYWNrKCgpID0+XG4gICAgICAgICAgICAgIGNoaWxkKFxuICAgICAgICAgICAgICAgIGtleWVkXG4gICAgICAgICAgICAgICAgICA/IGNcbiAgICAgICAgICAgICAgICAgIDogKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIGlmICghdW50cmFjayhjb25kaXRpb24pKSB0aHJvdyBuYXJyb3dlZEVycm9yKFwiU2hvd1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcHJvcHMud2hlbjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgICAgOiBjaGlsZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcm9wcy5mYWxsYmFjaztcbiAgICB9LFxuICAgIHVuZGVmaW5lZCxcbiAgICB1bmRlZmluZWRcbiAgKTtcbn1cbmZ1bmN0aW9uIFN3aXRjaChwcm9wcykge1xuICBsZXQga2V5ZWQgPSBmYWxzZTtcbiAgY29uc3QgZXF1YWxzID0gKGEsIGIpID0+IChrZXllZCA/IGFbMV0gPT09IGJbMV0gOiAhYVsxXSA9PT0gIWJbMV0pICYmIGFbMl0gPT09IGJbMl07XG4gIGNvbnN0IGNvbmRpdGlvbnMgPSBjaGlsZHJlbigoKSA9PiBwcm9wcy5jaGlsZHJlbiksXG4gICAgZXZhbENvbmRpdGlvbnMgPSBjcmVhdGVNZW1vKFxuICAgICAgKCkgPT4ge1xuICAgICAgICBsZXQgY29uZHMgPSBjb25kaXRpb25zKCk7XG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShjb25kcykpIGNvbmRzID0gW2NvbmRzXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb25kcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGNvbnN0IGMgPSBjb25kc1tpXS53aGVuO1xuICAgICAgICAgIGlmIChjKSB7XG4gICAgICAgICAgICBrZXllZCA9ICEhY29uZHNbaV0ua2V5ZWQ7XG4gICAgICAgICAgICByZXR1cm4gW2ksIGMsIGNvbmRzW2ldXTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFstMV07XG4gICAgICB9LFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAge1xuICAgICAgICBlcXVhbHNcbiAgICAgIH1cbiAgICApO1xuICByZXR1cm4gY3JlYXRlTWVtbyhcbiAgICAoKSA9PiB7XG4gICAgICBjb25zdCBbaW5kZXgsIHdoZW4sIGNvbmRdID0gZXZhbENvbmRpdGlvbnMoKTtcbiAgICAgIGlmIChpbmRleCA8IDApIHJldHVybiBwcm9wcy5mYWxsYmFjaztcbiAgICAgIGNvbnN0IGMgPSBjb25kLmNoaWxkcmVuO1xuICAgICAgY29uc3QgZm4gPSB0eXBlb2YgYyA9PT0gXCJmdW5jdGlvblwiICYmIGMubGVuZ3RoID4gMDtcbiAgICAgIHJldHVybiBmblxuICAgICAgICA/IHVudHJhY2soKCkgPT5cbiAgICAgICAgICAgIGMoXG4gICAgICAgICAgICAgIGtleWVkXG4gICAgICAgICAgICAgICAgPyB3aGVuXG4gICAgICAgICAgICAgICAgOiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh1bnRyYWNrKGV2YWxDb25kaXRpb25zKVswXSAhPT0gaW5kZXgpIHRocm93IG5hcnJvd2VkRXJyb3IoXCJNYXRjaFwiKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbmQud2hlbjtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgIDogYztcbiAgICB9LFxuICAgIHVuZGVmaW5lZCxcbiAgICB1bmRlZmluZWRcbiAgKTtcbn1cbmZ1bmN0aW9uIE1hdGNoKHByb3BzKSB7XG4gIHJldHVybiBwcm9wcztcbn1cbmxldCBFcnJvcnM7XG5mdW5jdGlvbiByZXNldEVycm9yQm91bmRhcmllcygpIHtcbiAgRXJyb3JzICYmIFsuLi5FcnJvcnNdLmZvckVhY2goZm4gPT4gZm4oKSk7XG59XG5mdW5jdGlvbiBFcnJvckJvdW5kYXJ5KHByb3BzKSB7XG4gIGxldCBlcnI7XG4gIGlmIChzaGFyZWRDb25maWcuY29udGV4dCAmJiBzaGFyZWRDb25maWcubG9hZClcbiAgICBlcnIgPSBzaGFyZWRDb25maWcubG9hZChzaGFyZWRDb25maWcuY29udGV4dC5pZCArIHNoYXJlZENvbmZpZy5jb250ZXh0LmNvdW50KTtcbiAgY29uc3QgW2Vycm9yZWQsIHNldEVycm9yZWRdID0gY3JlYXRlU2lnbmFsKGVyciwgdW5kZWZpbmVkKTtcbiAgRXJyb3JzIHx8IChFcnJvcnMgPSBuZXcgU2V0KCkpO1xuICBFcnJvcnMuYWRkKHNldEVycm9yZWQpO1xuICBvbkNsZWFudXAoKCkgPT4gRXJyb3JzLmRlbGV0ZShzZXRFcnJvcmVkKSk7XG4gIHJldHVybiBjcmVhdGVNZW1vKFxuICAgICgpID0+IHtcbiAgICAgIGxldCBlO1xuICAgICAgaWYgKChlID0gZXJyb3JlZCgpKSkge1xuICAgICAgICBjb25zdCBmID0gcHJvcHMuZmFsbGJhY2s7XG4gICAgICAgIHJldHVybiB0eXBlb2YgZiA9PT0gXCJmdW5jdGlvblwiICYmIGYubGVuZ3RoID8gdW50cmFjaygoKSA9PiBmKGUsICgpID0+IHNldEVycm9yZWQoKSkpIDogZjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBjYXRjaEVycm9yKCgpID0+IHByb3BzLmNoaWxkcmVuLCBzZXRFcnJvcmVkKTtcbiAgICB9LFxuICAgIHVuZGVmaW5lZCxcbiAgICB1bmRlZmluZWRcbiAgKTtcbn1cblxuY29uc3Qgc3VzcGVuc2VMaXN0RXF1YWxzID0gKGEsIGIpID0+XG4gIGEuc2hvd0NvbnRlbnQgPT09IGIuc2hvd0NvbnRlbnQgJiYgYS5zaG93RmFsbGJhY2sgPT09IGIuc2hvd0ZhbGxiYWNrO1xuY29uc3QgU3VzcGVuc2VMaXN0Q29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcbmZ1bmN0aW9uIFN1c3BlbnNlTGlzdChwcm9wcykge1xuICBsZXQgW3dyYXBwZXIsIHNldFdyYXBwZXJdID0gY3JlYXRlU2lnbmFsKCgpID0+ICh7XG4gICAgICBpbkZhbGxiYWNrOiBmYWxzZVxuICAgIH0pKSxcbiAgICBzaG93O1xuICBjb25zdCBsaXN0Q29udGV4dCA9IHVzZUNvbnRleHQoU3VzcGVuc2VMaXN0Q29udGV4dCk7XG4gIGNvbnN0IFtyZWdpc3RyeSwgc2V0UmVnaXN0cnldID0gY3JlYXRlU2lnbmFsKFtdKTtcbiAgaWYgKGxpc3RDb250ZXh0KSB7XG4gICAgc2hvdyA9IGxpc3RDb250ZXh0LnJlZ2lzdGVyKGNyZWF0ZU1lbW8oKCkgPT4gd3JhcHBlcigpKCkuaW5GYWxsYmFjaykpO1xuICB9XG4gIGNvbnN0IHJlc29sdmVkID0gY3JlYXRlTWVtbyhcbiAgICBwcmV2ID0+IHtcbiAgICAgIGNvbnN0IHJldmVhbCA9IHByb3BzLnJldmVhbE9yZGVyLFxuICAgICAgICB0YWlsID0gcHJvcHMudGFpbCxcbiAgICAgICAgeyBzaG93Q29udGVudCA9IHRydWUsIHNob3dGYWxsYmFjayA9IHRydWUgfSA9IHNob3cgPyBzaG93KCkgOiB7fSxcbiAgICAgICAgcmVnID0gcmVnaXN0cnkoKSxcbiAgICAgICAgcmV2ZXJzZSA9IHJldmVhbCA9PT0gXCJiYWNrd2FyZHNcIjtcbiAgICAgIGlmIChyZXZlYWwgPT09IFwidG9nZXRoZXJcIikge1xuICAgICAgICBjb25zdCBhbGwgPSByZWcuZXZlcnkoaW5GYWxsYmFjayA9PiAhaW5GYWxsYmFjaygpKTtcbiAgICAgICAgY29uc3QgcmVzID0gcmVnLm1hcCgoKSA9PiAoe1xuICAgICAgICAgIHNob3dDb250ZW50OiBhbGwgJiYgc2hvd0NvbnRlbnQsXG4gICAgICAgICAgc2hvd0ZhbGxiYWNrXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmVzLmluRmFsbGJhY2sgPSAhYWxsO1xuICAgICAgICByZXR1cm4gcmVzO1xuICAgICAgfVxuICAgICAgbGV0IHN0b3AgPSBmYWxzZTtcbiAgICAgIGxldCBpbkZhbGxiYWNrID0gcHJldi5pbkZhbGxiYWNrO1xuICAgICAgY29uc3QgcmVzID0gW107XG4gICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gcmVnLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGNvbnN0IG4gPSByZXZlcnNlID8gbGVuIC0gaSAtIDEgOiBpLFxuICAgICAgICAgIHMgPSByZWdbbl0oKTtcbiAgICAgICAgaWYgKCFzdG9wICYmICFzKSB7XG4gICAgICAgICAgcmVzW25dID0ge1xuICAgICAgICAgICAgc2hvd0NvbnRlbnQsXG4gICAgICAgICAgICBzaG93RmFsbGJhY2tcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IG5leHQgPSAhc3RvcDtcbiAgICAgICAgICBpZiAobmV4dCkgaW5GYWxsYmFjayA9IHRydWU7XG4gICAgICAgICAgcmVzW25dID0ge1xuICAgICAgICAgICAgc2hvd0NvbnRlbnQ6IG5leHQsXG4gICAgICAgICAgICBzaG93RmFsbGJhY2s6ICF0YWlsIHx8IChuZXh0ICYmIHRhaWwgPT09IFwiY29sbGFwc2VkXCIpID8gc2hvd0ZhbGxiYWNrIDogZmFsc2VcbiAgICAgICAgICB9O1xuICAgICAgICAgIHN0b3AgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIXN0b3ApIGluRmFsbGJhY2sgPSBmYWxzZTtcbiAgICAgIHJlcy5pbkZhbGxiYWNrID0gaW5GYWxsYmFjaztcbiAgICAgIHJldHVybiByZXM7XG4gICAgfSxcbiAgICB7XG4gICAgICBpbkZhbGxiYWNrOiBmYWxzZVxuICAgIH1cbiAgKTtcbiAgc2V0V3JhcHBlcigoKSA9PiByZXNvbHZlZCk7XG4gIHJldHVybiBjcmVhdGVDb21wb25lbnQoU3VzcGVuc2VMaXN0Q29udGV4dC5Qcm92aWRlciwge1xuICAgIHZhbHVlOiB7XG4gICAgICByZWdpc3RlcjogaW5GYWxsYmFjayA9PiB7XG4gICAgICAgIGxldCBpbmRleDtcbiAgICAgICAgc2V0UmVnaXN0cnkocmVnaXN0cnkgPT4ge1xuICAgICAgICAgIGluZGV4ID0gcmVnaXN0cnkubGVuZ3RoO1xuICAgICAgICAgIHJldHVybiBbLi4ucmVnaXN0cnksIGluRmFsbGJhY2tdO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZU1lbW8oKCkgPT4gcmVzb2x2ZWQoKVtpbmRleF0sIHVuZGVmaW5lZCwge1xuICAgICAgICAgIGVxdWFsczogc3VzcGVuc2VMaXN0RXF1YWxzXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0sXG4gICAgZ2V0IGNoaWxkcmVuKCkge1xuICAgICAgcmV0dXJuIHByb3BzLmNoaWxkcmVuO1xuICAgIH1cbiAgfSk7XG59XG5mdW5jdGlvbiBTdXNwZW5zZShwcm9wcykge1xuICBsZXQgY291bnRlciA9IDAsXG4gICAgc2hvdyxcbiAgICBjdHgsXG4gICAgcCxcbiAgICBmbGlja2VyLFxuICAgIGVycm9yO1xuICBjb25zdCBbaW5GYWxsYmFjaywgc2V0RmFsbGJhY2tdID0gY3JlYXRlU2lnbmFsKGZhbHNlKSxcbiAgICBTdXNwZW5zZUNvbnRleHQgPSBnZXRTdXNwZW5zZUNvbnRleHQoKSxcbiAgICBzdG9yZSA9IHtcbiAgICAgIGluY3JlbWVudDogKCkgPT4ge1xuICAgICAgICBpZiAoKytjb3VudGVyID09PSAxKSBzZXRGYWxsYmFjayh0cnVlKTtcbiAgICAgIH0sXG4gICAgICBkZWNyZW1lbnQ6ICgpID0+IHtcbiAgICAgICAgaWYgKC0tY291bnRlciA9PT0gMCkgc2V0RmFsbGJhY2soZmFsc2UpO1xuICAgICAgfSxcbiAgICAgIGluRmFsbGJhY2ssXG4gICAgICBlZmZlY3RzOiBbXSxcbiAgICAgIHJlc29sdmVkOiBmYWxzZVxuICAgIH0sXG4gICAgb3duZXIgPSBnZXRPd25lcigpO1xuICBpZiAoc2hhcmVkQ29uZmlnLmNvbnRleHQgJiYgc2hhcmVkQ29uZmlnLmxvYWQpIHtcbiAgICBjb25zdCBrZXkgPSBzaGFyZWRDb25maWcuY29udGV4dC5pZCArIHNoYXJlZENvbmZpZy5jb250ZXh0LmNvdW50O1xuICAgIGxldCByZWYgPSBzaGFyZWRDb25maWcubG9hZChrZXkpO1xuICAgIGlmIChyZWYpIHtcbiAgICAgIGlmICh0eXBlb2YgcmVmICE9PSBcIm9iamVjdFwiIHx8IHJlZi5zdGF0dXMgIT09IFwic3VjY2Vzc1wiKSBwID0gcmVmO1xuICAgICAgZWxzZSBzaGFyZWRDb25maWcuZ2F0aGVyKGtleSk7XG4gICAgfVxuICAgIGlmIChwICYmIHAgIT09IFwiJCRmXCIpIHtcbiAgICAgIGNvbnN0IFtzLCBzZXRdID0gY3JlYXRlU2lnbmFsKHVuZGVmaW5lZCwge1xuICAgICAgICBlcXVhbHM6IGZhbHNlXG4gICAgICB9KTtcbiAgICAgIGZsaWNrZXIgPSBzO1xuICAgICAgcC50aGVuKFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgaWYgKHNoYXJlZENvbmZpZy5kb25lKSByZXR1cm4gc2V0KCk7XG4gICAgICAgICAgc2hhcmVkQ29uZmlnLmdhdGhlcihrZXkpO1xuICAgICAgICAgIHNldEh5ZHJhdGVDb250ZXh0KGN0eCk7XG4gICAgICAgICAgc2V0KCk7XG4gICAgICAgICAgc2V0SHlkcmF0ZUNvbnRleHQoKTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICBlcnJvciA9IGVycjtcbiAgICAgICAgICBzZXQoKTtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgbGlzdENvbnRleHQgPSB1c2VDb250ZXh0KFN1c3BlbnNlTGlzdENvbnRleHQpO1xuICBpZiAobGlzdENvbnRleHQpIHNob3cgPSBsaXN0Q29udGV4dC5yZWdpc3RlcihzdG9yZS5pbkZhbGxiYWNrKTtcbiAgbGV0IGRpc3Bvc2U7XG4gIG9uQ2xlYW51cCgoKSA9PiBkaXNwb3NlICYmIGRpc3Bvc2UoKSk7XG4gIHJldHVybiBjcmVhdGVDb21wb25lbnQoU3VzcGVuc2VDb250ZXh0LlByb3ZpZGVyLCB7XG4gICAgdmFsdWU6IHN0b3JlLFxuICAgIGdldCBjaGlsZHJlbigpIHtcbiAgICAgIHJldHVybiBjcmVhdGVNZW1vKCgpID0+IHtcbiAgICAgICAgaWYgKGVycm9yKSB0aHJvdyBlcnJvcjtcbiAgICAgICAgY3R4ID0gc2hhcmVkQ29uZmlnLmNvbnRleHQ7XG4gICAgICAgIGlmIChmbGlja2VyKSB7XG4gICAgICAgICAgZmxpY2tlcigpO1xuICAgICAgICAgIHJldHVybiAoZmxpY2tlciA9IHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN0eCAmJiBwID09PSBcIiQkZlwiKSBzZXRIeWRyYXRlQ29udGV4dCgpO1xuICAgICAgICBjb25zdCByZW5kZXJlZCA9IGNyZWF0ZU1lbW8oKCkgPT4gcHJvcHMuY2hpbGRyZW4pO1xuICAgICAgICByZXR1cm4gY3JlYXRlTWVtbyhwcmV2ID0+IHtcbiAgICAgICAgICBjb25zdCBpbkZhbGxiYWNrID0gc3RvcmUuaW5GYWxsYmFjaygpLFxuICAgICAgICAgICAgeyBzaG93Q29udGVudCA9IHRydWUsIHNob3dGYWxsYmFjayA9IHRydWUgfSA9IHNob3cgPyBzaG93KCkgOiB7fTtcbiAgICAgICAgICBpZiAoKCFpbkZhbGxiYWNrIHx8IChwICYmIHAgIT09IFwiJCRmXCIpKSAmJiBzaG93Q29udGVudCkge1xuICAgICAgICAgICAgc3RvcmUucmVzb2x2ZWQgPSB0cnVlO1xuICAgICAgICAgICAgZGlzcG9zZSAmJiBkaXNwb3NlKCk7XG4gICAgICAgICAgICBkaXNwb3NlID0gY3R4ID0gcCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHJlc3VtZUVmZmVjdHMoc3RvcmUuZWZmZWN0cyk7XG4gICAgICAgICAgICByZXR1cm4gcmVuZGVyZWQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFzaG93RmFsbGJhY2spIHJldHVybjtcbiAgICAgICAgICBpZiAoZGlzcG9zZSkgcmV0dXJuIHByZXY7XG4gICAgICAgICAgcmV0dXJuIGNyZWF0ZVJvb3QoZGlzcG9zZXIgPT4ge1xuICAgICAgICAgICAgZGlzcG9zZSA9IGRpc3Bvc2VyO1xuICAgICAgICAgICAgaWYgKGN0eCkge1xuICAgICAgICAgICAgICBzZXRIeWRyYXRlQ29udGV4dCh7XG4gICAgICAgICAgICAgICAgaWQ6IGN0eC5pZCArIFwiZlwiLFxuICAgICAgICAgICAgICAgIGNvdW50OiAwXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBjdHggPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcHJvcHMuZmFsbGJhY2s7XG4gICAgICAgICAgfSwgb3duZXIpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59XG5cbmNvbnN0IERFViA9IHVuZGVmaW5lZDtcblxuZXhwb3J0IHtcbiAgJERFVkNPTVAsXG4gICRQUk9YWSxcbiAgJFRSQUNLLFxuICBERVYsXG4gIEVycm9yQm91bmRhcnksXG4gIEZvcixcbiAgSW5kZXgsXG4gIE1hdGNoLFxuICBTaG93LFxuICBTdXNwZW5zZSxcbiAgU3VzcGVuc2VMaXN0LFxuICBTd2l0Y2gsXG4gIGJhdGNoLFxuICBjYW5jZWxDYWxsYmFjayxcbiAgY2F0Y2hFcnJvcixcbiAgY2hpbGRyZW4sXG4gIGNyZWF0ZUNvbXBvbmVudCxcbiAgY3JlYXRlQ29tcHV0ZWQsXG4gIGNyZWF0ZUNvbnRleHQsXG4gIGNyZWF0ZURlZmVycmVkLFxuICBjcmVhdGVFZmZlY3QsXG4gIGNyZWF0ZU1lbW8sXG4gIGNyZWF0ZVJlYWN0aW9uLFxuICBjcmVhdGVSZW5kZXJFZmZlY3QsXG4gIGNyZWF0ZVJlc291cmNlLFxuICBjcmVhdGVSb290LFxuICBjcmVhdGVTZWxlY3RvcixcbiAgY3JlYXRlU2lnbmFsLFxuICBjcmVhdGVVbmlxdWVJZCxcbiAgZW5hYmxlRXh0ZXJuYWxTb3VyY2UsXG4gIGVuYWJsZUh5ZHJhdGlvbixcbiAgZW5hYmxlU2NoZWR1bGluZyxcbiAgZXF1YWxGbixcbiAgZnJvbSxcbiAgZ2V0TGlzdGVuZXIsXG4gIGdldE93bmVyLFxuICBpbmRleEFycmF5LFxuICBsYXp5LFxuICBtYXBBcnJheSxcbiAgbWVyZ2VQcm9wcyxcbiAgb2JzZXJ2YWJsZSxcbiAgb24sXG4gIG9uQ2xlYW51cCxcbiAgb25FcnJvcixcbiAgb25Nb3VudCxcbiAgcmVxdWVzdENhbGxiYWNrLFxuICByZXNldEVycm9yQm91bmRhcmllcyxcbiAgcnVuV2l0aE93bmVyLFxuICBzaGFyZWRDb25maWcsXG4gIHNwbGl0UHJvcHMsXG4gIHN0YXJ0VHJhbnNpdGlvbixcbiAgdW50cmFjayxcbiAgdXNlQ29udGV4dCxcbiAgdXNlVHJhbnNpdGlvblxufTtcbiIsImltcG9ydCB7XG4gIGNyZWF0ZVJvb3QsXG4gIHNoYXJlZENvbmZpZyxcbiAgY3JlYXRlUmVuZGVyRWZmZWN0LFxuICB1bnRyYWNrLFxuICBlbmFibGVIeWRyYXRpb24sXG4gIGdldE93bmVyLFxuICBjcmVhdGVFZmZlY3QsXG4gIHJ1bldpdGhPd25lcixcbiAgY3JlYXRlTWVtbyxcbiAgY3JlYXRlU2lnbmFsLFxuICBvbkNsZWFudXAsXG4gIHNwbGl0UHJvcHNcbn0gZnJvbSBcInNvbGlkLWpzXCI7XG5leHBvcnQge1xuICBFcnJvckJvdW5kYXJ5LFxuICBGb3IsXG4gIEluZGV4LFxuICBNYXRjaCxcbiAgU2hvdyxcbiAgU3VzcGVuc2UsXG4gIFN1c3BlbnNlTGlzdCxcbiAgU3dpdGNoLFxuICBjcmVhdGVDb21wb25lbnQsXG4gIGNyZWF0ZVJlbmRlckVmZmVjdCBhcyBlZmZlY3QsXG4gIGdldE93bmVyLFxuICBjcmVhdGVNZW1vIGFzIG1lbW8sXG4gIG1lcmdlUHJvcHMsXG4gIHVudHJhY2tcbn0gZnJvbSBcInNvbGlkLWpzXCI7XG5cbmNvbnN0IGJvb2xlYW5zID0gW1xuICBcImFsbG93ZnVsbHNjcmVlblwiLFxuICBcImFzeW5jXCIsXG4gIFwiYXV0b2ZvY3VzXCIsXG4gIFwiYXV0b3BsYXlcIixcbiAgXCJjaGVja2VkXCIsXG4gIFwiY29udHJvbHNcIixcbiAgXCJkZWZhdWx0XCIsXG4gIFwiZGlzYWJsZWRcIixcbiAgXCJmb3Jtbm92YWxpZGF0ZVwiLFxuICBcImhpZGRlblwiLFxuICBcImluZGV0ZXJtaW5hdGVcIixcbiAgXCJpbmVydFwiLFxuICBcImlzbWFwXCIsXG4gIFwibG9vcFwiLFxuICBcIm11bHRpcGxlXCIsXG4gIFwibXV0ZWRcIixcbiAgXCJub21vZHVsZVwiLFxuICBcIm5vdmFsaWRhdGVcIixcbiAgXCJvcGVuXCIsXG4gIFwicGxheXNpbmxpbmVcIixcbiAgXCJyZWFkb25seVwiLFxuICBcInJlcXVpcmVkXCIsXG4gIFwicmV2ZXJzZWRcIixcbiAgXCJzZWFtbGVzc1wiLFxuICBcInNlbGVjdGVkXCJcbl07XG5jb25zdCBQcm9wZXJ0aWVzID0gLyojX19QVVJFX18qLyBuZXcgU2V0KFtcbiAgXCJjbGFzc05hbWVcIixcbiAgXCJ2YWx1ZVwiLFxuICBcInJlYWRPbmx5XCIsXG4gIFwiZm9ybU5vVmFsaWRhdGVcIixcbiAgXCJpc01hcFwiLFxuICBcIm5vTW9kdWxlXCIsXG4gIFwicGxheXNJbmxpbmVcIixcbiAgLi4uYm9vbGVhbnNcbl0pO1xuY29uc3QgQ2hpbGRQcm9wZXJ0aWVzID0gLyojX19QVVJFX18qLyBuZXcgU2V0KFtcbiAgXCJpbm5lckhUTUxcIixcbiAgXCJ0ZXh0Q29udGVudFwiLFxuICBcImlubmVyVGV4dFwiLFxuICBcImNoaWxkcmVuXCJcbl0pO1xuY29uc3QgQWxpYXNlcyA9IC8qI19fUFVSRV9fKi8gT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKG51bGwpLCB7XG4gIGNsYXNzTmFtZTogXCJjbGFzc1wiLFxuICBodG1sRm9yOiBcImZvclwiXG59KTtcbmNvbnN0IFByb3BBbGlhc2VzID0gLyojX19QVVJFX18qLyBPYmplY3QuYXNzaWduKE9iamVjdC5jcmVhdGUobnVsbCksIHtcbiAgY2xhc3M6IFwiY2xhc3NOYW1lXCIsXG4gIGZvcm1ub3ZhbGlkYXRlOiB7XG4gICAgJDogXCJmb3JtTm9WYWxpZGF0ZVwiLFxuICAgIEJVVFRPTjogMSxcbiAgICBJTlBVVDogMVxuICB9LFxuICBpc21hcDoge1xuICAgICQ6IFwiaXNNYXBcIixcbiAgICBJTUc6IDFcbiAgfSxcbiAgbm9tb2R1bGU6IHtcbiAgICAkOiBcIm5vTW9kdWxlXCIsXG4gICAgU0NSSVBUOiAxXG4gIH0sXG4gIHBsYXlzaW5saW5lOiB7XG4gICAgJDogXCJwbGF5c0lubGluZVwiLFxuICAgIFZJREVPOiAxXG4gIH0sXG4gIHJlYWRvbmx5OiB7XG4gICAgJDogXCJyZWFkT25seVwiLFxuICAgIElOUFVUOiAxLFxuICAgIFRFWFRBUkVBOiAxXG4gIH1cbn0pO1xuZnVuY3Rpb24gZ2V0UHJvcEFsaWFzKHByb3AsIHRhZ05hbWUpIHtcbiAgY29uc3QgYSA9IFByb3BBbGlhc2VzW3Byb3BdO1xuICByZXR1cm4gdHlwZW9mIGEgPT09IFwib2JqZWN0XCIgPyAoYVt0YWdOYW1lXSA/IGFbXCIkXCJdIDogdW5kZWZpbmVkKSA6IGE7XG59XG5jb25zdCBEZWxlZ2F0ZWRFdmVudHMgPSAvKiNfX1BVUkVfXyovIG5ldyBTZXQoW1xuICBcImJlZm9yZWlucHV0XCIsXG4gIFwiY2xpY2tcIixcbiAgXCJkYmxjbGlja1wiLFxuICBcImNvbnRleHRtZW51XCIsXG4gIFwiZm9jdXNpblwiLFxuICBcImZvY3Vzb3V0XCIsXG4gIFwiaW5wdXRcIixcbiAgXCJrZXlkb3duXCIsXG4gIFwia2V5dXBcIixcbiAgXCJtb3VzZWRvd25cIixcbiAgXCJtb3VzZW1vdmVcIixcbiAgXCJtb3VzZW91dFwiLFxuICBcIm1vdXNlb3ZlclwiLFxuICBcIm1vdXNldXBcIixcbiAgXCJwb2ludGVyZG93blwiLFxuICBcInBvaW50ZXJtb3ZlXCIsXG4gIFwicG9pbnRlcm91dFwiLFxuICBcInBvaW50ZXJvdmVyXCIsXG4gIFwicG9pbnRlcnVwXCIsXG4gIFwidG91Y2hlbmRcIixcbiAgXCJ0b3VjaG1vdmVcIixcbiAgXCJ0b3VjaHN0YXJ0XCJcbl0pO1xuY29uc3QgU1ZHRWxlbWVudHMgPSAvKiNfX1BVUkVfXyovIG5ldyBTZXQoW1xuICBcImFsdEdseXBoXCIsXG4gIFwiYWx0R2x5cGhEZWZcIixcbiAgXCJhbHRHbHlwaEl0ZW1cIixcbiAgXCJhbmltYXRlXCIsXG4gIFwiYW5pbWF0ZUNvbG9yXCIsXG4gIFwiYW5pbWF0ZU1vdGlvblwiLFxuICBcImFuaW1hdGVUcmFuc2Zvcm1cIixcbiAgXCJjaXJjbGVcIixcbiAgXCJjbGlwUGF0aFwiLFxuICBcImNvbG9yLXByb2ZpbGVcIixcbiAgXCJjdXJzb3JcIixcbiAgXCJkZWZzXCIsXG4gIFwiZGVzY1wiLFxuICBcImVsbGlwc2VcIixcbiAgXCJmZUJsZW5kXCIsXG4gIFwiZmVDb2xvck1hdHJpeFwiLFxuICBcImZlQ29tcG9uZW50VHJhbnNmZXJcIixcbiAgXCJmZUNvbXBvc2l0ZVwiLFxuICBcImZlQ29udm9sdmVNYXRyaXhcIixcbiAgXCJmZURpZmZ1c2VMaWdodGluZ1wiLFxuICBcImZlRGlzcGxhY2VtZW50TWFwXCIsXG4gIFwiZmVEaXN0YW50TGlnaHRcIixcbiAgXCJmZURyb3BTaGFkb3dcIixcbiAgXCJmZUZsb29kXCIsXG4gIFwiZmVGdW5jQVwiLFxuICBcImZlRnVuY0JcIixcbiAgXCJmZUZ1bmNHXCIsXG4gIFwiZmVGdW5jUlwiLFxuICBcImZlR2F1c3NpYW5CbHVyXCIsXG4gIFwiZmVJbWFnZVwiLFxuICBcImZlTWVyZ2VcIixcbiAgXCJmZU1lcmdlTm9kZVwiLFxuICBcImZlTW9ycGhvbG9neVwiLFxuICBcImZlT2Zmc2V0XCIsXG4gIFwiZmVQb2ludExpZ2h0XCIsXG4gIFwiZmVTcGVjdWxhckxpZ2h0aW5nXCIsXG4gIFwiZmVTcG90TGlnaHRcIixcbiAgXCJmZVRpbGVcIixcbiAgXCJmZVR1cmJ1bGVuY2VcIixcbiAgXCJmaWx0ZXJcIixcbiAgXCJmb250XCIsXG4gIFwiZm9udC1mYWNlXCIsXG4gIFwiZm9udC1mYWNlLWZvcm1hdFwiLFxuICBcImZvbnQtZmFjZS1uYW1lXCIsXG4gIFwiZm9udC1mYWNlLXNyY1wiLFxuICBcImZvbnQtZmFjZS11cmlcIixcbiAgXCJmb3JlaWduT2JqZWN0XCIsXG4gIFwiZ1wiLFxuICBcImdseXBoXCIsXG4gIFwiZ2x5cGhSZWZcIixcbiAgXCJoa2VyblwiLFxuICBcImltYWdlXCIsXG4gIFwibGluZVwiLFxuICBcImxpbmVhckdyYWRpZW50XCIsXG4gIFwibWFya2VyXCIsXG4gIFwibWFza1wiLFxuICBcIm1ldGFkYXRhXCIsXG4gIFwibWlzc2luZy1nbHlwaFwiLFxuICBcIm1wYXRoXCIsXG4gIFwicGF0aFwiLFxuICBcInBhdHRlcm5cIixcbiAgXCJwb2x5Z29uXCIsXG4gIFwicG9seWxpbmVcIixcbiAgXCJyYWRpYWxHcmFkaWVudFwiLFxuICBcInJlY3RcIixcbiAgXCJzZXRcIixcbiAgXCJzdG9wXCIsXG4gIFwic3ZnXCIsXG4gIFwic3dpdGNoXCIsXG4gIFwic3ltYm9sXCIsXG4gIFwidGV4dFwiLFxuICBcInRleHRQYXRoXCIsXG4gIFwidHJlZlwiLFxuICBcInRzcGFuXCIsXG4gIFwidXNlXCIsXG4gIFwidmlld1wiLFxuICBcInZrZXJuXCJcbl0pO1xuY29uc3QgU1ZHTmFtZXNwYWNlID0ge1xuICB4bGluazogXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rXCIsXG4gIHhtbDogXCJodHRwOi8vd3d3LnczLm9yZy9YTUwvMTk5OC9uYW1lc3BhY2VcIlxufTtcbmNvbnN0IERPTUVsZW1lbnRzID0gLyojX19QVVJFX18qLyBuZXcgU2V0KFtcbiAgXCJodG1sXCIsXG4gIFwiYmFzZVwiLFxuICBcImhlYWRcIixcbiAgXCJsaW5rXCIsXG4gIFwibWV0YVwiLFxuICBcInN0eWxlXCIsXG4gIFwidGl0bGVcIixcbiAgXCJib2R5XCIsXG4gIFwiYWRkcmVzc1wiLFxuICBcImFydGljbGVcIixcbiAgXCJhc2lkZVwiLFxuICBcImZvb3RlclwiLFxuICBcImhlYWRlclwiLFxuICBcIm1haW5cIixcbiAgXCJuYXZcIixcbiAgXCJzZWN0aW9uXCIsXG4gIFwiYm9keVwiLFxuICBcImJsb2NrcXVvdGVcIixcbiAgXCJkZFwiLFxuICBcImRpdlwiLFxuICBcImRsXCIsXG4gIFwiZHRcIixcbiAgXCJmaWdjYXB0aW9uXCIsXG4gIFwiZmlndXJlXCIsXG4gIFwiaHJcIixcbiAgXCJsaVwiLFxuICBcIm9sXCIsXG4gIFwicFwiLFxuICBcInByZVwiLFxuICBcInVsXCIsXG4gIFwiYVwiLFxuICBcImFiYnJcIixcbiAgXCJiXCIsXG4gIFwiYmRpXCIsXG4gIFwiYmRvXCIsXG4gIFwiYnJcIixcbiAgXCJjaXRlXCIsXG4gIFwiY29kZVwiLFxuICBcImRhdGFcIixcbiAgXCJkZm5cIixcbiAgXCJlbVwiLFxuICBcImlcIixcbiAgXCJrYmRcIixcbiAgXCJtYXJrXCIsXG4gIFwicVwiLFxuICBcInJwXCIsXG4gIFwicnRcIixcbiAgXCJydWJ5XCIsXG4gIFwic1wiLFxuICBcInNhbXBcIixcbiAgXCJzbWFsbFwiLFxuICBcInNwYW5cIixcbiAgXCJzdHJvbmdcIixcbiAgXCJzdWJcIixcbiAgXCJzdXBcIixcbiAgXCJ0aW1lXCIsXG4gIFwidVwiLFxuICBcInZhclwiLFxuICBcIndiclwiLFxuICBcImFyZWFcIixcbiAgXCJhdWRpb1wiLFxuICBcImltZ1wiLFxuICBcIm1hcFwiLFxuICBcInRyYWNrXCIsXG4gIFwidmlkZW9cIixcbiAgXCJlbWJlZFwiLFxuICBcImlmcmFtZVwiLFxuICBcIm9iamVjdFwiLFxuICBcInBhcmFtXCIsXG4gIFwicGljdHVyZVwiLFxuICBcInBvcnRhbFwiLFxuICBcInNvdXJjZVwiLFxuICBcInN2Z1wiLFxuICBcIm1hdGhcIixcbiAgXCJjYW52YXNcIixcbiAgXCJub3NjcmlwdFwiLFxuICBcInNjcmlwdFwiLFxuICBcImRlbFwiLFxuICBcImluc1wiLFxuICBcImNhcHRpb25cIixcbiAgXCJjb2xcIixcbiAgXCJjb2xncm91cFwiLFxuICBcInRhYmxlXCIsXG4gIFwidGJvZHlcIixcbiAgXCJ0ZFwiLFxuICBcInRmb290XCIsXG4gIFwidGhcIixcbiAgXCJ0aGVhZFwiLFxuICBcInRyXCIsXG4gIFwiYnV0dG9uXCIsXG4gIFwiZGF0YWxpc3RcIixcbiAgXCJmaWVsZHNldFwiLFxuICBcImZvcm1cIixcbiAgXCJpbnB1dFwiLFxuICBcImxhYmVsXCIsXG4gIFwibGVnZW5kXCIsXG4gIFwibWV0ZXJcIixcbiAgXCJvcHRncm91cFwiLFxuICBcIm9wdGlvblwiLFxuICBcIm91dHB1dFwiLFxuICBcInByb2dyZXNzXCIsXG4gIFwic2VsZWN0XCIsXG4gIFwidGV4dGFyZWFcIixcbiAgXCJkZXRhaWxzXCIsXG4gIFwiZGlhbG9nXCIsXG4gIFwibWVudVwiLFxuICBcInN1bW1hcnlcIixcbiAgXCJkZXRhaWxzXCIsXG4gIFwic2xvdFwiLFxuICBcInRlbXBsYXRlXCIsXG4gIFwiYWNyb255bVwiLFxuICBcImFwcGxldFwiLFxuICBcImJhc2Vmb250XCIsXG4gIFwiYmdzb3VuZFwiLFxuICBcImJpZ1wiLFxuICBcImJsaW5rXCIsXG4gIFwiY2VudGVyXCIsXG4gIFwiY29udGVudFwiLFxuICBcImRpclwiLFxuICBcImZvbnRcIixcbiAgXCJmcmFtZVwiLFxuICBcImZyYW1lc2V0XCIsXG4gIFwiaGdyb3VwXCIsXG4gIFwiaW1hZ2VcIixcbiAgXCJrZXlnZW5cIixcbiAgXCJtYXJxdWVlXCIsXG4gIFwibWVudWl0ZW1cIixcbiAgXCJub2JyXCIsXG4gIFwibm9lbWJlZFwiLFxuICBcIm5vZnJhbWVzXCIsXG4gIFwicGxhaW50ZXh0XCIsXG4gIFwicmJcIixcbiAgXCJydGNcIixcbiAgXCJzaGFkb3dcIixcbiAgXCJzcGFjZXJcIixcbiAgXCJzdHJpa2VcIixcbiAgXCJ0dFwiLFxuICBcInhtcFwiLFxuICBcImFcIixcbiAgXCJhYmJyXCIsXG4gIFwiYWNyb255bVwiLFxuICBcImFkZHJlc3NcIixcbiAgXCJhcHBsZXRcIixcbiAgXCJhcmVhXCIsXG4gIFwiYXJ0aWNsZVwiLFxuICBcImFzaWRlXCIsXG4gIFwiYXVkaW9cIixcbiAgXCJiXCIsXG4gIFwiYmFzZVwiLFxuICBcImJhc2Vmb250XCIsXG4gIFwiYmRpXCIsXG4gIFwiYmRvXCIsXG4gIFwiYmdzb3VuZFwiLFxuICBcImJpZ1wiLFxuICBcImJsaW5rXCIsXG4gIFwiYmxvY2txdW90ZVwiLFxuICBcImJvZHlcIixcbiAgXCJiclwiLFxuICBcImJ1dHRvblwiLFxuICBcImNhbnZhc1wiLFxuICBcImNhcHRpb25cIixcbiAgXCJjZW50ZXJcIixcbiAgXCJjaXRlXCIsXG4gIFwiY29kZVwiLFxuICBcImNvbFwiLFxuICBcImNvbGdyb3VwXCIsXG4gIFwiY29udGVudFwiLFxuICBcImRhdGFcIixcbiAgXCJkYXRhbGlzdFwiLFxuICBcImRkXCIsXG4gIFwiZGVsXCIsXG4gIFwiZGV0YWlsc1wiLFxuICBcImRmblwiLFxuICBcImRpYWxvZ1wiLFxuICBcImRpclwiLFxuICBcImRpdlwiLFxuICBcImRsXCIsXG4gIFwiZHRcIixcbiAgXCJlbVwiLFxuICBcImVtYmVkXCIsXG4gIFwiZmllbGRzZXRcIixcbiAgXCJmaWdjYXB0aW9uXCIsXG4gIFwiZmlndXJlXCIsXG4gIFwiZm9udFwiLFxuICBcImZvb3RlclwiLFxuICBcImZvcm1cIixcbiAgXCJmcmFtZVwiLFxuICBcImZyYW1lc2V0XCIsXG4gIFwiaGVhZFwiLFxuICBcImhlYWRlclwiLFxuICBcImhncm91cFwiLFxuICBcImhyXCIsXG4gIFwiaHRtbFwiLFxuICBcImlcIixcbiAgXCJpZnJhbWVcIixcbiAgXCJpbWFnZVwiLFxuICBcImltZ1wiLFxuICBcImlucHV0XCIsXG4gIFwiaW5zXCIsXG4gIFwia2JkXCIsXG4gIFwia2V5Z2VuXCIsXG4gIFwibGFiZWxcIixcbiAgXCJsZWdlbmRcIixcbiAgXCJsaVwiLFxuICBcImxpbmtcIixcbiAgXCJtYWluXCIsXG4gIFwibWFwXCIsXG4gIFwibWFya1wiLFxuICBcIm1hcnF1ZWVcIixcbiAgXCJtZW51XCIsXG4gIFwibWVudWl0ZW1cIixcbiAgXCJtZXRhXCIsXG4gIFwibWV0ZXJcIixcbiAgXCJuYXZcIixcbiAgXCJub2JyXCIsXG4gIFwibm9lbWJlZFwiLFxuICBcIm5vZnJhbWVzXCIsXG4gIFwibm9zY3JpcHRcIixcbiAgXCJvYmplY3RcIixcbiAgXCJvbFwiLFxuICBcIm9wdGdyb3VwXCIsXG4gIFwib3B0aW9uXCIsXG4gIFwib3V0cHV0XCIsXG4gIFwicFwiLFxuICBcInBhcmFtXCIsXG4gIFwicGljdHVyZVwiLFxuICBcInBsYWludGV4dFwiLFxuICBcInBvcnRhbFwiLFxuICBcInByZVwiLFxuICBcInByb2dyZXNzXCIsXG4gIFwicVwiLFxuICBcInJiXCIsXG4gIFwicnBcIixcbiAgXCJydFwiLFxuICBcInJ0Y1wiLFxuICBcInJ1YnlcIixcbiAgXCJzXCIsXG4gIFwic2FtcFwiLFxuICBcInNjcmlwdFwiLFxuICBcInNlY3Rpb25cIixcbiAgXCJzZWxlY3RcIixcbiAgXCJzaGFkb3dcIixcbiAgXCJzbG90XCIsXG4gIFwic21hbGxcIixcbiAgXCJzb3VyY2VcIixcbiAgXCJzcGFjZXJcIixcbiAgXCJzcGFuXCIsXG4gIFwic3RyaWtlXCIsXG4gIFwic3Ryb25nXCIsXG4gIFwic3R5bGVcIixcbiAgXCJzdWJcIixcbiAgXCJzdW1tYXJ5XCIsXG4gIFwic3VwXCIsXG4gIFwidGFibGVcIixcbiAgXCJ0Ym9keVwiLFxuICBcInRkXCIsXG4gIFwidGVtcGxhdGVcIixcbiAgXCJ0ZXh0YXJlYVwiLFxuICBcInRmb290XCIsXG4gIFwidGhcIixcbiAgXCJ0aGVhZFwiLFxuICBcInRpbWVcIixcbiAgXCJ0aXRsZVwiLFxuICBcInRyXCIsXG4gIFwidHJhY2tcIixcbiAgXCJ0dFwiLFxuICBcInVcIixcbiAgXCJ1bFwiLFxuICBcInZhclwiLFxuICBcInZpZGVvXCIsXG4gIFwid2JyXCIsXG4gIFwieG1wXCIsXG4gIFwiaW5wdXRcIixcbiAgXCJoMVwiLFxuICBcImgyXCIsXG4gIFwiaDNcIixcbiAgXCJoNFwiLFxuICBcImg1XCIsXG4gIFwiaDZcIlxuXSk7XG5cbmZ1bmN0aW9uIHJlY29uY2lsZUFycmF5cyhwYXJlbnROb2RlLCBhLCBiKSB7XG4gIGxldCBiTGVuZ3RoID0gYi5sZW5ndGgsXG4gICAgYUVuZCA9IGEubGVuZ3RoLFxuICAgIGJFbmQgPSBiTGVuZ3RoLFxuICAgIGFTdGFydCA9IDAsXG4gICAgYlN0YXJ0ID0gMCxcbiAgICBhZnRlciA9IGFbYUVuZCAtIDFdLm5leHRTaWJsaW5nLFxuICAgIG1hcCA9IG51bGw7XG4gIHdoaWxlIChhU3RhcnQgPCBhRW5kIHx8IGJTdGFydCA8IGJFbmQpIHtcbiAgICBpZiAoYVthU3RhcnRdID09PSBiW2JTdGFydF0pIHtcbiAgICAgIGFTdGFydCsrO1xuICAgICAgYlN0YXJ0Kys7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgd2hpbGUgKGFbYUVuZCAtIDFdID09PSBiW2JFbmQgLSAxXSkge1xuICAgICAgYUVuZC0tO1xuICAgICAgYkVuZC0tO1xuICAgIH1cbiAgICBpZiAoYUVuZCA9PT0gYVN0YXJ0KSB7XG4gICAgICBjb25zdCBub2RlID0gYkVuZCA8IGJMZW5ndGggPyAoYlN0YXJ0ID8gYltiU3RhcnQgLSAxXS5uZXh0U2libGluZyA6IGJbYkVuZCAtIGJTdGFydF0pIDogYWZ0ZXI7XG4gICAgICB3aGlsZSAoYlN0YXJ0IDwgYkVuZCkgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoYltiU3RhcnQrK10sIG5vZGUpO1xuICAgIH0gZWxzZSBpZiAoYkVuZCA9PT0gYlN0YXJ0KSB7XG4gICAgICB3aGlsZSAoYVN0YXJ0IDwgYUVuZCkge1xuICAgICAgICBpZiAoIW1hcCB8fCAhbWFwLmhhcyhhW2FTdGFydF0pKSBhW2FTdGFydF0ucmVtb3ZlKCk7XG4gICAgICAgIGFTdGFydCsrO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoYVthU3RhcnRdID09PSBiW2JFbmQgLSAxXSAmJiBiW2JTdGFydF0gPT09IGFbYUVuZCAtIDFdKSB7XG4gICAgICBjb25zdCBub2RlID0gYVstLWFFbmRdLm5leHRTaWJsaW5nO1xuICAgICAgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoYltiU3RhcnQrK10sIGFbYVN0YXJ0KytdLm5leHRTaWJsaW5nKTtcbiAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGJbLS1iRW5kXSwgbm9kZSk7XG4gICAgICBhW2FFbmRdID0gYltiRW5kXTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCFtYXApIHtcbiAgICAgICAgbWFwID0gbmV3IE1hcCgpO1xuICAgICAgICBsZXQgaSA9IGJTdGFydDtcbiAgICAgICAgd2hpbGUgKGkgPCBiRW5kKSBtYXAuc2V0KGJbaV0sIGkrKyk7XG4gICAgICB9XG4gICAgICBjb25zdCBpbmRleCA9IG1hcC5nZXQoYVthU3RhcnRdKTtcbiAgICAgIGlmIChpbmRleCAhPSBudWxsKSB7XG4gICAgICAgIGlmIChiU3RhcnQgPCBpbmRleCAmJiBpbmRleCA8IGJFbmQpIHtcbiAgICAgICAgICBsZXQgaSA9IGFTdGFydCxcbiAgICAgICAgICAgIHNlcXVlbmNlID0gMSxcbiAgICAgICAgICAgIHQ7XG4gICAgICAgICAgd2hpbGUgKCsraSA8IGFFbmQgJiYgaSA8IGJFbmQpIHtcbiAgICAgICAgICAgIGlmICgodCA9IG1hcC5nZXQoYVtpXSkpID09IG51bGwgfHwgdCAhPT0gaW5kZXggKyBzZXF1ZW5jZSkgYnJlYWs7XG4gICAgICAgICAgICBzZXF1ZW5jZSsrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc2VxdWVuY2UgPiBpbmRleCAtIGJTdGFydCkge1xuICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGFbYVN0YXJ0XTtcbiAgICAgICAgICAgIHdoaWxlIChiU3RhcnQgPCBpbmRleCkgcGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoYltiU3RhcnQrK10sIG5vZGUpO1xuICAgICAgICAgIH0gZWxzZSBwYXJlbnROb2RlLnJlcGxhY2VDaGlsZChiW2JTdGFydCsrXSwgYVthU3RhcnQrK10pO1xuICAgICAgICB9IGVsc2UgYVN0YXJ0Kys7XG4gICAgICB9IGVsc2UgYVthU3RhcnQrK10ucmVtb3ZlKCk7XG4gICAgfVxuICB9XG59XG5cbmNvbnN0ICQkRVZFTlRTID0gXCJfJERYX0RFTEVHQVRFXCI7XG5mdW5jdGlvbiByZW5kZXIoY29kZSwgZWxlbWVudCwgaW5pdCwgb3B0aW9ucyA9IHt9KSB7XG4gIGxldCBkaXNwb3NlcjtcbiAgY3JlYXRlUm9vdChkaXNwb3NlID0+IHtcbiAgICBkaXNwb3NlciA9IGRpc3Bvc2U7XG4gICAgZWxlbWVudCA9PT0gZG9jdW1lbnRcbiAgICAgID8gY29kZSgpXG4gICAgICA6IGluc2VydChlbGVtZW50LCBjb2RlKCksIGVsZW1lbnQuZmlyc3RDaGlsZCA/IG51bGwgOiB1bmRlZmluZWQsIGluaXQpO1xuICB9LCBvcHRpb25zLm93bmVyKTtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBkaXNwb3NlcigpO1xuICAgIGVsZW1lbnQudGV4dENvbnRlbnQgPSBcIlwiO1xuICB9O1xufVxuZnVuY3Rpb24gdGVtcGxhdGUoaHRtbCwgaXNDRSwgaXNTVkcpIHtcbiAgbGV0IG5vZGU7XG4gIGNvbnN0IGNyZWF0ZSA9ICgpID0+IHtcbiAgICBjb25zdCB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRlbXBsYXRlXCIpO1xuICAgIHQuaW5uZXJIVE1MID0gaHRtbDtcbiAgICByZXR1cm4gaXNTVkcgPyB0LmNvbnRlbnQuZmlyc3RDaGlsZC5maXJzdENoaWxkIDogdC5jb250ZW50LmZpcnN0Q2hpbGQ7XG4gIH07XG4gIGNvbnN0IGZuID0gaXNDRVxuICAgID8gKCkgPT4gdW50cmFjaygoKSA9PiBkb2N1bWVudC5pbXBvcnROb2RlKG5vZGUgfHwgKG5vZGUgPSBjcmVhdGUoKSksIHRydWUpKVxuICAgIDogKCkgPT4gKG5vZGUgfHwgKG5vZGUgPSBjcmVhdGUoKSkpLmNsb25lTm9kZSh0cnVlKTtcbiAgZm4uY2xvbmVOb2RlID0gZm47XG4gIHJldHVybiBmbjtcbn1cbmZ1bmN0aW9uIGRlbGVnYXRlRXZlbnRzKGV2ZW50TmFtZXMsIGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50KSB7XG4gIGNvbnN0IGUgPSBkb2N1bWVudFskJEVWRU5UU10gfHwgKGRvY3VtZW50WyQkRVZFTlRTXSA9IG5ldyBTZXQoKSk7XG4gIGZvciAobGV0IGkgPSAwLCBsID0gZXZlbnROYW1lcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBjb25zdCBuYW1lID0gZXZlbnROYW1lc1tpXTtcbiAgICBpZiAoIWUuaGFzKG5hbWUpKSB7XG4gICAgICBlLmFkZChuYW1lKTtcbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIobmFtZSwgZXZlbnRIYW5kbGVyKTtcbiAgICB9XG4gIH1cbn1cbmZ1bmN0aW9uIGNsZWFyRGVsZWdhdGVkRXZlbnRzKGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50KSB7XG4gIGlmIChkb2N1bWVudFskJEVWRU5UU10pIHtcbiAgICBmb3IgKGxldCBuYW1lIG9mIGRvY3VtZW50WyQkRVZFTlRTXS5rZXlzKCkpIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIobmFtZSwgZXZlbnRIYW5kbGVyKTtcbiAgICBkZWxldGUgZG9jdW1lbnRbJCRFVkVOVFNdO1xuICB9XG59XG5mdW5jdGlvbiBzZXRQcm9wZXJ0eShub2RlLCBuYW1lLCB2YWx1ZSkge1xuICBpZiAoISFzaGFyZWRDb25maWcuY29udGV4dCAmJiBub2RlLmlzQ29ubmVjdGVkKSByZXR1cm47XG4gIG5vZGVbbmFtZV0gPSB2YWx1ZTtcbn1cbmZ1bmN0aW9uIHNldEF0dHJpYnV0ZShub2RlLCBuYW1lLCB2YWx1ZSkge1xuICBpZiAoISFzaGFyZWRDb25maWcuY29udGV4dCAmJiBub2RlLmlzQ29ubmVjdGVkKSByZXR1cm47XG4gIGlmICh2YWx1ZSA9PSBudWxsKSBub2RlLnJlbW92ZUF0dHJpYnV0ZShuYW1lKTtcbiAgZWxzZSBub2RlLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSk7XG59XG5mdW5jdGlvbiBzZXRBdHRyaWJ1dGVOUyhub2RlLCBuYW1lc3BhY2UsIG5hbWUsIHZhbHVlKSB7XG4gIGlmICghIXNoYXJlZENvbmZpZy5jb250ZXh0ICYmIG5vZGUuaXNDb25uZWN0ZWQpIHJldHVybjtcbiAgaWYgKHZhbHVlID09IG51bGwpIG5vZGUucmVtb3ZlQXR0cmlidXRlTlMobmFtZXNwYWNlLCBuYW1lKTtcbiAgZWxzZSBub2RlLnNldEF0dHJpYnV0ZU5TKG5hbWVzcGFjZSwgbmFtZSwgdmFsdWUpO1xufVxuZnVuY3Rpb24gY2xhc3NOYW1lKG5vZGUsIHZhbHVlKSB7XG4gIGlmICghIXNoYXJlZENvbmZpZy5jb250ZXh0ICYmIG5vZGUuaXNDb25uZWN0ZWQpIHJldHVybjtcbiAgaWYgKHZhbHVlID09IG51bGwpIG5vZGUucmVtb3ZlQXR0cmlidXRlKFwiY2xhc3NcIik7XG4gIGVsc2Ugbm9kZS5jbGFzc05hbWUgPSB2YWx1ZTtcbn1cbmZ1bmN0aW9uIGFkZEV2ZW50TGlzdGVuZXIobm9kZSwgbmFtZSwgaGFuZGxlciwgZGVsZWdhdGUpIHtcbiAgaWYgKGRlbGVnYXRlKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoaGFuZGxlcikpIHtcbiAgICAgIG5vZGVbYCQkJHtuYW1lfWBdID0gaGFuZGxlclswXTtcbiAgICAgIG5vZGVbYCQkJHtuYW1lfURhdGFgXSA9IGhhbmRsZXJbMV07XG4gICAgfSBlbHNlIG5vZGVbYCQkJHtuYW1lfWBdID0gaGFuZGxlcjtcbiAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGhhbmRsZXIpKSB7XG4gICAgY29uc3QgaGFuZGxlckZuID0gaGFuZGxlclswXTtcbiAgICBub2RlLmFkZEV2ZW50TGlzdGVuZXIobmFtZSwgKGhhbmRsZXJbMF0gPSBlID0+IGhhbmRsZXJGbi5jYWxsKG5vZGUsIGhhbmRsZXJbMV0sIGUpKSk7XG4gIH0gZWxzZSBub2RlLmFkZEV2ZW50TGlzdGVuZXIobmFtZSwgaGFuZGxlcik7XG59XG5mdW5jdGlvbiBjbGFzc0xpc3Qobm9kZSwgdmFsdWUsIHByZXYgPSB7fSkge1xuICBjb25zdCBjbGFzc0tleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSB8fCB7fSksXG4gICAgcHJldktleXMgPSBPYmplY3Qua2V5cyhwcmV2KTtcbiAgbGV0IGksIGxlbjtcbiAgZm9yIChpID0gMCwgbGVuID0gcHJldktleXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBjb25zdCBrZXkgPSBwcmV2S2V5c1tpXTtcbiAgICBpZiAoIWtleSB8fCBrZXkgPT09IFwidW5kZWZpbmVkXCIgfHwgdmFsdWVba2V5XSkgY29udGludWU7XG4gICAgdG9nZ2xlQ2xhc3NLZXkobm9kZSwga2V5LCBmYWxzZSk7XG4gICAgZGVsZXRlIHByZXZba2V5XTtcbiAgfVxuICBmb3IgKGkgPSAwLCBsZW4gPSBjbGFzc0tleXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBjb25zdCBrZXkgPSBjbGFzc0tleXNbaV0sXG4gICAgICBjbGFzc1ZhbHVlID0gISF2YWx1ZVtrZXldO1xuICAgIGlmICgha2V5IHx8IGtleSA9PT0gXCJ1bmRlZmluZWRcIiB8fCBwcmV2W2tleV0gPT09IGNsYXNzVmFsdWUgfHwgIWNsYXNzVmFsdWUpIGNvbnRpbnVlO1xuICAgIHRvZ2dsZUNsYXNzS2V5KG5vZGUsIGtleSwgdHJ1ZSk7XG4gICAgcHJldltrZXldID0gY2xhc3NWYWx1ZTtcbiAgfVxuICByZXR1cm4gcHJldjtcbn1cbmZ1bmN0aW9uIHN0eWxlKG5vZGUsIHZhbHVlLCBwcmV2KSB7XG4gIGlmICghdmFsdWUpIHJldHVybiBwcmV2ID8gc2V0QXR0cmlidXRlKG5vZGUsIFwic3R5bGVcIikgOiB2YWx1ZTtcbiAgY29uc3Qgbm9kZVN0eWxlID0gbm9kZS5zdHlsZTtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIChub2RlU3R5bGUuY3NzVGV4dCA9IHZhbHVlKTtcbiAgdHlwZW9mIHByZXYgPT09IFwic3RyaW5nXCIgJiYgKG5vZGVTdHlsZS5jc3NUZXh0ID0gcHJldiA9IHVuZGVmaW5lZCk7XG4gIHByZXYgfHwgKHByZXYgPSB7fSk7XG4gIHZhbHVlIHx8ICh2YWx1ZSA9IHt9KTtcbiAgbGV0IHYsIHM7XG4gIGZvciAocyBpbiBwcmV2KSB7XG4gICAgdmFsdWVbc10gPT0gbnVsbCAmJiBub2RlU3R5bGUucmVtb3ZlUHJvcGVydHkocyk7XG4gICAgZGVsZXRlIHByZXZbc107XG4gIH1cbiAgZm9yIChzIGluIHZhbHVlKSB7XG4gICAgdiA9IHZhbHVlW3NdO1xuICAgIGlmICh2ICE9PSBwcmV2W3NdKSB7XG4gICAgICBub2RlU3R5bGUuc2V0UHJvcGVydHkocywgdik7XG4gICAgICBwcmV2W3NdID0gdjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHByZXY7XG59XG5mdW5jdGlvbiBzcHJlYWQobm9kZSwgcHJvcHMgPSB7fSwgaXNTVkcsIHNraXBDaGlsZHJlbikge1xuICBjb25zdCBwcmV2UHJvcHMgPSB7fTtcbiAgaWYgKCFza2lwQ2hpbGRyZW4pIHtcbiAgICBjcmVhdGVSZW5kZXJFZmZlY3QoXG4gICAgICAoKSA9PiAocHJldlByb3BzLmNoaWxkcmVuID0gaW5zZXJ0RXhwcmVzc2lvbihub2RlLCBwcm9wcy5jaGlsZHJlbiwgcHJldlByb3BzLmNoaWxkcmVuKSlcbiAgICApO1xuICB9XG4gIGNyZWF0ZVJlbmRlckVmZmVjdCgoKSA9PlxuICAgIHR5cGVvZiBwcm9wcy5yZWYgPT09IFwiZnVuY3Rpb25cIiA/IHVzZShwcm9wcy5yZWYsIG5vZGUpIDogKHByb3BzLnJlZiA9IG5vZGUpXG4gICk7XG4gIGNyZWF0ZVJlbmRlckVmZmVjdCgoKSA9PiBhc3NpZ24obm9kZSwgcHJvcHMsIGlzU1ZHLCB0cnVlLCBwcmV2UHJvcHMsIHRydWUpKTtcbiAgcmV0dXJuIHByZXZQcm9wcztcbn1cbmZ1bmN0aW9uIGR5bmFtaWNQcm9wZXJ0eShwcm9wcywga2V5KSB7XG4gIGNvbnN0IHNyYyA9IHByb3BzW2tleV07XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm9wcywga2V5LCB7XG4gICAgZ2V0KCkge1xuICAgICAgcmV0dXJuIHNyYygpO1xuICAgIH0sXG4gICAgZW51bWVyYWJsZTogdHJ1ZVxuICB9KTtcbiAgcmV0dXJuIHByb3BzO1xufVxuZnVuY3Rpb24gdXNlKGZuLCBlbGVtZW50LCBhcmcpIHtcbiAgcmV0dXJuIHVudHJhY2soKCkgPT4gZm4oZWxlbWVudCwgYXJnKSk7XG59XG5mdW5jdGlvbiBpbnNlcnQocGFyZW50LCBhY2Nlc3NvciwgbWFya2VyLCBpbml0aWFsKSB7XG4gIGlmIChtYXJrZXIgIT09IHVuZGVmaW5lZCAmJiAhaW5pdGlhbCkgaW5pdGlhbCA9IFtdO1xuICBpZiAodHlwZW9mIGFjY2Vzc29yICE9PSBcImZ1bmN0aW9uXCIpIHJldHVybiBpbnNlcnRFeHByZXNzaW9uKHBhcmVudCwgYWNjZXNzb3IsIGluaXRpYWwsIG1hcmtlcik7XG4gIGNyZWF0ZVJlbmRlckVmZmVjdChjdXJyZW50ID0+IGluc2VydEV4cHJlc3Npb24ocGFyZW50LCBhY2Nlc3NvcigpLCBjdXJyZW50LCBtYXJrZXIpLCBpbml0aWFsKTtcbn1cbmZ1bmN0aW9uIGFzc2lnbihub2RlLCBwcm9wcywgaXNTVkcsIHNraXBDaGlsZHJlbiwgcHJldlByb3BzID0ge30sIHNraXBSZWYgPSBmYWxzZSkge1xuICBwcm9wcyB8fCAocHJvcHMgPSB7fSk7XG4gIGZvciAoY29uc3QgcHJvcCBpbiBwcmV2UHJvcHMpIHtcbiAgICBpZiAoIShwcm9wIGluIHByb3BzKSkge1xuICAgICAgaWYgKHByb3AgPT09IFwiY2hpbGRyZW5cIikgY29udGludWU7XG4gICAgICBwcmV2UHJvcHNbcHJvcF0gPSBhc3NpZ25Qcm9wKG5vZGUsIHByb3AsIG51bGwsIHByZXZQcm9wc1twcm9wXSwgaXNTVkcsIHNraXBSZWYpO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IHByb3AgaW4gcHJvcHMpIHtcbiAgICBpZiAocHJvcCA9PT0gXCJjaGlsZHJlblwiKSB7XG4gICAgICBpZiAoIXNraXBDaGlsZHJlbikgaW5zZXJ0RXhwcmVzc2lvbihub2RlLCBwcm9wcy5jaGlsZHJlbik7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgdmFsdWUgPSBwcm9wc1twcm9wXTtcbiAgICBwcmV2UHJvcHNbcHJvcF0gPSBhc3NpZ25Qcm9wKG5vZGUsIHByb3AsIHZhbHVlLCBwcmV2UHJvcHNbcHJvcF0sIGlzU1ZHLCBza2lwUmVmKTtcbiAgfVxufVxuZnVuY3Rpb24gaHlkcmF0ZSQxKGNvZGUsIGVsZW1lbnQsIG9wdGlvbnMgPSB7fSkge1xuICBzaGFyZWRDb25maWcuY29tcGxldGVkID0gZ2xvYmFsVGhpcy5fJEhZLmNvbXBsZXRlZDtcbiAgc2hhcmVkQ29uZmlnLmV2ZW50cyA9IGdsb2JhbFRoaXMuXyRIWS5ldmVudHM7XG4gIHNoYXJlZENvbmZpZy5sb2FkID0gaWQgPT4gZ2xvYmFsVGhpcy5fJEhZLnJbaWRdO1xuICBzaGFyZWRDb25maWcuaGFzID0gaWQgPT4gaWQgaW4gZ2xvYmFsVGhpcy5fJEhZLnI7XG4gIHNoYXJlZENvbmZpZy5nYXRoZXIgPSByb290ID0+IGdhdGhlckh5ZHJhdGFibGUoZWxlbWVudCwgcm9vdCk7XG4gIHNoYXJlZENvbmZpZy5yZWdpc3RyeSA9IG5ldyBNYXAoKTtcbiAgc2hhcmVkQ29uZmlnLmNvbnRleHQgPSB7XG4gICAgaWQ6IG9wdGlvbnMucmVuZGVySWQgfHwgXCJcIixcbiAgICBjb3VudDogMFxuICB9O1xuICBnYXRoZXJIeWRyYXRhYmxlKGVsZW1lbnQsIG9wdGlvbnMucmVuZGVySWQpO1xuICBjb25zdCBkaXNwb3NlID0gcmVuZGVyKGNvZGUsIGVsZW1lbnQsIFsuLi5lbGVtZW50LmNoaWxkTm9kZXNdLCBvcHRpb25zKTtcbiAgc2hhcmVkQ29uZmlnLmNvbnRleHQgPSBudWxsO1xuICByZXR1cm4gZGlzcG9zZTtcbn1cbmZ1bmN0aW9uIGdldE5leHRFbGVtZW50KHRlbXBsYXRlKSB7XG4gIGxldCBub2RlLCBrZXk7XG4gIGlmICghc2hhcmVkQ29uZmlnLmNvbnRleHQgfHwgIShub2RlID0gc2hhcmVkQ29uZmlnLnJlZ2lzdHJ5LmdldCgoa2V5ID0gZ2V0SHlkcmF0aW9uS2V5KCkpKSkpIHtcbiAgICByZXR1cm4gdGVtcGxhdGUoKTtcbiAgfVxuICBpZiAoc2hhcmVkQ29uZmlnLmNvbXBsZXRlZCkgc2hhcmVkQ29uZmlnLmNvbXBsZXRlZC5hZGQobm9kZSk7XG4gIHNoYXJlZENvbmZpZy5yZWdpc3RyeS5kZWxldGUoa2V5KTtcbiAgcmV0dXJuIG5vZGU7XG59XG5mdW5jdGlvbiBnZXROZXh0TWF0Y2goZWwsIG5vZGVOYW1lKSB7XG4gIHdoaWxlIChlbCAmJiBlbC5sb2NhbE5hbWUgIT09IG5vZGVOYW1lKSBlbCA9IGVsLm5leHRTaWJsaW5nO1xuICByZXR1cm4gZWw7XG59XG5mdW5jdGlvbiBnZXROZXh0TWFya2VyKHN0YXJ0KSB7XG4gIGxldCBlbmQgPSBzdGFydCxcbiAgICBjb3VudCA9IDAsXG4gICAgY3VycmVudCA9IFtdO1xuICBpZiAoc2hhcmVkQ29uZmlnLmNvbnRleHQpIHtcbiAgICB3aGlsZSAoZW5kKSB7XG4gICAgICBpZiAoZW5kLm5vZGVUeXBlID09PSA4KSB7XG4gICAgICAgIGNvbnN0IHYgPSBlbmQubm9kZVZhbHVlO1xuICAgICAgICBpZiAodiA9PT0gXCIkXCIpIGNvdW50Kys7XG4gICAgICAgIGVsc2UgaWYgKHYgPT09IFwiL1wiKSB7XG4gICAgICAgICAgaWYgKGNvdW50ID09PSAwKSByZXR1cm4gW2VuZCwgY3VycmVudF07XG4gICAgICAgICAgY291bnQtLTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY3VycmVudC5wdXNoKGVuZCk7XG4gICAgICBlbmQgPSBlbmQubmV4dFNpYmxpbmc7XG4gICAgfVxuICB9XG4gIHJldHVybiBbZW5kLCBjdXJyZW50XTtcbn1cbmZ1bmN0aW9uIHJ1bkh5ZHJhdGlvbkV2ZW50cygpIHtcbiAgaWYgKHNoYXJlZENvbmZpZy5ldmVudHMgJiYgIXNoYXJlZENvbmZpZy5ldmVudHMucXVldWVkKSB7XG4gICAgcXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuICAgICAgY29uc3QgeyBjb21wbGV0ZWQsIGV2ZW50cyB9ID0gc2hhcmVkQ29uZmlnO1xuICAgICAgZXZlbnRzLnF1ZXVlZCA9IGZhbHNlO1xuICAgICAgd2hpbGUgKGV2ZW50cy5sZW5ndGgpIHtcbiAgICAgICAgY29uc3QgW2VsLCBlXSA9IGV2ZW50c1swXTtcbiAgICAgICAgaWYgKCFjb21wbGV0ZWQuaGFzKGVsKSkgcmV0dXJuO1xuICAgICAgICBldmVudEhhbmRsZXIoZSk7XG4gICAgICAgIGV2ZW50cy5zaGlmdCgpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHNoYXJlZENvbmZpZy5ldmVudHMucXVldWVkID0gdHJ1ZTtcbiAgfVxufVxuZnVuY3Rpb24gdG9Qcm9wZXJ0eU5hbWUobmFtZSkge1xuICByZXR1cm4gbmFtZS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoLy0oW2Etel0pL2csIChfLCB3KSA9PiB3LnRvVXBwZXJDYXNlKCkpO1xufVxuZnVuY3Rpb24gdG9nZ2xlQ2xhc3NLZXkobm9kZSwga2V5LCB2YWx1ZSkge1xuICBjb25zdCBjbGFzc05hbWVzID0ga2V5LnRyaW0oKS5zcGxpdCgvXFxzKy8pO1xuICBmb3IgKGxldCBpID0gMCwgbmFtZUxlbiA9IGNsYXNzTmFtZXMubGVuZ3RoOyBpIDwgbmFtZUxlbjsgaSsrKVxuICAgIG5vZGUuY2xhc3NMaXN0LnRvZ2dsZShjbGFzc05hbWVzW2ldLCB2YWx1ZSk7XG59XG5mdW5jdGlvbiBhc3NpZ25Qcm9wKG5vZGUsIHByb3AsIHZhbHVlLCBwcmV2LCBpc1NWRywgc2tpcFJlZikge1xuICBsZXQgaXNDRSwgaXNQcm9wLCBpc0NoaWxkUHJvcCwgcHJvcEFsaWFzLCBmb3JjZVByb3A7XG4gIGlmIChwcm9wID09PSBcInN0eWxlXCIpIHJldHVybiBzdHlsZShub2RlLCB2YWx1ZSwgcHJldik7XG4gIGlmIChwcm9wID09PSBcImNsYXNzTGlzdFwiKSByZXR1cm4gY2xhc3NMaXN0KG5vZGUsIHZhbHVlLCBwcmV2KTtcbiAgaWYgKHZhbHVlID09PSBwcmV2KSByZXR1cm4gcHJldjtcbiAgaWYgKHByb3AgPT09IFwicmVmXCIpIHtcbiAgICBpZiAoIXNraXBSZWYpIHZhbHVlKG5vZGUpO1xuICB9IGVsc2UgaWYgKHByb3Auc2xpY2UoMCwgMykgPT09IFwib246XCIpIHtcbiAgICBjb25zdCBlID0gcHJvcC5zbGljZSgzKTtcbiAgICBwcmV2ICYmIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcihlLCBwcmV2KTtcbiAgICB2YWx1ZSAmJiBub2RlLmFkZEV2ZW50TGlzdGVuZXIoZSwgdmFsdWUpO1xuICB9IGVsc2UgaWYgKHByb3Auc2xpY2UoMCwgMTApID09PSBcIm9uY2FwdHVyZTpcIikge1xuICAgIGNvbnN0IGUgPSBwcm9wLnNsaWNlKDEwKTtcbiAgICBwcmV2ICYmIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcihlLCBwcmV2LCB0cnVlKTtcbiAgICB2YWx1ZSAmJiBub2RlLmFkZEV2ZW50TGlzdGVuZXIoZSwgdmFsdWUsIHRydWUpO1xuICB9IGVsc2UgaWYgKHByb3Auc2xpY2UoMCwgMikgPT09IFwib25cIikge1xuICAgIGNvbnN0IG5hbWUgPSBwcm9wLnNsaWNlKDIpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgZGVsZWdhdGUgPSBEZWxlZ2F0ZWRFdmVudHMuaGFzKG5hbWUpO1xuICAgIGlmICghZGVsZWdhdGUgJiYgcHJldikge1xuICAgICAgY29uc3QgaCA9IEFycmF5LmlzQXJyYXkocHJldikgPyBwcmV2WzBdIDogcHJldjtcbiAgICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcihuYW1lLCBoKTtcbiAgICB9XG4gICAgaWYgKGRlbGVnYXRlIHx8IHZhbHVlKSB7XG4gICAgICBhZGRFdmVudExpc3RlbmVyKG5vZGUsIG5hbWUsIHZhbHVlLCBkZWxlZ2F0ZSk7XG4gICAgICBkZWxlZ2F0ZSAmJiBkZWxlZ2F0ZUV2ZW50cyhbbmFtZV0pO1xuICAgIH1cbiAgfSBlbHNlIGlmIChwcm9wLnNsaWNlKDAsIDUpID09PSBcImF0dHI6XCIpIHtcbiAgICBzZXRBdHRyaWJ1dGUobm9kZSwgcHJvcC5zbGljZSg1KSwgdmFsdWUpO1xuICB9IGVsc2UgaWYgKFxuICAgIChmb3JjZVByb3AgPSBwcm9wLnNsaWNlKDAsIDUpID09PSBcInByb3A6XCIpIHx8XG4gICAgKGlzQ2hpbGRQcm9wID0gQ2hpbGRQcm9wZXJ0aWVzLmhhcyhwcm9wKSkgfHxcbiAgICAoIWlzU1ZHICYmXG4gICAgICAoKHByb3BBbGlhcyA9IGdldFByb3BBbGlhcyhwcm9wLCBub2RlLnRhZ05hbWUpKSB8fCAoaXNQcm9wID0gUHJvcGVydGllcy5oYXMocHJvcCkpKSkgfHxcbiAgICAoaXNDRSA9IG5vZGUubm9kZU5hbWUuaW5jbHVkZXMoXCItXCIpKVxuICApIHtcbiAgICBpZiAoZm9yY2VQcm9wKSB7XG4gICAgICBwcm9wID0gcHJvcC5zbGljZSg1KTtcbiAgICAgIGlzUHJvcCA9IHRydWU7XG4gICAgfSBlbHNlIGlmICghIXNoYXJlZENvbmZpZy5jb250ZXh0ICYmIG5vZGUuaXNDb25uZWN0ZWQpIHJldHVybiB2YWx1ZTtcbiAgICBpZiAocHJvcCA9PT0gXCJjbGFzc1wiIHx8IHByb3AgPT09IFwiY2xhc3NOYW1lXCIpIGNsYXNzTmFtZShub2RlLCB2YWx1ZSk7XG4gICAgZWxzZSBpZiAoaXNDRSAmJiAhaXNQcm9wICYmICFpc0NoaWxkUHJvcCkgbm9kZVt0b1Byb3BlcnR5TmFtZShwcm9wKV0gPSB2YWx1ZTtcbiAgICBlbHNlIG5vZGVbcHJvcEFsaWFzIHx8IHByb3BdID0gdmFsdWU7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgbnMgPSBpc1NWRyAmJiBwcm9wLmluZGV4T2YoXCI6XCIpID4gLTEgJiYgU1ZHTmFtZXNwYWNlW3Byb3Auc3BsaXQoXCI6XCIpWzBdXTtcbiAgICBpZiAobnMpIHNldEF0dHJpYnV0ZU5TKG5vZGUsIG5zLCBwcm9wLCB2YWx1ZSk7XG4gICAgZWxzZSBzZXRBdHRyaWJ1dGUobm9kZSwgQWxpYXNlc1twcm9wXSB8fCBwcm9wLCB2YWx1ZSk7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufVxuZnVuY3Rpb24gZXZlbnRIYW5kbGVyKGUpIHtcbiAgY29uc3Qga2V5ID0gYCQkJHtlLnR5cGV9YDtcbiAgbGV0IG5vZGUgPSAoZS5jb21wb3NlZFBhdGggJiYgZS5jb21wb3NlZFBhdGgoKVswXSkgfHwgZS50YXJnZXQ7XG4gIGlmIChlLnRhcmdldCAhPT0gbm9kZSkge1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlLCBcInRhcmdldFwiLCB7XG4gICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICB2YWx1ZTogbm9kZVxuICAgIH0pO1xuICB9XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlLCBcImN1cnJlbnRUYXJnZXRcIiwge1xuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICBnZXQoKSB7XG4gICAgICByZXR1cm4gbm9kZSB8fCBkb2N1bWVudDtcbiAgICB9XG4gIH0pO1xuICBpZiAoc2hhcmVkQ29uZmlnLnJlZ2lzdHJ5ICYmICFzaGFyZWRDb25maWcuZG9uZSkgc2hhcmVkQ29uZmlnLmRvbmUgPSBfJEhZLmRvbmUgPSB0cnVlO1xuICB3aGlsZSAobm9kZSkge1xuICAgIGNvbnN0IGhhbmRsZXIgPSBub2RlW2tleV07XG4gICAgaWYgKGhhbmRsZXIgJiYgIW5vZGUuZGlzYWJsZWQpIHtcbiAgICAgIGNvbnN0IGRhdGEgPSBub2RlW2Ake2tleX1EYXRhYF07XG4gICAgICBkYXRhICE9PSB1bmRlZmluZWQgPyBoYW5kbGVyLmNhbGwobm9kZSwgZGF0YSwgZSkgOiBoYW5kbGVyLmNhbGwobm9kZSwgZSk7XG4gICAgICBpZiAoZS5jYW5jZWxCdWJibGUpIHJldHVybjtcbiAgICB9XG4gICAgbm9kZSA9IG5vZGUuXyRob3N0IHx8IG5vZGUucGFyZW50Tm9kZSB8fCBub2RlLmhvc3Q7XG4gIH1cbn1cbmZ1bmN0aW9uIGluc2VydEV4cHJlc3Npb24ocGFyZW50LCB2YWx1ZSwgY3VycmVudCwgbWFya2VyLCB1bndyYXBBcnJheSkge1xuICBjb25zdCBoeWRyYXRpbmcgPSAhIXNoYXJlZENvbmZpZy5jb250ZXh0ICYmIHBhcmVudC5pc0Nvbm5lY3RlZDtcbiAgaWYgKGh5ZHJhdGluZykge1xuICAgICFjdXJyZW50ICYmIChjdXJyZW50ID0gWy4uLnBhcmVudC5jaGlsZE5vZGVzXSk7XG4gICAgbGV0IGNsZWFuZWQgPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN1cnJlbnQubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IG5vZGUgPSBjdXJyZW50W2ldO1xuICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IDggJiYgbm9kZS5kYXRhLnNsaWNlKDAsIDIpID09PSBcIiEkXCIpIG5vZGUucmVtb3ZlKCk7XG4gICAgICBlbHNlIGNsZWFuZWQucHVzaChub2RlKTtcbiAgICB9XG4gICAgY3VycmVudCA9IGNsZWFuZWQ7XG4gIH1cbiAgd2hpbGUgKHR5cGVvZiBjdXJyZW50ID09PSBcImZ1bmN0aW9uXCIpIGN1cnJlbnQgPSBjdXJyZW50KCk7XG4gIGlmICh2YWx1ZSA9PT0gY3VycmVudCkgcmV0dXJuIGN1cnJlbnQ7XG4gIGNvbnN0IHQgPSB0eXBlb2YgdmFsdWUsXG4gICAgbXVsdGkgPSBtYXJrZXIgIT09IHVuZGVmaW5lZDtcbiAgcGFyZW50ID0gKG11bHRpICYmIGN1cnJlbnRbMF0gJiYgY3VycmVudFswXS5wYXJlbnROb2RlKSB8fCBwYXJlbnQ7XG4gIGlmICh0ID09PSBcInN0cmluZ1wiIHx8IHQgPT09IFwibnVtYmVyXCIpIHtcbiAgICBpZiAoaHlkcmF0aW5nKSByZXR1cm4gY3VycmVudDtcbiAgICBpZiAodCA9PT0gXCJudW1iZXJcIikge1xuICAgICAgdmFsdWUgPSB2YWx1ZS50b1N0cmluZygpO1xuICAgICAgaWYgKHZhbHVlID09PSBjdXJyZW50KSByZXR1cm4gY3VycmVudDtcbiAgICB9XG4gICAgaWYgKG11bHRpKSB7XG4gICAgICBsZXQgbm9kZSA9IGN1cnJlbnRbMF07XG4gICAgICBpZiAobm9kZSAmJiBub2RlLm5vZGVUeXBlID09PSAzKSB7XG4gICAgICAgIG5vZGUuZGF0YSAhPT0gdmFsdWUgJiYgKG5vZGUuZGF0YSA9IHZhbHVlKTtcbiAgICAgIH0gZWxzZSBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodmFsdWUpO1xuICAgICAgY3VycmVudCA9IGNsZWFuQ2hpbGRyZW4ocGFyZW50LCBjdXJyZW50LCBtYXJrZXIsIG5vZGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoY3VycmVudCAhPT0gXCJcIiAmJiB0eXBlb2YgY3VycmVudCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBjdXJyZW50ID0gcGFyZW50LmZpcnN0Q2hpbGQuZGF0YSA9IHZhbHVlO1xuICAgICAgfSBlbHNlIGN1cnJlbnQgPSBwYXJlbnQudGV4dENvbnRlbnQgPSB2YWx1ZTtcbiAgICB9XG4gIH0gZWxzZSBpZiAodmFsdWUgPT0gbnVsbCB8fCB0ID09PSBcImJvb2xlYW5cIikge1xuICAgIGlmIChoeWRyYXRpbmcpIHJldHVybiBjdXJyZW50O1xuICAgIGN1cnJlbnQgPSBjbGVhbkNoaWxkcmVuKHBhcmVudCwgY3VycmVudCwgbWFya2VyKTtcbiAgfSBlbHNlIGlmICh0ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICBjcmVhdGVSZW5kZXJFZmZlY3QoKCkgPT4ge1xuICAgICAgbGV0IHYgPSB2YWx1ZSgpO1xuICAgICAgd2hpbGUgKHR5cGVvZiB2ID09PSBcImZ1bmN0aW9uXCIpIHYgPSB2KCk7XG4gICAgICBjdXJyZW50ID0gaW5zZXJ0RXhwcmVzc2lvbihwYXJlbnQsIHYsIGN1cnJlbnQsIG1hcmtlcik7XG4gICAgfSk7XG4gICAgcmV0dXJuICgpID0+IGN1cnJlbnQ7XG4gIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICBjb25zdCBhcnJheSA9IFtdO1xuICAgIGNvbnN0IGN1cnJlbnRBcnJheSA9IGN1cnJlbnQgJiYgQXJyYXkuaXNBcnJheShjdXJyZW50KTtcbiAgICBpZiAobm9ybWFsaXplSW5jb21pbmdBcnJheShhcnJheSwgdmFsdWUsIGN1cnJlbnQsIHVud3JhcEFycmF5KSkge1xuICAgICAgY3JlYXRlUmVuZGVyRWZmZWN0KCgpID0+IChjdXJyZW50ID0gaW5zZXJ0RXhwcmVzc2lvbihwYXJlbnQsIGFycmF5LCBjdXJyZW50LCBtYXJrZXIsIHRydWUpKSk7XG4gICAgICByZXR1cm4gKCkgPT4gY3VycmVudDtcbiAgICB9XG4gICAgaWYgKGh5ZHJhdGluZykge1xuICAgICAgaWYgKCFhcnJheS5sZW5ndGgpIHJldHVybiBjdXJyZW50O1xuICAgICAgaWYgKG1hcmtlciA9PT0gdW5kZWZpbmVkKSByZXR1cm4gWy4uLnBhcmVudC5jaGlsZE5vZGVzXTtcbiAgICAgIGxldCBub2RlID0gYXJyYXlbMF07XG4gICAgICBsZXQgbm9kZXMgPSBbbm9kZV07XG4gICAgICB3aGlsZSAoKG5vZGUgPSBub2RlLm5leHRTaWJsaW5nKSAhPT0gbWFya2VyKSBub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgcmV0dXJuIChjdXJyZW50ID0gbm9kZXMpO1xuICAgIH1cbiAgICBpZiAoYXJyYXkubGVuZ3RoID09PSAwKSB7XG4gICAgICBjdXJyZW50ID0gY2xlYW5DaGlsZHJlbihwYXJlbnQsIGN1cnJlbnQsIG1hcmtlcik7XG4gICAgICBpZiAobXVsdGkpIHJldHVybiBjdXJyZW50O1xuICAgIH0gZWxzZSBpZiAoY3VycmVudEFycmF5KSB7XG4gICAgICBpZiAoY3VycmVudC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgYXBwZW5kTm9kZXMocGFyZW50LCBhcnJheSwgbWFya2VyKTtcbiAgICAgIH0gZWxzZSByZWNvbmNpbGVBcnJheXMocGFyZW50LCBjdXJyZW50LCBhcnJheSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGN1cnJlbnQgJiYgY2xlYW5DaGlsZHJlbihwYXJlbnQpO1xuICAgICAgYXBwZW5kTm9kZXMocGFyZW50LCBhcnJheSk7XG4gICAgfVxuICAgIGN1cnJlbnQgPSBhcnJheTtcbiAgfSBlbHNlIGlmICh2YWx1ZS5ub2RlVHlwZSkge1xuICAgIGlmIChoeWRyYXRpbmcgJiYgdmFsdWUucGFyZW50Tm9kZSkgcmV0dXJuIChjdXJyZW50ID0gbXVsdGkgPyBbdmFsdWVdIDogdmFsdWUpO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGN1cnJlbnQpKSB7XG4gICAgICBpZiAobXVsdGkpIHJldHVybiAoY3VycmVudCA9IGNsZWFuQ2hpbGRyZW4ocGFyZW50LCBjdXJyZW50LCBtYXJrZXIsIHZhbHVlKSk7XG4gICAgICBjbGVhbkNoaWxkcmVuKHBhcmVudCwgY3VycmVudCwgbnVsbCwgdmFsdWUpO1xuICAgIH0gZWxzZSBpZiAoY3VycmVudCA9PSBudWxsIHx8IGN1cnJlbnQgPT09IFwiXCIgfHwgIXBhcmVudC5maXJzdENoaWxkKSB7XG4gICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQodmFsdWUpO1xuICAgIH0gZWxzZSBwYXJlbnQucmVwbGFjZUNoaWxkKHZhbHVlLCBwYXJlbnQuZmlyc3RDaGlsZCk7XG4gICAgY3VycmVudCA9IHZhbHVlO1xuICB9IGVsc2U7XG4gIHJldHVybiBjdXJyZW50O1xufVxuZnVuY3Rpb24gbm9ybWFsaXplSW5jb21pbmdBcnJheShub3JtYWxpemVkLCBhcnJheSwgY3VycmVudCwgdW53cmFwKSB7XG4gIGxldCBkeW5hbWljID0gZmFsc2U7XG4gIGZvciAobGV0IGkgPSAwLCBsZW4gPSBhcnJheS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgIGxldCBpdGVtID0gYXJyYXlbaV0sXG4gICAgICBwcmV2ID0gY3VycmVudCAmJiBjdXJyZW50W25vcm1hbGl6ZWQubGVuZ3RoXSxcbiAgICAgIHQ7XG4gICAgaWYgKGl0ZW0gPT0gbnVsbCB8fCBpdGVtID09PSB0cnVlIHx8IGl0ZW0gPT09IGZhbHNlKTtcbiAgICBlbHNlIGlmICgodCA9IHR5cGVvZiBpdGVtKSA9PT0gXCJvYmplY3RcIiAmJiBpdGVtLm5vZGVUeXBlKSB7XG4gICAgICBub3JtYWxpemVkLnB1c2goaXRlbSk7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGl0ZW0pKSB7XG4gICAgICBkeW5hbWljID0gbm9ybWFsaXplSW5jb21pbmdBcnJheShub3JtYWxpemVkLCBpdGVtLCBwcmV2KSB8fCBkeW5hbWljO1xuICAgIH0gZWxzZSBpZiAodCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICBpZiAodW53cmFwKSB7XG4gICAgICAgIHdoaWxlICh0eXBlb2YgaXRlbSA9PT0gXCJmdW5jdGlvblwiKSBpdGVtID0gaXRlbSgpO1xuICAgICAgICBkeW5hbWljID1cbiAgICAgICAgICBub3JtYWxpemVJbmNvbWluZ0FycmF5KFxuICAgICAgICAgICAgbm9ybWFsaXplZCxcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkoaXRlbSkgPyBpdGVtIDogW2l0ZW1dLFxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheShwcmV2KSA/IHByZXYgOiBbcHJldl1cbiAgICAgICAgICApIHx8IGR5bmFtaWM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBub3JtYWxpemVkLnB1c2goaXRlbSk7XG4gICAgICAgIGR5bmFtaWMgPSB0cnVlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IFN0cmluZyhpdGVtKTtcbiAgICAgIGlmIChwcmV2ICYmIHByZXYubm9kZVR5cGUgPT09IDMgJiYgcHJldi5kYXRhID09PSB2YWx1ZSkgbm9ybWFsaXplZC5wdXNoKHByZXYpO1xuICAgICAgZWxzZSBub3JtYWxpemVkLnB1c2goZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodmFsdWUpKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGR5bmFtaWM7XG59XG5mdW5jdGlvbiBhcHBlbmROb2RlcyhwYXJlbnQsIGFycmF5LCBtYXJrZXIgPSBudWxsKSB7XG4gIGZvciAobGV0IGkgPSAwLCBsZW4gPSBhcnJheS5sZW5ndGg7IGkgPCBsZW47IGkrKykgcGFyZW50Lmluc2VydEJlZm9yZShhcnJheVtpXSwgbWFya2VyKTtcbn1cbmZ1bmN0aW9uIGNsZWFuQ2hpbGRyZW4ocGFyZW50LCBjdXJyZW50LCBtYXJrZXIsIHJlcGxhY2VtZW50KSB7XG4gIGlmIChtYXJrZXIgPT09IHVuZGVmaW5lZCkgcmV0dXJuIChwYXJlbnQudGV4dENvbnRlbnQgPSBcIlwiKTtcbiAgY29uc3Qgbm9kZSA9IHJlcGxhY2VtZW50IHx8IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiXCIpO1xuICBpZiAoY3VycmVudC5sZW5ndGgpIHtcbiAgICBsZXQgaW5zZXJ0ZWQgPSBmYWxzZTtcbiAgICBmb3IgKGxldCBpID0gY3VycmVudC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgY29uc3QgZWwgPSBjdXJyZW50W2ldO1xuICAgICAgaWYgKG5vZGUgIT09IGVsKSB7XG4gICAgICAgIGNvbnN0IGlzUGFyZW50ID0gZWwucGFyZW50Tm9kZSA9PT0gcGFyZW50O1xuICAgICAgICBpZiAoIWluc2VydGVkICYmICFpKVxuICAgICAgICAgIGlzUGFyZW50ID8gcGFyZW50LnJlcGxhY2VDaGlsZChub2RlLCBlbCkgOiBwYXJlbnQuaW5zZXJ0QmVmb3JlKG5vZGUsIG1hcmtlcik7XG4gICAgICAgIGVsc2UgaXNQYXJlbnQgJiYgZWwucmVtb3ZlKCk7XG4gICAgICB9IGVsc2UgaW5zZXJ0ZWQgPSB0cnVlO1xuICAgIH1cbiAgfSBlbHNlIHBhcmVudC5pbnNlcnRCZWZvcmUobm9kZSwgbWFya2VyKTtcbiAgcmV0dXJuIFtub2RlXTtcbn1cbmZ1bmN0aW9uIGdhdGhlckh5ZHJhdGFibGUoZWxlbWVudCwgcm9vdCkge1xuICBjb25zdCB0ZW1wbGF0ZXMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYCpbZGF0YS1oa11gKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZW1wbGF0ZXMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBub2RlID0gdGVtcGxhdGVzW2ldO1xuICAgIGNvbnN0IGtleSA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiZGF0YS1oa1wiKTtcbiAgICBpZiAoKCFyb290IHx8IGtleS5zdGFydHNXaXRoKHJvb3QpKSAmJiAhc2hhcmVkQ29uZmlnLnJlZ2lzdHJ5LmhhcyhrZXkpKVxuICAgICAgc2hhcmVkQ29uZmlnLnJlZ2lzdHJ5LnNldChrZXksIG5vZGUpO1xuICB9XG59XG5mdW5jdGlvbiBnZXRIeWRyYXRpb25LZXkoKSB7XG4gIGNvbnN0IGh5ZHJhdGUgPSBzaGFyZWRDb25maWcuY29udGV4dDtcbiAgcmV0dXJuIGAke2h5ZHJhdGUuaWR9JHtoeWRyYXRlLmNvdW50Kyt9YDtcbn1cbmZ1bmN0aW9uIE5vSHlkcmF0aW9uKHByb3BzKSB7XG4gIHJldHVybiBzaGFyZWRDb25maWcuY29udGV4dCA/IHVuZGVmaW5lZCA6IHByb3BzLmNoaWxkcmVuO1xufVxuZnVuY3Rpb24gSHlkcmF0aW9uKHByb3BzKSB7XG4gIHJldHVybiBwcm9wcy5jaGlsZHJlbjtcbn1cbmNvbnN0IHZvaWRGbiA9ICgpID0+IHVuZGVmaW5lZDtcbmNvbnN0IFJlcXVlc3RDb250ZXh0ID0gU3ltYm9sKCk7XG5mdW5jdGlvbiBpbm5lckhUTUwocGFyZW50LCBjb250ZW50KSB7XG4gICFzaGFyZWRDb25maWcuY29udGV4dCAmJiAocGFyZW50LmlubmVySFRNTCA9IGNvbnRlbnQpO1xufVxuXG5mdW5jdGlvbiB0aHJvd0luQnJvd3NlcihmdW5jKSB7XG4gIGNvbnN0IGVyciA9IG5ldyBFcnJvcihgJHtmdW5jLm5hbWV9IGlzIG5vdCBzdXBwb3J0ZWQgaW4gdGhlIGJyb3dzZXIsIHJldHVybmluZyB1bmRlZmluZWRgKTtcbiAgY29uc29sZS5lcnJvcihlcnIpO1xufVxuZnVuY3Rpb24gcmVuZGVyVG9TdHJpbmcoZm4sIG9wdGlvbnMpIHtcbiAgdGhyb3dJbkJyb3dzZXIocmVuZGVyVG9TdHJpbmcpO1xufVxuZnVuY3Rpb24gcmVuZGVyVG9TdHJpbmdBc3luYyhmbiwgb3B0aW9ucykge1xuICB0aHJvd0luQnJvd3NlcihyZW5kZXJUb1N0cmluZ0FzeW5jKTtcbn1cbmZ1bmN0aW9uIHJlbmRlclRvU3RyZWFtKGZuLCBvcHRpb25zKSB7XG4gIHRocm93SW5Ccm93c2VyKHJlbmRlclRvU3RyZWFtKTtcbn1cbmZ1bmN0aW9uIHNzcih0ZW1wbGF0ZSwgLi4ubm9kZXMpIHt9XG5mdW5jdGlvbiBzc3JFbGVtZW50KG5hbWUsIHByb3BzLCBjaGlsZHJlbiwgbmVlZHNJZCkge31cbmZ1bmN0aW9uIHNzckNsYXNzTGlzdCh2YWx1ZSkge31cbmZ1bmN0aW9uIHNzclN0eWxlKHZhbHVlKSB7fVxuZnVuY3Rpb24gc3NyQXR0cmlidXRlKGtleSwgdmFsdWUpIHt9XG5mdW5jdGlvbiBzc3JIeWRyYXRpb25LZXkoKSB7fVxuZnVuY3Rpb24gcmVzb2x2ZVNTUk5vZGUobm9kZSkge31cbmZ1bmN0aW9uIGVzY2FwZShodG1sKSB7fVxuZnVuY3Rpb24gc3NyU3ByZWFkKHByb3BzLCBpc1NWRywgc2tpcENoaWxkcmVuKSB7fVxuXG5jb25zdCBpc1NlcnZlciA9IGZhbHNlO1xuY29uc3QgaXNEZXYgPSBmYWxzZTtcbmNvbnN0IFNWR19OQU1FU1BBQ0UgPSBcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCI7XG5mdW5jdGlvbiBjcmVhdGVFbGVtZW50KHRhZ05hbWUsIGlzU1ZHID0gZmFsc2UpIHtcbiAgcmV0dXJuIGlzU1ZHID8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWR19OQU1FU1BBQ0UsIHRhZ05hbWUpIDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTtcbn1cbmNvbnN0IGh5ZHJhdGUgPSAoLi4uYXJncykgPT4ge1xuICBlbmFibGVIeWRyYXRpb24oKTtcbiAgcmV0dXJuIGh5ZHJhdGUkMSguLi5hcmdzKTtcbn07XG5mdW5jdGlvbiBQb3J0YWwocHJvcHMpIHtcbiAgY29uc3QgeyB1c2VTaGFkb3cgfSA9IHByb3BzLFxuICAgIG1hcmtlciA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiXCIpLFxuICAgIG1vdW50ID0gKCkgPT4gcHJvcHMubW91bnQgfHwgZG9jdW1lbnQuYm9keSxcbiAgICBvd25lciA9IGdldE93bmVyKCk7XG4gIGxldCBjb250ZW50O1xuICBsZXQgaHlkcmF0aW5nID0gISFzaGFyZWRDb25maWcuY29udGV4dDtcbiAgY3JlYXRlRWZmZWN0KFxuICAgICgpID0+IHtcbiAgICAgIGlmIChoeWRyYXRpbmcpIGdldE93bmVyKCkudXNlciA9IGh5ZHJhdGluZyA9IGZhbHNlO1xuICAgICAgY29udGVudCB8fCAoY29udGVudCA9IHJ1bldpdGhPd25lcihvd25lciwgKCkgPT4gY3JlYXRlTWVtbygoKSA9PiBwcm9wcy5jaGlsZHJlbikpKTtcbiAgICAgIGNvbnN0IGVsID0gbW91bnQoKTtcbiAgICAgIGlmIChlbCBpbnN0YW5jZW9mIEhUTUxIZWFkRWxlbWVudCkge1xuICAgICAgICBjb25zdCBbY2xlYW4sIHNldENsZWFuXSA9IGNyZWF0ZVNpZ25hbChmYWxzZSk7XG4gICAgICAgIGNvbnN0IGNsZWFudXAgPSAoKSA9PiBzZXRDbGVhbih0cnVlKTtcbiAgICAgICAgY3JlYXRlUm9vdChkaXNwb3NlID0+IGluc2VydChlbCwgKCkgPT4gKCFjbGVhbigpID8gY29udGVudCgpIDogZGlzcG9zZSgpKSwgbnVsbCkpO1xuICAgICAgICBvbkNsZWFudXAoY2xlYW51cCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBjb250YWluZXIgPSBjcmVhdGVFbGVtZW50KHByb3BzLmlzU1ZHID8gXCJnXCIgOiBcImRpdlwiLCBwcm9wcy5pc1NWRyksXG4gICAgICAgICAgcmVuZGVyUm9vdCA9XG4gICAgICAgICAgICB1c2VTaGFkb3cgJiYgY29udGFpbmVyLmF0dGFjaFNoYWRvd1xuICAgICAgICAgICAgICA/IGNvbnRhaW5lci5hdHRhY2hTaGFkb3coe1xuICAgICAgICAgICAgICAgICAgbW9kZTogXCJvcGVuXCJcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICA6IGNvbnRhaW5lcjtcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGNvbnRhaW5lciwgXCJfJGhvc3RcIiwge1xuICAgICAgICAgIGdldCgpIHtcbiAgICAgICAgICAgIHJldHVybiBtYXJrZXIucGFyZW50Tm9kZTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgICB9KTtcbiAgICAgICAgaW5zZXJ0KHJlbmRlclJvb3QsIGNvbnRlbnQpO1xuICAgICAgICBlbC5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuICAgICAgICBwcm9wcy5yZWYgJiYgcHJvcHMucmVmKGNvbnRhaW5lcik7XG4gICAgICAgIG9uQ2xlYW51cCgoKSA9PiBlbC5yZW1vdmVDaGlsZChjb250YWluZXIpKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIHVuZGVmaW5lZCxcbiAgICB7XG4gICAgICByZW5kZXI6ICFoeWRyYXRpbmdcbiAgICB9XG4gICk7XG4gIHJldHVybiBtYXJrZXI7XG59XG5mdW5jdGlvbiBEeW5hbWljKHByb3BzKSB7XG4gIGNvbnN0IFtwLCBvdGhlcnNdID0gc3BsaXRQcm9wcyhwcm9wcywgW1wiY29tcG9uZW50XCJdKTtcbiAgY29uc3QgY2FjaGVkID0gY3JlYXRlTWVtbygoKSA9PiBwLmNvbXBvbmVudCk7XG4gIHJldHVybiBjcmVhdGVNZW1vKCgpID0+IHtcbiAgICBjb25zdCBjb21wb25lbnQgPSBjYWNoZWQoKTtcbiAgICBzd2l0Y2ggKHR5cGVvZiBjb21wb25lbnQpIHtcbiAgICAgIGNhc2UgXCJmdW5jdGlvblwiOlxuICAgICAgICByZXR1cm4gdW50cmFjaygoKSA9PiBjb21wb25lbnQob3RoZXJzKSk7XG4gICAgICBjYXNlIFwic3RyaW5nXCI6XG4gICAgICAgIGNvbnN0IGlzU3ZnID0gU1ZHRWxlbWVudHMuaGFzKGNvbXBvbmVudCk7XG4gICAgICAgIGNvbnN0IGVsID0gc2hhcmVkQ29uZmlnLmNvbnRleHQgPyBnZXROZXh0RWxlbWVudCgpIDogY3JlYXRlRWxlbWVudChjb21wb25lbnQsIGlzU3ZnKTtcbiAgICAgICAgc3ByZWFkKGVsLCBvdGhlcnMsIGlzU3ZnKTtcbiAgICAgICAgcmV0dXJuIGVsO1xuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydCB7XG4gIEFsaWFzZXMsXG4gIHZvaWRGbiBhcyBBc3NldHMsXG4gIENoaWxkUHJvcGVydGllcyxcbiAgRE9NRWxlbWVudHMsXG4gIERlbGVnYXRlZEV2ZW50cyxcbiAgRHluYW1pYyxcbiAgSHlkcmF0aW9uLFxuICB2b2lkRm4gYXMgSHlkcmF0aW9uU2NyaXB0LFxuICBOb0h5ZHJhdGlvbixcbiAgUG9ydGFsLFxuICBQcm9wZXJ0aWVzLFxuICBSZXF1ZXN0Q29udGV4dCxcbiAgU1ZHRWxlbWVudHMsXG4gIFNWR05hbWVzcGFjZSxcbiAgYWRkRXZlbnRMaXN0ZW5lcixcbiAgYXNzaWduLFxuICBjbGFzc0xpc3QsXG4gIGNsYXNzTmFtZSxcbiAgY2xlYXJEZWxlZ2F0ZWRFdmVudHMsXG4gIGRlbGVnYXRlRXZlbnRzLFxuICBkeW5hbWljUHJvcGVydHksXG4gIGVzY2FwZSxcbiAgdm9pZEZuIGFzIGdlbmVyYXRlSHlkcmF0aW9uU2NyaXB0LFxuICB2b2lkRm4gYXMgZ2V0QXNzZXRzLFxuICBnZXRIeWRyYXRpb25LZXksXG4gIGdldE5leHRFbGVtZW50LFxuICBnZXROZXh0TWFya2VyLFxuICBnZXROZXh0TWF0Y2gsXG4gIGdldFByb3BBbGlhcyxcbiAgdm9pZEZuIGFzIGdldFJlcXVlc3RFdmVudCxcbiAgaHlkcmF0ZSxcbiAgaW5uZXJIVE1MLFxuICBpbnNlcnQsXG4gIGlzRGV2LFxuICBpc1NlcnZlcixcbiAgcmVuZGVyLFxuICByZW5kZXJUb1N0cmVhbSxcbiAgcmVuZGVyVG9TdHJpbmcsXG4gIHJlbmRlclRvU3RyaW5nQXN5bmMsXG4gIHJlc29sdmVTU1JOb2RlLFxuICBydW5IeWRyYXRpb25FdmVudHMsXG4gIHNldEF0dHJpYnV0ZSxcbiAgc2V0QXR0cmlidXRlTlMsXG4gIHNldFByb3BlcnR5LFxuICBzcHJlYWQsXG4gIHNzcixcbiAgc3NyQXR0cmlidXRlLFxuICBzc3JDbGFzc0xpc3QsXG4gIHNzckVsZW1lbnQsXG4gIHNzckh5ZHJhdGlvbktleSxcbiAgc3NyU3ByZWFkLFxuICBzc3JTdHlsZSxcbiAgc3R5bGUsXG4gIHRlbXBsYXRlLFxuICB1c2UsXG4gIHZvaWRGbiBhcyB1c2VBc3NldHNcbn07XG4iLCJpbXBvcnQgeyAkUFJPWFksICRUUkFDSywgZ2V0TGlzdGVuZXIsIGJhdGNoLCBjcmVhdGVTaWduYWwgfSBmcm9tIFwic29saWQtanNcIjtcblxuY29uc3QgJFJBVyA9IFN5bWJvbChcInN0b3JlLXJhd1wiKSxcbiAgJE5PREUgPSBTeW1ib2woXCJzdG9yZS1ub2RlXCIpLFxuICAkSEFTID0gU3ltYm9sKFwic3RvcmUtaGFzXCIpLFxuICAkU0VMRiA9IFN5bWJvbChcInN0b3JlLXNlbGZcIik7XG5mdW5jdGlvbiB3cmFwJDEodmFsdWUpIHtcbiAgbGV0IHAgPSB2YWx1ZVskUFJPWFldO1xuICBpZiAoIXApIHtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodmFsdWUsICRQUk9YWSwge1xuICAgICAgdmFsdWU6IChwID0gbmV3IFByb3h5KHZhbHVlLCBwcm94eVRyYXBzJDEpKVxuICAgIH0pO1xuICAgIGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSksXG4gICAgICAgIGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyh2YWx1ZSk7XG4gICAgICBmb3IgKGxldCBpID0gMCwgbCA9IGtleXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHByb3AgPSBrZXlzW2ldO1xuICAgICAgICBpZiAoZGVzY1twcm9wXS5nZXQpIHtcbiAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodmFsdWUsIHByb3AsIHtcbiAgICAgICAgICAgIGVudW1lcmFibGU6IGRlc2NbcHJvcF0uZW51bWVyYWJsZSxcbiAgICAgICAgICAgIGdldDogZGVzY1twcm9wXS5nZXQuYmluZChwKVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBwO1xufVxuZnVuY3Rpb24gaXNXcmFwcGFibGUob2JqKSB7XG4gIGxldCBwcm90bztcbiAgcmV0dXJuIChcbiAgICBvYmogIT0gbnVsbCAmJlxuICAgIHR5cGVvZiBvYmogPT09IFwib2JqZWN0XCIgJiZcbiAgICAob2JqWyRQUk9YWV0gfHxcbiAgICAgICEocHJvdG8gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2Yob2JqKSkgfHxcbiAgICAgIHByb3RvID09PSBPYmplY3QucHJvdG90eXBlIHx8XG4gICAgICBBcnJheS5pc0FycmF5KG9iaikpXG4gICk7XG59XG5mdW5jdGlvbiB1bndyYXAoaXRlbSwgc2V0ID0gbmV3IFNldCgpKSB7XG4gIGxldCByZXN1bHQsIHVud3JhcHBlZCwgdiwgcHJvcDtcbiAgaWYgKChyZXN1bHQgPSBpdGVtICE9IG51bGwgJiYgaXRlbVskUkFXXSkpIHJldHVybiByZXN1bHQ7XG4gIGlmICghaXNXcmFwcGFibGUoaXRlbSkgfHwgc2V0LmhhcyhpdGVtKSkgcmV0dXJuIGl0ZW07XG4gIGlmIChBcnJheS5pc0FycmF5KGl0ZW0pKSB7XG4gICAgaWYgKE9iamVjdC5pc0Zyb3plbihpdGVtKSkgaXRlbSA9IGl0ZW0uc2xpY2UoMCk7XG4gICAgZWxzZSBzZXQuYWRkKGl0ZW0pO1xuICAgIGZvciAobGV0IGkgPSAwLCBsID0gaXRlbS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHYgPSBpdGVtW2ldO1xuICAgICAgaWYgKCh1bndyYXBwZWQgPSB1bndyYXAodiwgc2V0KSkgIT09IHYpIGl0ZW1baV0gPSB1bndyYXBwZWQ7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmIChPYmplY3QuaXNGcm96ZW4oaXRlbSkpIGl0ZW0gPSBPYmplY3QuYXNzaWduKHt9LCBpdGVtKTtcbiAgICBlbHNlIHNldC5hZGQoaXRlbSk7XG4gICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKGl0ZW0pLFxuICAgICAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzKGl0ZW0pO1xuICAgIGZvciAobGV0IGkgPSAwLCBsID0ga2V5cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHByb3AgPSBrZXlzW2ldO1xuICAgICAgaWYgKGRlc2NbcHJvcF0uZ2V0KSBjb250aW51ZTtcbiAgICAgIHYgPSBpdGVtW3Byb3BdO1xuICAgICAgaWYgKCh1bndyYXBwZWQgPSB1bndyYXAodiwgc2V0KSkgIT09IHYpIGl0ZW1bcHJvcF0gPSB1bndyYXBwZWQ7XG4gICAgfVxuICB9XG4gIHJldHVybiBpdGVtO1xufVxuZnVuY3Rpb24gZ2V0Tm9kZXModGFyZ2V0LCBzeW1ib2wpIHtcbiAgbGV0IG5vZGVzID0gdGFyZ2V0W3N5bWJvbF07XG4gIGlmICghbm9kZXMpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgc3ltYm9sLCB7XG4gICAgICB2YWx1ZTogKG5vZGVzID0gT2JqZWN0LmNyZWF0ZShudWxsKSlcbiAgICB9KTtcbiAgcmV0dXJuIG5vZGVzO1xufVxuZnVuY3Rpb24gZ2V0Tm9kZShub2RlcywgcHJvcGVydHksIHZhbHVlKSB7XG4gIGlmIChub2Rlc1twcm9wZXJ0eV0pIHJldHVybiBub2Rlc1twcm9wZXJ0eV07XG4gIGNvbnN0IFtzLCBzZXRdID0gY3JlYXRlU2lnbmFsKHZhbHVlLCB7XG4gICAgZXF1YWxzOiBmYWxzZSxcbiAgICBpbnRlcm5hbDogdHJ1ZVxuICB9KTtcbiAgcy4kID0gc2V0O1xuICByZXR1cm4gKG5vZGVzW3Byb3BlcnR5XSA9IHMpO1xufVxuZnVuY3Rpb24gcHJveHlEZXNjcmlwdG9yJDEodGFyZ2V0LCBwcm9wZXJ0eSkge1xuICBjb25zdCBkZXNjID0gUmVmbGVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodGFyZ2V0LCBwcm9wZXJ0eSk7XG4gIGlmICghZGVzYyB8fCBkZXNjLmdldCB8fCAhZGVzYy5jb25maWd1cmFibGUgfHwgcHJvcGVydHkgPT09ICRQUk9YWSB8fCBwcm9wZXJ0eSA9PT0gJE5PREUpXG4gICAgcmV0dXJuIGRlc2M7XG4gIGRlbGV0ZSBkZXNjLnZhbHVlO1xuICBkZWxldGUgZGVzYy53cml0YWJsZTtcbiAgZGVzYy5nZXQgPSAoKSA9PiB0YXJnZXRbJFBST1hZXVtwcm9wZXJ0eV07XG4gIHJldHVybiBkZXNjO1xufVxuZnVuY3Rpb24gdHJhY2tTZWxmKHRhcmdldCkge1xuICBnZXRMaXN0ZW5lcigpICYmIGdldE5vZGUoZ2V0Tm9kZXModGFyZ2V0LCAkTk9ERSksICRTRUxGKSgpO1xufVxuZnVuY3Rpb24gb3duS2V5cyh0YXJnZXQpIHtcbiAgdHJhY2tTZWxmKHRhcmdldCk7XG4gIHJldHVybiBSZWZsZWN0Lm93bktleXModGFyZ2V0KTtcbn1cbmNvbnN0IHByb3h5VHJhcHMkMSA9IHtcbiAgZ2V0KHRhcmdldCwgcHJvcGVydHksIHJlY2VpdmVyKSB7XG4gICAgaWYgKHByb3BlcnR5ID09PSAkUkFXKSByZXR1cm4gdGFyZ2V0O1xuICAgIGlmIChwcm9wZXJ0eSA9PT0gJFBST1hZKSByZXR1cm4gcmVjZWl2ZXI7XG4gICAgaWYgKHByb3BlcnR5ID09PSAkVFJBQ0spIHtcbiAgICAgIHRyYWNrU2VsZih0YXJnZXQpO1xuICAgICAgcmV0dXJuIHJlY2VpdmVyO1xuICAgIH1cbiAgICBjb25zdCBub2RlcyA9IGdldE5vZGVzKHRhcmdldCwgJE5PREUpO1xuICAgIGNvbnN0IHRyYWNrZWQgPSBub2Rlc1twcm9wZXJ0eV07XG4gICAgbGV0IHZhbHVlID0gdHJhY2tlZCA/IHRyYWNrZWQoKSA6IHRhcmdldFtwcm9wZXJ0eV07XG4gICAgaWYgKHByb3BlcnR5ID09PSAkTk9ERSB8fCBwcm9wZXJ0eSA9PT0gJEhBUyB8fCBwcm9wZXJ0eSA9PT0gXCJfX3Byb3RvX19cIikgcmV0dXJuIHZhbHVlO1xuICAgIGlmICghdHJhY2tlZCkge1xuICAgICAgY29uc3QgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodGFyZ2V0LCBwcm9wZXJ0eSk7XG4gICAgICBpZiAoXG4gICAgICAgIGdldExpc3RlbmVyKCkgJiZcbiAgICAgICAgKHR5cGVvZiB2YWx1ZSAhPT0gXCJmdW5jdGlvblwiIHx8IHRhcmdldC5oYXNPd25Qcm9wZXJ0eShwcm9wZXJ0eSkpICYmXG4gICAgICAgICEoZGVzYyAmJiBkZXNjLmdldClcbiAgICAgIClcbiAgICAgICAgdmFsdWUgPSBnZXROb2RlKG5vZGVzLCBwcm9wZXJ0eSwgdmFsdWUpKCk7XG4gICAgfVxuICAgIHJldHVybiBpc1dyYXBwYWJsZSh2YWx1ZSkgPyB3cmFwJDEodmFsdWUpIDogdmFsdWU7XG4gIH0sXG4gIGhhcyh0YXJnZXQsIHByb3BlcnR5KSB7XG4gICAgaWYgKFxuICAgICAgcHJvcGVydHkgPT09ICRSQVcgfHxcbiAgICAgIHByb3BlcnR5ID09PSAkUFJPWFkgfHxcbiAgICAgIHByb3BlcnR5ID09PSAkVFJBQ0sgfHxcbiAgICAgIHByb3BlcnR5ID09PSAkTk9ERSB8fFxuICAgICAgcHJvcGVydHkgPT09ICRIQVMgfHxcbiAgICAgIHByb3BlcnR5ID09PSBcIl9fcHJvdG9fX1wiXG4gICAgKVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgZ2V0TGlzdGVuZXIoKSAmJiBnZXROb2RlKGdldE5vZGVzKHRhcmdldCwgJEhBUyksIHByb3BlcnR5KSgpO1xuICAgIHJldHVybiBwcm9wZXJ0eSBpbiB0YXJnZXQ7XG4gIH0sXG4gIHNldCgpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSxcbiAgZGVsZXRlUHJvcGVydHkoKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG4gIG93bktleXM6IG93bktleXMsXG4gIGdldE93blByb3BlcnR5RGVzY3JpcHRvcjogcHJveHlEZXNjcmlwdG9yJDFcbn07XG5mdW5jdGlvbiBzZXRQcm9wZXJ0eShzdGF0ZSwgcHJvcGVydHksIHZhbHVlLCBkZWxldGluZyA9IGZhbHNlKSB7XG4gIGlmICghZGVsZXRpbmcgJiYgc3RhdGVbcHJvcGVydHldID09PSB2YWx1ZSkgcmV0dXJuO1xuICBjb25zdCBwcmV2ID0gc3RhdGVbcHJvcGVydHldLFxuICAgIGxlbiA9IHN0YXRlLmxlbmd0aDtcbiAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICBkZWxldGUgc3RhdGVbcHJvcGVydHldO1xuICAgIGlmIChzdGF0ZVskSEFTXSAmJiBzdGF0ZVskSEFTXVtwcm9wZXJ0eV0gJiYgcHJldiAhPT0gdW5kZWZpbmVkKSBzdGF0ZVskSEFTXVtwcm9wZXJ0eV0uJCgpO1xuICB9IGVsc2Uge1xuICAgIHN0YXRlW3Byb3BlcnR5XSA9IHZhbHVlO1xuICAgIGlmIChzdGF0ZVskSEFTXSAmJiBzdGF0ZVskSEFTXVtwcm9wZXJ0eV0gJiYgcHJldiA9PT0gdW5kZWZpbmVkKSBzdGF0ZVskSEFTXVtwcm9wZXJ0eV0uJCgpO1xuICB9XG4gIGxldCBub2RlcyA9IGdldE5vZGVzKHN0YXRlLCAkTk9ERSksXG4gICAgbm9kZTtcbiAgaWYgKChub2RlID0gZ2V0Tm9kZShub2RlcywgcHJvcGVydHksIHByZXYpKSkgbm9kZS4kKCgpID0+IHZhbHVlKTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc3RhdGUpICYmIHN0YXRlLmxlbmd0aCAhPT0gbGVuKSB7XG4gICAgZm9yIChsZXQgaSA9IHN0YXRlLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSAobm9kZSA9IG5vZGVzW2ldKSAmJiBub2RlLiQoKTtcbiAgICAobm9kZSA9IGdldE5vZGUobm9kZXMsIFwibGVuZ3RoXCIsIGxlbikpICYmIG5vZGUuJChzdGF0ZS5sZW5ndGgpO1xuICB9XG4gIChub2RlID0gbm9kZXNbJFNFTEZdKSAmJiBub2RlLiQoKTtcbn1cbmZ1bmN0aW9uIG1lcmdlU3RvcmVOb2RlKHN0YXRlLCB2YWx1ZSkge1xuICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICBjb25zdCBrZXkgPSBrZXlzW2ldO1xuICAgIHNldFByb3BlcnR5KHN0YXRlLCBrZXksIHZhbHVlW2tleV0pO1xuICB9XG59XG5mdW5jdGlvbiB1cGRhdGVBcnJheShjdXJyZW50LCBuZXh0KSB7XG4gIGlmICh0eXBlb2YgbmV4dCA9PT0gXCJmdW5jdGlvblwiKSBuZXh0ID0gbmV4dChjdXJyZW50KTtcbiAgbmV4dCA9IHVud3JhcChuZXh0KTtcbiAgaWYgKEFycmF5LmlzQXJyYXkobmV4dCkpIHtcbiAgICBpZiAoY3VycmVudCA9PT0gbmV4dCkgcmV0dXJuO1xuICAgIGxldCBpID0gMCxcbiAgICAgIGxlbiA9IG5leHQubGVuZ3RoO1xuICAgIGZvciAoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gbmV4dFtpXTtcbiAgICAgIGlmIChjdXJyZW50W2ldICE9PSB2YWx1ZSkgc2V0UHJvcGVydHkoY3VycmVudCwgaSwgdmFsdWUpO1xuICAgIH1cbiAgICBzZXRQcm9wZXJ0eShjdXJyZW50LCBcImxlbmd0aFwiLCBsZW4pO1xuICB9IGVsc2UgbWVyZ2VTdG9yZU5vZGUoY3VycmVudCwgbmV4dCk7XG59XG5mdW5jdGlvbiB1cGRhdGVQYXRoKGN1cnJlbnQsIHBhdGgsIHRyYXZlcnNlZCA9IFtdKSB7XG4gIGxldCBwYXJ0LFxuICAgIHByZXYgPSBjdXJyZW50O1xuICBpZiAocGF0aC5sZW5ndGggPiAxKSB7XG4gICAgcGFydCA9IHBhdGguc2hpZnQoKTtcbiAgICBjb25zdCBwYXJ0VHlwZSA9IHR5cGVvZiBwYXJ0LFxuICAgICAgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkoY3VycmVudCk7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocGFydCkpIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydC5sZW5ndGg7IGkrKykge1xuICAgICAgICB1cGRhdGVQYXRoKGN1cnJlbnQsIFtwYXJ0W2ldXS5jb25jYXQocGF0aCksIHRyYXZlcnNlZCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIGlmIChpc0FycmF5ICYmIHBhcnRUeXBlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY3VycmVudC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGFydChjdXJyZW50W2ldLCBpKSkgdXBkYXRlUGF0aChjdXJyZW50LCBbaV0uY29uY2F0KHBhdGgpLCB0cmF2ZXJzZWQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheSAmJiBwYXJ0VHlwZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgY29uc3QgeyBmcm9tID0gMCwgdG8gPSBjdXJyZW50Lmxlbmd0aCAtIDEsIGJ5ID0gMSB9ID0gcGFydDtcbiAgICAgIGZvciAobGV0IGkgPSBmcm9tOyBpIDw9IHRvOyBpICs9IGJ5KSB7XG4gICAgICAgIHVwZGF0ZVBhdGgoY3VycmVudCwgW2ldLmNvbmNhdChwYXRoKSwgdHJhdmVyc2VkKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2UgaWYgKHBhdGgubGVuZ3RoID4gMSkge1xuICAgICAgdXBkYXRlUGF0aChjdXJyZW50W3BhcnRdLCBwYXRoLCBbcGFydF0uY29uY2F0KHRyYXZlcnNlZCkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBwcmV2ID0gY3VycmVudFtwYXJ0XTtcbiAgICB0cmF2ZXJzZWQgPSBbcGFydF0uY29uY2F0KHRyYXZlcnNlZCk7XG4gIH1cbiAgbGV0IHZhbHVlID0gcGF0aFswXTtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgdmFsdWUgPSB2YWx1ZShwcmV2LCB0cmF2ZXJzZWQpO1xuICAgIGlmICh2YWx1ZSA9PT0gcHJldikgcmV0dXJuO1xuICB9XG4gIGlmIChwYXJ0ID09PSB1bmRlZmluZWQgJiYgdmFsdWUgPT0gdW5kZWZpbmVkKSByZXR1cm47XG4gIHZhbHVlID0gdW53cmFwKHZhbHVlKTtcbiAgaWYgKHBhcnQgPT09IHVuZGVmaW5lZCB8fCAoaXNXcmFwcGFibGUocHJldikgJiYgaXNXcmFwcGFibGUodmFsdWUpICYmICFBcnJheS5pc0FycmF5KHZhbHVlKSkpIHtcbiAgICBtZXJnZVN0b3JlTm9kZShwcmV2LCB2YWx1ZSk7XG4gIH0gZWxzZSBzZXRQcm9wZXJ0eShjdXJyZW50LCBwYXJ0LCB2YWx1ZSk7XG59XG5mdW5jdGlvbiBjcmVhdGVTdG9yZSguLi5bc3RvcmUsIG9wdGlvbnNdKSB7XG4gIGNvbnN0IHVud3JhcHBlZFN0b3JlID0gdW53cmFwKHN0b3JlIHx8IHt9KTtcbiAgY29uc3QgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkodW53cmFwcGVkU3RvcmUpO1xuICBjb25zdCB3cmFwcGVkU3RvcmUgPSB3cmFwJDEodW53cmFwcGVkU3RvcmUpO1xuICBmdW5jdGlvbiBzZXRTdG9yZSguLi5hcmdzKSB7XG4gICAgYmF0Y2goKCkgPT4ge1xuICAgICAgaXNBcnJheSAmJiBhcmdzLmxlbmd0aCA9PT0gMVxuICAgICAgICA/IHVwZGF0ZUFycmF5KHVud3JhcHBlZFN0b3JlLCBhcmdzWzBdKVxuICAgICAgICA6IHVwZGF0ZVBhdGgodW53cmFwcGVkU3RvcmUsIGFyZ3MpO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBbd3JhcHBlZFN0b3JlLCBzZXRTdG9yZV07XG59XG5cbmZ1bmN0aW9uIHByb3h5RGVzY3JpcHRvcih0YXJnZXQsIHByb3BlcnR5KSB7XG4gIGNvbnN0IGRlc2MgPSBSZWZsZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih0YXJnZXQsIHByb3BlcnR5KTtcbiAgaWYgKFxuICAgICFkZXNjIHx8XG4gICAgZGVzYy5nZXQgfHxcbiAgICBkZXNjLnNldCB8fFxuICAgICFkZXNjLmNvbmZpZ3VyYWJsZSB8fFxuICAgIHByb3BlcnR5ID09PSAkUFJPWFkgfHxcbiAgICBwcm9wZXJ0eSA9PT0gJE5PREVcbiAgKVxuICAgIHJldHVybiBkZXNjO1xuICBkZWxldGUgZGVzYy52YWx1ZTtcbiAgZGVsZXRlIGRlc2Mud3JpdGFibGU7XG4gIGRlc2MuZ2V0ID0gKCkgPT4gdGFyZ2V0WyRQUk9YWV1bcHJvcGVydHldO1xuICBkZXNjLnNldCA9IHYgPT4gKHRhcmdldFskUFJPWFldW3Byb3BlcnR5XSA9IHYpO1xuICByZXR1cm4gZGVzYztcbn1cbmNvbnN0IHByb3h5VHJhcHMgPSB7XG4gIGdldCh0YXJnZXQsIHByb3BlcnR5LCByZWNlaXZlcikge1xuICAgIGlmIChwcm9wZXJ0eSA9PT0gJFJBVykgcmV0dXJuIHRhcmdldDtcbiAgICBpZiAocHJvcGVydHkgPT09ICRQUk9YWSkgcmV0dXJuIHJlY2VpdmVyO1xuICAgIGlmIChwcm9wZXJ0eSA9PT0gJFRSQUNLKSB7XG4gICAgICB0cmFja1NlbGYodGFyZ2V0KTtcbiAgICAgIHJldHVybiByZWNlaXZlcjtcbiAgICB9XG4gICAgY29uc3Qgbm9kZXMgPSBnZXROb2Rlcyh0YXJnZXQsICROT0RFKTtcbiAgICBjb25zdCB0cmFja2VkID0gbm9kZXNbcHJvcGVydHldO1xuICAgIGxldCB2YWx1ZSA9IHRyYWNrZWQgPyB0cmFja2VkKCkgOiB0YXJnZXRbcHJvcGVydHldO1xuICAgIGlmIChwcm9wZXJ0eSA9PT0gJE5PREUgfHwgcHJvcGVydHkgPT09ICRIQVMgfHwgcHJvcGVydHkgPT09IFwiX19wcm90b19fXCIpIHJldHVybiB2YWx1ZTtcbiAgICBpZiAoIXRyYWNrZWQpIHtcbiAgICAgIGNvbnN0IGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHRhcmdldCwgcHJvcGVydHkpO1xuICAgICAgY29uc3QgaXNGdW5jdGlvbiA9IHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiO1xuICAgICAgaWYgKGdldExpc3RlbmVyKCkgJiYgKCFpc0Z1bmN0aW9uIHx8IHRhcmdldC5oYXNPd25Qcm9wZXJ0eShwcm9wZXJ0eSkpICYmICEoZGVzYyAmJiBkZXNjLmdldCkpXG4gICAgICAgIHZhbHVlID0gZ2V0Tm9kZShub2RlcywgcHJvcGVydHksIHZhbHVlKSgpO1xuICAgICAgZWxzZSBpZiAodmFsdWUgIT0gbnVsbCAmJiBpc0Z1bmN0aW9uICYmIHZhbHVlID09PSBBcnJheS5wcm90b3R5cGVbcHJvcGVydHldKSB7XG4gICAgICAgIHJldHVybiAoLi4uYXJncykgPT4gYmF0Y2goKCkgPT4gQXJyYXkucHJvdG90eXBlW3Byb3BlcnR5XS5hcHBseShyZWNlaXZlciwgYXJncykpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gaXNXcmFwcGFibGUodmFsdWUpID8gd3JhcCh2YWx1ZSkgOiB2YWx1ZTtcbiAgfSxcbiAgaGFzKHRhcmdldCwgcHJvcGVydHkpIHtcbiAgICBpZiAoXG4gICAgICBwcm9wZXJ0eSA9PT0gJFJBVyB8fFxuICAgICAgcHJvcGVydHkgPT09ICRQUk9YWSB8fFxuICAgICAgcHJvcGVydHkgPT09ICRUUkFDSyB8fFxuICAgICAgcHJvcGVydHkgPT09ICROT0RFIHx8XG4gICAgICBwcm9wZXJ0eSA9PT0gJEhBUyB8fFxuICAgICAgcHJvcGVydHkgPT09IFwiX19wcm90b19fXCJcbiAgICApXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICBnZXRMaXN0ZW5lcigpICYmIGdldE5vZGUoZ2V0Tm9kZXModGFyZ2V0LCAkSEFTKSwgcHJvcGVydHkpKCk7XG4gICAgcmV0dXJuIHByb3BlcnR5IGluIHRhcmdldDtcbiAgfSxcbiAgc2V0KHRhcmdldCwgcHJvcGVydHksIHZhbHVlKSB7XG4gICAgYmF0Y2goKCkgPT4gc2V0UHJvcGVydHkodGFyZ2V0LCBwcm9wZXJ0eSwgdW53cmFwKHZhbHVlKSkpO1xuICAgIHJldHVybiB0cnVlO1xuICB9LFxuICBkZWxldGVQcm9wZXJ0eSh0YXJnZXQsIHByb3BlcnR5KSB7XG4gICAgYmF0Y2goKCkgPT4gc2V0UHJvcGVydHkodGFyZ2V0LCBwcm9wZXJ0eSwgdW5kZWZpbmVkLCB0cnVlKSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG4gIG93bktleXM6IG93bktleXMsXG4gIGdldE93blByb3BlcnR5RGVzY3JpcHRvcjogcHJveHlEZXNjcmlwdG9yXG59O1xuZnVuY3Rpb24gd3JhcCh2YWx1ZSkge1xuICBsZXQgcCA9IHZhbHVlWyRQUk9YWV07XG4gIGlmICghcCkge1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh2YWx1ZSwgJFBST1hZLCB7XG4gICAgICB2YWx1ZTogKHAgPSBuZXcgUHJveHkodmFsdWUsIHByb3h5VHJhcHMpKVxuICAgIH0pO1xuICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSksXG4gICAgICBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcnModmFsdWUpO1xuICAgIGNvbnN0IHByb3RvID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHZhbHVlKTtcbiAgICBjb25zdCBpc0NsYXNzID1cbiAgICAgIHZhbHVlICE9PSBudWxsICYmXG4gICAgICB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiZcbiAgICAgICFBcnJheS5pc0FycmF5KHZhbHVlKSAmJlxuICAgICAgcHJvdG8gIT09IE9iamVjdC5wcm90b3R5cGU7XG4gICAgaWYgKGlzQ2xhc3MpIHtcbiAgICAgIGNvbnN0IGRlc2NyaXB0b3JzID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcnMocHJvdG8pO1xuICAgICAga2V5cy5wdXNoKC4uLk9iamVjdC5rZXlzKGRlc2NyaXB0b3JzKSk7XG4gICAgICBPYmplY3QuYXNzaWduKGRlc2MsIGRlc2NyaXB0b3JzKTtcbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDAsIGwgPSBrZXlzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgY29uc3QgcHJvcCA9IGtleXNbaV07XG4gICAgICBpZiAoaXNDbGFzcyAmJiBwcm9wID09PSBcImNvbnN0cnVjdG9yXCIpIGNvbnRpbnVlO1xuICAgICAgaWYgKGRlc2NbcHJvcF0uZ2V0KSB7XG4gICAgICAgIGNvbnN0IGdldCA9IGRlc2NbcHJvcF0uZ2V0LmJpbmQocCk7XG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh2YWx1ZSwgcHJvcCwge1xuICAgICAgICAgIGdldCxcbiAgICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBpZiAoZGVzY1twcm9wXS5zZXQpIHtcbiAgICAgICAgY29uc3Qgb2cgPSBkZXNjW3Byb3BdLnNldCxcbiAgICAgICAgICBzZXQgPSB2ID0+IGJhdGNoKCgpID0+IG9nLmNhbGwocCwgdikpO1xuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodmFsdWUsIHByb3AsIHtcbiAgICAgICAgICBzZXQsXG4gICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gcDtcbn1cbmZ1bmN0aW9uIGNyZWF0ZU11dGFibGUoc3RhdGUsIG9wdGlvbnMpIHtcbiAgY29uc3QgdW53cmFwcGVkU3RvcmUgPSB1bndyYXAoc3RhdGUgfHwge30pO1xuICBjb25zdCB3cmFwcGVkU3RvcmUgPSB3cmFwKHVud3JhcHBlZFN0b3JlKTtcbiAgcmV0dXJuIHdyYXBwZWRTdG9yZTtcbn1cbmZ1bmN0aW9uIG1vZGlmeU11dGFibGUoc3RhdGUsIG1vZGlmaWVyKSB7XG4gIGJhdGNoKCgpID0+IG1vZGlmaWVyKHVud3JhcChzdGF0ZSkpKTtcbn1cblxuY29uc3QgJFJPT1QgPSBTeW1ib2woXCJzdG9yZS1yb290XCIpO1xuZnVuY3Rpb24gYXBwbHlTdGF0ZSh0YXJnZXQsIHBhcmVudCwgcHJvcGVydHksIG1lcmdlLCBrZXkpIHtcbiAgY29uc3QgcHJldmlvdXMgPSBwYXJlbnRbcHJvcGVydHldO1xuICBpZiAodGFyZ2V0ID09PSBwcmV2aW91cykgcmV0dXJuO1xuICBjb25zdCBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSh0YXJnZXQpO1xuICBpZiAoXG4gICAgcHJvcGVydHkgIT09ICRST09UICYmXG4gICAgKCFpc1dyYXBwYWJsZSh0YXJnZXQpIHx8XG4gICAgICAhaXNXcmFwcGFibGUocHJldmlvdXMpIHx8XG4gICAgICBpc0FycmF5ICE9PSBBcnJheS5pc0FycmF5KHByZXZpb3VzKSB8fFxuICAgICAgKGtleSAmJiB0YXJnZXRba2V5XSAhPT0gcHJldmlvdXNba2V5XSkpXG4gICkge1xuICAgIHNldFByb3BlcnR5KHBhcmVudCwgcHJvcGVydHksIHRhcmdldCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChpc0FycmF5KSB7XG4gICAgaWYgKFxuICAgICAgdGFyZ2V0Lmxlbmd0aCAmJlxuICAgICAgcHJldmlvdXMubGVuZ3RoICYmXG4gICAgICAoIW1lcmdlIHx8IChrZXkgJiYgdGFyZ2V0WzBdICYmIHRhcmdldFswXVtrZXldICE9IG51bGwpKVxuICAgICkge1xuICAgICAgbGV0IGksIGosIHN0YXJ0LCBlbmQsIG5ld0VuZCwgaXRlbSwgbmV3SW5kaWNlc05leHQsIGtleVZhbDtcbiAgICAgIGZvciAoXG4gICAgICAgIHN0YXJ0ID0gMCwgZW5kID0gTWF0aC5taW4ocHJldmlvdXMubGVuZ3RoLCB0YXJnZXQubGVuZ3RoKTtcbiAgICAgICAgc3RhcnQgPCBlbmQgJiZcbiAgICAgICAgKHByZXZpb3VzW3N0YXJ0XSA9PT0gdGFyZ2V0W3N0YXJ0XSB8fFxuICAgICAgICAgIChrZXkgJiYgcHJldmlvdXNbc3RhcnRdICYmIHRhcmdldFtzdGFydF0gJiYgcHJldmlvdXNbc3RhcnRdW2tleV0gPT09IHRhcmdldFtzdGFydF1ba2V5XSkpO1xuICAgICAgICBzdGFydCsrXG4gICAgICApIHtcbiAgICAgICAgYXBwbHlTdGF0ZSh0YXJnZXRbc3RhcnRdLCBwcmV2aW91cywgc3RhcnQsIG1lcmdlLCBrZXkpO1xuICAgICAgfVxuICAgICAgY29uc3QgdGVtcCA9IG5ldyBBcnJheSh0YXJnZXQubGVuZ3RoKSxcbiAgICAgICAgbmV3SW5kaWNlcyA9IG5ldyBNYXAoKTtcbiAgICAgIGZvciAoXG4gICAgICAgIGVuZCA9IHByZXZpb3VzLmxlbmd0aCAtIDEsIG5ld0VuZCA9IHRhcmdldC5sZW5ndGggLSAxO1xuICAgICAgICBlbmQgPj0gc3RhcnQgJiZcbiAgICAgICAgbmV3RW5kID49IHN0YXJ0ICYmXG4gICAgICAgIChwcmV2aW91c1tlbmRdID09PSB0YXJnZXRbbmV3RW5kXSB8fFxuICAgICAgICAgIChrZXkgJiYgcHJldmlvdXNbc3RhcnRdICYmIHRhcmdldFtzdGFydF0gJiYgcHJldmlvdXNbZW5kXVtrZXldID09PSB0YXJnZXRbbmV3RW5kXVtrZXldKSk7XG4gICAgICAgIGVuZC0tLCBuZXdFbmQtLVxuICAgICAgKSB7XG4gICAgICAgIHRlbXBbbmV3RW5kXSA9IHByZXZpb3VzW2VuZF07XG4gICAgICB9XG4gICAgICBpZiAoc3RhcnQgPiBuZXdFbmQgfHwgc3RhcnQgPiBlbmQpIHtcbiAgICAgICAgZm9yIChqID0gc3RhcnQ7IGogPD0gbmV3RW5kOyBqKyspIHNldFByb3BlcnR5KHByZXZpb3VzLCBqLCB0YXJnZXRbal0pO1xuICAgICAgICBmb3IgKDsgaiA8IHRhcmdldC5sZW5ndGg7IGorKykge1xuICAgICAgICAgIHNldFByb3BlcnR5KHByZXZpb3VzLCBqLCB0ZW1wW2pdKTtcbiAgICAgICAgICBhcHBseVN0YXRlKHRhcmdldFtqXSwgcHJldmlvdXMsIGosIG1lcmdlLCBrZXkpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwcmV2aW91cy5sZW5ndGggPiB0YXJnZXQubGVuZ3RoKSBzZXRQcm9wZXJ0eShwcmV2aW91cywgXCJsZW5ndGhcIiwgdGFyZ2V0Lmxlbmd0aCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIG5ld0luZGljZXNOZXh0ID0gbmV3IEFycmF5KG5ld0VuZCArIDEpO1xuICAgICAgZm9yIChqID0gbmV3RW5kOyBqID49IHN0YXJ0OyBqLS0pIHtcbiAgICAgICAgaXRlbSA9IHRhcmdldFtqXTtcbiAgICAgICAga2V5VmFsID0ga2V5ICYmIGl0ZW0gPyBpdGVtW2tleV0gOiBpdGVtO1xuICAgICAgICBpID0gbmV3SW5kaWNlcy5nZXQoa2V5VmFsKTtcbiAgICAgICAgbmV3SW5kaWNlc05leHRbal0gPSBpID09PSB1bmRlZmluZWQgPyAtMSA6IGk7XG4gICAgICAgIG5ld0luZGljZXMuc2V0KGtleVZhbCwgaik7XG4gICAgICB9XG4gICAgICBmb3IgKGkgPSBzdGFydDsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICBpdGVtID0gcHJldmlvdXNbaV07XG4gICAgICAgIGtleVZhbCA9IGtleSAmJiBpdGVtID8gaXRlbVtrZXldIDogaXRlbTtcbiAgICAgICAgaiA9IG5ld0luZGljZXMuZ2V0KGtleVZhbCk7XG4gICAgICAgIGlmIChqICE9PSB1bmRlZmluZWQgJiYgaiAhPT0gLTEpIHtcbiAgICAgICAgICB0ZW1wW2pdID0gcHJldmlvdXNbaV07XG4gICAgICAgICAgaiA9IG5ld0luZGljZXNOZXh0W2pdO1xuICAgICAgICAgIG5ld0luZGljZXMuc2V0KGtleVZhbCwgaik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGZvciAoaiA9IHN0YXJ0OyBqIDwgdGFyZ2V0Lmxlbmd0aDsgaisrKSB7XG4gICAgICAgIGlmIChqIGluIHRlbXApIHtcbiAgICAgICAgICBzZXRQcm9wZXJ0eShwcmV2aW91cywgaiwgdGVtcFtqXSk7XG4gICAgICAgICAgYXBwbHlTdGF0ZSh0YXJnZXRbal0sIHByZXZpb3VzLCBqLCBtZXJnZSwga2V5KTtcbiAgICAgICAgfSBlbHNlIHNldFByb3BlcnR5KHByZXZpb3VzLCBqLCB0YXJnZXRbal0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gdGFyZ2V0Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGFwcGx5U3RhdGUodGFyZ2V0W2ldLCBwcmV2aW91cywgaSwgbWVyZ2UsIGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChwcmV2aW91cy5sZW5ndGggPiB0YXJnZXQubGVuZ3RoKSBzZXRQcm9wZXJ0eShwcmV2aW91cywgXCJsZW5ndGhcIiwgdGFyZ2V0Lmxlbmd0aCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHRhcmdldEtleXMgPSBPYmplY3Qua2V5cyh0YXJnZXQpO1xuICBmb3IgKGxldCBpID0gMCwgbGVuID0gdGFyZ2V0S2V5cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgIGFwcGx5U3RhdGUodGFyZ2V0W3RhcmdldEtleXNbaV1dLCBwcmV2aW91cywgdGFyZ2V0S2V5c1tpXSwgbWVyZ2UsIGtleSk7XG4gIH1cbiAgY29uc3QgcHJldmlvdXNLZXlzID0gT2JqZWN0LmtleXMocHJldmlvdXMpO1xuICBmb3IgKGxldCBpID0gMCwgbGVuID0gcHJldmlvdXNLZXlzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKHRhcmdldFtwcmV2aW91c0tleXNbaV1dID09PSB1bmRlZmluZWQpIHNldFByb3BlcnR5KHByZXZpb3VzLCBwcmV2aW91c0tleXNbaV0sIHVuZGVmaW5lZCk7XG4gIH1cbn1cbmZ1bmN0aW9uIHJlY29uY2lsZSh2YWx1ZSwgb3B0aW9ucyA9IHt9KSB7XG4gIGNvbnN0IHsgbWVyZ2UsIGtleSA9IFwiaWRcIiB9ID0gb3B0aW9ucyxcbiAgICB2ID0gdW53cmFwKHZhbHVlKTtcbiAgcmV0dXJuIHN0YXRlID0+IHtcbiAgICBpZiAoIWlzV3JhcHBhYmxlKHN0YXRlKSB8fCAhaXNXcmFwcGFibGUodikpIHJldHVybiB2O1xuICAgIGNvbnN0IHJlcyA9IGFwcGx5U3RhdGUoXG4gICAgICB2LFxuICAgICAge1xuICAgICAgICBbJFJPT1RdOiBzdGF0ZVxuICAgICAgfSxcbiAgICAgICRST09ULFxuICAgICAgbWVyZ2UsXG4gICAgICBrZXlcbiAgICApO1xuICAgIHJldHVybiByZXMgPT09IHVuZGVmaW5lZCA/IHN0YXRlIDogcmVzO1xuICB9O1xufVxuY29uc3QgcHJvZHVjZXJzID0gbmV3IFdlYWtNYXAoKTtcbmNvbnN0IHNldHRlclRyYXBzID0ge1xuICBnZXQodGFyZ2V0LCBwcm9wZXJ0eSkge1xuICAgIGlmIChwcm9wZXJ0eSA9PT0gJFJBVykgcmV0dXJuIHRhcmdldDtcbiAgICBjb25zdCB2YWx1ZSA9IHRhcmdldFtwcm9wZXJ0eV07XG4gICAgbGV0IHByb3h5O1xuICAgIHJldHVybiBpc1dyYXBwYWJsZSh2YWx1ZSlcbiAgICAgID8gcHJvZHVjZXJzLmdldCh2YWx1ZSkgfHxcbiAgICAgICAgICAocHJvZHVjZXJzLnNldCh2YWx1ZSwgKHByb3h5ID0gbmV3IFByb3h5KHZhbHVlLCBzZXR0ZXJUcmFwcykpKSwgcHJveHkpXG4gICAgICA6IHZhbHVlO1xuICB9LFxuICBzZXQodGFyZ2V0LCBwcm9wZXJ0eSwgdmFsdWUpIHtcbiAgICBzZXRQcm9wZXJ0eSh0YXJnZXQsIHByb3BlcnR5LCB1bndyYXAodmFsdWUpKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSxcbiAgZGVsZXRlUHJvcGVydHkodGFyZ2V0LCBwcm9wZXJ0eSkge1xuICAgIHNldFByb3BlcnR5KHRhcmdldCwgcHJvcGVydHksIHVuZGVmaW5lZCwgdHJ1ZSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn07XG5mdW5jdGlvbiBwcm9kdWNlKGZuKSB7XG4gIHJldHVybiBzdGF0ZSA9PiB7XG4gICAgaWYgKGlzV3JhcHBhYmxlKHN0YXRlKSkge1xuICAgICAgbGV0IHByb3h5O1xuICAgICAgaWYgKCEocHJveHkgPSBwcm9kdWNlcnMuZ2V0KHN0YXRlKSkpIHtcbiAgICAgICAgcHJvZHVjZXJzLnNldChzdGF0ZSwgKHByb3h5ID0gbmV3IFByb3h5KHN0YXRlLCBzZXR0ZXJUcmFwcykpKTtcbiAgICAgIH1cbiAgICAgIGZuKHByb3h5KTtcbiAgICB9XG4gICAgcmV0dXJuIHN0YXRlO1xuICB9O1xufVxuXG5jb25zdCBERVYgPSB1bmRlZmluZWQ7XG5cbmV4cG9ydCB7ICRSQVcsIERFViwgY3JlYXRlTXV0YWJsZSwgY3JlYXRlU3RvcmUsIG1vZGlmeU11dGFibGUsIHByb2R1Y2UsIHJlY29uY2lsZSwgdW53cmFwIH07XG4iLCJpbXBvcnQgeyBNb2RpZmllZERhdGF2aWV3UXVlcnlSZXN1bHQgfSBmcm9tIFwiQC9saWIvdHlwZXNcIjtcclxuXHJcbi8qKlxyXG4gKiBQbGFjZWhvbGRlciBmb3IgY29tcGxleCBwcm9wZXJ0aWVzIGZyb20gYSBEYXRhdmlldyBxdWVyeVxyXG4gKiBgYGBcclxuICogVEFCTEUgRGF0ZShjb21wbGV4MSksIHN1bShjb21wbGV4MikgLSAzXHJcbiAqIEZST00gI3NvbWVUYWdcclxuICogV0hFUkUgdHJ1ZVxyXG4gKiBgYGBcclxuICogLS0tXHJcbiAqIGBcImZpbGUuY29tcGxleC1wcm9wZXJ0eVwiYFxyXG4gKlxyXG4gKiB0aGlzIHdvdWxkIGJlIGludmFsaWQgdG8gdXNlIGFzIGEgcHJvcGVydHkgbmFtZSBpblxyXG4gKiBEYXRhdmlldywgc28gdGhpcyBpcyBzYWZlIHRvIHVzZSBhcyBhbiBpZGVudGlmaWVyXHJcbiAqIGJldHdlZW4gZnVuY3Rpb25zXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgQ09NUExFWF9QUk9QRVJUWV9QTEFDRUhPTERFUiA9IFwiZmlsZS5jb21wbGV4LXByb3BlcnR5XCI7XHJcblxyXG5leHBvcnQgY29uc3QgZGVmYXVsdFF1ZXJ5UmVzdWx0OiBNb2RpZmllZERhdGF2aWV3UXVlcnlSZXN1bHQgPSB7XHJcbiAgc3VjY2Vzc2Z1bDogdHJ1ZSxcclxuICB2YWx1ZToge1xyXG4gICAgaGVhZGVyczogW1wiXCJdLFxyXG4gICAgdmFsdWVzOiBbW251bGxdXSxcclxuICAgIHR5cGU6IFwidGFibGVcIixcclxuICB9LFxyXG4gIHRydWVQcm9wZXJ0eU5hbWVzOiBbXSxcclxufTtcclxuIiwiaW1wb3J0IHtcclxuICBBcHAsXHJcbiAgTm90aWNlLFxyXG4gIHBhcnNlWWFtbCxcclxuICBQbHVnaW4sXHJcbiAgc3RyaW5naWZ5WWFtbCxcclxuICBURmlsZSxcclxuICBWYXVsdCxcclxufSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IHtcclxuICBEYXRhQXJyYXksXHJcbiAgRGF0YXZpZXdBUEksXHJcbiAgRGF0YXZpZXdMaW5rLFxyXG4gIERhdGF2aWV3UHJvcGVydHlWYWx1ZU5vdExpbmssXHJcbiAgUHJvcGVydHlJbmZvLFxyXG4gIFByb3BlcnR5VmFsdWVUeXBlLFxyXG59IGZyb20gXCIuL3R5cGVzXCI7XHJcbmltcG9ydCB7IERhdGVUaW1lIH0gZnJvbSBcImx1eG9uXCI7XHJcbmltcG9ydCB7IENPTVBMRVhfUFJPUEVSVFlfUExBQ0VIT0xERVIgfSBmcm9tIFwiLi9jb25zdGFudHNcIjtcclxuaW1wb3J0IHsgQ29kZUJsb2NrSW5mbyB9IGZyb20gXCJAL0FwcFwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IGNsYW1wTnVtYmVyID0gKG46IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKSA9PiB7XHJcbiAgaWYgKG4gPCBtaW4pIHJldHVybiBtaW47XHJcbiAgaWYgKG4gPiBtYXgpIHJldHVybiBtYXg7XHJcbiAgcmV0dXJuIG47XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgdG9OdW1iZXIgPSAoXHJcbiAgdjogdW5rbm93bixcclxuICBkZWZhdWx0TnVtYmVyPzogbnVtYmVyLFxyXG4gIG1pbj86IG51bWJlcixcclxuICBtYXg/OiBudW1iZXIsXHJcbiAgdmFsaWRhdG9yPzogKHZhbDogdW5rbm93biwgbnVtOiBudW1iZXIpID0+IGJvb2xlYW4sXHJcbikgPT4ge1xyXG4gIGNvbnN0IG51bSA9IE51bWJlcih2KTtcclxuICBpZiAoTnVtYmVyLmlzTmFOKG51bSkpIHJldHVybiBkZWZhdWx0TnVtYmVyID8/IDA7XHJcbiAgaWYgKHZhbGlkYXRvcikge1xyXG4gICAgaWYgKCF2YWxpZGF0b3IodiwgbnVtKSkgcmV0dXJuIGRlZmF1bHROdW1iZXIgPz8gMDtcclxuICB9XHJcbiAgaWYgKG1pbiAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICBpZiAobnVtIDwgbWluKSByZXR1cm4gbWluO1xyXG4gIH1cclxuICBpZiAobWF4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgIGlmIChudW0gPiBtYXgpIHJldHVybiBtYXg7XHJcbiAgfVxyXG4gIHJldHVybiBudW07XHJcbn07XHJcblxyXG4vKipcclxuICogQ2hlY2tzIGlmIGEgbHV4b24gRGF0ZVRpbWUgaGFzIGEgbm9uLXplcm8gdGltZSB2YWx1ZVxyXG4gKiBAcGFyYW0gZHQgbHV4b24gRGF0ZVRpbWVcclxuICogQHJldHVybnMgYHRydWVgIGlmIHRpbWUgaXMgbm90IGFsbCB6ZXJvZXMsIGZhbHNlIG90aGVyd2lzZVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGNoZWNrSWZEYXRlSGFzVGltZSA9IChkdDogRGF0ZVRpbWUpID0+IHtcclxuICBjb25zdCBpc1RpbWUgPSBkdC5ob3VyICE9PSAwIHx8IGR0Lm1pbnV0ZSAhPT0gMCB8fCBkdC5zZWNvbmQgIT09IDA7XHJcbiAgcmV0dXJuIGlzVGltZTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBnZXRWYWx1ZVR5cGU6IChcclxuICB2YWx1ZTogdW5rbm93bixcclxuICBwcm9wZXJ0eTogc3RyaW5nLFxyXG4gIGx1eG9uOiBEYXRhdmlld0FQSVtcImx1eG9uXCJdLFxyXG4pID0+IFByb3BlcnR5VmFsdWVUeXBlID0gKHZhbHVlLCBwcm9wZXJ0eSwgbHV4b24pID0+IHtcclxuICBjb25zdCB0ID0gdHlwZW9mIHZhbHVlO1xyXG4gIGlmICh0ID09PSBcInN0cmluZ1wiKSByZXR1cm4gXCJ0ZXh0XCI7XHJcbiAgaWYgKHQgPT09IFwibnVtYmVyXCIpIHJldHVybiBcIm51bWJlclwiO1xyXG4gIGlmICh0ID09PSBcImJvb2xlYW5cIikgcmV0dXJuIFwiY2hlY2tib3hcIjtcclxuICBpZiAodCA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgLy8gY29uc29sZS5sb2coXCJvYmplY3QgdmFsdWU6IFwiLCB2YWx1ZSk7XHJcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcclxuICAgICAgcmV0dXJuIHByb3BlcnR5ID09PSBcInRhZ3NcIiA/IFwidGFnc1wiIDogXCJsaXN0XCI7XHJcbiAgICB9XHJcbiAgICBpZiAobHV4b24uRGF0ZVRpbWUuaXNEYXRlVGltZSh2YWx1ZSkpIHtcclxuICAgICAgY29uc3QgZHQgPSB2YWx1ZSBhcyB1bmtub3duIGFzIERhdGVUaW1lO1xyXG4gICAgICBjb25zdCBpc1RpbWUgPSBjaGVja0lmRGF0ZUhhc1RpbWUoZHQpO1xyXG4gICAgICByZXR1cm4gaXNUaW1lID8gXCJkYXRldGltZVwiIDogXCJkYXRlXCI7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gXCJ0ZXh0XCI7XHJcbiAgfVxyXG4gIHRocm93IG5ldyBFcnJvcihcIkZhaWxlZCB0byBnZXQgcHJvcGVydHkgdmFsdWUgdHlwZVwiKTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCByZWdpc3RlckRhdGF2aWV3RXZlbnRzID0gKFxyXG4gIHBsdWdpbjogUGx1Z2luLFxyXG4gIGNhbGxiYWNrOiAoKSA9PiB1bmtub3duLFxyXG4pID0+IHtcclxuICBwbHVnaW4uYXBwLm1ldGFkYXRhQ2FjaGUub24oXCJkYXRhdmlldzppbmRleC1yZWFkeVwiIGFzIFwiY2hhbmdlZFwiLCBjYWxsYmFjayk7XHJcblxyXG4gIHBsdWdpbi5hcHAubWV0YWRhdGFDYWNoZS5vbihcclxuICAgIFwiZGF0YXZpZXc6bWV0YWRhdGEtY2hhbmdlXCIgYXMgXCJjaGFuZ2VkXCIsXHJcbiAgICBjYWxsYmFjayxcclxuICApO1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IHVucmVnaXN0ZXJEYXRhdmlld0V2ZW50cyA9IChcclxuICBwbHVnaW46IFBsdWdpbixcclxuICBjYWxsYmFjazogKCkgPT4gdW5rbm93bixcclxuKSA9PiB7XHJcbiAgcGx1Z2luLmFwcC5tZXRhZGF0YUNhY2hlLm9mZihcImRhdGF2aWV3OmluZGV4LXJlYWR5XCIgYXMgXCJjaGFuZ2VkXCIsIGNhbGxiYWNrKTtcclxuXHJcbiAgcGx1Z2luLmFwcC5tZXRhZGF0YUNhY2hlLm9mZihcclxuICAgIFwiZGF0YXZpZXc6bWV0YWRhdGEtY2hhbmdlXCIgYXMgXCJjaGFuZ2VkXCIsXHJcbiAgICBjYWxsYmFjayxcclxuICApO1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IGdldElkQ29sdW1uSW5kZXggPSAoXHJcbiAgaGVhZGVyczogc3RyaW5nW10sXHJcbiAgdGFibGVJZENvbHVtbk5hbWU6IHN0cmluZyxcclxuKSA9PiB7XHJcbiAgY29uc3QgaSA9IGhlYWRlcnMuZmluZEluZGV4KFxyXG4gICAgKGgpID0+XHJcbiAgICAgIGgudG9Mb3dlckNhc2UoKSA9PT0gdGFibGVJZENvbHVtbk5hbWUudG9Mb3dlckNhc2UoKSB8fCBoID09PSBcImZpbGUubGlua1wiLFxyXG4gICk7XHJcbiAgaWYgKGkgPT09IC0xKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBmaW5lIElEIGNvbHVtbiBpbmRleFwiKTtcclxuICB9XHJcbiAgcmV0dXJuIGk7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgY2hlY2tJZkRhdGF2aWV3TGluayA9ICh2YWw6IHVua25vd24pID0+IHtcclxuICBpZiAoIXZhbCkgcmV0dXJuIGZhbHNlO1xyXG4gIGlmICh0eXBlb2YgdmFsICE9PSBcIm9iamVjdFwiKSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKCF2YWwuaGFzT3duUHJvcGVydHkoXCJ0eXBlXCIpKSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKCh2YWwgYXMgeyB0eXBlOiB1bmtub3duIH0pLnR5cGUgIT09IFwiZmlsZVwiKSByZXR1cm4gZmFsc2U7XHJcbiAgcmV0dXJuIHRydWU7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgdHJ5RGF0YXZpZXdMaW5rVG9NYXJrZG93biA9ICh2YWw6IHVua25vd24pID0+IHtcclxuICBpZiAoIWNoZWNrSWZEYXRhdmlld0xpbmsodmFsKSkgcmV0dXJuIHZhbCBhcyBEYXRhdmlld1Byb3BlcnR5VmFsdWVOb3RMaW5rO1xyXG4gIHJldHVybiAodmFsIGFzIERhdGF2aWV3TGluaykubWFya2Rvd24oKTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCB0cnlEYXRhdmlld0FycmF5VG9BcnJheSA9IDxUPih2YWw6IFQpID0+IHtcclxuICBpZiAodHlwZW9mIHZhbCAhPT0gXCJvYmplY3RcIikgcmV0dXJuIHZhbDtcclxuICBpZiAoIXZhbD8uaGFzT3duUHJvcGVydHkoXCJhcnJheVwiKSkgcmV0dXJuIHZhbDtcclxuICByZXR1cm4gKHsgLi4udmFsIH0gYXMgdW5rbm93biBhcyBEYXRhQXJyYXk8VD4pLmFycmF5KCkgYXMgVDtcclxufTtcclxuXHJcbi8qXHJcbiAgVEFCTEUgY29sMSBhcyBBbGlhczEsIGZ1bmMoY29sMikgICxjb2wzLnN1YiwgY29sNCBhcyBcIkFsaWFzIDJcIlxyXG4gIEZST00gXCIvXCJcclxuICBXSEVSRSB0cnVlIFxyXG4qL1xyXG5cclxuZXhwb3J0IGNvbnN0IGdldENvbHVtblByb3BlcnR5TmFtZXMgPSAoc291cmNlOiBzdHJpbmcpID0+IHtcclxuICBjb25zdCBsaW5lID0gc291cmNlLnNwbGl0KFwiXFxuXCIpWzBdO1xyXG4gIGNvbnN0IGlzV2l0aG91dElkID0gbGluZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKFwid2l0aG91dCBpZFwiKTtcclxuICBjb25zdCBjb2xzID0gc291cmNlXHJcbiAgICAuc3BsaXQoXCJcXG5cIilbMF1cclxuICAgIC5zdWJzdHJpbmcoaXNXaXRob3V0SWQgPyAxNyA6IDYpXHJcbiAgICAuc3BsaXQoXCIsXCIpXHJcbiAgICAubWFwKChjKSA9PiB7XHJcbiAgICAgIGNvbnN0IHN0ciA9IGMudHJpbSgpO1xyXG4gICAgICBjb25zdCBwb3RlbnRpYWwgPSBzdHIuc3BsaXQoL1xcc0FTXFxzL2dpbSlbMF0udHJpbSgpO1xyXG4gICAgICBjb25zdCBpbnZhbGlkQ2hhcnMgPSBbXHJcbiAgICAgICAgXCIoXCIsXHJcbiAgICAgICAgXCIpXCIsXHJcbiAgICAgICAgXCJbXCIsXHJcbiAgICAgICAgXCJdXCIsXHJcbiAgICAgICAgXCJ7XCIsXHJcbiAgICAgICAgXCJ9XCIsXHJcbiAgICAgICAgXCIrXCIsXHJcbiAgICAgICAgLy8gXCItXCIsIGRhc2hlcyBhcmUgcHJldHR5IGNvbW1vbiBpbiBwcm9wZXJ0eSBuYW1lc1xyXG4gICAgICAgIFwiKlwiLFxyXG4gICAgICAgIFwiL1wiLFxyXG4gICAgICAgIFwiJVwiLFxyXG4gICAgICAgIFwiPFwiLFxyXG4gICAgICAgIFwiPlwiLFxyXG4gICAgICAgIFwiIVwiLFxyXG4gICAgICAgIFwiPVwiLFxyXG4gICAgICAgICdcIicsXHJcbiAgICAgIF07XHJcbiAgICAgIGNvbnN0IGlzQ29tcGxleCA9XHJcbiAgICAgICAgIU51bWJlci5pc05hTihOdW1iZXIocG90ZW50aWFsKSkgfHxcclxuICAgICAgICAvL3ByZXR0aWVyLWlnbm9yZVxyXG4gICAgICAgIHBvdGVudGlhbFxyXG4gICAgICAgICAgLnNwbGl0KFwiXCIpXHJcbiAgICAgICAgICAuc29tZSgoY2hhcikgPT4gaW52YWxpZENoYXJzLmluY2x1ZGVzKGNoYXIpKTtcclxuICAgICAgaWYgKGlzQ29tcGxleCkge1xyXG4gICAgICAgIC8vIHByb3BlcnR5IGlzIG1hbmlwdWxhdGVkIGluIHRoZSBxdWVyeVxyXG4gICAgICAgIC8vIHNvIGl0IGNhbid0IGJlIGVkaXRlZCBzaW5jZSBpdCdzIGEgY2FsY3VsYXRlZCB2YWx1ZVxyXG4gICAgICAgIHJldHVybiBDT01QTEVYX1BST1BFUlRZX1BMQUNFSE9MREVSO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBwb3RlbnRpYWw7XHJcbiAgICB9KTtcclxuICBpZiAoaXNXaXRob3V0SWQpIHJldHVybiBjb2xzO1xyXG4gIC8vIHNvIGl0IG1hdGNoZXMgd2l0aCB3aGF0IGlzIHJldHVybmVkIGZyb20gZGF0YXZpZXdcclxuICByZXR1cm4gW1wiRmlsZVwiLCAuLi5jb2xzXTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCB1cGRhdGVNZXRhZGF0YVByb3BlcnR5ID0gYXN5bmMgKFxyXG4gIHByb3BlcnR5OiBzdHJpbmcsXHJcbiAgdmFsdWU6IHVua25vd24sXHJcbiAgZmlsZVBhdGg6IHN0cmluZyxcclxuICBwbHVnaW46IFBsdWdpbixcclxuICBwcmV2aW91c1ZhbHVlOiB1bmtub3duLFxyXG4gIGl0ZW1JbmRleD86IG51bWJlcixcclxuKSA9PiB7XHJcbiAgY29uc3Qge1xyXG4gICAgYXBwOiB7IGZpbGVNYW5hZ2VyLCB2YXVsdCB9LFxyXG4gIH0gPSBwbHVnaW47XHJcbiAgY29uc3QgZmlsZSA9IHZhdWx0LmdldEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xyXG4gIGlmICghZmlsZSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICBcIlRyaWVkIHVwZGF0aW5nIGZyb250bWF0dGVyIHByb3BlcnR5IGJ1dCBjb3VsZG4ndCBmaW5kIGZpbGVcIixcclxuICAgICk7XHJcbiAgfVxyXG4gIGxldCBmbVVwZGF0ZWQgPSBmYWxzZTtcclxuICBhd2FpdCBmaWxlTWFuYWdlci5wcm9jZXNzRnJvbnRNYXR0ZXIoZmlsZSwgKGZtOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KSA9PiB7XHJcbiAgICBpZiAoIWZtLmhhc093blByb3BlcnR5KHByb3BlcnR5KSkge1xyXG4gICAgICAvLyBuZXN0ZWQgKG9iamVjdClcclxuICAgICAgaWYgKHByb3BlcnR5LmluY2x1ZGVzKFwiLlwiKSkge1xyXG4gICAgICAgIGFzc2lnbkRvdFByb3BlcnR5VmFsdWUoZm0sIHByb3BlcnR5LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuIChmbVVwZGF0ZWQgPSB0cnVlKTtcclxuICAgICAgfVxyXG4gICAgICAvLyBtaWdodCBiZSBpbmxpbmVcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgZm1bcHJvcGVydHldID0gdmFsdWU7XHJcbiAgICByZXR1cm4gKGZtVXBkYXRlZCA9IHRydWUpO1xyXG4gIH0pO1xyXG5cclxuICBpZiAoZm1VcGRhdGVkKSByZXR1cm47XHJcblxyXG4gIGNvbnN0IGlubGluZVVwZGF0ZWQgPSBhd2FpdCB0cnlVcGRhdGVJbmxpbmVQcm9wZXJ0eShcclxuICAgIHByb3BlcnR5LFxyXG4gICAgdmFsdWUsXHJcbiAgICBwcmV2aW91c1ZhbHVlLFxyXG4gICAgZmlsZSxcclxuICAgIHZhdWx0LFxyXG4gICAgaXRlbUluZGV4LFxyXG4gICk7XHJcbiAgaWYgKGlubGluZVVwZGF0ZWQpIHJldHVybjtcclxuXHJcbiAgLy8gcHJvcGVydHkgaXMgbm90IGluIGZyb250bWF0dGVyIG5vciBpbmxpbmVcclxuICBhd2FpdCBmaWxlTWFuYWdlci5wcm9jZXNzRnJvbnRNYXR0ZXIoZmlsZSwgKGZtKSA9PiB7XHJcbiAgICBmbVtwcm9wZXJ0eV0gPSB2YWx1ZTtcclxuICB9KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBNdXRhdGVzIGFuIG9iamVjdCBieSBhc3NpZ25pbmcgYSB2YWx1ZSB0byBhIHByb3BlcnR5IGdpdmVuIGluIGRvdCBub3RhdGlvblxyXG4gKiBAcGFyYW0gb2JqIFRoZSBvYmplY3QgdG8gbXV0YXRlXHJcbiAqIEBwYXJhbSBwcm9wZXJ0eSBQcm9wZXJ0eSBuYW1lIGluIGRvdCBub3RhdGlvblxyXG4gKiBAcGFyYW0gdmFsdWUgVGhlIHZhbHVlIHRvIGFzc2lnblxyXG4gKiAtLS1cclxuICogYGBgdHNcclxuICpcclxuICogY29uc3Qgb2JqID0geydmaXp6JzogJ2J1enonfTtcclxuICogYXNzaWduRG90UHJvcGVydHlWYWx1ZShvYmosICduZXN0ZWQucHJvcC5mb28nLCAnYmFyJyk7XHJcbiAqIGNvbnNvbGUubG9nKG9iaik7XHJcbiAqIC8vIHsnZml6eic6ICdidXp6JywgbmVzdGVkOiB7cHJvcDoge2ZvbzogJ2Jhcid9fX1cclxuICogYGBgXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgYXNzaWduRG90UHJvcGVydHlWYWx1ZSA9IChcclxuICBvYmo6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxyXG4gIHByb3BlcnR5OiBzdHJpbmcsXHJcbiAgdmFsdWU6IHVua25vd24sXHJcbikgPT4ge1xyXG4gIGNvbnN0IGtleXMgPSBwcm9wZXJ0eS5zcGxpdChcIi5cIik7XHJcbiAgbGV0IGN1cnJlbnQgPSBvYmo7XHJcblxyXG4gIGtleXMuZm9yRWFjaCgoa2V5LCBpbmRleCkgPT4ge1xyXG4gICAgaWYgKGluZGV4ID09PSBrZXlzLmxlbmd0aCAtIDEpIHtcclxuICAgICAgY3VycmVudFtrZXldID0gdmFsdWU7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpZiAoIWN1cnJlbnRba2V5XSB8fCB0eXBlb2YgY3VycmVudFtrZXldICE9PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgY3VycmVudFtrZXldID0ge307XHJcbiAgICAgIH1cclxuICAgICAgY3VycmVudCA9IGN1cnJlbnRba2V5XSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcclxuICAgIH1cclxuICB9KTtcclxufTtcclxuXHJcbnR5cGUgSW5saW5lUHJvcGVydHlWYWx1ZSA9XHJcbiAgfCBzdHJpbmdcclxuICB8IG51bWJlclxyXG4gIHwgYm9vbGVhblxyXG4gIHwgbnVsbFxyXG4gIHwgKHN0cmluZyB8IG51bWJlcilbXVxyXG4gIHwgdW5kZWZpbmVkO1xyXG5cclxuY29uc3QgcGFyc2VMaW5lc0ZvcklubGluZUZpZWxkcyA9IChsaW5lczogKHN0cmluZyB8IG51bGwpW10pID0+IHtcclxuICBjb25zdCByZWcgPSBuZXcgUmVnRXhwKC9bXFxbXFwoXT8oW15cXG5cXHJcXChcXFtdKik6OlsgXSooW15cXClcXF1cXG5cXHJdKilbXFxdXFwpXT8vZ20pO1xyXG4gIHJldHVybiBsaW5lcy5yZWR1Y2U8XHJcbiAgICB7XHJcbiAgICAgIGtleTogc3RyaW5nO1xyXG4gICAgICB2YWx1ZTogSW5saW5lUHJvcGVydHlWYWx1ZTtcclxuICAgICAgbGluZTogbnVtYmVyO1xyXG4gICAgICBtYXRjaDogc3RyaW5nO1xyXG4gICAgfVtdXHJcbiAgPigocHJldiwgY3VyciwgaW5kZXgpID0+IHtcclxuICAgIGxldCBtYXRjaGVzID0gcmVnLmV4ZWMoY3VyciA/PyBcIlwiKTtcclxuICAgIGlmICghbWF0Y2hlcykge1xyXG4gICAgICByZXR1cm4gcHJldjtcclxuICAgIH1cclxuICAgIGNvbnN0IGtleSA9IG1hdGNoZXNbMV0udHJpbSgpO1xyXG4gICAgY29uc3Qgb2xkVmFsID0gbWF0Y2hlc1syXS50cmltKCk7XHJcbiAgICByZXR1cm4gW1xyXG4gICAgICAuLi5wcmV2LFxyXG4gICAgICB7XHJcbiAgICAgICAga2V5OiBrZXksXHJcbiAgICAgICAgdmFsdWU6IG9sZFZhbCxcclxuICAgICAgICBsaW5lOiBpbmRleCxcclxuICAgICAgICBtYXRjaDogbWF0Y2hlc1swXSxcclxuICAgICAgfSxcclxuICAgIF07XHJcbiAgfSwgW10pO1xyXG59O1xyXG5cclxuY29uc3QgdHJ5VXBkYXRlSW5saW5lUHJvcGVydHkgPSBhc3luYyAoXHJcbiAgcHJvcGVydHk6IHN0cmluZyxcclxuICB2YWx1ZTogdW5rbm93bixcclxuICBwcmV2aW91c1ZhbHVlOiB1bmtub3duLFxyXG4gIGZpbGU6IFRGaWxlLFxyXG4gIHZhdWx0OiBWYXVsdCxcclxuICBpdGVtSW5kZXg/OiBudW1iZXIsXHJcbikgPT4ge1xyXG4gIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB2YXVsdC5yZWFkKGZpbGUpO1xyXG4gIGNvbnN0IGxpbmVzOiAoc3RyaW5nIHwgbnVsbClbXSA9IGNvbnRlbnQuc3BsaXQoXCJcXG5cIik7XHJcbiAgY29uc3QgeWFtbCA9IFtdO1xyXG4gIGlmIChsaW5lc1swXSA9PT0gXCItLS1cIikge1xyXG4gICAgY29uc3QgbGFzdFlhbWxEYXNoZXNJbmRleCA9IGxpbmVzLmZpbmRJbmRleChcclxuICAgICAgKGwsIGkpID0+IGwgPT09IFwiLS0tXCIgJiYgaSAhPT0gMCxcclxuICAgICk7XHJcbiAgICBpZiAoXHJcbiAgICAgIGxhc3RZYW1sRGFzaGVzSW5kZXggIT09IC0xICYmXHJcbiAgICAgIGxpbmVzW2xhc3RZYW1sRGFzaGVzSW5kZXggKyAxXSAhPT0gdW5kZWZpbmVkXHJcbiAgICApIHtcclxuICAgICAgLy8gdGhpcyBlbmRzIHVwIGJlaW5nIGNoZWFwZXIgdGhhbiBhcnJheS5zbGljZSgpIHdoZW5cclxuICAgICAgLy8gbGluZXMgY2FuIGJlIGEgdmVyeSBsYXJnZSBhcnJheSBvZiB2ZXJ5IGxhcmdlIHN0cmluZ3NcclxuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBsYXN0WWFtbERhc2hlc0luZGV4ICsgMTsgaisrKSB7XHJcbiAgICAgICAgeWFtbC5wdXNoKGxpbmVzW2pdKTtcclxuICAgICAgICBsaW5lc1tqXSA9IG51bGw7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbiAgY29uc3QgcGFyc2VkRmllbGRzID0gcGFyc2VMaW5lc0ZvcklubGluZUZpZWxkcyhsaW5lcyk7XHJcbiAgY29uc3QgZm91bmRJbmxpbmUgPSBwYXJzZWRGaWVsZHMuZmluZChcclxuICAgIChmKSA9PiBmLnZhbHVlID09PSBwcmV2aW91c1ZhbHVlPy50b1N0cmluZygpLFxyXG4gICk7XHJcbiAgaWYgKCFmb3VuZElubGluZSkge1xyXG4gICAgY29uc3QgaXNOYW1lTWF0Y2hlZElubGluZSA9IHBhcnNlZEZpZWxkcy5zb21lKChmKSA9PiBmLmtleSA9PT0gcHJvcGVydHkpO1xyXG4gICAgaWYgKGlzTmFtZU1hdGNoZWRJbmxpbmUpIHtcclxuICAgICAgLy8gcGx1cyBidXR0b24gd2FzIGNsaWNrZWQgZm9yIGxpc3QgdmFsdWVcclxuICAgICAgLy8geW91IGNhbid0IHJlYWxseSBhZGQgYSBpbmxpbmUgcHJvZ3JhbW1hdGljYWxseVxyXG4gICAgICAvLyBiZWNhdXNlIHRoZXkgYXJlIGRlZmluZWQgYXJiaXRyYXJpbHkgaW4gdGhlIG5vdGVcclxuICAgICAgbmV3IE5vdGljZShcclxuICAgICAgICBcIklubGluZSBmaWVsZHMgZm91bmQgZm9yIHByb3BlcnR5LCBzbyB5b3UgY2FuJ3QgdXNlIHRoZSBwbHVzIGJ1dHRvblwiLFxyXG4gICAgICApO1xyXG4gICAgICAvLyBzbyBmcm9udG1hdHRlciBpc24ndCB1cGRhdGVkXHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuICBjb25zdCBuZXdWYWx1ZSA9IEFycmF5LmlzQXJyYXkodmFsdWUpID8gdmFsdWVbaXRlbUluZGV4ID8/IDBdIDogdmFsdWU7XHJcbiAgbGluZXNbZm91bmRJbmxpbmUubGluZV0gPVxyXG4gICAgbGluZXNbZm91bmRJbmxpbmUubGluZV0/LnJlcGxhY2UoXHJcbiAgICAgIC8vIFRPRE8gSSBkb24ndCB0aGluayBzcGFjZSBhZnRlciBjb2xvbnMgaXMgcmVxdWlyZWRcclxuICAgICAgKHByb3BlcnR5ICsgXCI6OiBcIiArIGZvdW5kSW5saW5lLnZhbHVlKSBhcyBzdHJpbmcsXHJcbiAgICAgIHByb3BlcnR5ICsgXCI6OiBcIiArIChuZXdWYWx1ZSA/PyBcIlwiKS50b1N0cmluZygpLFxyXG4gICAgKSA/PyBudWxsO1xyXG4gIGxldCBmaW5hbENvbnRlbnQgPSBcIlwiO1xyXG4gIGZvciAobGV0IG0gPSAwOyBtIDwgbGluZXMubGVuZ3RoOyBtKyspIHtcclxuICAgIGNvbnN0IHYgPSBsaW5lc1ttXTtcclxuICAgIGlmICh2ID09PSBudWxsKSBjb250aW51ZTtcclxuICAgIGZpbmFsQ29udGVudCArPSBcIlxcblwiICsgdjtcclxuICB9XHJcbiAgYXdhaXQgdmF1bHQubW9kaWZ5KGZpbGUsIHlhbWwuam9pbihcIlxcblwiKSArIGZpbmFsQ29udGVudCk7XHJcbiAgcmV0dXJuIHRydWU7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgZ2V0RXhpc3RpbmdQcm9wZXJ0aWVzID0gKGFwcDogQXBwKSA9PiB7XHJcbiAgY29uc3QgeyBtZXRhZGF0YUNhY2hlIH0gPSBhcHA7XHJcbiAgLy8gQHRzLWV4cGVjdC1lcnJvclxyXG4gIHJldHVybiBtZXRhZGF0YUNhY2hlLmdldEFsbFByb3BlcnR5SW5mb3MoKSBhcyBSZWNvcmQ8c3RyaW5nLCBQcm9wZXJ0eUluZm8+O1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IGdldFRhYmxlTGluZSA9IChjb2RlQmxvY2tUZXh0OiBzdHJpbmcpID0+IHtcclxuICBjb25zdCBsaW5lcyA9IGNvZGVCbG9ja1RleHQuc3BsaXQoXCJcXG5cIik7XHJcbiAgbGV0IGluZGV4ID0gMDtcclxuICBmb3IgKGluZGV4OyBpbmRleCA8IGxpbmVzLmxlbmd0aDsgaW5kZXgrKykge1xyXG4gICAgY29uc3QgbGluZSA9IGxpbmVzW2luZGV4XTtcclxuICAgIGlmICghbGluZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoXCJ0YWJsZVwiKSkgY29udGludWU7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBsaW5lLFxyXG4gICAgICBpbmRleCxcclxuICAgIH07XHJcbiAgfVxyXG4gIHRocm93IG5ldyBFcnJvcihcclxuICAgIFwiVW5hYmxlIHRvIGZpbmQgdGFibGUgbGluZSBmcm9tIGNvZGVCbG9ja1RleHQuIFRoaXMgc2hvdWxkIGJlIGltcG9zc2libGUuXCIsXHJcbiAgKTtcclxufTtcclxuXHJcbmV4cG9ydCB0eXBlIERhdGFFZGl0QmxvY2tDb25maWcgPSB7XHJcbiAgbG9ja0VkaXRpbmc6IGJvb2xlYW47XHJcbn07XHJcblxyXG5leHBvcnQgdHlwZSBEYXRhRWRpdEJsb2NrQ29uZmlnS2V5ID0ga2V5b2YgRGF0YUVkaXRCbG9ja0NvbmZpZztcclxuXHJcbmV4cG9ydCBjb25zdCBkZWZhdWx0RGF0YUVkaXRCbG9ja0NvbmZpZzogRGF0YUVkaXRCbG9ja0NvbmZpZyA9IHtcclxuICBsb2NrRWRpdGluZzogZmFsc2UsXHJcbn07XHJcblxyXG4vLyBUT0RPIGFkZHMgb25lIGV4dHJhIGxpbmUgb2Ygc3BhY2UgKG5vdCBpbmNyZW1lbnRhbGx5KSB3aGljaCBkb2Vzbid0IGJyZWFrIGFueXRoaW5nIGJ1dCBsb29rcyB3ZWlyZFxyXG5leHBvcnQgY29uc3Qgc3BsaXRRdWVyeU9uQ29uZmlnID0gKGNvZGVCbG9ja1RleHQ6IHN0cmluZykgPT4ge1xyXG4gIGNvbnN0IFtxdWVyeSwgY29uZmlnU3RyXSA9IGNvZGVCbG9ja1RleHQuc3BsaXQoL1xcbl4tLS0kXFxuL2dpbSk7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGNvbmZpZyA9IHBhcnNlWWFtbChjb25maWdTdHIpO1xyXG4gICAgaWYgKHR5cGVvZiBjb25maWcgIT09IFwib2JqZWN0XCIpIHRocm93IG5ldyBFcnJvcigpO1xyXG4gICAgcmV0dXJuIHsgcXVlcnksIGNvbmZpZzogeyAuLi5kZWZhdWx0RGF0YUVkaXRCbG9ja0NvbmZpZywgLi4uY29uZmlnIH0gfTtcclxuICB9IGNhdGNoIChlKSB7XHJcbiAgICBjb25zdCBtc2cgPSBcImludmFsaWQgWUFNTCBkZXRlY3RlZCBpbiBjb25maWdcIjtcclxuICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcclxuICAgIHJldHVybiB7IHF1ZXJ5LCBjb25maWc6IGRlZmF1bHREYXRhRWRpdEJsb2NrQ29uZmlnIH07XHJcbiAgfVxyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IHVwZGF0ZUJsb2NrQ29uZmlnID0gYXN5bmMgKFxyXG4gIGtleTogRGF0YUVkaXRCbG9ja0NvbmZpZ0tleSxcclxuICB2YWx1ZTogRGF0YUVkaXRCbG9ja0NvbmZpZ1t0eXBlb2Yga2V5XSxcclxuICBkYXRhRWRpdEluZm9zOiBDb2RlQmxvY2tJbmZvLFxyXG4pID0+IHtcclxuICBjb25zdCB7XHJcbiAgICBjb25maWcsXHJcbiAgICBjdHgsXHJcbiAgICBlbCxcclxuICAgIHBsdWdpbjoge1xyXG4gICAgICBhcHA6IHsgdmF1bHQgfSxcclxuICAgIH0sXHJcbiAgICBxdWVyeSxcclxuICB9ID0gZGF0YUVkaXRJbmZvcztcclxuICAvLyBicmVhayBkb3duIHRoZSBxdWVyeSB0ZXh0IGludG8gbGluZXNcclxuICBjb25zdCBxdWVyeUxpbmVzID0gcXVlcnkuc3BsaXQoXCJcXG5cIik7XHJcbiAgLy8gdXBkYXRlIHRoZSBvbGQgY29uZmlnXHJcbiAgY29uc3QgbmV3Q29uZmlnID0geyAuLi5jb25maWcsIFtrZXldOiB2YWx1ZSB9O1xyXG4gIC8vIHR1cm4gaW50byB5YW1sIHRleHRcclxuICBjb25zdCBuZXdDb25maWdTdHIgPSBzdHJpbmdpZnlZYW1sKG5ld0NvbmZpZyk7XHJcbiAgY29uc3QgbmV3Q29uZmlnTGluZXMgPSBuZXdDb25maWdTdHIuc3BsaXQoXCJcXG5cIik7XHJcbiAgLy8gc3RyaW5naWZ5WWFtbCgpIGFsd2F5cyBhZGRzIGEgbmV3IGxpbmUgY2hhcmFjdGVyIGF0IHRoZSBlbmQsIHJlc3VsdGluZyBpbiBhbiBleHRyYSBpdGVtIGluIHRoZSBsaW5lcyBhcnJheVxyXG4gIG5ld0NvbmZpZ0xpbmVzLnBvcCgpO1xyXG4gIC8vIHRleHQgaXMgdGhlIGVudGlyZSBub3RlcyB0ZXh0IGFuZCBpcyBlc3NlbnRpYWxseSBhIHN5bmNocm9ub3VzIHJlYWRcclxuICBjb25zdCB7IGxpbmVTdGFydCwgbGluZUVuZCwgdGV4dCB9ID0gY3R4LmdldFNlY3Rpb25JbmZvKGVsKSE7XHJcbiAgY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KFwiXFxuXCIpO1xyXG4gIGNvbnN0IG5ld0xpbmVzID0gbGluZXMudG9TcGxpY2VkKFxyXG4gICAgLy8gc3RhcnQgYXQgd2hlcmUgdGhlIGNvZGUgYmxvY2sgdGV4dCBzdGFydHNcclxuICAgIGxpbmVTdGFydCArIDEsXHJcbiAgICAvLyBkZWxldGUgZXhpc3RpbmcgbGluZXMgdXAgdG8gZW5kIG9mIGNvZGUgYmxvY2sgdGV4dFxyXG4gICAgbGluZUVuZCAtIGxpbmVTdGFydCAtIDEsXHJcbiAgICAvLyByZWNvbnN0cnVjdCB0aGUgY29kZSBibG9jayB0ZXh0IHdpdGggbmV3IGNvbmZpZ1xyXG4gICAgLi4ucXVlcnlMaW5lcyxcclxuICAgIFwiLS0tXCIsXHJcbiAgICAuLi5uZXdDb25maWdMaW5lcyxcclxuICApO1xyXG4gIGNvbnN0IGZpbGUgPSB2YXVsdC5nZXRGaWxlQnlQYXRoKGN0eC5zb3VyY2VQYXRoKTtcclxuICBpZiAoIWZpbGUpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIlRoaXMgc2hvdWxkIGJlIGltcG9zc2libGVcIik7XHJcbiAgfVxyXG4gIC8vIHVwZGF0ZSBmaWxlIHdpdGggdGhlIG5ldyBjb25maWdcclxuICBhd2FpdCB2YXVsdC5tb2RpZnkoZmlsZSwgbmV3TGluZXMuam9pbihcIlxcblwiKSk7XHJcbn07XHJcblxyXG4vLyBUT0RPIGNvdWxkIHByb2JhYmx5IGNvbWJpbmUgdGhpcyB3aXRoIHRoZSB1cGRhdGVyIGZ1bmMgc2luY2UgaXQncyBsaXRlcmFsbHkganVzdCBvbmUgbGluZSBkaWZmZXJlbmNlXHJcbi8vIGJ1dCB0eXBpbmcgdGhlIG92ZXJsb2FkcyBpcyBzZWVtaW5nIG1vcmUgZGlmZmljdWx0IHRoYW4gSSB0aG91Z2h0XHJcbmV4cG9ydCBjb25zdCBzZXRCbG9ja0NvbmZpZyA9IGFzeW5jIChcclxuICBjb25maWc6IERhdGFFZGl0QmxvY2tDb25maWcsXHJcbiAgZGF0YUVkaXRJbmZvczogQ29kZUJsb2NrSW5mbyxcclxuKSA9PiB7XHJcbiAgY29uc3Qge1xyXG4gICAgY3R4LFxyXG4gICAgZWwsXHJcbiAgICBwbHVnaW46IHtcclxuICAgICAgYXBwOiB7IHZhdWx0IH0sXHJcbiAgICB9LFxyXG4gICAgcXVlcnksXHJcbiAgfSA9IGRhdGFFZGl0SW5mb3M7XHJcbiAgLy8gYnJlYWsgZG93biB0aGUgcXVlcnkgdGV4dCBpbnRvIGxpbmVzXHJcbiAgY29uc3QgcXVlcnlMaW5lcyA9IHF1ZXJ5LnNwbGl0KFwiXFxuXCIpO1xyXG4gIC8vIHR1cm4gaW50byB5YW1sIHRleHRcclxuICBjb25zdCBuZXdDb25maWdTdHIgPSBzdHJpbmdpZnlZYW1sKGNvbmZpZyk7XHJcbiAgY29uc3QgbmV3Q29uZmlnTGluZXMgPSBuZXdDb25maWdTdHIuc3BsaXQoXCJcXG5cIik7XHJcbiAgLy8gc3RyaW5naWZ5WWFtbCgpIGFsd2F5cyBhZGRzIGEgbmV3IGxpbmUgY2hhcmFjdGVyIGF0IHRoZSBlbmQsIHJlc3VsdGluZyBpbiBhbiBleHRyYSBpdGVtIGluIHRoZSBsaW5lcyBhcnJheVxyXG4gIG5ld0NvbmZpZ0xpbmVzLnBvcCgpO1xyXG4gIC8vIHRleHQgaXMgdGhlIGVudGlyZSBub3RlcyB0ZXh0IGFuZCBpcyBlc3NlbnRpYWxseSBhIHN5bmNocm9ub3VzIHJlYWRcclxuICBjb25zdCB7IGxpbmVTdGFydCwgbGluZUVuZCwgdGV4dCB9ID0gY3R4LmdldFNlY3Rpb25JbmZvKGVsKSE7XHJcbiAgY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KFwiXFxuXCIpO1xyXG4gIGNvbnN0IG5ld0xpbmVzID0gbGluZXMudG9TcGxpY2VkKFxyXG4gICAgLy8gc3RhcnQgYXQgd2hlcmUgdGhlIGNvZGUgYmxvY2sgdGV4dCBzdGFydHNcclxuICAgIGxpbmVTdGFydCArIDEsXHJcbiAgICAvLyBkZWxldGUgZXhpc3RpbmcgbGluZXMgdXAgdG8gZW5kIG9mIGNvZGUgYmxvY2sgdGV4dFxyXG4gICAgbGluZUVuZCAtIGxpbmVTdGFydCAtIDEsXHJcbiAgICAvLyByZWNvbnN0cnVjdCB0aGUgY29kZSBibG9jayB0ZXh0IHdpdGggbmV3IGNvbmZpZ1xyXG4gICAgLi4ucXVlcnlMaW5lcyxcclxuICAgIFwiLS0tXCIsXHJcbiAgICAuLi5uZXdDb25maWdMaW5lcyxcclxuICApO1xyXG4gIGNvbnN0IGZpbGUgPSB2YXVsdC5nZXRGaWxlQnlQYXRoKGN0eC5zb3VyY2VQYXRoKTtcclxuICBpZiAoIWZpbGUpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIlRoaXMgc2hvdWxkIGJlIGltcG9zc2libGVcIik7XHJcbiAgfVxyXG4gIC8vIHVwZGF0ZSBmaWxlIHdpdGggdGhlIG5ldyBjb25maWdcclxuICBhd2FpdCB2YXVsdC5tb2RpZnkoZmlsZSwgbmV3TGluZXMuam9pbihcIlxcblwiKSk7XHJcbn07XHJcbiIsIi8qKlxuKiBAbGljZW5zZSBsdWNpZGUtc29saWQgdjAuNDEyLjAgLSBJU0NcbipcbiogVGhpcyBzb3VyY2UgY29kZSBpcyBsaWNlbnNlZCB1bmRlciB0aGUgSVNDIGxpY2Vuc2UuXG4qIFNlZSB0aGUgTElDRU5TRSBmaWxlIGluIHRoZSByb290IGRpcmVjdG9yeSBvZiB0aGlzIHNvdXJjZSB0cmVlLlxuKi9cblxuLy8gc3JjL2RlZmF1bHRBdHRyaWJ1dGVzLnRzXG52YXIgZGVmYXVsdEF0dHJpYnV0ZXMgPSB7XG4gIHhtbG5zOiBcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsXG4gIHdpZHRoOiAyNCxcbiAgaGVpZ2h0OiAyNCxcbiAgdmlld0JveDogXCIwIDAgMjQgMjRcIixcbiAgZmlsbDogXCJub25lXCIsXG4gIHN0cm9rZTogXCJjdXJyZW50Q29sb3JcIixcbiAgXCJzdHJva2Utd2lkdGhcIjogMixcbiAgXCJzdHJva2UtbGluZWNhcFwiOiBcInJvdW5kXCIsXG4gIFwic3Ryb2tlLWxpbmVqb2luXCI6IFwicm91bmRcIlxufTtcbnZhciBkZWZhdWx0QXR0cmlidXRlc19kZWZhdWx0ID0gZGVmYXVsdEF0dHJpYnV0ZXM7XG5leHBvcnQge1xuICBkZWZhdWx0QXR0cmlidXRlc19kZWZhdWx0IGFzIGRlZmF1bHRcbn07XG4vLyMgc291cmNlTWFwcGluZ1VSTD1kZWZhdWx0QXR0cmlidXRlcy5qc3gubWFwXG4iLCIvKipcbiogQGxpY2Vuc2UgbHVjaWRlLXNvbGlkIHYwLjQxMi4wIC0gSVNDXG4qXG4qIFRoaXMgc291cmNlIGNvZGUgaXMgbGljZW5zZWQgdW5kZXIgdGhlIElTQyBsaWNlbnNlLlxuKiBTZWUgdGhlIExJQ0VOU0UgZmlsZSBpbiB0aGUgcm9vdCBkaXJlY3Rvcnkgb2YgdGhpcyBzb3VyY2UgdHJlZS5cbiovXG5cbi8vIHNyYy9JY29uLnRzeFxuaW1wb3J0IHsgRm9yLCBzcGxpdFByb3BzIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5pbXBvcnQgeyBEeW5hbWljIH0gZnJvbSBcInNvbGlkLWpzL3dlYlwiO1xuaW1wb3J0IGRlZmF1bHRBdHRyaWJ1dGVzIGZyb20gXCIuL2RlZmF1bHRBdHRyaWJ1dGVzXCI7XG5cbi8vIC4uL3NoYXJlZC9zcmMvdXRpbHMudHNcbnZhciB0b0tlYmFiQ2FzZSA9IChzdHJpbmcpID0+IHN0cmluZy5yZXBsYWNlKC8oW2EtejAtOV0pKFtBLVpdKS9nLCBcIiQxLSQyXCIpLnRvTG93ZXJDYXNlKCk7XG52YXIgbWVyZ2VDbGFzc2VzID0gKC4uLmNsYXNzZXMpID0+IGNsYXNzZXMuZmlsdGVyKChjbGFzc05hbWUsIGluZGV4LCBhcnJheSkgPT4ge1xuICByZXR1cm4gQm9vbGVhbihjbGFzc05hbWUpICYmIGFycmF5LmluZGV4T2YoY2xhc3NOYW1lKSA9PT0gaW5kZXg7XG59KS5qb2luKFwiIFwiKTtcblxuLy8gc3JjL0ljb24udHN4XG52YXIgSWNvbiA9IChwcm9wcykgPT4ge1xuICBjb25zdCBbbG9jYWxQcm9wcywgcmVzdF0gPSBzcGxpdFByb3BzKHByb3BzLCBbXG4gICAgXCJjb2xvclwiLFxuICAgIFwic2l6ZVwiLFxuICAgIFwic3Ryb2tlV2lkdGhcIixcbiAgICBcImNoaWxkcmVuXCIsXG4gICAgXCJjbGFzc1wiLFxuICAgIFwibmFtZVwiLFxuICAgIFwiaWNvbk5vZGVcIixcbiAgICBcImFic29sdXRlU3Ryb2tlV2lkdGhcIlxuICBdKTtcbiAgcmV0dXJuIDxzdmdcbiAgICB7Li4uZGVmYXVsdEF0dHJpYnV0ZXN9XG4gICAgd2lkdGg9e2xvY2FsUHJvcHMuc2l6ZSA/PyBkZWZhdWx0QXR0cmlidXRlcy53aWR0aH1cbiAgICBoZWlnaHQ9e2xvY2FsUHJvcHMuc2l6ZSA/PyBkZWZhdWx0QXR0cmlidXRlcy5oZWlnaHR9XG4gICAgc3Ryb2tlPXtsb2NhbFByb3BzLmNvbG9yID8/IGRlZmF1bHRBdHRyaWJ1dGVzLnN0cm9rZX1cbiAgICBzdHJva2Utd2lkdGg9e2xvY2FsUHJvcHMuYWJzb2x1dGVTdHJva2VXaWR0aCA/IE51bWJlcihsb2NhbFByb3BzLnN0cm9rZVdpZHRoID8/IGRlZmF1bHRBdHRyaWJ1dGVzW1wic3Ryb2tlLXdpZHRoXCJdKSAqIDI0IC8gTnVtYmVyKGxvY2FsUHJvcHMuc2l6ZSkgOiBOdW1iZXIobG9jYWxQcm9wcy5zdHJva2VXaWR0aCA/PyBkZWZhdWx0QXR0cmlidXRlc1tcInN0cm9rZS13aWR0aFwiXSl9XG4gICAgY2xhc3M9e21lcmdlQ2xhc3NlcyhcbiAgICAgIFwibHVjaWRlXCIsXG4gICAgICBcImx1Y2lkZS1pY29uXCIsXG4gICAgICBsb2NhbFByb3BzLm5hbWUgIT0gbnVsbCA/IGBsdWNpZGUtJHt0b0tlYmFiQ2FzZShsb2NhbFByb3BzPy5uYW1lKX1gIDogdm9pZCAwLFxuICAgICAgbG9jYWxQcm9wcy5jbGFzcyAhPSBudWxsID8gbG9jYWxQcm9wcy5jbGFzcyA6IFwiXCJcbiAgICApfVxuICAgIHsuLi5yZXN0fVxuICA+PEZvciBlYWNoPXtsb2NhbFByb3BzLmljb25Ob2RlfT57KFtlbGVtZW50TmFtZSwgYXR0cnNdKSA9PiB7XG4gICAgcmV0dXJuIDxEeW5hbWljXG4gICAgICBjb21wb25lbnQ9e2VsZW1lbnROYW1lfVxuICAgICAgey4uLmF0dHJzfVxuICAgIC8+O1xuICB9fTwvRm9yPjwvc3ZnPjtcbn07XG52YXIgSWNvbl9kZWZhdWx0ID0gSWNvbjtcbmV4cG9ydCB7XG4gIEljb25fZGVmYXVsdCBhcyBkZWZhdWx0XG59O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9SWNvbi5qc3gubWFwXG4iLCIvKipcbiogQGxpY2Vuc2UgbHVjaWRlLXNvbGlkIHYwLjQxMi4wIC0gSVNDXG4qXG4qIFRoaXMgc291cmNlIGNvZGUgaXMgbGljZW5zZWQgdW5kZXIgdGhlIElTQyBsaWNlbnNlLlxuKiBTZWUgdGhlIExJQ0VOU0UgZmlsZSBpbiB0aGUgcm9vdCBkaXJlY3Rvcnkgb2YgdGhpcyBzb3VyY2UgdHJlZS5cbiovXG5cbi8vIHNyYy9pY29ucy9sb2NrLnRzeFxuaW1wb3J0IEljb24gZnJvbSBcIi4uL0ljb25cIjtcbnZhciBpY29uTm9kZSA9IFtcbiAgW1wicmVjdFwiLCB7IHdpZHRoOiBcIjE4XCIsIGhlaWdodDogXCIxMVwiLCB4OiBcIjNcIiwgeTogXCIxMVwiLCByeDogXCIyXCIsIHJ5OiBcIjJcIiwga2V5OiBcIjF3NGV3MVwiIH1dLFxuICBbXCJwYXRoXCIsIHsgZDogXCJNNyAxMVY3YTUgNSAwIDAgMSAxMCAwdjRcIiwga2V5OiBcImZ3dm16bVwiIH1dXG5dO1xudmFyIExvY2sgPSAocHJvcHMpID0+IDxJY29uIHsuLi5wcm9wc30gbmFtZT1cIkxvY2tcIiBpY29uTm9kZT17aWNvbk5vZGV9IC8+O1xudmFyIGxvY2tfZGVmYXVsdCA9IExvY2s7XG5leHBvcnQge1xuICBsb2NrX2RlZmF1bHQgYXMgZGVmYXVsdFxufTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWxvY2suanN4Lm1hcFxuIiwiLyoqXG4qIEBsaWNlbnNlIGx1Y2lkZS1zb2xpZCB2MC40MTIuMCAtIElTQ1xuKlxuKiBUaGlzIHNvdXJjZSBjb2RlIGlzIGxpY2Vuc2VkIHVuZGVyIHRoZSBJU0MgbGljZW5zZS5cbiogU2VlIHRoZSBMSUNFTlNFIGZpbGUgaW4gdGhlIHJvb3QgZGlyZWN0b3J5IG9mIHRoaXMgc291cmNlIHRyZWUuXG4qL1xuXG4vLyBzcmMvaWNvbnMvbG9jay1vcGVuLnRzeFxuaW1wb3J0IEljb24gZnJvbSBcIi4uL0ljb25cIjtcbnZhciBpY29uTm9kZSA9IFtcbiAgW1wicmVjdFwiLCB7IHdpZHRoOiBcIjE4XCIsIGhlaWdodDogXCIxMVwiLCB4OiBcIjNcIiwgeTogXCIxMVwiLCByeDogXCIyXCIsIHJ5OiBcIjJcIiwga2V5OiBcIjF3NGV3MVwiIH1dLFxuICBbXCJwYXRoXCIsIHsgZDogXCJNNyAxMVY3YTUgNSAwIDAgMSA5LjktMVwiLCBrZXk6IFwiMW1tOHc4XCIgfV1cbl07XG52YXIgTG9ja09wZW4gPSAocHJvcHMpID0+IDxJY29uIHsuLi5wcm9wc30gbmFtZT1cIkxvY2tPcGVuXCIgaWNvbk5vZGU9e2ljb25Ob2RlfSAvPjtcbnZhciBsb2NrX29wZW5fZGVmYXVsdCA9IExvY2tPcGVuO1xuZXhwb3J0IHtcbiAgbG9ja19vcGVuX2RlZmF1bHQgYXMgZGVmYXVsdFxufTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWxvY2stb3Blbi5qc3gubWFwXG4iLCIvKipcbiogQGxpY2Vuc2UgbHVjaWRlLXNvbGlkIHYwLjQxMi4wIC0gSVNDXG4qXG4qIFRoaXMgc291cmNlIGNvZGUgaXMgbGljZW5zZWQgdW5kZXIgdGhlIElTQyBsaWNlbnNlLlxuKiBTZWUgdGhlIExJQ0VOU0UgZmlsZSBpbiB0aGUgcm9vdCBkaXJlY3Rvcnkgb2YgdGhpcyBzb3VyY2UgdHJlZS5cbiovXG5cbi8vIHNyYy9pY29ucy9zZXR0aW5ncy50c3hcbmltcG9ydCBJY29uIGZyb20gXCIuLi9JY29uXCI7XG52YXIgaWNvbk5vZGUgPSBbXG4gIFtcbiAgICBcInBhdGhcIixcbiAgICB7XG4gICAgICBkOiBcIk0xMi4yMiAyaC0uNDRhMiAyIDAgMCAwLTIgMnYuMThhMiAyIDAgMCAxLTEgMS43M2wtLjQzLjI1YTIgMiAwIDAgMS0yIDBsLS4xNS0uMDhhMiAyIDAgMCAwLTIuNzMuNzNsLS4yMi4zOGEyIDIgMCAwIDAgLjczIDIuNzNsLjE1LjFhMiAyIDAgMCAxIDEgMS43MnYuNTFhMiAyIDAgMCAxLTEgMS43NGwtLjE1LjA5YTIgMiAwIDAgMC0uNzMgMi43M2wuMjIuMzhhMiAyIDAgMCAwIDIuNzMuNzNsLjE1LS4wOGEyIDIgMCAwIDEgMiAwbC40My4yNWEyIDIgMCAwIDEgMSAxLjczVjIwYTIgMiAwIDAgMCAyIDJoLjQ0YTIgMiAwIDAgMCAyLTJ2LS4xOGEyIDIgMCAwIDEgMS0xLjczbC40My0uMjVhMiAyIDAgMCAxIDIgMGwuMTUuMDhhMiAyIDAgMCAwIDIuNzMtLjczbC4yMi0uMzlhMiAyIDAgMCAwLS43My0yLjczbC0uMTUtLjA4YTIgMiAwIDAgMS0xLTEuNzR2LS41YTIgMiAwIDAgMSAxLTEuNzRsLjE1LS4wOWEyIDIgMCAwIDAgLjczLTIuNzNsLS4yMi0uMzhhMiAyIDAgMCAwLTIuNzMtLjczbC0uMTUuMDhhMiAyIDAgMCAxLTIgMGwtLjQzLS4yNWEyIDIgMCAwIDEtMS0xLjczVjRhMiAyIDAgMCAwLTItMnpcIixcbiAgICAgIGtleTogXCIxcW1lMmZcIlxuICAgIH1cbiAgXSxcbiAgW1wiY2lyY2xlXCIsIHsgY3g6IFwiMTJcIiwgY3k6IFwiMTJcIiwgcjogXCIzXCIsIGtleTogXCIxdjd6cmRcIiB9XVxuXTtcbnZhciBTZXR0aW5ncyA9IChwcm9wcykgPT4gPEljb24gey4uLnByb3BzfSBuYW1lPVwiU2V0dGluZ3NcIiBpY29uTm9kZT17aWNvbk5vZGV9IC8+O1xudmFyIHNldHRpbmdzX2RlZmF1bHQgPSBTZXR0aW5ncztcbmV4cG9ydCB7XG4gIHNldHRpbmdzX2RlZmF1bHQgYXMgZGVmYXVsdFxufTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXNldHRpbmdzLmpzeC5tYXBcbiIsImltcG9ydCB7IEFwcCwgQ29tcG9uZW50LCBNYXJrZG93blJlbmRlcmVyIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7XHJcbiAgQ29tcG9uZW50UHJvcHMsXHJcbiAgY3JlYXRlRWZmZWN0LFxyXG4gIGNyZWF0ZU1lbW8sXHJcbiAgb25Nb3VudCxcclxuICBzcGxpdFByb3BzLFxyXG59IGZyb20gXCJzb2xpZC1qc1wiO1xyXG5pbXBvcnQgeyBEYXRhdmlld1Byb3BlcnR5VmFsdWVOb3RMaW5rIH0gZnJvbSBcIi4uLy4uL2xpYi90eXBlc1wiO1xyXG5cclxudHlwZSBNYXJrZG93blByb3BzID0gQ29tcG9uZW50UHJvcHM8XCJkaXZcIj4gJiB7XHJcbiAgLy8gY29udGFpbmVyRWw6IEhUTUxFbGVtZW50O1xyXG4gIGFwcDogQXBwO1xyXG4gIG1hcmtkb3duOiBEYXRhdmlld1Byb3BlcnR5VmFsdWVOb3RMaW5rO1xyXG4gIHNvdXJjZVBhdGg6IHN0cmluZztcclxuICBjbGFzcz86IHN0cmluZztcclxufTtcclxuZXhwb3J0IGNvbnN0IE1hcmtkb3duID0gKHByb3BzOiBNYXJrZG93blByb3BzKSA9PiB7XHJcbiAgbGV0IHJlZjogSFRNTERpdkVsZW1lbnQ7XHJcblxyXG4gIGNvbnN0IFtsb2NhbFByb3BzLCBkaXZQcm9wc10gPSBzcGxpdFByb3BzKHByb3BzLCBbXHJcbiAgICBcImFwcFwiLFxyXG4gICAgXCJtYXJrZG93blwiLFxyXG4gICAgXCJzb3VyY2VQYXRoXCIsXHJcbiAgXSk7XHJcblxyXG4gIGNvbnN0IG1kID0gY3JlYXRlTWVtbygoKSA9PiB7XHJcbiAgICBjb25zdCBzdHIgPSBsb2NhbFByb3BzLm1hcmtkb3duID8/IFwiJm5ic3A7XCI7XHJcbiAgICBpZiAoQXJyYXkuaXNBcnJheShzdHIpKSByZXR1cm4gc3RyLmpvaW4oXCIsIFwiKTtcclxuICAgIGlmIChzdHIgPT09IFwiXCIgfHwgdHlwZW9mIHN0ciA9PT0gXCJvYmplY3RcIikgcmV0dXJuIFwiJm5ic3A7XCI7XHJcbiAgICByZXR1cm4gc3RyLnRvU3RyaW5nKCk7XHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IGNvbXBvbmVudCA9IG5ldyBDb21wb25lbnQoKTtcclxuXHJcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcclxuICAgIHJlZi5lbXB0eSgpO1xyXG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXIoXHJcbiAgICAgIGxvY2FsUHJvcHMuYXBwLFxyXG4gICAgICBtZCgpLFxyXG4gICAgICByZWYsXHJcbiAgICAgIGxvY2FsUHJvcHMuc291cmNlUGF0aCxcclxuICAgICAgY29tcG9uZW50LFxyXG4gICAgKTtcclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIDxkaXYgey4uLmRpdlByb3BzfSByZWY9eyhyKSA9PiAocmVmID0gcil9PjwvZGl2PjtcclxufTtcclxuIiwiaW1wb3J0IHsgUHJvcGVydHlWYWx1ZVR5cGUgfSBmcm9tIFwiQC9saWIvdHlwZXNcIjtcclxuaW1wb3J0IHsgdXBkYXRlTWV0YWRhdGFQcm9wZXJ0eSB9IGZyb20gXCJAL2xpYi91dGlsXCI7XHJcbmltcG9ydCB7IFRhYmxlRGF0YVByb3BzIH0gZnJvbSBcIi4uL1RhYmxlL1RhYmxlRGF0YVwiO1xyXG5cclxudHlwZSBDaGVja2JveElucHV0UHJvcHMgPSBUYWJsZURhdGFQcm9wcyAmIHtcclxuICB2YWx1ZVR5cGU6IFByb3BlcnR5VmFsdWVUeXBlO1xyXG59O1xyXG5leHBvcnQgY29uc3QgQ2hlY2tib3hJbnB1dCA9IChwcm9wczogQ2hlY2tib3hJbnB1dFByb3BzKSA9PiB7XHJcbiAgY29uc3QgeyBwbHVnaW4sIGNvbmZpZyB9ID0gcHJvcHMuY29kZUJsb2NrSW5mbztcclxuICByZXR1cm4gKFxyXG4gICAgPGlucHV0XHJcbiAgICAgIGNsYXNzPVwiXCJcclxuICAgICAgZGlzYWJsZWQ9e2NvbmZpZy5sb2NrRWRpdGluZ31cclxuICAgICAgdHlwZT1cImNoZWNrYm94XCJcclxuICAgICAgY2hlY2tlZD17ISFwcm9wcy52YWx1ZX1cclxuICAgICAgb25DbGljaz17YXN5bmMgKGUpID0+IHtcclxuICAgICAgICBhd2FpdCB1cGRhdGVNZXRhZGF0YVByb3BlcnR5KFxyXG4gICAgICAgICAgcHJvcHMucHJvcGVydHksXHJcbiAgICAgICAgICBlLmN1cnJlbnRUYXJnZXQuY2hlY2tlZCxcclxuICAgICAgICAgIHByb3BzLmZpbGVQYXRoLFxyXG4gICAgICAgICAgcGx1Z2luLFxyXG4gICAgICAgICAgcHJvcHMudmFsdWUsXHJcbiAgICAgICAgKTtcclxuICAgICAgfX1cclxuICAgIC8+XHJcbiAgKTtcclxufTtcclxuIiwiaW1wb3J0IHsgb25Nb3VudCwgY3JlYXRlRWZmZWN0IH0gZnJvbSAnc29saWQtanMnO1xuXG4vLyBzcmMvaW5kZXgudHNcbnZhciBhdXRvZm9jdXMgPSAoZWxlbWVudCwgYXV0b2ZvY3VzMikgPT4ge1xuICBpZiAoYXV0b2ZvY3VzMj8uKCkgPT09IGZhbHNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIG9uTW91bnQoKCkgPT4ge1xuICAgIGlmIChlbGVtZW50Lmhhc0F0dHJpYnV0ZShcImF1dG9mb2N1c1wiKSlcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gZWxlbWVudC5mb2N1cygpKTtcbiAgfSk7XG59O1xudmFyIGNyZWF0ZUF1dG9mb2N1cyA9IChyZWYpID0+IHtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBjb25zdCBlbCA9IHJlZigpO1xuICAgIGVsICYmIHNldFRpbWVvdXQoKCkgPT4gZWwuZm9jdXMoKSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IHsgYXV0b2ZvY3VzLCBjcmVhdGVBdXRvZm9jdXMgfTtcbiIsImltcG9ydCB7IFByb3BlcnR5VmFsdWVUeXBlIH0gZnJvbSBcIkAvbGliL3R5cGVzXCI7XHJcbmltcG9ydCB7IGNoZWNrSWZEYXRlSGFzVGltZSwgdXBkYXRlTWV0YWRhdGFQcm9wZXJ0eSB9IGZyb20gXCJAL2xpYi91dGlsXCI7XHJcbmltcG9ydCB7IERhdGVUaW1lIH0gZnJvbSBcImx1eG9uXCI7XHJcbmltcG9ydCB7IFNldHRlciwgY3JlYXRlTWVtbyB9IGZyb20gXCJzb2xpZC1qc1wiO1xyXG5pbXBvcnQgeyBUYWJsZURhdGFQcm9wcyB9IGZyb20gXCIuLi9UYWJsZS9UYWJsZURhdGFcIjtcclxuaW1wb3J0IHsgYXV0b2ZvY3VzIH0gZnJvbSBcIkBzb2xpZC1wcmltaXRpdmVzL2F1dG9mb2N1c1wiO1xyXG4vLyBUbyBwcmV2ZW50IHRyZWVzaGFraW5nXHJcbmF1dG9mb2N1cztcclxuXHJcbnR5cGUgRGF0ZURhdGV0aW1lSW5wdXRQcm9wcyA9IFRhYmxlRGF0YVByb3BzPERhdGVUaW1lPiAmIHtcclxuICBzZXRFZGl0aW5nOiBTZXR0ZXI8Ym9vbGVhbj47XHJcbiAgdmFsdWVUeXBlOiBQcm9wZXJ0eVZhbHVlVHlwZTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBEYXRlRGF0ZXRpbWVJbnB1dCA9IChwcm9wczogRGF0ZURhdGV0aW1lSW5wdXRQcm9wcykgPT4ge1xyXG4gIGNvbnN0IHtcclxuICAgIHBsdWdpbixcclxuICAgIGRhdGF2aWV3QVBJOiB7XHJcbiAgICAgIGx1eG9uOiB7IERhdGVUaW1lIH0sXHJcbiAgICB9LFxyXG4gIH0gPSBwcm9wcy5jb2RlQmxvY2tJbmZvO1xyXG4gIGNvbnN0IGlzVGltZSA9IGNyZWF0ZU1lbW8oKCkgPT4ge1xyXG4gICAgcmV0dXJuIGNoZWNrSWZEYXRlSGFzVGltZShwcm9wcy52YWx1ZSk7XHJcbiAgfSk7XHJcblxyXG4gIHJldHVybiAoXHJcbiAgICA8aW5wdXRcclxuICAgICAgdXNlOmF1dG9mb2N1c1xyXG4gICAgICBhdXRvZm9jdXNcclxuICAgICAgY2xhc3M9XCJcIlxyXG4gICAgICB0eXBlPXtpc1RpbWUoKSA/IFwiZGF0ZXRpbWUtbG9jYWxcIiA6IFwiZGF0ZVwifVxyXG4gICAgICAvLyAyMDE4LTA2LTEyVDE5OjMwXHJcbiAgICAgIHZhbHVlPXtcclxuICAgICAgICBpc1RpbWUoKVxyXG4gICAgICAgICAgPyBwcm9wcy52YWx1ZS50b0Zvcm1hdChcInl5eXktTU0tZGQnVCdoaDptbVwiKVxyXG4gICAgICAgICAgOiBwcm9wcy52YWx1ZS50b0Zvcm1hdChcInl5eXktTU0tZGRcIilcclxuICAgICAgfVxyXG4gICAgICBvbkJsdXI9e2FzeW5jIChlKSA9PiB7XHJcbiAgICAgICAgY29uc3QgaXNWYWxpZCA9IGUudGFyZ2V0LnZhbGlkaXR5O1xyXG4gICAgICAgIGlmICghaXNWYWxpZCkgcmV0dXJuIHByb3BzLnNldEVkaXRpbmcoZmFsc2UpO1xyXG4gICAgICAgIGNvbnN0IGZvcm1hdCA9IGlzVGltZSgpID8gXCJ5eXl5LU1NLWRkJ1QnaGg6bW1cIiA6IFwieXl5eS1NTS1kZFwiO1xyXG4gICAgICAgIGNvbnN0IGR0ID0gRGF0ZVRpbWUuZnJvbUZvcm1hdChlLnRhcmdldC52YWx1ZSwgZm9ybWF0KTtcclxuICAgICAgICBjb25zdCBuZXdWYWx1ZSA9IGR0LnRvRm9ybWF0KGZvcm1hdCk7XHJcbiAgICAgICAgY29uc3QgZm9ybWF0dGVkT2xkID0gcHJvcHMudmFsdWUudG9Gb3JtYXQoZm9ybWF0KTtcclxuICAgICAgICBhd2FpdCB1cGRhdGVNZXRhZGF0YVByb3BlcnR5KFxyXG4gICAgICAgICAgcHJvcHMucHJvcGVydHksXHJcbiAgICAgICAgICBuZXdWYWx1ZSxcclxuICAgICAgICAgIHByb3BzLmZpbGVQYXRoLFxyXG4gICAgICAgICAgcGx1Z2luLFxyXG4gICAgICAgICAgZm9ybWF0dGVkT2xkLFxyXG4gICAgICAgICk7XHJcbiAgICAgICAgcHJvcHMuc2V0RWRpdGluZyhmYWxzZSk7XHJcbiAgICAgIH19XHJcbiAgICAvPlxyXG4gICk7XHJcbn07XHJcbiIsIi8qKlxuKiBAbGljZW5zZSBsdWNpZGUtc29saWQgdjAuNDEyLjAgLSBJU0NcbipcbiogVGhpcyBzb3VyY2UgY29kZSBpcyBsaWNlbnNlZCB1bmRlciB0aGUgSVNDIGxpY2Vuc2UuXG4qIFNlZSB0aGUgTElDRU5TRSBmaWxlIGluIHRoZSByb290IGRpcmVjdG9yeSBvZiB0aGlzIHNvdXJjZSB0cmVlLlxuKi9cblxuLy8gc3JjL2ljb25zL3BsdXMudHN4XG5pbXBvcnQgSWNvbiBmcm9tIFwiLi4vSWNvblwiO1xudmFyIGljb25Ob2RlID0gW1xuICBbXCJwYXRoXCIsIHsgZDogXCJNNSAxMmgxNFwiLCBrZXk6IFwiMWF5czBoXCIgfV0sXG4gIFtcInBhdGhcIiwgeyBkOiBcIk0xMiA1djE0XCIsIGtleTogXCJzNjk5bGVcIiB9XVxuXTtcbnZhciBQbHVzID0gKHByb3BzKSA9PiA8SWNvbiB7Li4ucHJvcHN9IG5hbWU9XCJQbHVzXCIgaWNvbk5vZGU9e2ljb25Ob2RlfSAvPjtcbnZhciBwbHVzX2RlZmF1bHQgPSBQbHVzO1xuZXhwb3J0IHtcbiAgcGx1c19kZWZhdWx0IGFzIGRlZmF1bHRcbn07XG4vLyMgc291cmNlTWFwcGluZ1VSTD1wbHVzLmpzeC5tYXBcbiIsImltcG9ydCB7IHVwZGF0ZU1ldGFkYXRhUHJvcGVydHkgfSBmcm9tIFwiQC9saWIvdXRpbFwiO1xyXG5pbXBvcnQgeyBjcmVhdGVTaWduYWwgfSBmcm9tIFwic29saWQtanNcIjtcclxuaW1wb3J0IHsgVGFibGVEYXRhRWRpdFByb3BzIH0gZnJvbSBcIi4uL1RhYmxlL1RhYmxlRGF0YVwiO1xyXG5pbXBvcnQgeyBhdXRvZm9jdXMgfSBmcm9tIFwiQHNvbGlkLXByaW1pdGl2ZXMvYXV0b2ZvY3VzXCI7XHJcbi8vIFRvIHByZXZlbnQgdHJlZXNoYWtpbmdcclxuYXV0b2ZvY3VzO1xyXG5cclxuZXhwb3J0IGNvbnN0IFRleHRJbnB1dCA9IChcclxuICBwcm9wczogVGFibGVEYXRhRWRpdFByb3BzICYge1xyXG4gICAgdXBkYXRlUHJvcGVydHk/OiAodmFsOiB1bmtub3duKSA9PiBQcm9taXNlPHZvaWQ+O1xyXG4gIH0sXHJcbikgPT4ge1xyXG4gIGNvbnN0IFtzaXplLCBzZXRTaXplXSA9IGNyZWF0ZVNpZ25hbChwcm9wcy52YWx1ZT8udG9TdHJpbmcoKS5sZW5ndGggPz8gNSk7XHJcbiAgY29uc3QgeyBwbHVnaW4gfSA9IHByb3BzLmNvZGVCbG9ja0luZm87XHJcbiAgcmV0dXJuIChcclxuICAgIDxpbnB1dFxyXG4gICAgICB1c2U6YXV0b2ZvY3VzXHJcbiAgICAgIGF1dG9mb2N1c1xyXG4gICAgICBjbGFzcz1cImgtYXV0byByb3VuZGVkLW5vbmUgYm9yZGVyLW5vbmUgYmctdHJhbnNwYXJlbnQgcC0wICFzaGFkb3ctbm9uZVwiXHJcbiAgICAgIC8vIHN0eWxlPXt7IFwiYm94LXNoYWRvd1wiOiBcIm5vbmVcIiB9fVxyXG4gICAgICBzaXplPXtzaXplKCl9XHJcbiAgICAgIHR5cGU9XCJ0ZXh0XCJcclxuICAgICAgdmFsdWU9e3Byb3BzLnZhbHVlPy50b1N0cmluZygpID8/IFwiXCJ9XHJcbiAgICAgIG9uQmx1cj17YXN5bmMgKGUpID0+IHtcclxuICAgICAgICBpZiAocHJvcHMudXBkYXRlUHJvcGVydHkpIHtcclxuICAgICAgICAgIGF3YWl0IHByb3BzLnVwZGF0ZVByb3BlcnR5KGUudGFyZ2V0LnZhbHVlKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgYXdhaXQgdXBkYXRlTWV0YWRhdGFQcm9wZXJ0eShcclxuICAgICAgICAgICAgcHJvcHMucHJvcGVydHksXHJcbiAgICAgICAgICAgIGUudGFyZ2V0LnZhbHVlLFxyXG4gICAgICAgICAgICBwcm9wcy5maWxlUGF0aCxcclxuICAgICAgICAgICAgcGx1Z2luLFxyXG4gICAgICAgICAgICBwcm9wcy52YWx1ZSxcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHByb3BzLnNldEVkaXRpbmcoZmFsc2UpO1xyXG4gICAgICB9fVxyXG4gICAgICBvbklucHV0PXsoZSkgPT4ge1xyXG4gICAgICAgIHNldFNpemUoZS50YXJnZXQudmFsdWUubGVuZ3RoKTtcclxuICAgICAgfX1cclxuICAgIC8+XHJcbiAgKTtcclxufTtcclxuIiwiaW1wb3J0IHsgRGF0YXZpZXdQcm9wZXJ0eVZhbHVlQXJyYXkgfSBmcm9tIFwiQC9saWIvdHlwZXNcIjtcclxuaW1wb3J0IHtcclxuICB1cGRhdGVNZXRhZGF0YVByb3BlcnR5LFxyXG4gIHRyeURhdGF2aWV3TGlua1RvTWFya2Rvd24sXHJcbiAgRGF0YUVkaXRCbG9ja0NvbmZpZyxcclxufSBmcm9tIFwiQC9saWIvdXRpbFwiO1xyXG5pbXBvcnQgRGF0YUVkaXQgZnJvbSBcIkAvbWFpblwiO1xyXG5pbXBvcnQgUGx1cyBmcm9tIFwibHVjaWRlLXNvbGlkL2ljb25zL1BsdXNcIjtcclxuaW1wb3J0IHsgTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5pbXBvcnQgeyBGb3IsIGNyZWF0ZVNpZ25hbCwgU2hvdywgU2V0dGVyIH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcbmltcG9ydCB7IE1hcmtkb3duIH0gZnJvbSBcIi4uL01hcmtkb3duXCI7XHJcbmltcG9ydCB7IFRhYmxlRGF0YVByb3BzIH0gZnJvbSBcIi4uL1RhYmxlL1RhYmxlRGF0YVwiO1xyXG5pbXBvcnQgeyBUZXh0SW5wdXQgfSBmcm9tIFwiLi90ZXh0XCI7XHJcblxyXG5leHBvcnQgY29uc3QgTGlzdFRhYmxlRGF0YVdyYXBwZXIgPSAoXHJcbiAgcHJvcHM6IFRhYmxlRGF0YVByb3BzPERhdGF2aWV3UHJvcGVydHlWYWx1ZUFycmF5PixcclxuKSA9PiB7XHJcbiAgY29uc3QgeyBwbHVnaW4sIGN0eCwgY29uZmlnIH0gPSBwcm9wcy5jb2RlQmxvY2tJbmZvO1xyXG4gIHJldHVybiAoXHJcbiAgICA8dWwgY2xhc3M9XCJtLTAgZmxleCBmbGV4LWNvbCBnYXAtMSBwLTAgWyY+bGldOmxpc3QtZGlzY1wiPlxyXG4gICAgICA8Rm9yIGVhY2g9e3Byb3BzLnZhbHVlfT5cclxuICAgICAgICB7KHZhbCwgaW5kZXgpID0+IChcclxuICAgICAgICAgIDxMaXN0VGFibGVEYXRhSXRlbVxyXG4gICAgICAgICAgICB7Li4ucHJvcHN9XHJcbiAgICAgICAgICAgIHBsdWdpbj17cGx1Z2lufVxyXG4gICAgICAgICAgICBjdHg9e2N0eH1cclxuICAgICAgICAgICAgaXRlbVZhbHVlPXt2YWx9XHJcbiAgICAgICAgICAgIGl0ZW1JbmRleD17aW5kZXgoKX1cclxuICAgICAgICAgICAgY29uZmlnPXtjb25maWd9XHJcbiAgICAgICAgICAvPlxyXG4gICAgICAgICl9XHJcbiAgICAgIDwvRm9yPlxyXG4gICAgICA8YnV0dG9uXHJcbiAgICAgICAgY2xhc3M9XCJjbGlja2FibGUtaWNvbiBzaXplLWZpdCBwLTFcIlxyXG4gICAgICAgIGRpc2FibGVkPXtjb25maWcubG9ja0VkaXRpbmd9XHJcbiAgICAgICAgb25DbGljaz17YXN5bmMgKGUpID0+IHtcclxuICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgIGF3YWl0IHVwZGF0ZU1ldGFkYXRhUHJvcGVydHkoXHJcbiAgICAgICAgICAgIHByb3BzLnByb3BlcnR5LFxyXG4gICAgICAgICAgICBbLi4ucHJvcHMudmFsdWUsIFwiXCJdLFxyXG4gICAgICAgICAgICBwcm9wcy5maWxlUGF0aCxcclxuICAgICAgICAgICAgcGx1Z2luLFxyXG4gICAgICAgICAgICBwcm9wcy52YWx1ZSxcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfX1cclxuICAgICAgPlxyXG4gICAgICAgIDxQbHVzIGNsYXNzPVwicG9pbnRlci1ldmVudHMtbm9uZSBzaXplLTNcIiAvPlxyXG4gICAgICA8L2J1dHRvbj5cclxuICAgIDwvdWw+XHJcbiAgKTtcclxufTtcclxuXHJcbmV4cG9ydCB0eXBlIExpc3RUYWJsZURhdGFJdGVtUHJvcHMgPVxyXG4gIFRhYmxlRGF0YVByb3BzPERhdGF2aWV3UHJvcGVydHlWYWx1ZUFycmF5PiAmIHtcclxuICAgIHBsdWdpbjogRGF0YUVkaXQ7XHJcbiAgICBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQ7XHJcbiAgICBpdGVtVmFsdWU6IHVua25vd247XHJcbiAgICBpdGVtSW5kZXg6IG51bWJlcjtcclxuICB9O1xyXG5leHBvcnQgY29uc3QgTGlzdFRhYmxlRGF0YUl0ZW0gPSAoXHJcbiAgcHJvcHM6IExpc3RUYWJsZURhdGFJdGVtUHJvcHMgJiB7IGNvbmZpZzogRGF0YUVkaXRCbG9ja0NvbmZpZyB9LFxyXG4pID0+IHtcclxuICBjb25zdCBbaXNFZGl0aW5nLCBzZXRFZGl0aW5nXSA9IGNyZWF0ZVNpZ25hbChmYWxzZSk7XHJcbiAgcmV0dXJuIChcclxuICAgIDxsaSBjbGFzcz1cIm0tMCBtbC0zXCI+XHJcbiAgICAgIDxTaG93XHJcbiAgICAgICAgd2hlbj17IXByb3BzLmNvbmZpZy5sb2NrRWRpdGluZyAmJiBpc0VkaXRpbmcoKX1cclxuICAgICAgICBmYWxsYmFjaz17XHJcbiAgICAgICAgICA8TWFya2Rvd25cclxuICAgICAgICAgICAgY2xhc3M9XCJzaXplLWZ1bGxcIlxyXG4gICAgICAgICAgICBhcHA9e3Byb3BzLnBsdWdpbi5hcHB9XHJcbiAgICAgICAgICAgIG1hcmtkb3duPXt0cnlEYXRhdmlld0xpbmtUb01hcmtkb3duKHByb3BzLml0ZW1WYWx1ZSl9XHJcbiAgICAgICAgICAgIHNvdXJjZVBhdGg9e3Byb3BzLmN0eC5zb3VyY2VQYXRofVxyXG4gICAgICAgICAgICBvbkNsaWNrPXtcclxuICAgICAgICAgICAgICBwcm9wcy5jb25maWcubG9ja0VkaXRpbmcgPyB1bmRlZmluZWQgOiAoKSA9PiBzZXRFZGl0aW5nKHRydWUpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIC8+XHJcbiAgICAgICAgfVxyXG4gICAgICA+XHJcbiAgICAgICAgPExpc3RJbnB1dCB7Li4ucHJvcHN9IHNldEVkaXRpbmc9e3NldEVkaXRpbmd9IC8+XHJcbiAgICAgIDwvU2hvdz5cclxuICAgIDwvbGk+XHJcbiAgKTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBMaXN0SW5wdXQgPSAoXHJcbiAgcHJvcHM6IExpc3RUYWJsZURhdGFJdGVtUHJvcHMgJiB7IHNldEVkaXRpbmc6IFNldHRlcjxib29sZWFuPiB9LFxyXG4pID0+IHtcclxuICByZXR1cm4gKFxyXG4gICAgPFRleHRJbnB1dFxyXG4gICAgICB7Li4ucHJvcHN9XHJcbiAgICAgIHZhbHVlPXtwcm9wcy5pdGVtVmFsdWV9XHJcbiAgICAgIHZhbHVlVHlwZT1cImxpc3RcIlxyXG4gICAgICB1cGRhdGVQcm9wZXJ0eT17YXN5bmMgKG5ld1ZhbCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHZhbHVlID0gWy4uLnByb3BzLnZhbHVlXSBhcyB1bmtub3duW107XHJcbiAgICAgICAgaWYgKCFuZXdWYWwgJiYgbmV3VmFsICE9PSAwKSB7XHJcbiAgICAgICAgICBjb25zdCBhcnIgPSB2YWx1ZS5maWx0ZXIoKF8sIGkpID0+IGkgIT09IHByb3BzLml0ZW1JbmRleCk7XHJcbiAgICAgICAgICBhd2FpdCB1cGRhdGVNZXRhZGF0YVByb3BlcnR5KFxyXG4gICAgICAgICAgICBwcm9wcy5wcm9wZXJ0eSxcclxuICAgICAgICAgICAgYXJyLFxyXG4gICAgICAgICAgICBwcm9wcy5maWxlUGF0aCxcclxuICAgICAgICAgICAgcHJvcHMucGx1Z2luLFxyXG4gICAgICAgICAgICBwcm9wcy5pdGVtVmFsdWUsXHJcbiAgICAgICAgICAgIHByb3BzLml0ZW1JbmRleCxcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhbHVlW3Byb3BzLml0ZW1JbmRleF0gPSBuZXdWYWw7XHJcbiAgICAgICAgYXdhaXQgdXBkYXRlTWV0YWRhdGFQcm9wZXJ0eShcclxuICAgICAgICAgIHByb3BzLnByb3BlcnR5LFxyXG4gICAgICAgICAgdmFsdWUsXHJcbiAgICAgICAgICBwcm9wcy5maWxlUGF0aCxcclxuICAgICAgICAgIHByb3BzLnBsdWdpbixcclxuICAgICAgICAgIHByb3BzLml0ZW1WYWx1ZSxcclxuICAgICAgICAgIHByb3BzLml0ZW1JbmRleCxcclxuICAgICAgICApO1xyXG4gICAgICB9fVxyXG4gICAgLz5cclxuICApO1xyXG59O1xyXG4iLCJmdW5jdGlvbiByKGUpe3ZhciB0LGYsbj1cIlwiO2lmKFwic3RyaW5nXCI9PXR5cGVvZiBlfHxcIm51bWJlclwiPT10eXBlb2YgZSluKz1lO2Vsc2UgaWYoXCJvYmplY3RcIj09dHlwZW9mIGUpaWYoQXJyYXkuaXNBcnJheShlKSl7dmFyIG89ZS5sZW5ndGg7Zm9yKHQ9MDt0PG87dCsrKWVbdF0mJihmPXIoZVt0XSkpJiYobiYmKG4rPVwiIFwiKSxuKz1mKX1lbHNlIGZvcihmIGluIGUpZVtmXSYmKG4mJihuKz1cIiBcIiksbis9Zik7cmV0dXJuIG59ZXhwb3J0IGZ1bmN0aW9uIGNsc3goKXtmb3IodmFyIGUsdCxmPTAsbj1cIlwiLG89YXJndW1lbnRzLmxlbmd0aDtmPG87ZisrKShlPWFyZ3VtZW50c1tmXSkmJih0PXIoZSkpJiYobiYmKG4rPVwiIFwiKSxuKz10KTtyZXR1cm4gbn1leHBvcnQgZGVmYXVsdCBjbHN4OyIsImNvbnN0IENMQVNTX1BBUlRfU0VQQVJBVE9SID0gJy0nO1xuZnVuY3Rpb24gY3JlYXRlQ2xhc3NHcm91cFV0aWxzKGNvbmZpZykge1xuICBjb25zdCBjbGFzc01hcCA9IGNyZWF0ZUNsYXNzTWFwKGNvbmZpZyk7XG4gIGNvbnN0IHtcbiAgICBjb25mbGljdGluZ0NsYXNzR3JvdXBzLFxuICAgIGNvbmZsaWN0aW5nQ2xhc3NHcm91cE1vZGlmaWVyc1xuICB9ID0gY29uZmlnO1xuICBmdW5jdGlvbiBnZXRDbGFzc0dyb3VwSWQoY2xhc3NOYW1lKSB7XG4gICAgY29uc3QgY2xhc3NQYXJ0cyA9IGNsYXNzTmFtZS5zcGxpdChDTEFTU19QQVJUX1NFUEFSQVRPUik7XG4gICAgLy8gQ2xhc3NlcyBsaWtlIGAtaW5zZXQtMWAgcHJvZHVjZSBhbiBlbXB0eSBzdHJpbmcgYXMgZmlyc3QgY2xhc3NQYXJ0LiBXZSBhc3N1bWUgdGhhdCBjbGFzc2VzIGZvciBuZWdhdGl2ZSB2YWx1ZXMgYXJlIHVzZWQgY29ycmVjdGx5IGFuZCByZW1vdmUgaXQgZnJvbSBjbGFzc1BhcnRzLlxuICAgIGlmIChjbGFzc1BhcnRzWzBdID09PSAnJyAmJiBjbGFzc1BhcnRzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgY2xhc3NQYXJ0cy5zaGlmdCgpO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0R3JvdXBSZWN1cnNpdmUoY2xhc3NQYXJ0cywgY2xhc3NNYXApIHx8IGdldEdyb3VwSWRGb3JBcmJpdHJhcnlQcm9wZXJ0eShjbGFzc05hbWUpO1xuICB9XG4gIGZ1bmN0aW9uIGdldENvbmZsaWN0aW5nQ2xhc3NHcm91cElkcyhjbGFzc0dyb3VwSWQsIGhhc1Bvc3RmaXhNb2RpZmllcikge1xuICAgIGNvbnN0IGNvbmZsaWN0cyA9IGNvbmZsaWN0aW5nQ2xhc3NHcm91cHNbY2xhc3NHcm91cElkXSB8fCBbXTtcbiAgICBpZiAoaGFzUG9zdGZpeE1vZGlmaWVyICYmIGNvbmZsaWN0aW5nQ2xhc3NHcm91cE1vZGlmaWVyc1tjbGFzc0dyb3VwSWRdKSB7XG4gICAgICByZXR1cm4gWy4uLmNvbmZsaWN0cywgLi4uY29uZmxpY3RpbmdDbGFzc0dyb3VwTW9kaWZpZXJzW2NsYXNzR3JvdXBJZF1dO1xuICAgIH1cbiAgICByZXR1cm4gY29uZmxpY3RzO1xuICB9XG4gIHJldHVybiB7XG4gICAgZ2V0Q2xhc3NHcm91cElkLFxuICAgIGdldENvbmZsaWN0aW5nQ2xhc3NHcm91cElkc1xuICB9O1xufVxuZnVuY3Rpb24gZ2V0R3JvdXBSZWN1cnNpdmUoY2xhc3NQYXJ0cywgY2xhc3NQYXJ0T2JqZWN0KSB7XG4gIGlmIChjbGFzc1BhcnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBjbGFzc1BhcnRPYmplY3QuY2xhc3NHcm91cElkO1xuICB9XG4gIGNvbnN0IGN1cnJlbnRDbGFzc1BhcnQgPSBjbGFzc1BhcnRzWzBdO1xuICBjb25zdCBuZXh0Q2xhc3NQYXJ0T2JqZWN0ID0gY2xhc3NQYXJ0T2JqZWN0Lm5leHRQYXJ0LmdldChjdXJyZW50Q2xhc3NQYXJ0KTtcbiAgY29uc3QgY2xhc3NHcm91cEZyb21OZXh0Q2xhc3NQYXJ0ID0gbmV4dENsYXNzUGFydE9iamVjdCA/IGdldEdyb3VwUmVjdXJzaXZlKGNsYXNzUGFydHMuc2xpY2UoMSksIG5leHRDbGFzc1BhcnRPYmplY3QpIDogdW5kZWZpbmVkO1xuICBpZiAoY2xhc3NHcm91cEZyb21OZXh0Q2xhc3NQYXJ0KSB7XG4gICAgcmV0dXJuIGNsYXNzR3JvdXBGcm9tTmV4dENsYXNzUGFydDtcbiAgfVxuICBpZiAoY2xhc3NQYXJ0T2JqZWN0LnZhbGlkYXRvcnMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICBjb25zdCBjbGFzc1Jlc3QgPSBjbGFzc1BhcnRzLmpvaW4oQ0xBU1NfUEFSVF9TRVBBUkFUT1IpO1xuICByZXR1cm4gY2xhc3NQYXJ0T2JqZWN0LnZhbGlkYXRvcnMuZmluZCgoe1xuICAgIHZhbGlkYXRvclxuICB9KSA9PiB2YWxpZGF0b3IoY2xhc3NSZXN0KSk/LmNsYXNzR3JvdXBJZDtcbn1cbmNvbnN0IGFyYml0cmFyeVByb3BlcnR5UmVnZXggPSAvXlxcWyguKylcXF0kLztcbmZ1bmN0aW9uIGdldEdyb3VwSWRGb3JBcmJpdHJhcnlQcm9wZXJ0eShjbGFzc05hbWUpIHtcbiAgaWYgKGFyYml0cmFyeVByb3BlcnR5UmVnZXgudGVzdChjbGFzc05hbWUpKSB7XG4gICAgY29uc3QgYXJiaXRyYXJ5UHJvcGVydHlDbGFzc05hbWUgPSBhcmJpdHJhcnlQcm9wZXJ0eVJlZ2V4LmV4ZWMoY2xhc3NOYW1lKVsxXTtcbiAgICBjb25zdCBwcm9wZXJ0eSA9IGFyYml0cmFyeVByb3BlcnR5Q2xhc3NOYW1lPy5zdWJzdHJpbmcoMCwgYXJiaXRyYXJ5UHJvcGVydHlDbGFzc05hbWUuaW5kZXhPZignOicpKTtcbiAgICBpZiAocHJvcGVydHkpIHtcbiAgICAgIC8vIEkgdXNlIHR3byBkb3RzIGhlcmUgYmVjYXVzZSBvbmUgZG90IGlzIHVzZWQgYXMgcHJlZml4IGZvciBjbGFzcyBncm91cHMgaW4gcGx1Z2luc1xuICAgICAgcmV0dXJuICdhcmJpdHJhcnkuLicgKyBwcm9wZXJ0eTtcbiAgICB9XG4gIH1cbn1cbi8qKlxuICogRXhwb3J0ZWQgZm9yIHRlc3Rpbmcgb25seVxuICovXG5mdW5jdGlvbiBjcmVhdGVDbGFzc01hcChjb25maWcpIHtcbiAgY29uc3Qge1xuICAgIHRoZW1lLFxuICAgIHByZWZpeFxuICB9ID0gY29uZmlnO1xuICBjb25zdCBjbGFzc01hcCA9IHtcbiAgICBuZXh0UGFydDogbmV3IE1hcCgpLFxuICAgIHZhbGlkYXRvcnM6IFtdXG4gIH07XG4gIGNvbnN0IHByZWZpeGVkQ2xhc3NHcm91cEVudHJpZXMgPSBnZXRQcmVmaXhlZENsYXNzR3JvdXBFbnRyaWVzKE9iamVjdC5lbnRyaWVzKGNvbmZpZy5jbGFzc0dyb3VwcyksIHByZWZpeCk7XG4gIHByZWZpeGVkQ2xhc3NHcm91cEVudHJpZXMuZm9yRWFjaCgoW2NsYXNzR3JvdXBJZCwgY2xhc3NHcm91cF0pID0+IHtcbiAgICBwcm9jZXNzQ2xhc3Nlc1JlY3Vyc2l2ZWx5KGNsYXNzR3JvdXAsIGNsYXNzTWFwLCBjbGFzc0dyb3VwSWQsIHRoZW1lKTtcbiAgfSk7XG4gIHJldHVybiBjbGFzc01hcDtcbn1cbmZ1bmN0aW9uIHByb2Nlc3NDbGFzc2VzUmVjdXJzaXZlbHkoY2xhc3NHcm91cCwgY2xhc3NQYXJ0T2JqZWN0LCBjbGFzc0dyb3VwSWQsIHRoZW1lKSB7XG4gIGNsYXNzR3JvdXAuZm9yRWFjaChjbGFzc0RlZmluaXRpb24gPT4ge1xuICAgIGlmICh0eXBlb2YgY2xhc3NEZWZpbml0aW9uID09PSAnc3RyaW5nJykge1xuICAgICAgY29uc3QgY2xhc3NQYXJ0T2JqZWN0VG9FZGl0ID0gY2xhc3NEZWZpbml0aW9uID09PSAnJyA/IGNsYXNzUGFydE9iamVjdCA6IGdldFBhcnQoY2xhc3NQYXJ0T2JqZWN0LCBjbGFzc0RlZmluaXRpb24pO1xuICAgICAgY2xhc3NQYXJ0T2JqZWN0VG9FZGl0LmNsYXNzR3JvdXBJZCA9IGNsYXNzR3JvdXBJZDtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBjbGFzc0RlZmluaXRpb24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGlmIChpc1RoZW1lR2V0dGVyKGNsYXNzRGVmaW5pdGlvbikpIHtcbiAgICAgICAgcHJvY2Vzc0NsYXNzZXNSZWN1cnNpdmVseShjbGFzc0RlZmluaXRpb24odGhlbWUpLCBjbGFzc1BhcnRPYmplY3QsIGNsYXNzR3JvdXBJZCwgdGhlbWUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjbGFzc1BhcnRPYmplY3QudmFsaWRhdG9ycy5wdXNoKHtcbiAgICAgICAgdmFsaWRhdG9yOiBjbGFzc0RlZmluaXRpb24sXG4gICAgICAgIGNsYXNzR3JvdXBJZFxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIE9iamVjdC5lbnRyaWVzKGNsYXNzRGVmaW5pdGlvbikuZm9yRWFjaCgoW2tleSwgY2xhc3NHcm91cF0pID0+IHtcbiAgICAgIHByb2Nlc3NDbGFzc2VzUmVjdXJzaXZlbHkoY2xhc3NHcm91cCwgZ2V0UGFydChjbGFzc1BhcnRPYmplY3QsIGtleSksIGNsYXNzR3JvdXBJZCwgdGhlbWUpO1xuICAgIH0pO1xuICB9KTtcbn1cbmZ1bmN0aW9uIGdldFBhcnQoY2xhc3NQYXJ0T2JqZWN0LCBwYXRoKSB7XG4gIGxldCBjdXJyZW50Q2xhc3NQYXJ0T2JqZWN0ID0gY2xhc3NQYXJ0T2JqZWN0O1xuICBwYXRoLnNwbGl0KENMQVNTX1BBUlRfU0VQQVJBVE9SKS5mb3JFYWNoKHBhdGhQYXJ0ID0+IHtcbiAgICBpZiAoIWN1cnJlbnRDbGFzc1BhcnRPYmplY3QubmV4dFBhcnQuaGFzKHBhdGhQYXJ0KSkge1xuICAgICAgY3VycmVudENsYXNzUGFydE9iamVjdC5uZXh0UGFydC5zZXQocGF0aFBhcnQsIHtcbiAgICAgICAgbmV4dFBhcnQ6IG5ldyBNYXAoKSxcbiAgICAgICAgdmFsaWRhdG9yczogW11cbiAgICAgIH0pO1xuICAgIH1cbiAgICBjdXJyZW50Q2xhc3NQYXJ0T2JqZWN0ID0gY3VycmVudENsYXNzUGFydE9iamVjdC5uZXh0UGFydC5nZXQocGF0aFBhcnQpO1xuICB9KTtcbiAgcmV0dXJuIGN1cnJlbnRDbGFzc1BhcnRPYmplY3Q7XG59XG5mdW5jdGlvbiBpc1RoZW1lR2V0dGVyKGZ1bmMpIHtcbiAgcmV0dXJuIGZ1bmMuaXNUaGVtZUdldHRlcjtcbn1cbmZ1bmN0aW9uIGdldFByZWZpeGVkQ2xhc3NHcm91cEVudHJpZXMoY2xhc3NHcm91cEVudHJpZXMsIHByZWZpeCkge1xuICBpZiAoIXByZWZpeCkge1xuICAgIHJldHVybiBjbGFzc0dyb3VwRW50cmllcztcbiAgfVxuICByZXR1cm4gY2xhc3NHcm91cEVudHJpZXMubWFwKChbY2xhc3NHcm91cElkLCBjbGFzc0dyb3VwXSkgPT4ge1xuICAgIGNvbnN0IHByZWZpeGVkQ2xhc3NHcm91cCA9IGNsYXNzR3JvdXAubWFwKGNsYXNzRGVmaW5pdGlvbiA9PiB7XG4gICAgICBpZiAodHlwZW9mIGNsYXNzRGVmaW5pdGlvbiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIHByZWZpeCArIGNsYXNzRGVmaW5pdGlvbjtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgY2xhc3NEZWZpbml0aW9uID09PSAnb2JqZWN0Jykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKGNsYXNzRGVmaW5pdGlvbikubWFwKChba2V5LCB2YWx1ZV0pID0+IFtwcmVmaXggKyBrZXksIHZhbHVlXSkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNsYXNzRGVmaW5pdGlvbjtcbiAgICB9KTtcbiAgICByZXR1cm4gW2NsYXNzR3JvdXBJZCwgcHJlZml4ZWRDbGFzc0dyb3VwXTtcbiAgfSk7XG59XG5cbi8vIExSVSBjYWNoZSBpbnNwaXJlZCBmcm9tIGhhc2hscnUgKGh0dHBzOi8vZ2l0aHViLmNvbS9kb21pbmljdGFyci9oYXNobHJ1L2Jsb2IvdjEuMC40L2luZGV4LmpzKSBidXQgb2JqZWN0IHJlcGxhY2VkIHdpdGggTWFwIHRvIGltcHJvdmUgcGVyZm9ybWFuY2VcbmZ1bmN0aW9uIGNyZWF0ZUxydUNhY2hlKG1heENhY2hlU2l6ZSkge1xuICBpZiAobWF4Q2FjaGVTaXplIDwgMSkge1xuICAgIHJldHVybiB7XG4gICAgICBnZXQ6ICgpID0+IHVuZGVmaW5lZCxcbiAgICAgIHNldDogKCkgPT4ge31cbiAgICB9O1xuICB9XG4gIGxldCBjYWNoZVNpemUgPSAwO1xuICBsZXQgY2FjaGUgPSBuZXcgTWFwKCk7XG4gIGxldCBwcmV2aW91c0NhY2hlID0gbmV3IE1hcCgpO1xuICBmdW5jdGlvbiB1cGRhdGUoa2V5LCB2YWx1ZSkge1xuICAgIGNhY2hlLnNldChrZXksIHZhbHVlKTtcbiAgICBjYWNoZVNpemUrKztcbiAgICBpZiAoY2FjaGVTaXplID4gbWF4Q2FjaGVTaXplKSB7XG4gICAgICBjYWNoZVNpemUgPSAwO1xuICAgICAgcHJldmlvdXNDYWNoZSA9IGNhY2hlO1xuICAgICAgY2FjaGUgPSBuZXcgTWFwKCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB7XG4gICAgZ2V0KGtleSkge1xuICAgICAgbGV0IHZhbHVlID0gY2FjaGUuZ2V0KGtleSk7XG4gICAgICBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICB9XG4gICAgICBpZiAoKHZhbHVlID0gcHJldmlvdXNDYWNoZS5nZXQoa2V5KSkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB1cGRhdGUoa2V5LCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgIH1cbiAgICB9LFxuICAgIHNldChrZXksIHZhbHVlKSB7XG4gICAgICBpZiAoY2FjaGUuaGFzKGtleSkpIHtcbiAgICAgICAgY2FjaGUuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdXBkYXRlKGtleSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbn1cbmNvbnN0IElNUE9SVEFOVF9NT0RJRklFUiA9ICchJztcbmZ1bmN0aW9uIGNyZWF0ZVBhcnNlQ2xhc3NOYW1lKGNvbmZpZykge1xuICBjb25zdCB7XG4gICAgc2VwYXJhdG9yLFxuICAgIGV4cGVyaW1lbnRhbFBhcnNlQ2xhc3NOYW1lXG4gIH0gPSBjb25maWc7XG4gIGNvbnN0IGlzU2VwYXJhdG9yU2luZ2xlQ2hhcmFjdGVyID0gc2VwYXJhdG9yLmxlbmd0aCA9PT0gMTtcbiAgY29uc3QgZmlyc3RTZXBhcmF0b3JDaGFyYWN0ZXIgPSBzZXBhcmF0b3JbMF07XG4gIGNvbnN0IHNlcGFyYXRvckxlbmd0aCA9IHNlcGFyYXRvci5sZW5ndGg7XG4gIC8vIHBhcnNlQ2xhc3NOYW1lIGluc3BpcmVkIGJ5IGh0dHBzOi8vZ2l0aHViLmNvbS90YWlsd2luZGxhYnMvdGFpbHdpbmRjc3MvYmxvYi92My4yLjIvc3JjL3V0aWwvc3BsaXRBdFRvcExldmVsT25seS5qc1xuICBmdW5jdGlvbiBwYXJzZUNsYXNzTmFtZShjbGFzc05hbWUpIHtcbiAgICBjb25zdCBtb2RpZmllcnMgPSBbXTtcbiAgICBsZXQgYnJhY2tldERlcHRoID0gMDtcbiAgICBsZXQgbW9kaWZpZXJTdGFydCA9IDA7XG4gICAgbGV0IHBvc3RmaXhNb2RpZmllclBvc2l0aW9uO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBjbGFzc05hbWUubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICBsZXQgY3VycmVudENoYXJhY3RlciA9IGNsYXNzTmFtZVtpbmRleF07XG4gICAgICBpZiAoYnJhY2tldERlcHRoID09PSAwKSB7XG4gICAgICAgIGlmIChjdXJyZW50Q2hhcmFjdGVyID09PSBmaXJzdFNlcGFyYXRvckNoYXJhY3RlciAmJiAoaXNTZXBhcmF0b3JTaW5nbGVDaGFyYWN0ZXIgfHwgY2xhc3NOYW1lLnNsaWNlKGluZGV4LCBpbmRleCArIHNlcGFyYXRvckxlbmd0aCkgPT09IHNlcGFyYXRvcikpIHtcbiAgICAgICAgICBtb2RpZmllcnMucHVzaChjbGFzc05hbWUuc2xpY2UobW9kaWZpZXJTdGFydCwgaW5kZXgpKTtcbiAgICAgICAgICBtb2RpZmllclN0YXJ0ID0gaW5kZXggKyBzZXBhcmF0b3JMZW5ndGg7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN1cnJlbnRDaGFyYWN0ZXIgPT09ICcvJykge1xuICAgICAgICAgIHBvc3RmaXhNb2RpZmllclBvc2l0aW9uID0gaW5kZXg7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjdXJyZW50Q2hhcmFjdGVyID09PSAnWycpIHtcbiAgICAgICAgYnJhY2tldERlcHRoKys7XG4gICAgICB9IGVsc2UgaWYgKGN1cnJlbnRDaGFyYWN0ZXIgPT09ICddJykge1xuICAgICAgICBicmFja2V0RGVwdGgtLTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgYmFzZUNsYXNzTmFtZVdpdGhJbXBvcnRhbnRNb2RpZmllciA9IG1vZGlmaWVycy5sZW5ndGggPT09IDAgPyBjbGFzc05hbWUgOiBjbGFzc05hbWUuc3Vic3RyaW5nKG1vZGlmaWVyU3RhcnQpO1xuICAgIGNvbnN0IGhhc0ltcG9ydGFudE1vZGlmaWVyID0gYmFzZUNsYXNzTmFtZVdpdGhJbXBvcnRhbnRNb2RpZmllci5zdGFydHNXaXRoKElNUE9SVEFOVF9NT0RJRklFUik7XG4gICAgY29uc3QgYmFzZUNsYXNzTmFtZSA9IGhhc0ltcG9ydGFudE1vZGlmaWVyID8gYmFzZUNsYXNzTmFtZVdpdGhJbXBvcnRhbnRNb2RpZmllci5zdWJzdHJpbmcoMSkgOiBiYXNlQ2xhc3NOYW1lV2l0aEltcG9ydGFudE1vZGlmaWVyO1xuICAgIGNvbnN0IG1heWJlUG9zdGZpeE1vZGlmaWVyUG9zaXRpb24gPSBwb3N0Zml4TW9kaWZpZXJQb3NpdGlvbiAmJiBwb3N0Zml4TW9kaWZpZXJQb3NpdGlvbiA+IG1vZGlmaWVyU3RhcnQgPyBwb3N0Zml4TW9kaWZpZXJQb3NpdGlvbiAtIG1vZGlmaWVyU3RhcnQgOiB1bmRlZmluZWQ7XG4gICAgcmV0dXJuIHtcbiAgICAgIG1vZGlmaWVycyxcbiAgICAgIGhhc0ltcG9ydGFudE1vZGlmaWVyLFxuICAgICAgYmFzZUNsYXNzTmFtZSxcbiAgICAgIG1heWJlUG9zdGZpeE1vZGlmaWVyUG9zaXRpb25cbiAgICB9O1xuICB9XG4gIGlmIChleHBlcmltZW50YWxQYXJzZUNsYXNzTmFtZSkge1xuICAgIHJldHVybiBmdW5jdGlvbiBwYXJzZUNsYXNzTmFtZUV4cGVyaW1lbnRhbChjbGFzc05hbWUpIHtcbiAgICAgIHJldHVybiBleHBlcmltZW50YWxQYXJzZUNsYXNzTmFtZSh7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgcGFyc2VDbGFzc05hbWVcbiAgICAgIH0pO1xuICAgIH07XG4gIH1cbiAgcmV0dXJuIHBhcnNlQ2xhc3NOYW1lO1xufVxuLyoqXG4gKiBTb3J0cyBtb2RpZmllcnMgYWNjb3JkaW5nIHRvIGZvbGxvd2luZyBzY2hlbWE6XG4gKiAtIFByZWRlZmluZWQgbW9kaWZpZXJzIGFyZSBzb3J0ZWQgYWxwaGFiZXRpY2FsbHlcbiAqIC0gV2hlbiBhbiBhcmJpdHJhcnkgdmFyaWFudCBhcHBlYXJzLCBpdCBtdXN0IGJlIHByZXNlcnZlZCB3aGljaCBtb2RpZmllcnMgYXJlIGJlZm9yZSBhbmQgYWZ0ZXIgaXRcbiAqL1xuZnVuY3Rpb24gc29ydE1vZGlmaWVycyhtb2RpZmllcnMpIHtcbiAgaWYgKG1vZGlmaWVycy5sZW5ndGggPD0gMSkge1xuICAgIHJldHVybiBtb2RpZmllcnM7XG4gIH1cbiAgY29uc3Qgc29ydGVkTW9kaWZpZXJzID0gW107XG4gIGxldCB1bnNvcnRlZE1vZGlmaWVycyA9IFtdO1xuICBtb2RpZmllcnMuZm9yRWFjaChtb2RpZmllciA9PiB7XG4gICAgY29uc3QgaXNBcmJpdHJhcnlWYXJpYW50ID0gbW9kaWZpZXJbMF0gPT09ICdbJztcbiAgICBpZiAoaXNBcmJpdHJhcnlWYXJpYW50KSB7XG4gICAgICBzb3J0ZWRNb2RpZmllcnMucHVzaCguLi51bnNvcnRlZE1vZGlmaWVycy5zb3J0KCksIG1vZGlmaWVyKTtcbiAgICAgIHVuc29ydGVkTW9kaWZpZXJzID0gW107XG4gICAgfSBlbHNlIHtcbiAgICAgIHVuc29ydGVkTW9kaWZpZXJzLnB1c2gobW9kaWZpZXIpO1xuICAgIH1cbiAgfSk7XG4gIHNvcnRlZE1vZGlmaWVycy5wdXNoKC4uLnVuc29ydGVkTW9kaWZpZXJzLnNvcnQoKSk7XG4gIHJldHVybiBzb3J0ZWRNb2RpZmllcnM7XG59XG5mdW5jdGlvbiBjcmVhdGVDb25maWdVdGlscyhjb25maWcpIHtcbiAgcmV0dXJuIHtcbiAgICBjYWNoZTogY3JlYXRlTHJ1Q2FjaGUoY29uZmlnLmNhY2hlU2l6ZSksXG4gICAgcGFyc2VDbGFzc05hbWU6IGNyZWF0ZVBhcnNlQ2xhc3NOYW1lKGNvbmZpZyksXG4gICAgLi4uY3JlYXRlQ2xhc3NHcm91cFV0aWxzKGNvbmZpZylcbiAgfTtcbn1cbmNvbnN0IFNQTElUX0NMQVNTRVNfUkVHRVggPSAvXFxzKy87XG5mdW5jdGlvbiBtZXJnZUNsYXNzTGlzdChjbGFzc0xpc3QsIGNvbmZpZ1V0aWxzKSB7XG4gIGNvbnN0IHtcbiAgICBwYXJzZUNsYXNzTmFtZSxcbiAgICBnZXRDbGFzc0dyb3VwSWQsXG4gICAgZ2V0Q29uZmxpY3RpbmdDbGFzc0dyb3VwSWRzXG4gIH0gPSBjb25maWdVdGlscztcbiAgLyoqXG4gICAqIFNldCBvZiBjbGFzc0dyb3VwSWRzIGluIGZvbGxvd2luZyBmb3JtYXQ6XG4gICAqIGB7aW1wb3J0YW50TW9kaWZpZXJ9e3ZhcmlhbnRNb2RpZmllcnN9e2NsYXNzR3JvdXBJZH1gXG4gICAqIEBleGFtcGxlICdmbG9hdCdcbiAgICogQGV4YW1wbGUgJ2hvdmVyOmZvY3VzOmJnLWNvbG9yJ1xuICAgKiBAZXhhbXBsZSAnbWQ6IXByJ1xuICAgKi9cbiAgY29uc3QgY2xhc3NHcm91cHNJbkNvbmZsaWN0ID0gbmV3IFNldCgpO1xuICByZXR1cm4gY2xhc3NMaXN0LnRyaW0oKS5zcGxpdChTUExJVF9DTEFTU0VTX1JFR0VYKS5tYXAob3JpZ2luYWxDbGFzc05hbWUgPT4ge1xuICAgIGNvbnN0IHtcbiAgICAgIG1vZGlmaWVycyxcbiAgICAgIGhhc0ltcG9ydGFudE1vZGlmaWVyLFxuICAgICAgYmFzZUNsYXNzTmFtZSxcbiAgICAgIG1heWJlUG9zdGZpeE1vZGlmaWVyUG9zaXRpb25cbiAgICB9ID0gcGFyc2VDbGFzc05hbWUob3JpZ2luYWxDbGFzc05hbWUpO1xuICAgIGxldCBoYXNQb3N0Zml4TW9kaWZpZXIgPSBCb29sZWFuKG1heWJlUG9zdGZpeE1vZGlmaWVyUG9zaXRpb24pO1xuICAgIGxldCBjbGFzc0dyb3VwSWQgPSBnZXRDbGFzc0dyb3VwSWQoaGFzUG9zdGZpeE1vZGlmaWVyID8gYmFzZUNsYXNzTmFtZS5zdWJzdHJpbmcoMCwgbWF5YmVQb3N0Zml4TW9kaWZpZXJQb3NpdGlvbikgOiBiYXNlQ2xhc3NOYW1lKTtcbiAgICBpZiAoIWNsYXNzR3JvdXBJZCkge1xuICAgICAgaWYgKCFoYXNQb3N0Zml4TW9kaWZpZXIpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBpc1RhaWx3aW5kQ2xhc3M6IGZhbHNlLFxuICAgICAgICAgIG9yaWdpbmFsQ2xhc3NOYW1lXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBjbGFzc0dyb3VwSWQgPSBnZXRDbGFzc0dyb3VwSWQoYmFzZUNsYXNzTmFtZSk7XG4gICAgICBpZiAoIWNsYXNzR3JvdXBJZCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGlzVGFpbHdpbmRDbGFzczogZmFsc2UsXG4gICAgICAgICAgb3JpZ2luYWxDbGFzc05hbWVcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGhhc1Bvc3RmaXhNb2RpZmllciA9IGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCB2YXJpYW50TW9kaWZpZXIgPSBzb3J0TW9kaWZpZXJzKG1vZGlmaWVycykuam9pbignOicpO1xuICAgIGNvbnN0IG1vZGlmaWVySWQgPSBoYXNJbXBvcnRhbnRNb2RpZmllciA/IHZhcmlhbnRNb2RpZmllciArIElNUE9SVEFOVF9NT0RJRklFUiA6IHZhcmlhbnRNb2RpZmllcjtcbiAgICByZXR1cm4ge1xuICAgICAgaXNUYWlsd2luZENsYXNzOiB0cnVlLFxuICAgICAgbW9kaWZpZXJJZCxcbiAgICAgIGNsYXNzR3JvdXBJZCxcbiAgICAgIG9yaWdpbmFsQ2xhc3NOYW1lLFxuICAgICAgaGFzUG9zdGZpeE1vZGlmaWVyXG4gICAgfTtcbiAgfSkucmV2ZXJzZSgpXG4gIC8vIExhc3QgY2xhc3MgaW4gY29uZmxpY3Qgd2lucywgc28gd2UgbmVlZCB0byBmaWx0ZXIgY29uZmxpY3RpbmcgY2xhc3NlcyBpbiByZXZlcnNlIG9yZGVyLlxuICAuZmlsdGVyKHBhcnNlZCA9PiB7XG4gICAgaWYgKCFwYXJzZWQuaXNUYWlsd2luZENsYXNzKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3Qge1xuICAgICAgbW9kaWZpZXJJZCxcbiAgICAgIGNsYXNzR3JvdXBJZCxcbiAgICAgIGhhc1Bvc3RmaXhNb2RpZmllclxuICAgIH0gPSBwYXJzZWQ7XG4gICAgY29uc3QgY2xhc3NJZCA9IG1vZGlmaWVySWQgKyBjbGFzc0dyb3VwSWQ7XG4gICAgaWYgKGNsYXNzR3JvdXBzSW5Db25mbGljdC5oYXMoY2xhc3NJZCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY2xhc3NHcm91cHNJbkNvbmZsaWN0LmFkZChjbGFzc0lkKTtcbiAgICBnZXRDb25mbGljdGluZ0NsYXNzR3JvdXBJZHMoY2xhc3NHcm91cElkLCBoYXNQb3N0Zml4TW9kaWZpZXIpLmZvckVhY2goZ3JvdXAgPT4gY2xhc3NHcm91cHNJbkNvbmZsaWN0LmFkZChtb2RpZmllcklkICsgZ3JvdXApKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSkucmV2ZXJzZSgpLm1hcChwYXJzZWQgPT4gcGFyc2VkLm9yaWdpbmFsQ2xhc3NOYW1lKS5qb2luKCcgJyk7XG59XG5cbi8qKlxuICogVGhlIGNvZGUgaW4gdGhpcyBmaWxlIGlzIGNvcGllZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9sdWtlZWQvY2xzeCBhbmQgbW9kaWZpZWQgdG8gc3VpdCB0aGUgbmVlZHMgb2YgdGFpbHdpbmQtbWVyZ2UgYmV0dGVyLlxuICpcbiAqIFNwZWNpZmljYWxseTpcbiAqIC0gUnVudGltZSBjb2RlIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2x1a2VlZC9jbHN4L2Jsb2IvdjEuMi4xL3NyYy9pbmRleC5qc1xuICogLSBUeXBlU2NyaXB0IHR5cGVzIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2x1a2VlZC9jbHN4L2Jsb2IvdjEuMi4xL2Nsc3guZC50c1xuICpcbiAqIE9yaWdpbmFsIGNvZGUgaGFzIE1JVCBsaWNlbnNlOiBDb3B5cmlnaHQgKGMpIEx1a2UgRWR3YXJkcyA8bHVrZS5lZHdhcmRzMDVAZ21haWwuY29tPiAobHVrZWVkLmNvbSlcbiAqL1xuZnVuY3Rpb24gdHdKb2luKCkge1xuICBsZXQgaW5kZXggPSAwO1xuICBsZXQgYXJndW1lbnQ7XG4gIGxldCByZXNvbHZlZFZhbHVlO1xuICBsZXQgc3RyaW5nID0gJyc7XG4gIHdoaWxlIChpbmRleCA8IGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICBpZiAoYXJndW1lbnQgPSBhcmd1bWVudHNbaW5kZXgrK10pIHtcbiAgICAgIGlmIChyZXNvbHZlZFZhbHVlID0gdG9WYWx1ZShhcmd1bWVudCkpIHtcbiAgICAgICAgc3RyaW5nICYmIChzdHJpbmcgKz0gJyAnKTtcbiAgICAgICAgc3RyaW5nICs9IHJlc29sdmVkVmFsdWU7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBzdHJpbmc7XG59XG5mdW5jdGlvbiB0b1ZhbHVlKG1peCkge1xuICBpZiAodHlwZW9mIG1peCA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbWl4O1xuICB9XG4gIGxldCByZXNvbHZlZFZhbHVlO1xuICBsZXQgc3RyaW5nID0gJyc7XG4gIGZvciAobGV0IGsgPSAwOyBrIDwgbWl4Lmxlbmd0aDsgaysrKSB7XG4gICAgaWYgKG1peFtrXSkge1xuICAgICAgaWYgKHJlc29sdmVkVmFsdWUgPSB0b1ZhbHVlKG1peFtrXSkpIHtcbiAgICAgICAgc3RyaW5nICYmIChzdHJpbmcgKz0gJyAnKTtcbiAgICAgICAgc3RyaW5nICs9IHJlc29sdmVkVmFsdWU7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBzdHJpbmc7XG59XG5mdW5jdGlvbiBjcmVhdGVUYWlsd2luZE1lcmdlKGNyZWF0ZUNvbmZpZ0ZpcnN0LCAuLi5jcmVhdGVDb25maWdSZXN0KSB7XG4gIGxldCBjb25maWdVdGlscztcbiAgbGV0IGNhY2hlR2V0O1xuICBsZXQgY2FjaGVTZXQ7XG4gIGxldCBmdW5jdGlvblRvQ2FsbCA9IGluaXRUYWlsd2luZE1lcmdlO1xuICBmdW5jdGlvbiBpbml0VGFpbHdpbmRNZXJnZShjbGFzc0xpc3QpIHtcbiAgICBjb25zdCBjb25maWcgPSBjcmVhdGVDb25maWdSZXN0LnJlZHVjZSgocHJldmlvdXNDb25maWcsIGNyZWF0ZUNvbmZpZ0N1cnJlbnQpID0+IGNyZWF0ZUNvbmZpZ0N1cnJlbnQocHJldmlvdXNDb25maWcpLCBjcmVhdGVDb25maWdGaXJzdCgpKTtcbiAgICBjb25maWdVdGlscyA9IGNyZWF0ZUNvbmZpZ1V0aWxzKGNvbmZpZyk7XG4gICAgY2FjaGVHZXQgPSBjb25maWdVdGlscy5jYWNoZS5nZXQ7XG4gICAgY2FjaGVTZXQgPSBjb25maWdVdGlscy5jYWNoZS5zZXQ7XG4gICAgZnVuY3Rpb25Ub0NhbGwgPSB0YWlsd2luZE1lcmdlO1xuICAgIHJldHVybiB0YWlsd2luZE1lcmdlKGNsYXNzTGlzdCk7XG4gIH1cbiAgZnVuY3Rpb24gdGFpbHdpbmRNZXJnZShjbGFzc0xpc3QpIHtcbiAgICBjb25zdCBjYWNoZWRSZXN1bHQgPSBjYWNoZUdldChjbGFzc0xpc3QpO1xuICAgIGlmIChjYWNoZWRSZXN1bHQpIHtcbiAgICAgIHJldHVybiBjYWNoZWRSZXN1bHQ7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IG1lcmdlQ2xhc3NMaXN0KGNsYXNzTGlzdCwgY29uZmlnVXRpbHMpO1xuICAgIGNhY2hlU2V0KGNsYXNzTGlzdCwgcmVzdWx0KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIHJldHVybiBmdW5jdGlvbiBjYWxsVGFpbHdpbmRNZXJnZSgpIHtcbiAgICByZXR1cm4gZnVuY3Rpb25Ub0NhbGwodHdKb2luLmFwcGx5KG51bGwsIGFyZ3VtZW50cykpO1xuICB9O1xufVxuZnVuY3Rpb24gZnJvbVRoZW1lKGtleSkge1xuICBjb25zdCB0aGVtZUdldHRlciA9IHRoZW1lID0+IHRoZW1lW2tleV0gfHwgW107XG4gIHRoZW1lR2V0dGVyLmlzVGhlbWVHZXR0ZXIgPSB0cnVlO1xuICByZXR1cm4gdGhlbWVHZXR0ZXI7XG59XG5jb25zdCBhcmJpdHJhcnlWYWx1ZVJlZ2V4ID0gL15cXFsoPzooW2Etei1dKyk6KT8oLispXFxdJC9pO1xuY29uc3QgZnJhY3Rpb25SZWdleCA9IC9eXFxkK1xcL1xcZCskLztcbmNvbnN0IHN0cmluZ0xlbmd0aHMgPSAvKiNfX1BVUkVfXyovbmV3IFNldChbJ3B4JywgJ2Z1bGwnLCAnc2NyZWVuJ10pO1xuY29uc3QgdHNoaXJ0VW5pdFJlZ2V4ID0gL14oXFxkKyhcXC5cXGQrKT8pPyh4c3xzbXxtZHxsZ3x4bCkkLztcbmNvbnN0IGxlbmd0aFVuaXRSZWdleCA9IC9cXGQrKCV8cHh8cj9lbXxbc2RsXT92KFtod2liXXxtaW58bWF4KXxwdHxwY3xpbnxjbXxtbXxjYXB8Y2h8ZXh8cj9saHxjcSh3fGh8aXxifG1pbnxtYXgpKXxcXGIoY2FsY3xtaW58bWF4fGNsYW1wKVxcKC4rXFwpfF4wJC87XG5jb25zdCBjb2xvckZ1bmN0aW9uUmVnZXggPSAvXihyZ2JhP3xoc2xhP3xod2J8KG9rKT8obGFifGxjaCkpXFwoLitcXCkkLztcbi8vIFNoYWRvdyBhbHdheXMgYmVnaW5zIHdpdGggeCBhbmQgeSBvZmZzZXQgc2VwYXJhdGVkIGJ5IHVuZGVyc2NvcmUgb3B0aW9uYWxseSBwcmVwZW5kZWQgYnkgaW5zZXRcbmNvbnN0IHNoYWRvd1JlZ2V4ID0gL14oaW5zZXRfKT8tPygoXFxkKyk/XFwuPyhcXGQrKVthLXpdK3wwKV8tPygoXFxkKyk/XFwuPyhcXGQrKVthLXpdK3wwKS87XG5jb25zdCBpbWFnZVJlZ2V4ID0gL14odXJsfGltYWdlfGltYWdlLXNldHxjcm9zcy1mYWRlfGVsZW1lbnR8KHJlcGVhdGluZy0pPyhsaW5lYXJ8cmFkaWFsfGNvbmljKS1ncmFkaWVudClcXCguK1xcKSQvO1xuZnVuY3Rpb24gaXNMZW5ndGgodmFsdWUpIHtcbiAgcmV0dXJuIGlzTnVtYmVyKHZhbHVlKSB8fCBzdHJpbmdMZW5ndGhzLmhhcyh2YWx1ZSkgfHwgZnJhY3Rpb25SZWdleC50ZXN0KHZhbHVlKTtcbn1cbmZ1bmN0aW9uIGlzQXJiaXRyYXJ5TGVuZ3RoKHZhbHVlKSB7XG4gIHJldHVybiBnZXRJc0FyYml0cmFyeVZhbHVlKHZhbHVlLCAnbGVuZ3RoJywgaXNMZW5ndGhPbmx5KTtcbn1cbmZ1bmN0aW9uIGlzTnVtYmVyKHZhbHVlKSB7XG4gIHJldHVybiBCb29sZWFuKHZhbHVlKSAmJiAhTnVtYmVyLmlzTmFOKE51bWJlcih2YWx1ZSkpO1xufVxuZnVuY3Rpb24gaXNBcmJpdHJhcnlOdW1iZXIodmFsdWUpIHtcbiAgcmV0dXJuIGdldElzQXJiaXRyYXJ5VmFsdWUodmFsdWUsICdudW1iZXInLCBpc051bWJlcik7XG59XG5mdW5jdGlvbiBpc0ludGVnZXIodmFsdWUpIHtcbiAgcmV0dXJuIEJvb2xlYW4odmFsdWUpICYmIE51bWJlci5pc0ludGVnZXIoTnVtYmVyKHZhbHVlKSk7XG59XG5mdW5jdGlvbiBpc1BlcmNlbnQodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlLmVuZHNXaXRoKCclJykgJiYgaXNOdW1iZXIodmFsdWUuc2xpY2UoMCwgLTEpKTtcbn1cbmZ1bmN0aW9uIGlzQXJiaXRyYXJ5VmFsdWUodmFsdWUpIHtcbiAgcmV0dXJuIGFyYml0cmFyeVZhbHVlUmVnZXgudGVzdCh2YWx1ZSk7XG59XG5mdW5jdGlvbiBpc1RzaGlydFNpemUodmFsdWUpIHtcbiAgcmV0dXJuIHRzaGlydFVuaXRSZWdleC50ZXN0KHZhbHVlKTtcbn1cbmNvbnN0IHNpemVMYWJlbHMgPSAvKiNfX1BVUkVfXyovbmV3IFNldChbJ2xlbmd0aCcsICdzaXplJywgJ3BlcmNlbnRhZ2UnXSk7XG5mdW5jdGlvbiBpc0FyYml0cmFyeVNpemUodmFsdWUpIHtcbiAgcmV0dXJuIGdldElzQXJiaXRyYXJ5VmFsdWUodmFsdWUsIHNpemVMYWJlbHMsIGlzTmV2ZXIpO1xufVxuZnVuY3Rpb24gaXNBcmJpdHJhcnlQb3NpdGlvbih2YWx1ZSkge1xuICByZXR1cm4gZ2V0SXNBcmJpdHJhcnlWYWx1ZSh2YWx1ZSwgJ3Bvc2l0aW9uJywgaXNOZXZlcik7XG59XG5jb25zdCBpbWFnZUxhYmVscyA9IC8qI19fUFVSRV9fKi9uZXcgU2V0KFsnaW1hZ2UnLCAndXJsJ10pO1xuZnVuY3Rpb24gaXNBcmJpdHJhcnlJbWFnZSh2YWx1ZSkge1xuICByZXR1cm4gZ2V0SXNBcmJpdHJhcnlWYWx1ZSh2YWx1ZSwgaW1hZ2VMYWJlbHMsIGlzSW1hZ2UpO1xufVxuZnVuY3Rpb24gaXNBcmJpdHJhcnlTaGFkb3codmFsdWUpIHtcbiAgcmV0dXJuIGdldElzQXJiaXRyYXJ5VmFsdWUodmFsdWUsICcnLCBpc1NoYWRvdyk7XG59XG5mdW5jdGlvbiBpc0FueSgpIHtcbiAgcmV0dXJuIHRydWU7XG59XG5mdW5jdGlvbiBnZXRJc0FyYml0cmFyeVZhbHVlKHZhbHVlLCBsYWJlbCwgdGVzdFZhbHVlKSB7XG4gIGNvbnN0IHJlc3VsdCA9IGFyYml0cmFyeVZhbHVlUmVnZXguZXhlYyh2YWx1ZSk7XG4gIGlmIChyZXN1bHQpIHtcbiAgICBpZiAocmVzdWx0WzFdKSB7XG4gICAgICByZXR1cm4gdHlwZW9mIGxhYmVsID09PSAnc3RyaW5nJyA/IHJlc3VsdFsxXSA9PT0gbGFiZWwgOiBsYWJlbC5oYXMocmVzdWx0WzFdKTtcbiAgICB9XG4gICAgcmV0dXJuIHRlc3RWYWx1ZShyZXN1bHRbMl0pO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cbmZ1bmN0aW9uIGlzTGVuZ3RoT25seSh2YWx1ZSkge1xuICAvLyBgY29sb3JGdW5jdGlvblJlZ2V4YCBjaGVjayBpcyBuZWNlc3NhcnkgYmVjYXVzZSBjb2xvciBmdW5jdGlvbnMgY2FuIGhhdmUgcGVyY2VudGFnZXMgaW4gdGhlbSB3aGljaCB3aGljaCB3b3VsZCBiZSBpbmNvcnJlY3RseSBjbGFzc2lmaWVkIGFzIGxlbmd0aHMuXG4gIC8vIEZvciBleGFtcGxlLCBgaHNsKDAgMCUgMCUpYCB3b3VsZCBiZSBjbGFzc2lmaWVkIGFzIGEgbGVuZ3RoIHdpdGhvdXQgdGhpcyBjaGVjay5cbiAgLy8gSSBjb3VsZCBhbHNvIHVzZSBsb29rYmVoaW5kIGFzc2VydGlvbiBpbiBgbGVuZ3RoVW5pdFJlZ2V4YCBidXQgdGhhdCBpc24ndCBzdXBwb3J0ZWQgd2lkZWx5IGVub3VnaC5cbiAgcmV0dXJuIGxlbmd0aFVuaXRSZWdleC50ZXN0KHZhbHVlKSAmJiAhY29sb3JGdW5jdGlvblJlZ2V4LnRlc3QodmFsdWUpO1xufVxuZnVuY3Rpb24gaXNOZXZlcigpIHtcbiAgcmV0dXJuIGZhbHNlO1xufVxuZnVuY3Rpb24gaXNTaGFkb3codmFsdWUpIHtcbiAgcmV0dXJuIHNoYWRvd1JlZ2V4LnRlc3QodmFsdWUpO1xufVxuZnVuY3Rpb24gaXNJbWFnZSh2YWx1ZSkge1xuICByZXR1cm4gaW1hZ2VSZWdleC50ZXN0KHZhbHVlKTtcbn1cbmNvbnN0IHZhbGlkYXRvcnMgPSAvKiNfX1BVUkVfXyovT2JqZWN0LmRlZmluZVByb3BlcnR5KHtcbiAgX19wcm90b19fOiBudWxsLFxuICBpc0FueSxcbiAgaXNBcmJpdHJhcnlJbWFnZSxcbiAgaXNBcmJpdHJhcnlMZW5ndGgsXG4gIGlzQXJiaXRyYXJ5TnVtYmVyLFxuICBpc0FyYml0cmFyeVBvc2l0aW9uLFxuICBpc0FyYml0cmFyeVNoYWRvdyxcbiAgaXNBcmJpdHJhcnlTaXplLFxuICBpc0FyYml0cmFyeVZhbHVlLFxuICBpc0ludGVnZXIsXG4gIGlzTGVuZ3RoLFxuICBpc051bWJlcixcbiAgaXNQZXJjZW50LFxuICBpc1RzaGlydFNpemVcbn0sIFN5bWJvbC50b1N0cmluZ1RhZywge1xuICB2YWx1ZTogJ01vZHVsZSdcbn0pO1xuZnVuY3Rpb24gZ2V0RGVmYXVsdENvbmZpZygpIHtcbiAgY29uc3QgY29sb3JzID0gZnJvbVRoZW1lKCdjb2xvcnMnKTtcbiAgY29uc3Qgc3BhY2luZyA9IGZyb21UaGVtZSgnc3BhY2luZycpO1xuICBjb25zdCBibHVyID0gZnJvbVRoZW1lKCdibHVyJyk7XG4gIGNvbnN0IGJyaWdodG5lc3MgPSBmcm9tVGhlbWUoJ2JyaWdodG5lc3MnKTtcbiAgY29uc3QgYm9yZGVyQ29sb3IgPSBmcm9tVGhlbWUoJ2JvcmRlckNvbG9yJyk7XG4gIGNvbnN0IGJvcmRlclJhZGl1cyA9IGZyb21UaGVtZSgnYm9yZGVyUmFkaXVzJyk7XG4gIGNvbnN0IGJvcmRlclNwYWNpbmcgPSBmcm9tVGhlbWUoJ2JvcmRlclNwYWNpbmcnKTtcbiAgY29uc3QgYm9yZGVyV2lkdGggPSBmcm9tVGhlbWUoJ2JvcmRlcldpZHRoJyk7XG4gIGNvbnN0IGNvbnRyYXN0ID0gZnJvbVRoZW1lKCdjb250cmFzdCcpO1xuICBjb25zdCBncmF5c2NhbGUgPSBmcm9tVGhlbWUoJ2dyYXlzY2FsZScpO1xuICBjb25zdCBodWVSb3RhdGUgPSBmcm9tVGhlbWUoJ2h1ZVJvdGF0ZScpO1xuICBjb25zdCBpbnZlcnQgPSBmcm9tVGhlbWUoJ2ludmVydCcpO1xuICBjb25zdCBnYXAgPSBmcm9tVGhlbWUoJ2dhcCcpO1xuICBjb25zdCBncmFkaWVudENvbG9yU3RvcHMgPSBmcm9tVGhlbWUoJ2dyYWRpZW50Q29sb3JTdG9wcycpO1xuICBjb25zdCBncmFkaWVudENvbG9yU3RvcFBvc2l0aW9ucyA9IGZyb21UaGVtZSgnZ3JhZGllbnRDb2xvclN0b3BQb3NpdGlvbnMnKTtcbiAgY29uc3QgaW5zZXQgPSBmcm9tVGhlbWUoJ2luc2V0Jyk7XG4gIGNvbnN0IG1hcmdpbiA9IGZyb21UaGVtZSgnbWFyZ2luJyk7XG4gIGNvbnN0IG9wYWNpdHkgPSBmcm9tVGhlbWUoJ29wYWNpdHknKTtcbiAgY29uc3QgcGFkZGluZyA9IGZyb21UaGVtZSgncGFkZGluZycpO1xuICBjb25zdCBzYXR1cmF0ZSA9IGZyb21UaGVtZSgnc2F0dXJhdGUnKTtcbiAgY29uc3Qgc2NhbGUgPSBmcm9tVGhlbWUoJ3NjYWxlJyk7XG4gIGNvbnN0IHNlcGlhID0gZnJvbVRoZW1lKCdzZXBpYScpO1xuICBjb25zdCBza2V3ID0gZnJvbVRoZW1lKCdza2V3Jyk7XG4gIGNvbnN0IHNwYWNlID0gZnJvbVRoZW1lKCdzcGFjZScpO1xuICBjb25zdCB0cmFuc2xhdGUgPSBmcm9tVGhlbWUoJ3RyYW5zbGF0ZScpO1xuICBjb25zdCBnZXRPdmVyc2Nyb2xsID0gKCkgPT4gWydhdXRvJywgJ2NvbnRhaW4nLCAnbm9uZSddO1xuICBjb25zdCBnZXRPdmVyZmxvdyA9ICgpID0+IFsnYXV0bycsICdoaWRkZW4nLCAnY2xpcCcsICd2aXNpYmxlJywgJ3Njcm9sbCddO1xuICBjb25zdCBnZXRTcGFjaW5nV2l0aEF1dG9BbmRBcmJpdHJhcnkgPSAoKSA9PiBbJ2F1dG8nLCBpc0FyYml0cmFyeVZhbHVlLCBzcGFjaW5nXTtcbiAgY29uc3QgZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkgPSAoKSA9PiBbaXNBcmJpdHJhcnlWYWx1ZSwgc3BhY2luZ107XG4gIGNvbnN0IGdldExlbmd0aFdpdGhFbXB0eUFuZEFyYml0cmFyeSA9ICgpID0+IFsnJywgaXNMZW5ndGgsIGlzQXJiaXRyYXJ5TGVuZ3RoXTtcbiAgY29uc3QgZ2V0TnVtYmVyV2l0aEF1dG9BbmRBcmJpdHJhcnkgPSAoKSA9PiBbJ2F1dG8nLCBpc051bWJlciwgaXNBcmJpdHJhcnlWYWx1ZV07XG4gIGNvbnN0IGdldFBvc2l0aW9ucyA9ICgpID0+IFsnYm90dG9tJywgJ2NlbnRlcicsICdsZWZ0JywgJ2xlZnQtYm90dG9tJywgJ2xlZnQtdG9wJywgJ3JpZ2h0JywgJ3JpZ2h0LWJvdHRvbScsICdyaWdodC10b3AnLCAndG9wJ107XG4gIGNvbnN0IGdldExpbmVTdHlsZXMgPSAoKSA9PiBbJ3NvbGlkJywgJ2Rhc2hlZCcsICdkb3R0ZWQnLCAnZG91YmxlJywgJ25vbmUnXTtcbiAgY29uc3QgZ2V0QmxlbmRNb2RlcyA9ICgpID0+IFsnbm9ybWFsJywgJ211bHRpcGx5JywgJ3NjcmVlbicsICdvdmVybGF5JywgJ2RhcmtlbicsICdsaWdodGVuJywgJ2NvbG9yLWRvZGdlJywgJ2NvbG9yLWJ1cm4nLCAnaGFyZC1saWdodCcsICdzb2Z0LWxpZ2h0JywgJ2RpZmZlcmVuY2UnLCAnZXhjbHVzaW9uJywgJ2h1ZScsICdzYXR1cmF0aW9uJywgJ2NvbG9yJywgJ2x1bWlub3NpdHknXTtcbiAgY29uc3QgZ2V0QWxpZ24gPSAoKSA9PiBbJ3N0YXJ0JywgJ2VuZCcsICdjZW50ZXInLCAnYmV0d2VlbicsICdhcm91bmQnLCAnZXZlbmx5JywgJ3N0cmV0Y2gnXTtcbiAgY29uc3QgZ2V0WmVyb0FuZEVtcHR5ID0gKCkgPT4gWycnLCAnMCcsIGlzQXJiaXRyYXJ5VmFsdWVdO1xuICBjb25zdCBnZXRCcmVha3MgPSAoKSA9PiBbJ2F1dG8nLCAnYXZvaWQnLCAnYWxsJywgJ2F2b2lkLXBhZ2UnLCAncGFnZScsICdsZWZ0JywgJ3JpZ2h0JywgJ2NvbHVtbiddO1xuICBjb25zdCBnZXROdW1iZXIgPSAoKSA9PiBbaXNOdW1iZXIsIGlzQXJiaXRyYXJ5TnVtYmVyXTtcbiAgY29uc3QgZ2V0TnVtYmVyQW5kQXJiaXRyYXJ5ID0gKCkgPT4gW2lzTnVtYmVyLCBpc0FyYml0cmFyeVZhbHVlXTtcbiAgcmV0dXJuIHtcbiAgICBjYWNoZVNpemU6IDUwMCxcbiAgICBzZXBhcmF0b3I6ICc6JyxcbiAgICB0aGVtZToge1xuICAgICAgY29sb3JzOiBbaXNBbnldLFxuICAgICAgc3BhY2luZzogW2lzTGVuZ3RoLCBpc0FyYml0cmFyeUxlbmd0aF0sXG4gICAgICBibHVyOiBbJ25vbmUnLCAnJywgaXNUc2hpcnRTaXplLCBpc0FyYml0cmFyeVZhbHVlXSxcbiAgICAgIGJyaWdodG5lc3M6IGdldE51bWJlcigpLFxuICAgICAgYm9yZGVyQ29sb3I6IFtjb2xvcnNdLFxuICAgICAgYm9yZGVyUmFkaXVzOiBbJ25vbmUnLCAnJywgJ2Z1bGwnLCBpc1RzaGlydFNpemUsIGlzQXJiaXRyYXJ5VmFsdWVdLFxuICAgICAgYm9yZGVyU3BhY2luZzogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKSxcbiAgICAgIGJvcmRlcldpZHRoOiBnZXRMZW5ndGhXaXRoRW1wdHlBbmRBcmJpdHJhcnkoKSxcbiAgICAgIGNvbnRyYXN0OiBnZXROdW1iZXIoKSxcbiAgICAgIGdyYXlzY2FsZTogZ2V0WmVyb0FuZEVtcHR5KCksXG4gICAgICBodWVSb3RhdGU6IGdldE51bWJlckFuZEFyYml0cmFyeSgpLFxuICAgICAgaW52ZXJ0OiBnZXRaZXJvQW5kRW1wdHkoKSxcbiAgICAgIGdhcDogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKSxcbiAgICAgIGdyYWRpZW50Q29sb3JTdG9wczogW2NvbG9yc10sXG4gICAgICBncmFkaWVudENvbG9yU3RvcFBvc2l0aW9uczogW2lzUGVyY2VudCwgaXNBcmJpdHJhcnlMZW5ndGhdLFxuICAgICAgaW5zZXQ6IGdldFNwYWNpbmdXaXRoQXV0b0FuZEFyYml0cmFyeSgpLFxuICAgICAgbWFyZ2luOiBnZXRTcGFjaW5nV2l0aEF1dG9BbmRBcmJpdHJhcnkoKSxcbiAgICAgIG9wYWNpdHk6IGdldE51bWJlcigpLFxuICAgICAgcGFkZGluZzogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKSxcbiAgICAgIHNhdHVyYXRlOiBnZXROdW1iZXIoKSxcbiAgICAgIHNjYWxlOiBnZXROdW1iZXIoKSxcbiAgICAgIHNlcGlhOiBnZXRaZXJvQW5kRW1wdHkoKSxcbiAgICAgIHNrZXc6IGdldE51bWJlckFuZEFyYml0cmFyeSgpLFxuICAgICAgc3BhY2U6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KCksXG4gICAgICB0cmFuc2xhdGU6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICB9LFxuICAgIGNsYXNzR3JvdXBzOiB7XG4gICAgICAvLyBMYXlvdXRcbiAgICAgIC8qKlxuICAgICAgICogQXNwZWN0IFJhdGlvXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYXNwZWN0LXJhdGlvXG4gICAgICAgKi9cbiAgICAgIGFzcGVjdDogW3tcbiAgICAgICAgYXNwZWN0OiBbJ2F1dG8nLCAnc3F1YXJlJywgJ3ZpZGVvJywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBDb250YWluZXJcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9jb250YWluZXJcbiAgICAgICAqL1xuICAgICAgY29udGFpbmVyOiBbJ2NvbnRhaW5lciddLFxuICAgICAgLyoqXG4gICAgICAgKiBDb2x1bW5zXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvY29sdW1uc1xuICAgICAgICovXG4gICAgICBjb2x1bW5zOiBbe1xuICAgICAgICBjb2x1bW5zOiBbaXNUc2hpcnRTaXplXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJyZWFrIEFmdGVyXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYnJlYWstYWZ0ZXJcbiAgICAgICAqL1xuICAgICAgJ2JyZWFrLWFmdGVyJzogW3tcbiAgICAgICAgJ2JyZWFrLWFmdGVyJzogZ2V0QnJlYWtzKClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCcmVhayBCZWZvcmVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9icmVhay1iZWZvcmVcbiAgICAgICAqL1xuICAgICAgJ2JyZWFrLWJlZm9yZSc6IFt7XG4gICAgICAgICdicmVhay1iZWZvcmUnOiBnZXRCcmVha3MoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJyZWFrIEluc2lkZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JyZWFrLWluc2lkZVxuICAgICAgICovXG4gICAgICAnYnJlYWstaW5zaWRlJzogW3tcbiAgICAgICAgJ2JyZWFrLWluc2lkZSc6IFsnYXV0bycsICdhdm9pZCcsICdhdm9pZC1wYWdlJywgJ2F2b2lkLWNvbHVtbiddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm94IERlY29yYXRpb24gQnJlYWtcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3gtZGVjb3JhdGlvbi1icmVha1xuICAgICAgICovXG4gICAgICAnYm94LWRlY29yYXRpb24nOiBbe1xuICAgICAgICAnYm94LWRlY29yYXRpb24nOiBbJ3NsaWNlJywgJ2Nsb25lJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3ggU2l6aW5nXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm94LXNpemluZ1xuICAgICAgICovXG4gICAgICBib3g6IFt7XG4gICAgICAgIGJveDogWydib3JkZXInLCAnY29udGVudCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRGlzcGxheVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2Rpc3BsYXlcbiAgICAgICAqL1xuICAgICAgZGlzcGxheTogWydibG9jaycsICdpbmxpbmUtYmxvY2snLCAnaW5saW5lJywgJ2ZsZXgnLCAnaW5saW5lLWZsZXgnLCAndGFibGUnLCAnaW5saW5lLXRhYmxlJywgJ3RhYmxlLWNhcHRpb24nLCAndGFibGUtY2VsbCcsICd0YWJsZS1jb2x1bW4nLCAndGFibGUtY29sdW1uLWdyb3VwJywgJ3RhYmxlLWZvb3Rlci1ncm91cCcsICd0YWJsZS1oZWFkZXItZ3JvdXAnLCAndGFibGUtcm93LWdyb3VwJywgJ3RhYmxlLXJvdycsICdmbG93LXJvb3QnLCAnZ3JpZCcsICdpbmxpbmUtZ3JpZCcsICdjb250ZW50cycsICdsaXN0LWl0ZW0nLCAnaGlkZGVuJ10sXG4gICAgICAvKipcbiAgICAgICAqIEZsb2F0c1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2Zsb2F0XG4gICAgICAgKi9cbiAgICAgIGZsb2F0OiBbe1xuICAgICAgICBmbG9hdDogWydyaWdodCcsICdsZWZ0JywgJ25vbmUnLCAnc3RhcnQnLCAnZW5kJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBDbGVhclxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2NsZWFyXG4gICAgICAgKi9cbiAgICAgIGNsZWFyOiBbe1xuICAgICAgICBjbGVhcjogWydsZWZ0JywgJ3JpZ2h0JywgJ2JvdGgnLCAnbm9uZScsICdzdGFydCcsICdlbmQnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIElzb2xhdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2lzb2xhdGlvblxuICAgICAgICovXG4gICAgICBpc29sYXRpb246IFsnaXNvbGF0ZScsICdpc29sYXRpb24tYXV0byddLFxuICAgICAgLyoqXG4gICAgICAgKiBPYmplY3QgRml0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb2JqZWN0LWZpdFxuICAgICAgICovXG4gICAgICAnb2JqZWN0LWZpdCc6IFt7XG4gICAgICAgIG9iamVjdDogWydjb250YWluJywgJ2NvdmVyJywgJ2ZpbGwnLCAnbm9uZScsICdzY2FsZS1kb3duJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBPYmplY3QgUG9zaXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9vYmplY3QtcG9zaXRpb25cbiAgICAgICAqL1xuICAgICAgJ29iamVjdC1wb3NpdGlvbic6IFt7XG4gICAgICAgIG9iamVjdDogWy4uLmdldFBvc2l0aW9ucygpLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE92ZXJmbG93XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3ZlcmZsb3dcbiAgICAgICAqL1xuICAgICAgb3ZlcmZsb3c6IFt7XG4gICAgICAgIG92ZXJmbG93OiBnZXRPdmVyZmxvdygpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogT3ZlcmZsb3cgWFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL292ZXJmbG93XG4gICAgICAgKi9cbiAgICAgICdvdmVyZmxvdy14JzogW3tcbiAgICAgICAgJ292ZXJmbG93LXgnOiBnZXRPdmVyZmxvdygpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogT3ZlcmZsb3cgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL292ZXJmbG93XG4gICAgICAgKi9cbiAgICAgICdvdmVyZmxvdy15JzogW3tcbiAgICAgICAgJ292ZXJmbG93LXknOiBnZXRPdmVyZmxvdygpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogT3ZlcnNjcm9sbCBCZWhhdmlvclxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL292ZXJzY3JvbGwtYmVoYXZpb3JcbiAgICAgICAqL1xuICAgICAgb3ZlcnNjcm9sbDogW3tcbiAgICAgICAgb3ZlcnNjcm9sbDogZ2V0T3ZlcnNjcm9sbCgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogT3ZlcnNjcm9sbCBCZWhhdmlvciBYXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3ZlcnNjcm9sbC1iZWhhdmlvclxuICAgICAgICovXG4gICAgICAnb3ZlcnNjcm9sbC14JzogW3tcbiAgICAgICAgJ292ZXJzY3JvbGwteCc6IGdldE92ZXJzY3JvbGwoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE92ZXJzY3JvbGwgQmVoYXZpb3IgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL292ZXJzY3JvbGwtYmVoYXZpb3JcbiAgICAgICAqL1xuICAgICAgJ292ZXJzY3JvbGwteSc6IFt7XG4gICAgICAgICdvdmVyc2Nyb2xsLXknOiBnZXRPdmVyc2Nyb2xsKClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBQb3NpdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Bvc2l0aW9uXG4gICAgICAgKi9cbiAgICAgIHBvc2l0aW9uOiBbJ3N0YXRpYycsICdmaXhlZCcsICdhYnNvbHV0ZScsICdyZWxhdGl2ZScsICdzdGlja3knXSxcbiAgICAgIC8qKlxuICAgICAgICogVG9wIC8gUmlnaHQgLyBCb3R0b20gLyBMZWZ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdG9wLXJpZ2h0LWJvdHRvbS1sZWZ0XG4gICAgICAgKi9cbiAgICAgIGluc2V0OiBbe1xuICAgICAgICBpbnNldDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFJpZ2h0IC8gTGVmdFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvcC1yaWdodC1ib3R0b20tbGVmdFxuICAgICAgICovXG4gICAgICAnaW5zZXQteCc6IFt7XG4gICAgICAgICdpbnNldC14JzogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRvcCAvIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvcC1yaWdodC1ib3R0b20tbGVmdFxuICAgICAgICovXG4gICAgICAnaW5zZXQteSc6IFt7XG4gICAgICAgICdpbnNldC15JzogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFN0YXJ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdG9wLXJpZ2h0LWJvdHRvbS1sZWZ0XG4gICAgICAgKi9cbiAgICAgIHN0YXJ0OiBbe1xuICAgICAgICBzdGFydDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEVuZFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvcC1yaWdodC1ib3R0b20tbGVmdFxuICAgICAgICovXG4gICAgICBlbmQ6IFt7XG4gICAgICAgIGVuZDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRvcFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvcC1yaWdodC1ib3R0b20tbGVmdFxuICAgICAgICovXG4gICAgICB0b3A6IFt7XG4gICAgICAgIHRvcDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFJpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdG9wLXJpZ2h0LWJvdHRvbS1sZWZ0XG4gICAgICAgKi9cbiAgICAgIHJpZ2h0OiBbe1xuICAgICAgICByaWdodDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvcC1yaWdodC1ib3R0b20tbGVmdFxuICAgICAgICovXG4gICAgICBib3R0b206IFt7XG4gICAgICAgIGJvdHRvbTogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIExlZnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90b3AtcmlnaHQtYm90dG9tLWxlZnRcbiAgICAgICAqL1xuICAgICAgbGVmdDogW3tcbiAgICAgICAgbGVmdDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFZpc2liaWxpdHlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy92aXNpYmlsaXR5XG4gICAgICAgKi9cbiAgICAgIHZpc2liaWxpdHk6IFsndmlzaWJsZScsICdpbnZpc2libGUnLCAnY29sbGFwc2UnXSxcbiAgICAgIC8qKlxuICAgICAgICogWi1JbmRleFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3otaW5kZXhcbiAgICAgICAqL1xuICAgICAgejogW3tcbiAgICAgICAgejogWydhdXRvJywgaXNJbnRlZ2VyLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvLyBGbGV4Ym94IGFuZCBHcmlkXG4gICAgICAvKipcbiAgICAgICAqIEZsZXggQmFzaXNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mbGV4LWJhc2lzXG4gICAgICAgKi9cbiAgICAgIGJhc2lzOiBbe1xuICAgICAgICBiYXNpczogZ2V0U3BhY2luZ1dpdGhBdXRvQW5kQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBGbGV4IERpcmVjdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZsZXgtZGlyZWN0aW9uXG4gICAgICAgKi9cbiAgICAgICdmbGV4LWRpcmVjdGlvbic6IFt7XG4gICAgICAgIGZsZXg6IFsncm93JywgJ3Jvdy1yZXZlcnNlJywgJ2NvbCcsICdjb2wtcmV2ZXJzZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRmxleCBXcmFwXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZmxleC13cmFwXG4gICAgICAgKi9cbiAgICAgICdmbGV4LXdyYXAnOiBbe1xuICAgICAgICBmbGV4OiBbJ3dyYXAnLCAnd3JhcC1yZXZlcnNlJywgJ25vd3JhcCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRmxleFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZsZXhcbiAgICAgICAqL1xuICAgICAgZmxleDogW3tcbiAgICAgICAgZmxleDogWycxJywgJ2F1dG8nLCAnaW5pdGlhbCcsICdub25lJywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBGbGV4IEdyb3dcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mbGV4LWdyb3dcbiAgICAgICAqL1xuICAgICAgZ3JvdzogW3tcbiAgICAgICAgZ3JvdzogZ2V0WmVyb0FuZEVtcHR5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBGbGV4IFNocmlua1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZsZXgtc2hyaW5rXG4gICAgICAgKi9cbiAgICAgIHNocmluazogW3tcbiAgICAgICAgc2hyaW5rOiBnZXRaZXJvQW5kRW1wdHkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE9yZGVyXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3JkZXJcbiAgICAgICAqL1xuICAgICAgb3JkZXI6IFt7XG4gICAgICAgIG9yZGVyOiBbJ2ZpcnN0JywgJ2xhc3QnLCAnbm9uZScsIGlzSW50ZWdlciwgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHcmlkIFRlbXBsYXRlIENvbHVtbnNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ncmlkLXRlbXBsYXRlLWNvbHVtbnNcbiAgICAgICAqL1xuICAgICAgJ2dyaWQtY29scyc6IFt7XG4gICAgICAgICdncmlkLWNvbHMnOiBbaXNBbnldXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JpZCBDb2x1bW4gU3RhcnQgLyBFbmRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ncmlkLWNvbHVtblxuICAgICAgICovXG4gICAgICAnY29sLXN0YXJ0LWVuZCc6IFt7XG4gICAgICAgIGNvbDogWydhdXRvJywge1xuICAgICAgICAgIHNwYW46IFsnZnVsbCcsIGlzSW50ZWdlciwgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgICAgfSwgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHcmlkIENvbHVtbiBTdGFydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dyaWQtY29sdW1uXG4gICAgICAgKi9cbiAgICAgICdjb2wtc3RhcnQnOiBbe1xuICAgICAgICAnY29sLXN0YXJ0JzogZ2V0TnVtYmVyV2l0aEF1dG9BbmRBcmJpdHJhcnkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyaWQgQ29sdW1uIEVuZFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dyaWQtY29sdW1uXG4gICAgICAgKi9cbiAgICAgICdjb2wtZW5kJzogW3tcbiAgICAgICAgJ2NvbC1lbmQnOiBnZXROdW1iZXJXaXRoQXV0b0FuZEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JpZCBUZW1wbGF0ZSBSb3dzXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JpZC10ZW1wbGF0ZS1yb3dzXG4gICAgICAgKi9cbiAgICAgICdncmlkLXJvd3MnOiBbe1xuICAgICAgICAnZ3JpZC1yb3dzJzogW2lzQW55XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyaWQgUm93IFN0YXJ0IC8gRW5kXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JpZC1yb3dcbiAgICAgICAqL1xuICAgICAgJ3Jvdy1zdGFydC1lbmQnOiBbe1xuICAgICAgICByb3c6IFsnYXV0bycsIHtcbiAgICAgICAgICBzcGFuOiBbaXNJbnRlZ2VyLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgICB9LCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyaWQgUm93IFN0YXJ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JpZC1yb3dcbiAgICAgICAqL1xuICAgICAgJ3Jvdy1zdGFydCc6IFt7XG4gICAgICAgICdyb3ctc3RhcnQnOiBnZXROdW1iZXJXaXRoQXV0b0FuZEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JpZCBSb3cgRW5kXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JpZC1yb3dcbiAgICAgICAqL1xuICAgICAgJ3Jvdy1lbmQnOiBbe1xuICAgICAgICAncm93LWVuZCc6IGdldE51bWJlcldpdGhBdXRvQW5kQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHcmlkIEF1dG8gRmxvd1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dyaWQtYXV0by1mbG93XG4gICAgICAgKi9cbiAgICAgICdncmlkLWZsb3cnOiBbe1xuICAgICAgICAnZ3JpZC1mbG93JzogWydyb3cnLCAnY29sJywgJ2RlbnNlJywgJ3Jvdy1kZW5zZScsICdjb2wtZGVuc2UnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyaWQgQXV0byBDb2x1bW5zXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JpZC1hdXRvLWNvbHVtbnNcbiAgICAgICAqL1xuICAgICAgJ2F1dG8tY29scyc6IFt7XG4gICAgICAgICdhdXRvLWNvbHMnOiBbJ2F1dG8nLCAnbWluJywgJ21heCcsICdmcicsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JpZCBBdXRvIFJvd3NcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ncmlkLWF1dG8tcm93c1xuICAgICAgICovXG4gICAgICAnYXV0by1yb3dzJzogW3tcbiAgICAgICAgJ2F1dG8tcm93cyc6IFsnYXV0bycsICdtaW4nLCAnbWF4JywgJ2ZyJywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHYXBcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9nYXBcbiAgICAgICAqL1xuICAgICAgZ2FwOiBbe1xuICAgICAgICBnYXA6IFtnYXBdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR2FwIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9nYXBcbiAgICAgICAqL1xuICAgICAgJ2dhcC14JzogW3tcbiAgICAgICAgJ2dhcC14JzogW2dhcF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHYXAgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dhcFxuICAgICAgICovXG4gICAgICAnZ2FwLXknOiBbe1xuICAgICAgICAnZ2FwLXknOiBbZ2FwXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEp1c3RpZnkgQ29udGVudFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2p1c3RpZnktY29udGVudFxuICAgICAgICovXG4gICAgICAnanVzdGlmeS1jb250ZW50JzogW3tcbiAgICAgICAganVzdGlmeTogWydub3JtYWwnLCAuLi5nZXRBbGlnbigpXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEp1c3RpZnkgSXRlbXNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9qdXN0aWZ5LWl0ZW1zXG4gICAgICAgKi9cbiAgICAgICdqdXN0aWZ5LWl0ZW1zJzogW3tcbiAgICAgICAgJ2p1c3RpZnktaXRlbXMnOiBbJ3N0YXJ0JywgJ2VuZCcsICdjZW50ZXInLCAnc3RyZXRjaCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogSnVzdGlmeSBTZWxmXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvanVzdGlmeS1zZWxmXG4gICAgICAgKi9cbiAgICAgICdqdXN0aWZ5LXNlbGYnOiBbe1xuICAgICAgICAnanVzdGlmeS1zZWxmJzogWydhdXRvJywgJ3N0YXJ0JywgJ2VuZCcsICdjZW50ZXInLCAnc3RyZXRjaCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQWxpZ24gQ29udGVudFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2FsaWduLWNvbnRlbnRcbiAgICAgICAqL1xuICAgICAgJ2FsaWduLWNvbnRlbnQnOiBbe1xuICAgICAgICBjb250ZW50OiBbJ25vcm1hbCcsIC4uLmdldEFsaWduKCksICdiYXNlbGluZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQWxpZ24gSXRlbXNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9hbGlnbi1pdGVtc1xuICAgICAgICovXG4gICAgICAnYWxpZ24taXRlbXMnOiBbe1xuICAgICAgICBpdGVtczogWydzdGFydCcsICdlbmQnLCAnY2VudGVyJywgJ2Jhc2VsaW5lJywgJ3N0cmV0Y2gnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEFsaWduIFNlbGZcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9hbGlnbi1zZWxmXG4gICAgICAgKi9cbiAgICAgICdhbGlnbi1zZWxmJzogW3tcbiAgICAgICAgc2VsZjogWydhdXRvJywgJ3N0YXJ0JywgJ2VuZCcsICdjZW50ZXInLCAnc3RyZXRjaCcsICdiYXNlbGluZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGxhY2UgQ29udGVudFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3BsYWNlLWNvbnRlbnRcbiAgICAgICAqL1xuICAgICAgJ3BsYWNlLWNvbnRlbnQnOiBbe1xuICAgICAgICAncGxhY2UtY29udGVudCc6IFsuLi5nZXRBbGlnbigpLCAnYmFzZWxpbmUnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFBsYWNlIEl0ZW1zXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcGxhY2UtaXRlbXNcbiAgICAgICAqL1xuICAgICAgJ3BsYWNlLWl0ZW1zJzogW3tcbiAgICAgICAgJ3BsYWNlLWl0ZW1zJzogWydzdGFydCcsICdlbmQnLCAnY2VudGVyJywgJ2Jhc2VsaW5lJywgJ3N0cmV0Y2gnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFBsYWNlIFNlbGZcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wbGFjZS1zZWxmXG4gICAgICAgKi9cbiAgICAgICdwbGFjZS1zZWxmJzogW3tcbiAgICAgICAgJ3BsYWNlLXNlbGYnOiBbJ2F1dG8nLCAnc3RhcnQnLCAnZW5kJywgJ2NlbnRlcicsICdzdHJldGNoJ11cbiAgICAgIH1dLFxuICAgICAgLy8gU3BhY2luZ1xuICAgICAgLyoqXG4gICAgICAgKiBQYWRkaW5nXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcGFkZGluZ1xuICAgICAgICovXG4gICAgICBwOiBbe1xuICAgICAgICBwOiBbcGFkZGluZ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBQYWRkaW5nIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgIHB4OiBbe1xuICAgICAgICBweDogW3BhZGRpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGFkZGluZyBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcGFkZGluZ1xuICAgICAgICovXG4gICAgICBweTogW3tcbiAgICAgICAgcHk6IFtwYWRkaW5nXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFBhZGRpbmcgU3RhcnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgIHBzOiBbe1xuICAgICAgICBwczogW3BhZGRpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGFkZGluZyBFbmRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgIHBlOiBbe1xuICAgICAgICBwZTogW3BhZGRpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGFkZGluZyBUb3BcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgIHB0OiBbe1xuICAgICAgICBwdDogW3BhZGRpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGFkZGluZyBSaWdodFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3BhZGRpbmdcbiAgICAgICAqL1xuICAgICAgcHI6IFt7XG4gICAgICAgIHByOiBbcGFkZGluZ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBQYWRkaW5nIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3BhZGRpbmdcbiAgICAgICAqL1xuICAgICAgcGI6IFt7XG4gICAgICAgIHBiOiBbcGFkZGluZ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBQYWRkaW5nIExlZnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgIHBsOiBbe1xuICAgICAgICBwbDogW3BhZGRpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogTWFyZ2luXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbWFyZ2luXG4gICAgICAgKi9cbiAgICAgIG06IFt7XG4gICAgICAgIG06IFttYXJnaW5dXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogTWFyZ2luIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXJnaW5cbiAgICAgICAqL1xuICAgICAgbXg6IFt7XG4gICAgICAgIG14OiBbbWFyZ2luXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1hcmdpbiBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbWFyZ2luXG4gICAgICAgKi9cbiAgICAgIG15OiBbe1xuICAgICAgICBteTogW21hcmdpbl1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBNYXJnaW4gU3RhcnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXJnaW5cbiAgICAgICAqL1xuICAgICAgbXM6IFt7XG4gICAgICAgIG1zOiBbbWFyZ2luXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1hcmdpbiBFbmRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXJnaW5cbiAgICAgICAqL1xuICAgICAgbWU6IFt7XG4gICAgICAgIG1lOiBbbWFyZ2luXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1hcmdpbiBUb3BcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXJnaW5cbiAgICAgICAqL1xuICAgICAgbXQ6IFt7XG4gICAgICAgIG10OiBbbWFyZ2luXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1hcmdpbiBSaWdodFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL21hcmdpblxuICAgICAgICovXG4gICAgICBtcjogW3tcbiAgICAgICAgbXI6IFttYXJnaW5dXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogTWFyZ2luIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL21hcmdpblxuICAgICAgICovXG4gICAgICBtYjogW3tcbiAgICAgICAgbWI6IFttYXJnaW5dXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogTWFyZ2luIExlZnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXJnaW5cbiAgICAgICAqL1xuICAgICAgbWw6IFt7XG4gICAgICAgIG1sOiBbbWFyZ2luXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNwYWNlIEJldHdlZW4gWFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3NwYWNlXG4gICAgICAgKi9cbiAgICAgICdzcGFjZS14JzogW3tcbiAgICAgICAgJ3NwYWNlLXgnOiBbc3BhY2VdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU3BhY2UgQmV0d2VlbiBYIFJldmVyc2VcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zcGFjZVxuICAgICAgICovXG4gICAgICAnc3BhY2UteC1yZXZlcnNlJzogWydzcGFjZS14LXJldmVyc2UnXSxcbiAgICAgIC8qKlxuICAgICAgICogU3BhY2UgQmV0d2VlbiBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc3BhY2VcbiAgICAgICAqL1xuICAgICAgJ3NwYWNlLXknOiBbe1xuICAgICAgICAnc3BhY2UteSc6IFtzcGFjZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTcGFjZSBCZXR3ZWVuIFkgUmV2ZXJzZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3NwYWNlXG4gICAgICAgKi9cbiAgICAgICdzcGFjZS15LXJldmVyc2UnOiBbJ3NwYWNlLXktcmV2ZXJzZSddLFxuICAgICAgLy8gU2l6aW5nXG4gICAgICAvKipcbiAgICAgICAqIFdpZHRoXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvd2lkdGhcbiAgICAgICAqL1xuICAgICAgdzogW3tcbiAgICAgICAgdzogWydhdXRvJywgJ21pbicsICdtYXgnLCAnZml0JywgJ3N2dycsICdsdncnLCAnZHZ3JywgaXNBcmJpdHJhcnlWYWx1ZSwgc3BhY2luZ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBNaW4tV2lkdGhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9taW4td2lkdGhcbiAgICAgICAqL1xuICAgICAgJ21pbi13JzogW3tcbiAgICAgICAgJ21pbi13JzogW2lzQXJiaXRyYXJ5VmFsdWUsIHNwYWNpbmcsICdtaW4nLCAnbWF4JywgJ2ZpdCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogTWF4LVdpZHRoXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbWF4LXdpZHRoXG4gICAgICAgKi9cbiAgICAgICdtYXgtdyc6IFt7XG4gICAgICAgICdtYXgtdyc6IFtpc0FyYml0cmFyeVZhbHVlLCBzcGFjaW5nLCAnbm9uZScsICdmdWxsJywgJ21pbicsICdtYXgnLCAnZml0JywgJ3Byb3NlJywge1xuICAgICAgICAgIHNjcmVlbjogW2lzVHNoaXJ0U2l6ZV1cbiAgICAgICAgfSwgaXNUc2hpcnRTaXplXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEhlaWdodFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2hlaWdodFxuICAgICAgICovXG4gICAgICBoOiBbe1xuICAgICAgICBoOiBbaXNBcmJpdHJhcnlWYWx1ZSwgc3BhY2luZywgJ2F1dG8nLCAnbWluJywgJ21heCcsICdmaXQnLCAnc3ZoJywgJ2x2aCcsICdkdmgnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1pbi1IZWlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9taW4taGVpZ2h0XG4gICAgICAgKi9cbiAgICAgICdtaW4taCc6IFt7XG4gICAgICAgICdtaW4taCc6IFtpc0FyYml0cmFyeVZhbHVlLCBzcGFjaW5nLCAnbWluJywgJ21heCcsICdmaXQnLCAnc3ZoJywgJ2x2aCcsICdkdmgnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1heC1IZWlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXgtaGVpZ2h0XG4gICAgICAgKi9cbiAgICAgICdtYXgtaCc6IFt7XG4gICAgICAgICdtYXgtaCc6IFtpc0FyYml0cmFyeVZhbHVlLCBzcGFjaW5nLCAnbWluJywgJ21heCcsICdmaXQnLCAnc3ZoJywgJ2x2aCcsICdkdmgnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNpemVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zaXplXG4gICAgICAgKi9cbiAgICAgIHNpemU6IFt7XG4gICAgICAgIHNpemU6IFtpc0FyYml0cmFyeVZhbHVlLCBzcGFjaW5nLCAnYXV0bycsICdtaW4nLCAnbWF4JywgJ2ZpdCddXG4gICAgICB9XSxcbiAgICAgIC8vIFR5cG9ncmFwaHlcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBTaXplXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZm9udC1zaXplXG4gICAgICAgKi9cbiAgICAgICdmb250LXNpemUnOiBbe1xuICAgICAgICB0ZXh0OiBbJ2Jhc2UnLCBpc1RzaGlydFNpemUsIGlzQXJiaXRyYXJ5TGVuZ3RoXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEZvbnQgU21vb3RoaW5nXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZm9udC1zbW9vdGhpbmdcbiAgICAgICAqL1xuICAgICAgJ2ZvbnQtc21vb3RoaW5nJzogWydhbnRpYWxpYXNlZCcsICdzdWJwaXhlbC1hbnRpYWxpYXNlZCddLFxuICAgICAgLyoqXG4gICAgICAgKiBGb250IFN0eWxlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZm9udC1zdHlsZVxuICAgICAgICovXG4gICAgICAnZm9udC1zdHlsZSc6IFsnaXRhbGljJywgJ25vdC1pdGFsaWMnXSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBXZWlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LXdlaWdodFxuICAgICAgICovXG4gICAgICAnZm9udC13ZWlnaHQnOiBbe1xuICAgICAgICBmb250OiBbJ3RoaW4nLCAnZXh0cmFsaWdodCcsICdsaWdodCcsICdub3JtYWwnLCAnbWVkaXVtJywgJ3NlbWlib2xkJywgJ2JvbGQnLCAnZXh0cmFib2xkJywgJ2JsYWNrJywgaXNBcmJpdHJhcnlOdW1iZXJdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBGYW1pbHlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LWZhbWlseVxuICAgICAgICovXG4gICAgICAnZm9udC1mYW1pbHknOiBbe1xuICAgICAgICBmb250OiBbaXNBbnldXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBWYXJpYW50IE51bWVyaWNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LXZhcmlhbnQtbnVtZXJpY1xuICAgICAgICovXG4gICAgICAnZnZuLW5vcm1hbCc6IFsnbm9ybWFsLW51bXMnXSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBWYXJpYW50IE51bWVyaWNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LXZhcmlhbnQtbnVtZXJpY1xuICAgICAgICovXG4gICAgICAnZnZuLW9yZGluYWwnOiBbJ29yZGluYWwnXSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBWYXJpYW50IE51bWVyaWNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LXZhcmlhbnQtbnVtZXJpY1xuICAgICAgICovXG4gICAgICAnZnZuLXNsYXNoZWQtemVybyc6IFsnc2xhc2hlZC16ZXJvJ10sXG4gICAgICAvKipcbiAgICAgICAqIEZvbnQgVmFyaWFudCBOdW1lcmljXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZm9udC12YXJpYW50LW51bWVyaWNcbiAgICAgICAqL1xuICAgICAgJ2Z2bi1maWd1cmUnOiBbJ2xpbmluZy1udW1zJywgJ29sZHN0eWxlLW51bXMnXSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBWYXJpYW50IE51bWVyaWNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LXZhcmlhbnQtbnVtZXJpY1xuICAgICAgICovXG4gICAgICAnZnZuLXNwYWNpbmcnOiBbJ3Byb3BvcnRpb25hbC1udW1zJywgJ3RhYnVsYXItbnVtcyddLFxuICAgICAgLyoqXG4gICAgICAgKiBGb250IFZhcmlhbnQgTnVtZXJpY1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZvbnQtdmFyaWFudC1udW1lcmljXG4gICAgICAgKi9cbiAgICAgICdmdm4tZnJhY3Rpb24nOiBbJ2RpYWdvbmFsLWZyYWN0aW9ucycsICdzdGFja2VkLWZyYWN0b25zJ10sXG4gICAgICAvKipcbiAgICAgICAqIExldHRlciBTcGFjaW5nXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbGV0dGVyLXNwYWNpbmdcbiAgICAgICAqL1xuICAgICAgdHJhY2tpbmc6IFt7XG4gICAgICAgIHRyYWNraW5nOiBbJ3RpZ2h0ZXInLCAndGlnaHQnLCAnbm9ybWFsJywgJ3dpZGUnLCAnd2lkZXInLCAnd2lkZXN0JywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBMaW5lIENsYW1wXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbGluZS1jbGFtcFxuICAgICAgICovXG4gICAgICAnbGluZS1jbGFtcCc6IFt7XG4gICAgICAgICdsaW5lLWNsYW1wJzogWydub25lJywgaXNOdW1iZXIsIGlzQXJiaXRyYXJ5TnVtYmVyXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIExpbmUgSGVpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbGluZS1oZWlnaHRcbiAgICAgICAqL1xuICAgICAgbGVhZGluZzogW3tcbiAgICAgICAgbGVhZGluZzogWydub25lJywgJ3RpZ2h0JywgJ3NudWcnLCAnbm9ybWFsJywgJ3JlbGF4ZWQnLCAnbG9vc2UnLCBpc0xlbmd0aCwgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBMaXN0IFN0eWxlIEltYWdlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbGlzdC1zdHlsZS1pbWFnZVxuICAgICAgICovXG4gICAgICAnbGlzdC1pbWFnZSc6IFt7XG4gICAgICAgICdsaXN0LWltYWdlJzogWydub25lJywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBMaXN0IFN0eWxlIFR5cGVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9saXN0LXN0eWxlLXR5cGVcbiAgICAgICAqL1xuICAgICAgJ2xpc3Qtc3R5bGUtdHlwZSc6IFt7XG4gICAgICAgIGxpc3Q6IFsnbm9uZScsICdkaXNjJywgJ2RlY2ltYWwnLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIExpc3QgU3R5bGUgUG9zaXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9saXN0LXN0eWxlLXBvc2l0aW9uXG4gICAgICAgKi9cbiAgICAgICdsaXN0LXN0eWxlLXBvc2l0aW9uJzogW3tcbiAgICAgICAgbGlzdDogWydpbnNpZGUnLCAnb3V0c2lkZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGxhY2Vob2xkZXIgQ29sb3JcbiAgICAgICAqIEBkZXByZWNhdGVkIHNpbmNlIFRhaWx3aW5kIENTUyB2My4wLjBcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wbGFjZWhvbGRlci1jb2xvclxuICAgICAgICovXG4gICAgICAncGxhY2Vob2xkZXItY29sb3InOiBbe1xuICAgICAgICBwbGFjZWhvbGRlcjogW2NvbG9yc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBQbGFjZWhvbGRlciBPcGFjaXR5XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcGxhY2Vob2xkZXItb3BhY2l0eVxuICAgICAgICovXG4gICAgICAncGxhY2Vob2xkZXItb3BhY2l0eSc6IFt7XG4gICAgICAgICdwbGFjZWhvbGRlci1vcGFjaXR5JzogW29wYWNpdHldXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBBbGlnbm1lbnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90ZXh0LWFsaWduXG4gICAgICAgKi9cbiAgICAgICd0ZXh0LWFsaWdubWVudCc6IFt7XG4gICAgICAgIHRleHQ6IFsnbGVmdCcsICdjZW50ZXInLCAncmlnaHQnLCAnanVzdGlmeScsICdzdGFydCcsICdlbmQnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRleHQgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90ZXh0LWNvbG9yXG4gICAgICAgKi9cbiAgICAgICd0ZXh0LWNvbG9yJzogW3tcbiAgICAgICAgdGV4dDogW2NvbG9yc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBUZXh0IE9wYWNpdHlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90ZXh0LW9wYWNpdHlcbiAgICAgICAqL1xuICAgICAgJ3RleHQtb3BhY2l0eSc6IFt7XG4gICAgICAgICd0ZXh0LW9wYWNpdHknOiBbb3BhY2l0eV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBUZXh0IERlY29yYXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90ZXh0LWRlY29yYXRpb25cbiAgICAgICAqL1xuICAgICAgJ3RleHQtZGVjb3JhdGlvbic6IFsndW5kZXJsaW5lJywgJ292ZXJsaW5lJywgJ2xpbmUtdGhyb3VnaCcsICduby11bmRlcmxpbmUnXSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBEZWNvcmF0aW9uIFN0eWxlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdGV4dC1kZWNvcmF0aW9uLXN0eWxlXG4gICAgICAgKi9cbiAgICAgICd0ZXh0LWRlY29yYXRpb24tc3R5bGUnOiBbe1xuICAgICAgICBkZWNvcmF0aW9uOiBbLi4uZ2V0TGluZVN0eWxlcygpLCAnd2F2eSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBEZWNvcmF0aW9uIFRoaWNrbmVzc1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RleHQtZGVjb3JhdGlvbi10aGlja25lc3NcbiAgICAgICAqL1xuICAgICAgJ3RleHQtZGVjb3JhdGlvbi10aGlja25lc3MnOiBbe1xuICAgICAgICBkZWNvcmF0aW9uOiBbJ2F1dG8nLCAnZnJvbS1mb250JywgaXNMZW5ndGgsIGlzQXJiaXRyYXJ5TGVuZ3RoXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRleHQgVW5kZXJsaW5lIE9mZnNldFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RleHQtdW5kZXJsaW5lLW9mZnNldFxuICAgICAgICovXG4gICAgICAndW5kZXJsaW5lLW9mZnNldCc6IFt7XG4gICAgICAgICd1bmRlcmxpbmUtb2Zmc2V0JzogWydhdXRvJywgaXNMZW5ndGgsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBEZWNvcmF0aW9uIENvbG9yXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdGV4dC1kZWNvcmF0aW9uLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICd0ZXh0LWRlY29yYXRpb24tY29sb3InOiBbe1xuICAgICAgICBkZWNvcmF0aW9uOiBbY29sb3JzXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRleHQgVHJhbnNmb3JtXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdGV4dC10cmFuc2Zvcm1cbiAgICAgICAqL1xuICAgICAgJ3RleHQtdHJhbnNmb3JtJzogWyd1cHBlcmNhc2UnLCAnbG93ZXJjYXNlJywgJ2NhcGl0YWxpemUnLCAnbm9ybWFsLWNhc2UnXSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBPdmVyZmxvd1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RleHQtb3ZlcmZsb3dcbiAgICAgICAqL1xuICAgICAgJ3RleHQtb3ZlcmZsb3cnOiBbJ3RydW5jYXRlJywgJ3RleHQtZWxsaXBzaXMnLCAndGV4dC1jbGlwJ10sXG4gICAgICAvKipcbiAgICAgICAqIFRleHQgV3JhcFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RleHQtd3JhcFxuICAgICAgICovXG4gICAgICAndGV4dC13cmFwJzogW3tcbiAgICAgICAgdGV4dDogWyd3cmFwJywgJ25vd3JhcCcsICdiYWxhbmNlJywgJ3ByZXR0eSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBJbmRlbnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90ZXh0LWluZGVudFxuICAgICAgICovXG4gICAgICBpbmRlbnQ6IFt7XG4gICAgICAgIGluZGVudDogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFZlcnRpY2FsIEFsaWdubWVudFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3ZlcnRpY2FsLWFsaWduXG4gICAgICAgKi9cbiAgICAgICd2ZXJ0aWNhbC1hbGlnbic6IFt7XG4gICAgICAgIGFsaWduOiBbJ2Jhc2VsaW5lJywgJ3RvcCcsICdtaWRkbGUnLCAnYm90dG9tJywgJ3RleHQtdG9wJywgJ3RleHQtYm90dG9tJywgJ3N1YicsICdzdXBlcicsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogV2hpdGVzcGFjZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3doaXRlc3BhY2VcbiAgICAgICAqL1xuICAgICAgd2hpdGVzcGFjZTogW3tcbiAgICAgICAgd2hpdGVzcGFjZTogWydub3JtYWwnLCAnbm93cmFwJywgJ3ByZScsICdwcmUtbGluZScsICdwcmUtd3JhcCcsICdicmVhay1zcGFjZXMnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFdvcmQgQnJlYWtcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy93b3JkLWJyZWFrXG4gICAgICAgKi9cbiAgICAgIGJyZWFrOiBbe1xuICAgICAgICBicmVhazogWydub3JtYWwnLCAnd29yZHMnLCAnYWxsJywgJ2tlZXAnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEh5cGhlbnNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9oeXBoZW5zXG4gICAgICAgKi9cbiAgICAgIGh5cGhlbnM6IFt7XG4gICAgICAgIGh5cGhlbnM6IFsnbm9uZScsICdtYW51YWwnLCAnYXV0byddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQ29udGVudFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2NvbnRlbnRcbiAgICAgICAqL1xuICAgICAgY29udGVudDogW3tcbiAgICAgICAgY29udGVudDogWydub25lJywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLy8gQmFja2dyb3VuZHNcbiAgICAgIC8qKlxuICAgICAgICogQmFja2dyb3VuZCBBdHRhY2htZW50XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2dyb3VuZC1hdHRhY2htZW50XG4gICAgICAgKi9cbiAgICAgICdiZy1hdHRhY2htZW50JzogW3tcbiAgICAgICAgYmc6IFsnZml4ZWQnLCAnbG9jYWwnLCAnc2Nyb2xsJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCYWNrZ3JvdW5kIENsaXBcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLWNsaXBcbiAgICAgICAqL1xuICAgICAgJ2JnLWNsaXAnOiBbe1xuICAgICAgICAnYmctY2xpcCc6IFsnYm9yZGVyJywgJ3BhZGRpbmcnLCAnY29udGVudCcsICd0ZXh0J11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCYWNrZ3JvdW5kIE9wYWNpdHlcbiAgICAgICAqIEBkZXByZWNhdGVkIHNpbmNlIFRhaWx3aW5kIENTUyB2My4wLjBcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLW9wYWNpdHlcbiAgICAgICAqL1xuICAgICAgJ2JnLW9wYWNpdHknOiBbe1xuICAgICAgICAnYmctb3BhY2l0eSc6IFtvcGFjaXR5XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tncm91bmQgT3JpZ2luXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2dyb3VuZC1vcmlnaW5cbiAgICAgICAqL1xuICAgICAgJ2JnLW9yaWdpbic6IFt7XG4gICAgICAgICdiZy1vcmlnaW4nOiBbJ2JvcmRlcicsICdwYWRkaW5nJywgJ2NvbnRlbnQnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tncm91bmQgUG9zaXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLXBvc2l0aW9uXG4gICAgICAgKi9cbiAgICAgICdiZy1wb3NpdGlvbic6IFt7XG4gICAgICAgIGJnOiBbLi4uZ2V0UG9zaXRpb25zKCksIGlzQXJiaXRyYXJ5UG9zaXRpb25dXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2dyb3VuZCBSZXBlYXRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLXJlcGVhdFxuICAgICAgICovXG4gICAgICAnYmctcmVwZWF0JzogW3tcbiAgICAgICAgYmc6IFsnbm8tcmVwZWF0Jywge1xuICAgICAgICAgIHJlcGVhdDogWycnLCAneCcsICd5JywgJ3JvdW5kJywgJ3NwYWNlJ11cbiAgICAgICAgfV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCYWNrZ3JvdW5kIFNpemVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLXNpemVcbiAgICAgICAqL1xuICAgICAgJ2JnLXNpemUnOiBbe1xuICAgICAgICBiZzogWydhdXRvJywgJ2NvdmVyJywgJ2NvbnRhaW4nLCBpc0FyYml0cmFyeVNpemVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2dyb3VuZCBJbWFnZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JhY2tncm91bmQtaW1hZ2VcbiAgICAgICAqL1xuICAgICAgJ2JnLWltYWdlJzogW3tcbiAgICAgICAgYmc6IFsnbm9uZScsIHtcbiAgICAgICAgICAnZ3JhZGllbnQtdG8nOiBbJ3QnLCAndHInLCAncicsICdicicsICdiJywgJ2JsJywgJ2wnLCAndGwnXVxuICAgICAgICB9LCBpc0FyYml0cmFyeUltYWdlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tncm91bmQgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdiZy1jb2xvcic6IFt7XG4gICAgICAgIGJnOiBbY29sb3JzXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyYWRpZW50IENvbG9yIFN0b3BzIEZyb20gUG9zaXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ncmFkaWVudC1jb2xvci1zdG9wc1xuICAgICAgICovXG4gICAgICAnZ3JhZGllbnQtZnJvbS1wb3MnOiBbe1xuICAgICAgICBmcm9tOiBbZ3JhZGllbnRDb2xvclN0b3BQb3NpdGlvbnNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JhZGllbnQgQ29sb3IgU3RvcHMgVmlhIFBvc2l0aW9uXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JhZGllbnQtY29sb3Itc3RvcHNcbiAgICAgICAqL1xuICAgICAgJ2dyYWRpZW50LXZpYS1wb3MnOiBbe1xuICAgICAgICB2aWE6IFtncmFkaWVudENvbG9yU3RvcFBvc2l0aW9uc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHcmFkaWVudCBDb2xvciBTdG9wcyBUbyBQb3NpdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dyYWRpZW50LWNvbG9yLXN0b3BzXG4gICAgICAgKi9cbiAgICAgICdncmFkaWVudC10by1wb3MnOiBbe1xuICAgICAgICB0bzogW2dyYWRpZW50Q29sb3JTdG9wUG9zaXRpb25zXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyYWRpZW50IENvbG9yIFN0b3BzIEZyb21cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ncmFkaWVudC1jb2xvci1zdG9wc1xuICAgICAgICovXG4gICAgICAnZ3JhZGllbnQtZnJvbSc6IFt7XG4gICAgICAgIGZyb206IFtncmFkaWVudENvbG9yU3RvcHNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JhZGllbnQgQ29sb3IgU3RvcHMgVmlhXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JhZGllbnQtY29sb3Itc3RvcHNcbiAgICAgICAqL1xuICAgICAgJ2dyYWRpZW50LXZpYSc6IFt7XG4gICAgICAgIHZpYTogW2dyYWRpZW50Q29sb3JTdG9wc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHcmFkaWVudCBDb2xvciBTdG9wcyBUb1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dyYWRpZW50LWNvbG9yLXN0b3BzXG4gICAgICAgKi9cbiAgICAgICdncmFkaWVudC10byc6IFt7XG4gICAgICAgIHRvOiBbZ3JhZGllbnRDb2xvclN0b3BzXVxuICAgICAgfV0sXG4gICAgICAvLyBCb3JkZXJzXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBSYWRpdXNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItcmFkaXVzXG4gICAgICAgKi9cbiAgICAgIHJvdW5kZWQ6IFt7XG4gICAgICAgIHJvdW5kZWQ6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBTdGFydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1yYWRpdXNcbiAgICAgICAqL1xuICAgICAgJ3JvdW5kZWQtcyc6IFt7XG4gICAgICAgICdyb3VuZGVkLXMnOiBbYm9yZGVyUmFkaXVzXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBSYWRpdXMgRW5kXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1lJzogW3tcbiAgICAgICAgJ3JvdW5kZWQtZSc6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBUb3BcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItcmFkaXVzXG4gICAgICAgKi9cbiAgICAgICdyb3VuZGVkLXQnOiBbe1xuICAgICAgICAncm91bmRlZC10JzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIFJpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1yJzogW3tcbiAgICAgICAgJ3JvdW5kZWQtcic6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBCb3R0b21cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItcmFkaXVzXG4gICAgICAgKi9cbiAgICAgICdyb3VuZGVkLWInOiBbe1xuICAgICAgICAncm91bmRlZC1iJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIExlZnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItcmFkaXVzXG4gICAgICAgKi9cbiAgICAgICdyb3VuZGVkLWwnOiBbe1xuICAgICAgICAncm91bmRlZC1sJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIFN0YXJ0IFN0YXJ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1zcyc6IFt7XG4gICAgICAgICdyb3VuZGVkLXNzJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIFN0YXJ0IEVuZFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1yYWRpdXNcbiAgICAgICAqL1xuICAgICAgJ3JvdW5kZWQtc2UnOiBbe1xuICAgICAgICAncm91bmRlZC1zZSc6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBFbmQgRW5kXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1lZSc6IFt7XG4gICAgICAgICdyb3VuZGVkLWVlJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIEVuZCBTdGFydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1yYWRpdXNcbiAgICAgICAqL1xuICAgICAgJ3JvdW5kZWQtZXMnOiBbe1xuICAgICAgICAncm91bmRlZC1lcyc6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBUb3AgTGVmdFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1yYWRpdXNcbiAgICAgICAqL1xuICAgICAgJ3JvdW5kZWQtdGwnOiBbe1xuICAgICAgICAncm91bmRlZC10bCc6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBUb3AgUmlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItcmFkaXVzXG4gICAgICAgKi9cbiAgICAgICdyb3VuZGVkLXRyJzogW3tcbiAgICAgICAgJ3JvdW5kZWQtdHInOiBbYm9yZGVyUmFkaXVzXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBSYWRpdXMgQm90dG9tIFJpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1icic6IFt7XG4gICAgICAgICdyb3VuZGVkLWJyJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIEJvdHRvbSBMZWZ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1ibCc6IFt7XG4gICAgICAgICdyb3VuZGVkLWJsJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgV2lkdGhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItd2lkdGhcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci13JzogW3tcbiAgICAgICAgYm9yZGVyOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFdpZHRoIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItd2lkdGhcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci13LXgnOiBbe1xuICAgICAgICAnYm9yZGVyLXgnOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFdpZHRoIFlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItd2lkdGhcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci13LXknOiBbe1xuICAgICAgICAnYm9yZGVyLXknOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFdpZHRoIFN0YXJ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXdpZHRoXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItdy1zJzogW3tcbiAgICAgICAgJ2JvcmRlci1zJzogW2JvcmRlcldpZHRoXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBXaWR0aCBFbmRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItd2lkdGhcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci13LWUnOiBbe1xuICAgICAgICAnYm9yZGVyLWUnOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFdpZHRoIFRvcFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci13aWR0aFxuICAgICAgICovXG4gICAgICAnYm9yZGVyLXctdCc6IFt7XG4gICAgICAgICdib3JkZXItdCc6IFtib3JkZXJXaWR0aF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgV2lkdGggUmlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItd2lkdGhcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci13LXInOiBbe1xuICAgICAgICAnYm9yZGVyLXInOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFdpZHRoIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci13aWR0aFxuICAgICAgICovXG4gICAgICAnYm9yZGVyLXctYic6IFt7XG4gICAgICAgICdib3JkZXItYic6IFtib3JkZXJXaWR0aF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgV2lkdGggTGVmdFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci13aWR0aFxuICAgICAgICovXG4gICAgICAnYm9yZGVyLXctbCc6IFt7XG4gICAgICAgICdib3JkZXItbCc6IFtib3JkZXJXaWR0aF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgT3BhY2l0eVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1vcGFjaXR5XG4gICAgICAgKi9cbiAgICAgICdib3JkZXItb3BhY2l0eSc6IFt7XG4gICAgICAgICdib3JkZXItb3BhY2l0eSc6IFtvcGFjaXR5XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBTdHlsZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1zdHlsZVxuICAgICAgICovXG4gICAgICAnYm9yZGVyLXN0eWxlJzogW3tcbiAgICAgICAgYm9yZGVyOiBbLi4uZ2V0TGluZVN0eWxlcygpLCAnaGlkZGVuJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBEaXZpZGUgV2lkdGggWFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS13aWR0aFxuICAgICAgICovXG4gICAgICAnZGl2aWRlLXgnOiBbe1xuICAgICAgICAnZGl2aWRlLXgnOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRGl2aWRlIFdpZHRoIFggUmV2ZXJzZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS13aWR0aFxuICAgICAgICovXG4gICAgICAnZGl2aWRlLXgtcmV2ZXJzZSc6IFsnZGl2aWRlLXgtcmV2ZXJzZSddLFxuICAgICAgLyoqXG4gICAgICAgKiBEaXZpZGUgV2lkdGggWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS13aWR0aFxuICAgICAgICovXG4gICAgICAnZGl2aWRlLXknOiBbe1xuICAgICAgICAnZGl2aWRlLXknOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRGl2aWRlIFdpZHRoIFkgUmV2ZXJzZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS13aWR0aFxuICAgICAgICovXG4gICAgICAnZGl2aWRlLXktcmV2ZXJzZSc6IFsnZGl2aWRlLXktcmV2ZXJzZSddLFxuICAgICAgLyoqXG4gICAgICAgKiBEaXZpZGUgT3BhY2l0eVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS1vcGFjaXR5XG4gICAgICAgKi9cbiAgICAgICdkaXZpZGUtb3BhY2l0eSc6IFt7XG4gICAgICAgICdkaXZpZGUtb3BhY2l0eSc6IFtvcGFjaXR5XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIERpdmlkZSBTdHlsZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS1zdHlsZVxuICAgICAgICovXG4gICAgICAnZGl2aWRlLXN0eWxlJzogW3tcbiAgICAgICAgZGl2aWRlOiBnZXRMaW5lU3R5bGVzKClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItY29sb3JcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci1jb2xvcic6IFt7XG4gICAgICAgIGJvcmRlcjogW2JvcmRlckNvbG9yXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBDb2xvciBYXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItY29sb3IteCc6IFt7XG4gICAgICAgICdib3JkZXIteCc6IFtib3JkZXJDb2xvcl1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgQ29sb3IgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1jb2xvclxuICAgICAgICovXG4gICAgICAnYm9yZGVyLWNvbG9yLXknOiBbe1xuICAgICAgICAnYm9yZGVyLXknOiBbYm9yZGVyQ29sb3JdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIENvbG9yIFRvcFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1jb2xvclxuICAgICAgICovXG4gICAgICAnYm9yZGVyLWNvbG9yLXQnOiBbe1xuICAgICAgICAnYm9yZGVyLXQnOiBbYm9yZGVyQ29sb3JdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIENvbG9yIFJpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItY29sb3Itcic6IFt7XG4gICAgICAgICdib3JkZXItcic6IFtib3JkZXJDb2xvcl1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgQ29sb3IgQm90dG9tXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItY29sb3ItYic6IFt7XG4gICAgICAgICdib3JkZXItYic6IFtib3JkZXJDb2xvcl1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgQ29sb3IgTGVmdFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1jb2xvclxuICAgICAgICovXG4gICAgICAnYm9yZGVyLWNvbG9yLWwnOiBbe1xuICAgICAgICAnYm9yZGVyLWwnOiBbYm9yZGVyQ29sb3JdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRGl2aWRlIENvbG9yXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZGl2aWRlLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdkaXZpZGUtY29sb3InOiBbe1xuICAgICAgICBkaXZpZGU6IFtib3JkZXJDb2xvcl1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBPdXRsaW5lIFN0eWxlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3V0bGluZS1zdHlsZVxuICAgICAgICovXG4gICAgICAnb3V0bGluZS1zdHlsZSc6IFt7XG4gICAgICAgIG91dGxpbmU6IFsnJywgLi4uZ2V0TGluZVN0eWxlcygpXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE91dGxpbmUgT2Zmc2V0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3V0bGluZS1vZmZzZXRcbiAgICAgICAqL1xuICAgICAgJ291dGxpbmUtb2Zmc2V0JzogW3tcbiAgICAgICAgJ291dGxpbmUtb2Zmc2V0JzogW2lzTGVuZ3RoLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE91dGxpbmUgV2lkdGhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9vdXRsaW5lLXdpZHRoXG4gICAgICAgKi9cbiAgICAgICdvdXRsaW5lLXcnOiBbe1xuICAgICAgICBvdXRsaW5lOiBbaXNMZW5ndGgsIGlzQXJiaXRyYXJ5TGVuZ3RoXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE91dGxpbmUgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9vdXRsaW5lLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdvdXRsaW5lLWNvbG9yJzogW3tcbiAgICAgICAgb3V0bGluZTogW2NvbG9yc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBSaW5nIFdpZHRoXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcmluZy13aWR0aFxuICAgICAgICovXG4gICAgICAncmluZy13JzogW3tcbiAgICAgICAgcmluZzogZ2V0TGVuZ3RoV2l0aEVtcHR5QW5kQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBSaW5nIFdpZHRoIEluc2V0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcmluZy13aWR0aFxuICAgICAgICovXG4gICAgICAncmluZy13LWluc2V0JzogWydyaW5nLWluc2V0J10sXG4gICAgICAvKipcbiAgICAgICAqIFJpbmcgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9yaW5nLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdyaW5nLWNvbG9yJzogW3tcbiAgICAgICAgcmluZzogW2NvbG9yc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBSaW5nIE9wYWNpdHlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9yaW5nLW9wYWNpdHlcbiAgICAgICAqL1xuICAgICAgJ3Jpbmctb3BhY2l0eSc6IFt7XG4gICAgICAgICdyaW5nLW9wYWNpdHknOiBbb3BhY2l0eV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBSaW5nIE9mZnNldCBXaWR0aFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Jpbmctb2Zmc2V0LXdpZHRoXG4gICAgICAgKi9cbiAgICAgICdyaW5nLW9mZnNldC13JzogW3tcbiAgICAgICAgJ3Jpbmctb2Zmc2V0JzogW2lzTGVuZ3RoLCBpc0FyYml0cmFyeUxlbmd0aF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBSaW5nIE9mZnNldCBDb2xvclxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Jpbmctb2Zmc2V0LWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdyaW5nLW9mZnNldC1jb2xvcic6IFt7XG4gICAgICAgICdyaW5nLW9mZnNldCc6IFtjb2xvcnNdXG4gICAgICB9XSxcbiAgICAgIC8vIEVmZmVjdHNcbiAgICAgIC8qKlxuICAgICAgICogQm94IFNoYWRvd1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JveC1zaGFkb3dcbiAgICAgICAqL1xuICAgICAgc2hhZG93OiBbe1xuICAgICAgICBzaGFkb3c6IFsnJywgJ2lubmVyJywgJ25vbmUnLCBpc1RzaGlydFNpemUsIGlzQXJiaXRyYXJ5U2hhZG93XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJveCBTaGFkb3cgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3gtc2hhZG93LWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdzaGFkb3ctY29sb3InOiBbe1xuICAgICAgICBzaGFkb3c6IFtpc0FueV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBPcGFjaXR5XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3BhY2l0eVxuICAgICAgICovXG4gICAgICBvcGFjaXR5OiBbe1xuICAgICAgICBvcGFjaXR5OiBbb3BhY2l0eV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBNaXggQmxlbmQgTW9kZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL21peC1ibGVuZC1tb2RlXG4gICAgICAgKi9cbiAgICAgICdtaXgtYmxlbmQnOiBbe1xuICAgICAgICAnbWl4LWJsZW5kJzogWy4uLmdldEJsZW5kTW9kZXMoKSwgJ3BsdXMtbGlnaHRlcicsICdwbHVzLWRhcmtlciddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2dyb3VuZCBCbGVuZCBNb2RlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2dyb3VuZC1ibGVuZC1tb2RlXG4gICAgICAgKi9cbiAgICAgICdiZy1ibGVuZCc6IFt7XG4gICAgICAgICdiZy1ibGVuZCc6IGdldEJsZW5kTW9kZXMoKVxuICAgICAgfV0sXG4gICAgICAvLyBGaWx0ZXJzXG4gICAgICAvKipcbiAgICAgICAqIEZpbHRlclxuICAgICAgICogQGRlcHJlY2F0ZWQgc2luY2UgVGFpbHdpbmQgQ1NTIHYzLjAuMFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZpbHRlclxuICAgICAgICovXG4gICAgICBmaWx0ZXI6IFt7XG4gICAgICAgIGZpbHRlcjogWycnLCAnbm9uZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmx1clxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JsdXJcbiAgICAgICAqL1xuICAgICAgYmx1cjogW3tcbiAgICAgICAgYmx1cjogW2JsdXJdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQnJpZ2h0bmVzc1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JyaWdodG5lc3NcbiAgICAgICAqL1xuICAgICAgYnJpZ2h0bmVzczogW3tcbiAgICAgICAgYnJpZ2h0bmVzczogW2JyaWdodG5lc3NdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQ29udHJhc3RcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9jb250cmFzdFxuICAgICAgICovXG4gICAgICBjb250cmFzdDogW3tcbiAgICAgICAgY29udHJhc3Q6IFtjb250cmFzdF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBEcm9wIFNoYWRvd1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2Ryb3Atc2hhZG93XG4gICAgICAgKi9cbiAgICAgICdkcm9wLXNoYWRvdyc6IFt7XG4gICAgICAgICdkcm9wLXNoYWRvdyc6IFsnJywgJ25vbmUnLCBpc1RzaGlydFNpemUsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JheXNjYWxlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JheXNjYWxlXG4gICAgICAgKi9cbiAgICAgIGdyYXlzY2FsZTogW3tcbiAgICAgICAgZ3JheXNjYWxlOiBbZ3JheXNjYWxlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEh1ZSBSb3RhdGVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9odWUtcm90YXRlXG4gICAgICAgKi9cbiAgICAgICdodWUtcm90YXRlJzogW3tcbiAgICAgICAgJ2h1ZS1yb3RhdGUnOiBbaHVlUm90YXRlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEludmVydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ludmVydFxuICAgICAgICovXG4gICAgICBpbnZlcnQ6IFt7XG4gICAgICAgIGludmVydDogW2ludmVydF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTYXR1cmF0ZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3NhdHVyYXRlXG4gICAgICAgKi9cbiAgICAgIHNhdHVyYXRlOiBbe1xuICAgICAgICBzYXR1cmF0ZTogW3NhdHVyYXRlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNlcGlhXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2VwaWFcbiAgICAgICAqL1xuICAgICAgc2VwaWE6IFt7XG4gICAgICAgIHNlcGlhOiBbc2VwaWFdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2Ryb3AgRmlsdGVyXG4gICAgICAgKiBAZGVwcmVjYXRlZCBzaW5jZSBUYWlsd2luZCBDU1MgdjMuMC4wXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2Ryb3AtZmlsdGVyXG4gICAgICAgKi9cbiAgICAgICdiYWNrZHJvcC1maWx0ZXInOiBbe1xuICAgICAgICAnYmFja2Ryb3AtZmlsdGVyJzogWycnLCAnbm9uZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2Ryb3AgQmx1clxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JhY2tkcm9wLWJsdXJcbiAgICAgICAqL1xuICAgICAgJ2JhY2tkcm9wLWJsdXInOiBbe1xuICAgICAgICAnYmFja2Ryb3AtYmx1cic6IFtibHVyXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tkcm9wIEJyaWdodG5lc3NcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZHJvcC1icmlnaHRuZXNzXG4gICAgICAgKi9cbiAgICAgICdiYWNrZHJvcC1icmlnaHRuZXNzJzogW3tcbiAgICAgICAgJ2JhY2tkcm9wLWJyaWdodG5lc3MnOiBbYnJpZ2h0bmVzc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCYWNrZHJvcCBDb250cmFzdFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JhY2tkcm9wLWNvbnRyYXN0XG4gICAgICAgKi9cbiAgICAgICdiYWNrZHJvcC1jb250cmFzdCc6IFt7XG4gICAgICAgICdiYWNrZHJvcC1jb250cmFzdCc6IFtjb250cmFzdF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCYWNrZHJvcCBHcmF5c2NhbGVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZHJvcC1ncmF5c2NhbGVcbiAgICAgICAqL1xuICAgICAgJ2JhY2tkcm9wLWdyYXlzY2FsZSc6IFt7XG4gICAgICAgICdiYWNrZHJvcC1ncmF5c2NhbGUnOiBbZ3JheXNjYWxlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tkcm9wIEh1ZSBSb3RhdGVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZHJvcC1odWUtcm90YXRlXG4gICAgICAgKi9cbiAgICAgICdiYWNrZHJvcC1odWUtcm90YXRlJzogW3tcbiAgICAgICAgJ2JhY2tkcm9wLWh1ZS1yb3RhdGUnOiBbaHVlUm90YXRlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tkcm9wIEludmVydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JhY2tkcm9wLWludmVydFxuICAgICAgICovXG4gICAgICAnYmFja2Ryb3AtaW52ZXJ0JzogW3tcbiAgICAgICAgJ2JhY2tkcm9wLWludmVydCc6IFtpbnZlcnRdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2Ryb3AgT3BhY2l0eVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JhY2tkcm9wLW9wYWNpdHlcbiAgICAgICAqL1xuICAgICAgJ2JhY2tkcm9wLW9wYWNpdHknOiBbe1xuICAgICAgICAnYmFja2Ryb3Atb3BhY2l0eSc6IFtvcGFjaXR5XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tkcm9wIFNhdHVyYXRlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2Ryb3Atc2F0dXJhdGVcbiAgICAgICAqL1xuICAgICAgJ2JhY2tkcm9wLXNhdHVyYXRlJzogW3tcbiAgICAgICAgJ2JhY2tkcm9wLXNhdHVyYXRlJzogW3NhdHVyYXRlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tkcm9wIFNlcGlhXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2Ryb3Atc2VwaWFcbiAgICAgICAqL1xuICAgICAgJ2JhY2tkcm9wLXNlcGlhJzogW3tcbiAgICAgICAgJ2JhY2tkcm9wLXNlcGlhJzogW3NlcGlhXVxuICAgICAgfV0sXG4gICAgICAvLyBUYWJsZXNcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIENvbGxhcHNlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLWNvbGxhcHNlXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItY29sbGFwc2UnOiBbe1xuICAgICAgICBib3JkZXI6IFsnY29sbGFwc2UnLCAnc2VwYXJhdGUnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBTcGFjaW5nXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXNwYWNpbmdcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci1zcGFjaW5nJzogW3tcbiAgICAgICAgJ2JvcmRlci1zcGFjaW5nJzogW2JvcmRlclNwYWNpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFNwYWNpbmcgWFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1zcGFjaW5nXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItc3BhY2luZy14JzogW3tcbiAgICAgICAgJ2JvcmRlci1zcGFjaW5nLXgnOiBbYm9yZGVyU3BhY2luZ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgU3BhY2luZyBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXNwYWNpbmdcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci1zcGFjaW5nLXknOiBbe1xuICAgICAgICAnYm9yZGVyLXNwYWNpbmcteSc6IFtib3JkZXJTcGFjaW5nXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRhYmxlIExheW91dFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RhYmxlLWxheW91dFxuICAgICAgICovXG4gICAgICAndGFibGUtbGF5b3V0JzogW3tcbiAgICAgICAgdGFibGU6IFsnYXV0bycsICdmaXhlZCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQ2FwdGlvbiBTaWRlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvY2FwdGlvbi1zaWRlXG4gICAgICAgKi9cbiAgICAgIGNhcHRpb246IFt7XG4gICAgICAgIGNhcHRpb246IFsndG9wJywgJ2JvdHRvbSddXG4gICAgICB9XSxcbiAgICAgIC8vIFRyYW5zaXRpb25zIGFuZCBBbmltYXRpb25cbiAgICAgIC8qKlxuICAgICAgICogVHJhbmlzaXRpb24gUHJvcGVydHlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90cmFuc2l0aW9uLXByb3BlcnR5XG4gICAgICAgKi9cbiAgICAgIHRyYW5zaXRpb246IFt7XG4gICAgICAgIHRyYW5zaXRpb246IFsnbm9uZScsICdhbGwnLCAnJywgJ2NvbG9ycycsICdvcGFjaXR5JywgJ3NoYWRvdycsICd0cmFuc2Zvcm0nLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRyYW5zaXRpb24gRHVyYXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90cmFuc2l0aW9uLWR1cmF0aW9uXG4gICAgICAgKi9cbiAgICAgIGR1cmF0aW9uOiBbe1xuICAgICAgICBkdXJhdGlvbjogZ2V0TnVtYmVyQW5kQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBUcmFuc2l0aW9uIFRpbWluZyBGdW5jdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RyYW5zaXRpb24tdGltaW5nLWZ1bmN0aW9uXG4gICAgICAgKi9cbiAgICAgIGVhc2U6IFt7XG4gICAgICAgIGVhc2U6IFsnbGluZWFyJywgJ2luJywgJ291dCcsICdpbi1vdXQnLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRyYW5zaXRpb24gRGVsYXlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90cmFuc2l0aW9uLWRlbGF5XG4gICAgICAgKi9cbiAgICAgIGRlbGF5OiBbe1xuICAgICAgICBkZWxheTogZ2V0TnVtYmVyQW5kQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBBbmltYXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9hbmltYXRpb25cbiAgICAgICAqL1xuICAgICAgYW5pbWF0ZTogW3tcbiAgICAgICAgYW5pbWF0ZTogWydub25lJywgJ3NwaW4nLCAncGluZycsICdwdWxzZScsICdib3VuY2UnLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvLyBUcmFuc2Zvcm1zXG4gICAgICAvKipcbiAgICAgICAqIFRyYW5zZm9ybVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RyYW5zZm9ybVxuICAgICAgICovXG4gICAgICB0cmFuc2Zvcm06IFt7XG4gICAgICAgIHRyYW5zZm9ybTogWycnLCAnZ3B1JywgJ25vbmUnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNjYWxlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2NhbGVcbiAgICAgICAqL1xuICAgICAgc2NhbGU6IFt7XG4gICAgICAgIHNjYWxlOiBbc2NhbGVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2NhbGUgWFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3NjYWxlXG4gICAgICAgKi9cbiAgICAgICdzY2FsZS14JzogW3tcbiAgICAgICAgJ3NjYWxlLXgnOiBbc2NhbGVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2NhbGUgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3NjYWxlXG4gICAgICAgKi9cbiAgICAgICdzY2FsZS15JzogW3tcbiAgICAgICAgJ3NjYWxlLXknOiBbc2NhbGVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUm90YXRlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvcm90YXRlXG4gICAgICAgKi9cbiAgICAgIHJvdGF0ZTogW3tcbiAgICAgICAgcm90YXRlOiBbaXNJbnRlZ2VyLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRyYW5zbGF0ZSBYXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdHJhbnNsYXRlXG4gICAgICAgKi9cbiAgICAgICd0cmFuc2xhdGUteCc6IFt7XG4gICAgICAgICd0cmFuc2xhdGUteCc6IFt0cmFuc2xhdGVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVHJhbnNsYXRlIFlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90cmFuc2xhdGVcbiAgICAgICAqL1xuICAgICAgJ3RyYW5zbGF0ZS15JzogW3tcbiAgICAgICAgJ3RyYW5zbGF0ZS15JzogW3RyYW5zbGF0ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTa2V3IFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9za2V3XG4gICAgICAgKi9cbiAgICAgICdza2V3LXgnOiBbe1xuICAgICAgICAnc2tldy14JzogW3NrZXddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2tldyBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2tld1xuICAgICAgICovXG4gICAgICAnc2tldy15JzogW3tcbiAgICAgICAgJ3NrZXcteSc6IFtza2V3XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRyYW5zZm9ybSBPcmlnaW5cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90cmFuc2Zvcm0tb3JpZ2luXG4gICAgICAgKi9cbiAgICAgICd0cmFuc2Zvcm0tb3JpZ2luJzogW3tcbiAgICAgICAgb3JpZ2luOiBbJ2NlbnRlcicsICd0b3AnLCAndG9wLXJpZ2h0JywgJ3JpZ2h0JywgJ2JvdHRvbS1yaWdodCcsICdib3R0b20nLCAnYm90dG9tLWxlZnQnLCAnbGVmdCcsICd0b3AtbGVmdCcsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8vIEludGVyYWN0aXZpdHlcbiAgICAgIC8qKlxuICAgICAgICogQWNjZW50IENvbG9yXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYWNjZW50LWNvbG9yXG4gICAgICAgKi9cbiAgICAgIGFjY2VudDogW3tcbiAgICAgICAgYWNjZW50OiBbJ2F1dG8nLCBjb2xvcnNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQXBwZWFyYW5jZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2FwcGVhcmFuY2VcbiAgICAgICAqL1xuICAgICAgYXBwZWFyYW5jZTogW3tcbiAgICAgICAgYXBwZWFyYW5jZTogWydub25lJywgJ2F1dG8nXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEN1cnNvclxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2N1cnNvclxuICAgICAgICovXG4gICAgICBjdXJzb3I6IFt7XG4gICAgICAgIGN1cnNvcjogWydhdXRvJywgJ2RlZmF1bHQnLCAncG9pbnRlcicsICd3YWl0JywgJ3RleHQnLCAnbW92ZScsICdoZWxwJywgJ25vdC1hbGxvd2VkJywgJ25vbmUnLCAnY29udGV4dC1tZW51JywgJ3Byb2dyZXNzJywgJ2NlbGwnLCAnY3Jvc3NoYWlyJywgJ3ZlcnRpY2FsLXRleHQnLCAnYWxpYXMnLCAnY29weScsICduby1kcm9wJywgJ2dyYWInLCAnZ3JhYmJpbmcnLCAnYWxsLXNjcm9sbCcsICdjb2wtcmVzaXplJywgJ3Jvdy1yZXNpemUnLCAnbi1yZXNpemUnLCAnZS1yZXNpemUnLCAncy1yZXNpemUnLCAndy1yZXNpemUnLCAnbmUtcmVzaXplJywgJ253LXJlc2l6ZScsICdzZS1yZXNpemUnLCAnc3ctcmVzaXplJywgJ2V3LXJlc2l6ZScsICducy1yZXNpemUnLCAnbmVzdy1yZXNpemUnLCAnbndzZS1yZXNpemUnLCAnem9vbS1pbicsICd6b29tLW91dCcsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQ2FyZXQgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9qdXN0LWluLXRpbWUtbW9kZSNjYXJldC1jb2xvci11dGlsaXRpZXNcbiAgICAgICAqL1xuICAgICAgJ2NhcmV0LWNvbG9yJzogW3tcbiAgICAgICAgY2FyZXQ6IFtjb2xvcnNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUG9pbnRlciBFdmVudHNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wb2ludGVyLWV2ZW50c1xuICAgICAgICovXG4gICAgICAncG9pbnRlci1ldmVudHMnOiBbe1xuICAgICAgICAncG9pbnRlci1ldmVudHMnOiBbJ25vbmUnLCAnYXV0byddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUmVzaXplXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcmVzaXplXG4gICAgICAgKi9cbiAgICAgIHJlc2l6ZTogW3tcbiAgICAgICAgcmVzaXplOiBbJ25vbmUnLCAneScsICd4JywgJyddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIEJlaGF2aW9yXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLWJlaGF2aW9yXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtYmVoYXZpb3InOiBbe1xuICAgICAgICBzY3JvbGw6IFsnYXV0bycsICdzbW9vdGgnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNjcm9sbCBNYXJnaW5cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtbWFyZ2luXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtbSc6IFt7XG4gICAgICAgICdzY3JvbGwtbSc6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgTWFyZ2luIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtbWFyZ2luXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtbXgnOiBbe1xuICAgICAgICAnc2Nyb2xsLW14JzogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNjcm9sbCBNYXJnaW4gWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Njcm9sbC1tYXJnaW5cbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1teSc6IFt7XG4gICAgICAgICdzY3JvbGwtbXknOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIE1hcmdpbiBTdGFydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Njcm9sbC1tYXJnaW5cbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1tcyc6IFt7XG4gICAgICAgICdzY3JvbGwtbXMnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIE1hcmdpbiBFbmRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtbWFyZ2luXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtbWUnOiBbe1xuICAgICAgICAnc2Nyb2xsLW1lJzogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNjcm9sbCBNYXJnaW4gVG9wXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLW1hcmdpblxuICAgICAgICovXG4gICAgICAnc2Nyb2xsLW10JzogW3tcbiAgICAgICAgJ3Njcm9sbC1tdCc6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgTWFyZ2luIFJpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLW1hcmdpblxuICAgICAgICovXG4gICAgICAnc2Nyb2xsLW1yJzogW3tcbiAgICAgICAgJ3Njcm9sbC1tcic6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgTWFyZ2luIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Njcm9sbC1tYXJnaW5cbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1tYic6IFt7XG4gICAgICAgICdzY3JvbGwtbWInOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIE1hcmdpbiBMZWZ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLW1hcmdpblxuICAgICAgICovXG4gICAgICAnc2Nyb2xsLW1sJzogW3tcbiAgICAgICAgJ3Njcm9sbC1tbCc6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgUGFkZGluZ1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Njcm9sbC1wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtcCc6IFt7XG4gICAgICAgICdzY3JvbGwtcCc6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgUGFkZGluZyBYXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXBhZGRpbmdcbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1weCc6IFt7XG4gICAgICAgICdzY3JvbGwtcHgnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIFBhZGRpbmcgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Njcm9sbC1wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtcHknOiBbe1xuICAgICAgICAnc2Nyb2xsLXB5JzogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNjcm9sbCBQYWRkaW5nIFN0YXJ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXBhZGRpbmdcbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1wcyc6IFt7XG4gICAgICAgICdzY3JvbGwtcHMnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIFBhZGRpbmcgRW5kXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXBhZGRpbmdcbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1wZSc6IFt7XG4gICAgICAgICdzY3JvbGwtcGUnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIFBhZGRpbmcgVG9wXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXBhZGRpbmdcbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1wdCc6IFt7XG4gICAgICAgICdzY3JvbGwtcHQnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIFBhZGRpbmcgUmlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtcGFkZGluZ1xuICAgICAgICovXG4gICAgICAnc2Nyb2xsLXByJzogW3tcbiAgICAgICAgJ3Njcm9sbC1wcic6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgUGFkZGluZyBCb3R0b21cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtcGFkZGluZ1xuICAgICAgICovXG4gICAgICAnc2Nyb2xsLXBiJzogW3tcbiAgICAgICAgJ3Njcm9sbC1wYic6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgUGFkZGluZyBMZWZ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXBhZGRpbmdcbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1wbCc6IFt7XG4gICAgICAgICdzY3JvbGwtcGwnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIFNuYXAgQWxpZ25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtc25hcC1hbGlnblxuICAgICAgICovXG4gICAgICAnc25hcC1hbGlnbic6IFt7XG4gICAgICAgIHNuYXA6IFsnc3RhcnQnLCAnZW5kJywgJ2NlbnRlcicsICdhbGlnbi1ub25lJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgU25hcCBTdG9wXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXNuYXAtc3RvcFxuICAgICAgICovXG4gICAgICAnc25hcC1zdG9wJzogW3tcbiAgICAgICAgc25hcDogWydub3JtYWwnLCAnYWx3YXlzJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgU25hcCBUeXBlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXNuYXAtdHlwZVxuICAgICAgICovXG4gICAgICAnc25hcC10eXBlJzogW3tcbiAgICAgICAgc25hcDogWydub25lJywgJ3gnLCAneScsICdib3RoJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgU25hcCBUeXBlIFN0cmljdG5lc3NcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtc25hcC10eXBlXG4gICAgICAgKi9cbiAgICAgICdzbmFwLXN0cmljdG5lc3MnOiBbe1xuICAgICAgICBzbmFwOiBbJ21hbmRhdG9yeScsICdwcm94aW1pdHknXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRvdWNoIEFjdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvdWNoLWFjdGlvblxuICAgICAgICovXG4gICAgICB0b3VjaDogW3tcbiAgICAgICAgdG91Y2g6IFsnYXV0bycsICdub25lJywgJ21hbmlwdWxhdGlvbiddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVG91Y2ggQWN0aW9uIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90b3VjaC1hY3Rpb25cbiAgICAgICAqL1xuICAgICAgJ3RvdWNoLXgnOiBbe1xuICAgICAgICAndG91Y2gtcGFuJzogWyd4JywgJ2xlZnQnLCAncmlnaHQnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRvdWNoIEFjdGlvbiBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdG91Y2gtYWN0aW9uXG4gICAgICAgKi9cbiAgICAgICd0b3VjaC15JzogW3tcbiAgICAgICAgJ3RvdWNoLXBhbic6IFsneScsICd1cCcsICdkb3duJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBUb3VjaCBBY3Rpb24gUGluY2ggWm9vbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvdWNoLWFjdGlvblxuICAgICAgICovXG4gICAgICAndG91Y2gtcHonOiBbJ3RvdWNoLXBpbmNoLXpvb20nXSxcbiAgICAgIC8qKlxuICAgICAgICogVXNlciBTZWxlY3RcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy91c2VyLXNlbGVjdFxuICAgICAgICovXG4gICAgICBzZWxlY3Q6IFt7XG4gICAgICAgIHNlbGVjdDogWydub25lJywgJ3RleHQnLCAnYWxsJywgJ2F1dG8nXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFdpbGwgQ2hhbmdlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvd2lsbC1jaGFuZ2VcbiAgICAgICAqL1xuICAgICAgJ3dpbGwtY2hhbmdlJzogW3tcbiAgICAgICAgJ3dpbGwtY2hhbmdlJzogWydhdXRvJywgJ3Njcm9sbCcsICdjb250ZW50cycsICd0cmFuc2Zvcm0nLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvLyBTVkdcbiAgICAgIC8qKlxuICAgICAgICogRmlsbFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZpbGxcbiAgICAgICAqL1xuICAgICAgZmlsbDogW3tcbiAgICAgICAgZmlsbDogW2NvbG9ycywgJ25vbmUnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFN0cm9rZSBXaWR0aFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3N0cm9rZS13aWR0aFxuICAgICAgICovXG4gICAgICAnc3Ryb2tlLXcnOiBbe1xuICAgICAgICBzdHJva2U6IFtpc0xlbmd0aCwgaXNBcmJpdHJhcnlMZW5ndGgsIGlzQXJiaXRyYXJ5TnVtYmVyXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFN0cm9rZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3N0cm9rZVxuICAgICAgICovXG4gICAgICBzdHJva2U6IFt7XG4gICAgICAgIHN0cm9rZTogW2NvbG9ycywgJ25vbmUnXVxuICAgICAgfV0sXG4gICAgICAvLyBBY2Nlc3NpYmlsaXR5XG4gICAgICAvKipcbiAgICAgICAqIFNjcmVlbiBSZWFkZXJzXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2NyZWVuLXJlYWRlcnNcbiAgICAgICAqL1xuICAgICAgc3I6IFsnc3Itb25seScsICdub3Qtc3Itb25seSddLFxuICAgICAgLyoqXG4gICAgICAgKiBGb3JjZWQgQ29sb3IgQWRqdXN0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZm9yY2VkLWNvbG9yLWFkanVzdFxuICAgICAgICovXG4gICAgICAnZm9yY2VkLWNvbG9yLWFkanVzdCc6IFt7XG4gICAgICAgICdmb3JjZWQtY29sb3ItYWRqdXN0JzogWydhdXRvJywgJ25vbmUnXVxuICAgICAgfV1cbiAgICB9LFxuICAgIGNvbmZsaWN0aW5nQ2xhc3NHcm91cHM6IHtcbiAgICAgIG92ZXJmbG93OiBbJ292ZXJmbG93LXgnLCAnb3ZlcmZsb3cteSddLFxuICAgICAgb3ZlcnNjcm9sbDogWydvdmVyc2Nyb2xsLXgnLCAnb3ZlcnNjcm9sbC15J10sXG4gICAgICBpbnNldDogWydpbnNldC14JywgJ2luc2V0LXknLCAnc3RhcnQnLCAnZW5kJywgJ3RvcCcsICdyaWdodCcsICdib3R0b20nLCAnbGVmdCddLFxuICAgICAgJ2luc2V0LXgnOiBbJ3JpZ2h0JywgJ2xlZnQnXSxcbiAgICAgICdpbnNldC15JzogWyd0b3AnLCAnYm90dG9tJ10sXG4gICAgICBmbGV4OiBbJ2Jhc2lzJywgJ2dyb3cnLCAnc2hyaW5rJ10sXG4gICAgICBnYXA6IFsnZ2FwLXgnLCAnZ2FwLXknXSxcbiAgICAgIHA6IFsncHgnLCAncHknLCAncHMnLCAncGUnLCAncHQnLCAncHInLCAncGInLCAncGwnXSxcbiAgICAgIHB4OiBbJ3ByJywgJ3BsJ10sXG4gICAgICBweTogWydwdCcsICdwYiddLFxuICAgICAgbTogWydteCcsICdteScsICdtcycsICdtZScsICdtdCcsICdtcicsICdtYicsICdtbCddLFxuICAgICAgbXg6IFsnbXInLCAnbWwnXSxcbiAgICAgIG15OiBbJ210JywgJ21iJ10sXG4gICAgICBzaXplOiBbJ3cnLCAnaCddLFxuICAgICAgJ2ZvbnQtc2l6ZSc6IFsnbGVhZGluZyddLFxuICAgICAgJ2Z2bi1ub3JtYWwnOiBbJ2Z2bi1vcmRpbmFsJywgJ2Z2bi1zbGFzaGVkLXplcm8nLCAnZnZuLWZpZ3VyZScsICdmdm4tc3BhY2luZycsICdmdm4tZnJhY3Rpb24nXSxcbiAgICAgICdmdm4tb3JkaW5hbCc6IFsnZnZuLW5vcm1hbCddLFxuICAgICAgJ2Z2bi1zbGFzaGVkLXplcm8nOiBbJ2Z2bi1ub3JtYWwnXSxcbiAgICAgICdmdm4tZmlndXJlJzogWydmdm4tbm9ybWFsJ10sXG4gICAgICAnZnZuLXNwYWNpbmcnOiBbJ2Z2bi1ub3JtYWwnXSxcbiAgICAgICdmdm4tZnJhY3Rpb24nOiBbJ2Z2bi1ub3JtYWwnXSxcbiAgICAgICdsaW5lLWNsYW1wJzogWydkaXNwbGF5JywgJ292ZXJmbG93J10sXG4gICAgICByb3VuZGVkOiBbJ3JvdW5kZWQtcycsICdyb3VuZGVkLWUnLCAncm91bmRlZC10JywgJ3JvdW5kZWQtcicsICdyb3VuZGVkLWInLCAncm91bmRlZC1sJywgJ3JvdW5kZWQtc3MnLCAncm91bmRlZC1zZScsICdyb3VuZGVkLWVlJywgJ3JvdW5kZWQtZXMnLCAncm91bmRlZC10bCcsICdyb3VuZGVkLXRyJywgJ3JvdW5kZWQtYnInLCAncm91bmRlZC1ibCddLFxuICAgICAgJ3JvdW5kZWQtcyc6IFsncm91bmRlZC1zcycsICdyb3VuZGVkLWVzJ10sXG4gICAgICAncm91bmRlZC1lJzogWydyb3VuZGVkLXNlJywgJ3JvdW5kZWQtZWUnXSxcbiAgICAgICdyb3VuZGVkLXQnOiBbJ3JvdW5kZWQtdGwnLCAncm91bmRlZC10ciddLFxuICAgICAgJ3JvdW5kZWQtcic6IFsncm91bmRlZC10cicsICdyb3VuZGVkLWJyJ10sXG4gICAgICAncm91bmRlZC1iJzogWydyb3VuZGVkLWJyJywgJ3JvdW5kZWQtYmwnXSxcbiAgICAgICdyb3VuZGVkLWwnOiBbJ3JvdW5kZWQtdGwnLCAncm91bmRlZC1ibCddLFxuICAgICAgJ2JvcmRlci1zcGFjaW5nJzogWydib3JkZXItc3BhY2luZy14JywgJ2JvcmRlci1zcGFjaW5nLXknXSxcbiAgICAgICdib3JkZXItdyc6IFsnYm9yZGVyLXctcycsICdib3JkZXItdy1lJywgJ2JvcmRlci13LXQnLCAnYm9yZGVyLXctcicsICdib3JkZXItdy1iJywgJ2JvcmRlci13LWwnXSxcbiAgICAgICdib3JkZXItdy14JzogWydib3JkZXItdy1yJywgJ2JvcmRlci13LWwnXSxcbiAgICAgICdib3JkZXItdy15JzogWydib3JkZXItdy10JywgJ2JvcmRlci13LWInXSxcbiAgICAgICdib3JkZXItY29sb3InOiBbJ2JvcmRlci1jb2xvci10JywgJ2JvcmRlci1jb2xvci1yJywgJ2JvcmRlci1jb2xvci1iJywgJ2JvcmRlci1jb2xvci1sJ10sXG4gICAgICAnYm9yZGVyLWNvbG9yLXgnOiBbJ2JvcmRlci1jb2xvci1yJywgJ2JvcmRlci1jb2xvci1sJ10sXG4gICAgICAnYm9yZGVyLWNvbG9yLXknOiBbJ2JvcmRlci1jb2xvci10JywgJ2JvcmRlci1jb2xvci1iJ10sXG4gICAgICAnc2Nyb2xsLW0nOiBbJ3Njcm9sbC1teCcsICdzY3JvbGwtbXknLCAnc2Nyb2xsLW1zJywgJ3Njcm9sbC1tZScsICdzY3JvbGwtbXQnLCAnc2Nyb2xsLW1yJywgJ3Njcm9sbC1tYicsICdzY3JvbGwtbWwnXSxcbiAgICAgICdzY3JvbGwtbXgnOiBbJ3Njcm9sbC1tcicsICdzY3JvbGwtbWwnXSxcbiAgICAgICdzY3JvbGwtbXknOiBbJ3Njcm9sbC1tdCcsICdzY3JvbGwtbWInXSxcbiAgICAgICdzY3JvbGwtcCc6IFsnc2Nyb2xsLXB4JywgJ3Njcm9sbC1weScsICdzY3JvbGwtcHMnLCAnc2Nyb2xsLXBlJywgJ3Njcm9sbC1wdCcsICdzY3JvbGwtcHInLCAnc2Nyb2xsLXBiJywgJ3Njcm9sbC1wbCddLFxuICAgICAgJ3Njcm9sbC1weCc6IFsnc2Nyb2xsLXByJywgJ3Njcm9sbC1wbCddLFxuICAgICAgJ3Njcm9sbC1weSc6IFsnc2Nyb2xsLXB0JywgJ3Njcm9sbC1wYiddLFxuICAgICAgdG91Y2g6IFsndG91Y2gteCcsICd0b3VjaC15JywgJ3RvdWNoLXB6J10sXG4gICAgICAndG91Y2gteCc6IFsndG91Y2gnXSxcbiAgICAgICd0b3VjaC15JzogWyd0b3VjaCddLFxuICAgICAgJ3RvdWNoLXB6JzogWyd0b3VjaCddXG4gICAgfSxcbiAgICBjb25mbGljdGluZ0NsYXNzR3JvdXBNb2RpZmllcnM6IHtcbiAgICAgICdmb250LXNpemUnOiBbJ2xlYWRpbmcnXVxuICAgIH1cbiAgfTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gYmFzZUNvbmZpZyBDb25maWcgd2hlcmUgb3RoZXIgY29uZmlnIHdpbGwgYmUgbWVyZ2VkIGludG8uIFRoaXMgb2JqZWN0IHdpbGwgYmUgbXV0YXRlZC5cbiAqIEBwYXJhbSBjb25maWdFeHRlbnNpb24gUGFydGlhbCBjb25maWcgdG8gbWVyZ2UgaW50byB0aGUgYGJhc2VDb25maWdgLlxuICovXG5mdW5jdGlvbiBtZXJnZUNvbmZpZ3MoYmFzZUNvbmZpZywge1xuICBjYWNoZVNpemUsXG4gIHByZWZpeCxcbiAgc2VwYXJhdG9yLFxuICBleHBlcmltZW50YWxQYXJzZUNsYXNzTmFtZSxcbiAgZXh0ZW5kID0ge30sXG4gIG92ZXJyaWRlID0ge31cbn0pIHtcbiAgb3ZlcnJpZGVQcm9wZXJ0eShiYXNlQ29uZmlnLCAnY2FjaGVTaXplJywgY2FjaGVTaXplKTtcbiAgb3ZlcnJpZGVQcm9wZXJ0eShiYXNlQ29uZmlnLCAncHJlZml4JywgcHJlZml4KTtcbiAgb3ZlcnJpZGVQcm9wZXJ0eShiYXNlQ29uZmlnLCAnc2VwYXJhdG9yJywgc2VwYXJhdG9yKTtcbiAgb3ZlcnJpZGVQcm9wZXJ0eShiYXNlQ29uZmlnLCAnZXhwZXJpbWVudGFsUGFyc2VDbGFzc05hbWUnLCBleHBlcmltZW50YWxQYXJzZUNsYXNzTmFtZSk7XG4gIGZvciAoY29uc3QgY29uZmlnS2V5IGluIG92ZXJyaWRlKSB7XG4gICAgb3ZlcnJpZGVDb25maWdQcm9wZXJ0aWVzKGJhc2VDb25maWdbY29uZmlnS2V5XSwgb3ZlcnJpZGVbY29uZmlnS2V5XSk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gZXh0ZW5kKSB7XG4gICAgbWVyZ2VDb25maWdQcm9wZXJ0aWVzKGJhc2VDb25maWdba2V5XSwgZXh0ZW5kW2tleV0pO1xuICB9XG4gIHJldHVybiBiYXNlQ29uZmlnO1xufVxuZnVuY3Rpb24gb3ZlcnJpZGVQcm9wZXJ0eShiYXNlT2JqZWN0LCBvdmVycmlkZUtleSwgb3ZlcnJpZGVWYWx1ZSkge1xuICBpZiAob3ZlcnJpZGVWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgYmFzZU9iamVjdFtvdmVycmlkZUtleV0gPSBvdmVycmlkZVZhbHVlO1xuICB9XG59XG5mdW5jdGlvbiBvdmVycmlkZUNvbmZpZ1Byb3BlcnRpZXMoYmFzZU9iamVjdCwgb3ZlcnJpZGVPYmplY3QpIHtcbiAgaWYgKG92ZXJyaWRlT2JqZWN0KSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3ZlcnJpZGVPYmplY3QpIHtcbiAgICAgIG92ZXJyaWRlUHJvcGVydHkoYmFzZU9iamVjdCwga2V5LCBvdmVycmlkZU9iamVjdFtrZXldKTtcbiAgICB9XG4gIH1cbn1cbmZ1bmN0aW9uIG1lcmdlQ29uZmlnUHJvcGVydGllcyhiYXNlT2JqZWN0LCBtZXJnZU9iamVjdCkge1xuICBpZiAobWVyZ2VPYmplY3QpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBtZXJnZU9iamVjdCkge1xuICAgICAgY29uc3QgbWVyZ2VWYWx1ZSA9IG1lcmdlT2JqZWN0W2tleV07XG4gICAgICBpZiAobWVyZ2VWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGJhc2VPYmplY3Rba2V5XSA9IChiYXNlT2JqZWN0W2tleV0gfHwgW10pLmNvbmNhdChtZXJnZVZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbmZ1bmN0aW9uIGV4dGVuZFRhaWx3aW5kTWVyZ2UoY29uZmlnRXh0ZW5zaW9uLCAuLi5jcmVhdGVDb25maWcpIHtcbiAgcmV0dXJuIHR5cGVvZiBjb25maWdFeHRlbnNpb24gPT09ICdmdW5jdGlvbicgPyBjcmVhdGVUYWlsd2luZE1lcmdlKGdldERlZmF1bHRDb25maWcsIGNvbmZpZ0V4dGVuc2lvbiwgLi4uY3JlYXRlQ29uZmlnKSA6IGNyZWF0ZVRhaWx3aW5kTWVyZ2UoKCkgPT4gbWVyZ2VDb25maWdzKGdldERlZmF1bHRDb25maWcoKSwgY29uZmlnRXh0ZW5zaW9uKSwgLi4uY3JlYXRlQ29uZmlnKTtcbn1cbmNvbnN0IHR3TWVyZ2UgPSAvKiNfX1BVUkVfXyovY3JlYXRlVGFpbHdpbmRNZXJnZShnZXREZWZhdWx0Q29uZmlnKTtcbmV4cG9ydCB7IGNyZWF0ZVRhaWx3aW5kTWVyZ2UsIGV4dGVuZFRhaWx3aW5kTWVyZ2UsIGZyb21UaGVtZSwgZ2V0RGVmYXVsdENvbmZpZywgbWVyZ2VDb25maWdzLCB0d0pvaW4sIHR3TWVyZ2UsIHZhbGlkYXRvcnMgfTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWJ1bmRsZS1tanMubWpzLm1hcFxuIiwiaW1wb3J0IHR5cGUgeyBDbGFzc1ZhbHVlIH0gZnJvbSBcImNsc3hcIjtcclxuaW1wb3J0IGNsc3ggZnJvbSBcImNsc3hcIjtcclxuaW1wb3J0IHsgdHdNZXJnZSB9IGZyb20gXCJ0YWlsd2luZC1tZXJnZVwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IGNuID0gKC4uLmNsYXNzTGlzdHM6IENsYXNzVmFsdWVbXSkgPT4gdHdNZXJnZShjbHN4KGNsYXNzTGlzdHMpKTtcclxuIiwiaW1wb3J0IHsgREVWLCBlcXVhbEZuLCB1bnRyYWNrLCBnZXRPd25lciwgb25DbGVhbnVwLCBjcmVhdGVTaWduYWwsIHNoYXJlZENvbmZpZywgb25Nb3VudCB9IGZyb20gJ3NvbGlkLWpzJztcbmltcG9ydCB7IGlzU2VydmVyIH0gZnJvbSAnc29saWQtanMvd2ViJztcbmV4cG9ydCB7IGlzU2VydmVyIH0gZnJvbSAnc29saWQtanMvd2ViJztcblxuLy8gc3JjL2luZGV4LnRzXG52YXIgaXNDbGllbnQgPSAhaXNTZXJ2ZXI7XG52YXIgaXNEZXYgPSBpc0NsaWVudCAmJiAhIURFVjtcbnZhciBpc1Byb2QgPSAhaXNEZXY7XG52YXIgbm9vcCA9ICgpID0+IHZvaWQgMDtcbnZhciB0cnVlRm4gPSAoKSA9PiB0cnVlO1xudmFyIGZhbHNlRm4gPSAoKSA9PiBmYWxzZTtcbnZhciBkZWZhdWx0RXF1YWxzID0gZXF1YWxGbjtcbnZhciBFUVVBTFNfRkFMU0VfT1BUSU9OUyA9IHsgZXF1YWxzOiBmYWxzZSB9O1xudmFyIElOVEVSTkFMX09QVElPTlMgPSB7IGludGVybmFsOiB0cnVlIH07XG52YXIgb2ZDbGFzcyA9ICh2LCBjKSA9PiB2IGluc3RhbmNlb2YgYyB8fCB2ICYmIHYuY29uc3RydWN0b3IgPT09IGM7XG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgIT09IG51bGwgJiYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiB8fCB0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIik7XG59XG52YXIgaXNOb25OdWxsYWJsZSA9IChpKSA9PiBpICE9IG51bGw7XG52YXIgZmlsdGVyTm9uTnVsbGFibGUgPSAoYXJyKSA9PiBhcnIuZmlsdGVyKGlzTm9uTnVsbGFibGUpO1xudmFyIGNvbXBhcmUgPSAoYSwgYikgPT4gYSA8IGIgPyAtMSA6IGEgPiBiID8gMSA6IDA7XG52YXIgYXJyYXlFcXVhbHMgPSAoYSwgYikgPT4gYSA9PT0gYiB8fCBhLmxlbmd0aCA9PT0gYi5sZW5ndGggJiYgYS5ldmVyeSgoZSwgaSkgPT4gZSA9PT0gYltpXSk7XG5mdW5jdGlvbiBjaGFpbihjYWxsYmFja3MpIHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgZm9yIChjb25zdCBjYWxsYmFjayBvZiBjYWxsYmFja3MpXG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayguLi5hcmdzKTtcbiAgfTtcbn1cbmZ1bmN0aW9uIHJldmVyc2VDaGFpbihjYWxsYmFja3MpIHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgZm9yIChsZXQgaSA9IGNhbGxiYWNrcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgY29uc3QgY2FsbGJhY2sgPSBjYWxsYmFja3NbaV07XG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayguLi5hcmdzKTtcbiAgICB9XG4gIH07XG59XG52YXIgY2xhbXAgPSAobiwgbWluLCBtYXgpID0+IE1hdGgubWluKE1hdGgubWF4KG4sIG1pbiksIG1heCk7XG52YXIgYWNjZXNzID0gKHYpID0+IHR5cGVvZiB2ID09PSBcImZ1bmN0aW9uXCIgJiYgIXYubGVuZ3RoID8gdigpIDogdjtcbnZhciBhc0FycmF5ID0gKHZhbHVlKSA9PiBBcnJheS5pc0FycmF5KHZhbHVlKSA/IHZhbHVlIDogdmFsdWUgPyBbdmFsdWVdIDogW107XG52YXIgYWNjZXNzQXJyYXkgPSAobGlzdCkgPT4gbGlzdC5tYXAoKHYpID0+IGFjY2Vzcyh2KSk7XG52YXIgd2l0aEFjY2VzcyA9ICh2YWx1ZSwgZm4pID0+IHtcbiAgY29uc3QgX3ZhbHVlID0gYWNjZXNzKHZhbHVlKTtcbiAgdHlwZW9mIF92YWx1ZSAhPSBudWxsICYmIGZuKF92YWx1ZSk7XG59O1xudmFyIGFzQWNjZXNzb3IgPSAodikgPT4gdHlwZW9mIHYgPT09IFwiZnVuY3Rpb25cIiA/IHYgOiAoKSA9PiB2O1xuZnVuY3Rpb24gYWNjZXNzV2l0aCh2YWx1ZU9yRm4sIC4uLmFyZ3MpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZU9yRm4gPT09IFwiZnVuY3Rpb25cIiA/IHZhbHVlT3JGbiguLi5hcmdzKSA6IHZhbHVlT3JGbjtcbn1cbmZ1bmN0aW9uIGRlZmVyKGRlcHMsIGZuLCBpbml0aWFsVmFsdWUpIHtcbiAgY29uc3QgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkoZGVwcyk7XG4gIGxldCBwcmV2SW5wdXQ7XG4gIGxldCBzaG91bGREZWZlciA9IHRydWU7XG4gIHJldHVybiAocHJldlZhbHVlKSA9PiB7XG4gICAgbGV0IGlucHV0O1xuICAgIGlmIChpc0FycmF5KSB7XG4gICAgICBpbnB1dCA9IEFycmF5KGRlcHMubGVuZ3RoKTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGVwcy5sZW5ndGg7IGkrKylcbiAgICAgICAgaW5wdXRbaV0gPSBkZXBzW2ldKCk7XG4gICAgfSBlbHNlXG4gICAgICBpbnB1dCA9IGRlcHMoKTtcbiAgICBpZiAoc2hvdWxkRGVmZXIpIHtcbiAgICAgIHNob3VsZERlZmVyID0gZmFsc2U7XG4gICAgICBwcmV2SW5wdXQgPSBpbnB1dDtcbiAgICAgIHJldHVybiBpbml0aWFsVmFsdWU7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IHVudHJhY2soKCkgPT4gZm4oaW5wdXQsIHByZXZJbnB1dCwgcHJldlZhbHVlKSk7XG4gICAgcHJldklucHV0ID0gaW5wdXQ7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcbn1cbnZhciBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXM7XG52YXIga2V5cyA9IE9iamVjdC5rZXlzO1xudmFyIHRyeU9uQ2xlYW51cCA9IGlzRGV2ID8gKGZuKSA9PiBnZXRPd25lcigpID8gb25DbGVhbnVwKGZuKSA6IGZuIDogb25DbGVhbnVwO1xudmFyIGNyZWF0ZUNhbGxiYWNrU3RhY2sgPSAoKSA9PiB7XG4gIGxldCBzdGFjayA9IFtdO1xuICBjb25zdCBjbGVhciA9ICgpID0+IHN0YWNrID0gW107XG4gIHJldHVybiB7XG4gICAgcHVzaDogKC4uLmNhbGxiYWNrcykgPT4gc3RhY2sucHVzaCguLi5jYWxsYmFja3MpLFxuICAgIGV4ZWN1dGUoYXJnMCwgYXJnMSwgYXJnMiwgYXJnMykge1xuICAgICAgc3RhY2suZm9yRWFjaCgoY2IpID0+IGNiKGFyZzAsIGFyZzEsIGFyZzIsIGFyZzMpKTtcbiAgICAgIGNsZWFyKCk7XG4gICAgfSxcbiAgICBjbGVhclxuICB9O1xufTtcbmZ1bmN0aW9uIGNyZWF0ZU1pY3JvdGFzayhmbikge1xuICBsZXQgY2FsbHMgPSAwO1xuICBsZXQgYXJncztcbiAgb25DbGVhbnVwKCgpID0+IGNhbGxzID0gMCk7XG4gIHJldHVybiAoLi4uYSkgPT4ge1xuICAgIGFyZ3MgPSBhLCBjYWxscysrO1xuICAgIHF1ZXVlTWljcm90YXNrKCgpID0+IC0tY2FsbHMgPT09IDAgJiYgZm4oLi4uYXJncykpO1xuICB9O1xufVxuZnVuY3Rpb24gY3JlYXRlSHlkcmF0YWJsZVNpZ25hbChzZXJ2ZXJWYWx1ZSwgdXBkYXRlLCBvcHRpb25zKSB7XG4gIGlmIChpc1NlcnZlcikge1xuICAgIHJldHVybiBjcmVhdGVTaWduYWwoc2VydmVyVmFsdWUsIG9wdGlvbnMpO1xuICB9XG4gIGlmIChzaGFyZWRDb25maWcuY29udGV4dCkge1xuICAgIGNvbnN0IFtzdGF0ZSwgc2V0U3RhdGVdID0gY3JlYXRlU2lnbmFsKHNlcnZlclZhbHVlLCBvcHRpb25zKTtcbiAgICBvbk1vdW50KCgpID0+IHNldFN0YXRlKCgpID0+IHVwZGF0ZSgpKSk7XG4gICAgcmV0dXJuIFtzdGF0ZSwgc2V0U3RhdGVdO1xuICB9XG4gIHJldHVybiBjcmVhdGVTaWduYWwodXBkYXRlKCksIG9wdGlvbnMpO1xufVxudmFyIGNyZWF0ZUh5ZHJhdGVTaWduYWwgPSBjcmVhdGVIeWRyYXRhYmxlU2lnbmFsO1xuZnVuY3Rpb24gaGFuZGxlRGlmZkFycmF5KGN1cnJlbnQsIHByZXYsIGhhbmRsZUFkZGVkLCBoYW5kbGVSZW1vdmVkKSB7XG4gIGNvbnN0IGN1cnJMZW5ndGggPSBjdXJyZW50Lmxlbmd0aDtcbiAgY29uc3QgcHJldkxlbmd0aCA9IHByZXYubGVuZ3RoO1xuICBsZXQgaSA9IDA7XG4gIGlmICghcHJldkxlbmd0aCkge1xuICAgIGZvciAoOyBpIDwgY3Vyckxlbmd0aDsgaSsrKVxuICAgICAgaGFuZGxlQWRkZWQoY3VycmVudFtpXSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghY3Vyckxlbmd0aCkge1xuICAgIGZvciAoOyBpIDwgcHJldkxlbmd0aDsgaSsrKVxuICAgICAgaGFuZGxlUmVtb3ZlZChwcmV2W2ldKTtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yICg7IGkgPCBwcmV2TGVuZ3RoOyBpKyspIHtcbiAgICBpZiAocHJldltpXSAhPT0gY3VycmVudFtpXSlcbiAgICAgIGJyZWFrO1xuICB9XG4gIGxldCBwcmV2RWw7XG4gIGxldCBjdXJyRWw7XG4gIHByZXYgPSBwcmV2LnNsaWNlKGkpO1xuICBjdXJyZW50ID0gY3VycmVudC5zbGljZShpKTtcbiAgZm9yIChwcmV2RWwgb2YgcHJldikge1xuICAgIGlmICghY3VycmVudC5pbmNsdWRlcyhwcmV2RWwpKVxuICAgICAgaGFuZGxlUmVtb3ZlZChwcmV2RWwpO1xuICB9XG4gIGZvciAoY3VyckVsIG9mIGN1cnJlbnQpIHtcbiAgICBpZiAoIXByZXYuaW5jbHVkZXMoY3VyckVsKSlcbiAgICAgIGhhbmRsZUFkZGVkKGN1cnJFbCk7XG4gIH1cbn1cblxuZXhwb3J0IHsgRVFVQUxTX0ZBTFNFX09QVElPTlMsIElOVEVSTkFMX09QVElPTlMsIGFjY2VzcywgYWNjZXNzQXJyYXksIGFjY2Vzc1dpdGgsIGFycmF5RXF1YWxzLCBhc0FjY2Vzc29yLCBhc0FycmF5LCBjaGFpbiwgY2xhbXAsIGNvbXBhcmUsIGNyZWF0ZUNhbGxiYWNrU3RhY2ssIGNyZWF0ZUh5ZHJhdGFibGVTaWduYWwsIGNyZWF0ZUh5ZHJhdGVTaWduYWwsIGNyZWF0ZU1pY3JvdGFzaywgZGVmYXVsdEVxdWFscywgZGVmZXIsIGVudHJpZXMsIGZhbHNlRm4sIGZpbHRlck5vbk51bGxhYmxlLCBoYW5kbGVEaWZmQXJyYXksIGlzQ2xpZW50LCBpc0RldiwgaXNOb25OdWxsYWJsZSwgaXNPYmplY3QsIGlzUHJvZCwga2V5cywgbm9vcCwgb2ZDbGFzcywgcmV2ZXJzZUNoYWluLCB0cnVlRm4sIHRyeU9uQ2xlYW51cCwgd2l0aEFjY2VzcyB9O1xuIiwiaW1wb3J0IHsgY2hhaW4sIGFycmF5RXF1YWxzIH0gZnJvbSAnQHNvbGlkLXByaW1pdGl2ZXMvdXRpbHMnO1xuaW1wb3J0IHsgY3JlYXRlTWVtbywgY2hpbGRyZW4sIGNyZWF0ZUNvbXB1dGVkLCB1bnRyYWNrLCBvbkNsZWFudXAgfSBmcm9tICdzb2xpZC1qcyc7XG5pbXBvcnQgeyBpc1NlcnZlciB9IGZyb20gJ3NvbGlkLWpzL3dlYic7XG5cbi8vIHNyYy9pbmRleC50c1xuZnVuY3Rpb24gbWVyZ2VSZWZzKC4uLnJlZnMpIHtcbiAgcmV0dXJuIGNoYWluKHJlZnMpO1xufVxudmFyIGRlZmF1bHRFbGVtZW50UHJlZGljYXRlID0gaXNTZXJ2ZXIgPyAoaXRlbSkgPT4gaXRlbSAhPSBudWxsICYmIHR5cGVvZiBpdGVtID09PSBcIm9iamVjdFwiICYmIFwidFwiIGluIGl0ZW0gOiAoaXRlbSkgPT4gaXRlbSBpbnN0YW5jZW9mIEVsZW1lbnQ7XG5mdW5jdGlvbiBnZXRSZXNvbHZlZEVsZW1lbnRzKHZhbHVlLCBwcmVkaWNhdGUpIHtcbiAgaWYgKHByZWRpY2F0ZSh2YWx1ZSkpXG4gICAgcmV0dXJuIHZhbHVlO1xuICBpZiAodHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCIgJiYgIXZhbHVlLmxlbmd0aClcbiAgICByZXR1cm4gZ2V0UmVzb2x2ZWRFbGVtZW50cyh2YWx1ZSgpLCBwcmVkaWNhdGUpO1xuICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICBjb25zdCByZXN1bHRzID0gW107XG4gICAgZm9yIChjb25zdCBpdGVtIG9mIHZhbHVlKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBnZXRSZXNvbHZlZEVsZW1lbnRzKGl0ZW0sIHByZWRpY2F0ZSk7XG4gICAgICBpZiAocmVzdWx0KVxuICAgICAgICBBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHRzLnB1c2guYXBwbHkocmVzdWx0cywgcmVzdWx0KSA6IHJlc3VsdHMucHVzaChyZXN1bHQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cy5sZW5ndGggPyByZXN1bHRzIDogbnVsbDtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cbmZ1bmN0aW9uIHJlc29sdmVFbGVtZW50cyhmbiwgcHJlZGljYXRlID0gZGVmYXVsdEVsZW1lbnRQcmVkaWNhdGUsIHNlcnZlclByZWRpY2F0ZSA9IGRlZmF1bHRFbGVtZW50UHJlZGljYXRlKSB7XG4gIGNvbnN0IGNoaWxkcmVuMiA9IGNyZWF0ZU1lbW8oZm4pO1xuICBjb25zdCBtZW1vID0gY3JlYXRlTWVtbyhcbiAgICAoKSA9PiBnZXRSZXNvbHZlZEVsZW1lbnRzKGNoaWxkcmVuMigpLCBpc1NlcnZlciA/IHNlcnZlclByZWRpY2F0ZSA6IHByZWRpY2F0ZSlcbiAgKTtcbiAgbWVtby50b0FycmF5ID0gKCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gbWVtbygpO1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KHZhbHVlKSA/IHZhbHVlIDogdmFsdWUgPyBbdmFsdWVdIDogW107XG4gIH07XG4gIHJldHVybiBtZW1vO1xufVxuZnVuY3Rpb24gZ2V0Rmlyc3RDaGlsZCh2YWx1ZSwgcHJlZGljYXRlKSB7XG4gIGlmIChwcmVkaWNhdGUodmFsdWUpKVxuICAgIHJldHVybiB2YWx1ZTtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiICYmICF2YWx1ZS5sZW5ndGgpXG4gICAgcmV0dXJuIGdldEZpcnN0Q2hpbGQodmFsdWUoKSwgcHJlZGljYXRlKTtcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgZm9yIChjb25zdCBpdGVtIG9mIHZhbHVlKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBnZXRGaXJzdENoaWxkKGl0ZW0sIHByZWRpY2F0ZSk7XG4gICAgICBpZiAocmVzdWx0KVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cbmZ1bmN0aW9uIHJlc29sdmVGaXJzdChmbiwgcHJlZGljYXRlID0gZGVmYXVsdEVsZW1lbnRQcmVkaWNhdGUsIHNlcnZlclByZWRpY2F0ZSA9IGRlZmF1bHRFbGVtZW50UHJlZGljYXRlKSB7XG4gIGNvbnN0IGNoaWxkcmVuMiA9IGNyZWF0ZU1lbW8oZm4pO1xuICByZXR1cm4gY3JlYXRlTWVtbygoKSA9PiBnZXRGaXJzdENoaWxkKGNoaWxkcmVuMigpLCBpc1NlcnZlciA/IHNlcnZlclByZWRpY2F0ZSA6IHByZWRpY2F0ZSkpO1xufVxuZnVuY3Rpb24gUmVmcyhwcm9wcykge1xuICBpZiAoaXNTZXJ2ZXIpIHtcbiAgICByZXR1cm4gcHJvcHMuY2hpbGRyZW47XG4gIH1cbiAgY29uc3QgY2IgPSBwcm9wcy5yZWYsIHJlc29sdmVkID0gY2hpbGRyZW4oKCkgPT4gcHJvcHMuY2hpbGRyZW4pO1xuICBsZXQgcHJldiA9IFtdO1xuICBjcmVhdGVDb21wdXRlZCgoKSA9PiB7XG4gICAgY29uc3QgZWxzID0gcmVzb2x2ZWQudG9BcnJheSgpLmZpbHRlcihkZWZhdWx0RWxlbWVudFByZWRpY2F0ZSk7XG4gICAgaWYgKCFhcnJheUVxdWFscyhwcmV2LCBlbHMpKVxuICAgICAgdW50cmFjaygoKSA9PiBjYihlbHMpKTtcbiAgICBwcmV2ID0gZWxzO1xuICB9LCBbXSk7XG4gIG9uQ2xlYW51cCgoKSA9PiBwcmV2Lmxlbmd0aCAmJiBjYihbXSkpO1xuICByZXR1cm4gcmVzb2x2ZWQ7XG59XG5mdW5jdGlvbiBSZWYocHJvcHMpIHtcbiAgaWYgKGlzU2VydmVyKSB7XG4gICAgcmV0dXJuIHByb3BzLmNoaWxkcmVuO1xuICB9XG4gIGNvbnN0IGNiID0gcHJvcHMucmVmLCByZXNvbHZlZCA9IGNoaWxkcmVuKCgpID0+IHByb3BzLmNoaWxkcmVuKTtcbiAgbGV0IHByZXY7XG4gIGNyZWF0ZUNvbXB1dGVkKCgpID0+IHtcbiAgICBjb25zdCBlbCA9IHJlc29sdmVkLnRvQXJyYXkoKS5maW5kKGRlZmF1bHRFbGVtZW50UHJlZGljYXRlKTtcbiAgICBpZiAoZWwgIT09IHByZXYpXG4gICAgICB1bnRyYWNrKCgpID0+IGNiKGVsKSk7XG4gICAgcHJldiA9IGVsO1xuICB9KTtcbiAgb25DbGVhbnVwKCgpID0+IHByZXYgJiYgY2Iodm9pZCAwKSk7XG4gIHJldHVybiByZXNvbHZlZDtcbn1cblxuZXhwb3J0IHsgUmVmLCBSZWZzLCBkZWZhdWx0RWxlbWVudFByZWRpY2F0ZSwgZ2V0Rmlyc3RDaGlsZCwgZ2V0UmVzb2x2ZWRFbGVtZW50cywgbWVyZ2VSZWZzLCByZXNvbHZlRWxlbWVudHMsIHJlc29sdmVGaXJzdCB9O1xuIiwiaW1wb3J0IHsgb25DbGVhbnVwLCBtZXJnZVByb3BzIH0gZnJvbSAnc29saWQtanMnO1xuZXhwb3J0IHsgY3JlYXRlRXZlbnRMaXN0ZW5lciB9IGZyb20gJ0Bzb2xpZC1wcmltaXRpdmVzL2V2ZW50LWxpc3RlbmVyJztcbmV4cG9ydCB7IEtleSB9IGZyb20gJ0Bzb2xpZC1wcmltaXRpdmVzL2tleWVkJztcbmV4cG9ydCB7IFJlYWN0aXZlTWFwIH0gZnJvbSAnQHNvbGlkLXByaW1pdGl2ZXMvbWFwJztcbmV4cG9ydCB7IGNyZWF0ZU1lZGlhUXVlcnkgfSBmcm9tICdAc29saWQtcHJpbWl0aXZlcy9tZWRpYSc7XG5leHBvcnQgeyBjb21iaW5lUHJvcHMgfSBmcm9tICdAc29saWQtcHJpbWl0aXZlcy9wcm9wcyc7XG5leHBvcnQgeyBtZXJnZVJlZnMgfSBmcm9tICdAc29saWQtcHJpbWl0aXZlcy9yZWZzJztcbmV4cG9ydCB7IGFjY2VzcywgYWNjZXNzV2l0aCwgY2hhaW4gfSBmcm9tICdAc29saWQtcHJpbWl0aXZlcy91dGlscyc7XG5cbi8vIHNyYy9hcnJheS50c1xuZnVuY3Rpb24gYWRkSXRlbVRvQXJyYXkoYXJyYXksIGl0ZW0sIGluZGV4ID0gLTEpIHtcbiAgaWYgKCEoaW5kZXggaW4gYXJyYXkpKSB7XG4gICAgcmV0dXJuIFsuLi5hcnJheSwgaXRlbV07XG4gIH1cbiAgcmV0dXJuIFsuLi5hcnJheS5zbGljZSgwLCBpbmRleCksIGl0ZW0sIC4uLmFycmF5LnNsaWNlKGluZGV4KV07XG59XG5mdW5jdGlvbiByZW1vdmVJdGVtRnJvbUFycmF5KGFycmF5LCBpdGVtKSB7XG4gIGNvbnN0IHVwZGF0ZWRBcnJheSA9IFsuLi5hcnJheV07XG4gIGNvbnN0IGluZGV4ID0gdXBkYXRlZEFycmF5LmluZGV4T2YoaXRlbSk7XG4gIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICB1cGRhdGVkQXJyYXkuc3BsaWNlKGluZGV4LCAxKTtcbiAgfVxuICByZXR1cm4gdXBkYXRlZEFycmF5O1xufVxuXG4vLyBzcmMvYXNzZXJ0aW9uLnRzXG5mdW5jdGlvbiBpc051bWJlcih2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiO1xufVxuZnVuY3Rpb24gaXNBcnJheSh2YWx1ZSkge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5mdW5jdGlvbiBpc1N0cmluZyh2YWx1ZSkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSA9PT0gXCJbb2JqZWN0IFN0cmluZ11cIjtcbn1cbmZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiO1xufVxuXG4vLyBzcmMvY3JlYXRlLWdlbmVyYXRlLWlkLnRzXG5mdW5jdGlvbiBjcmVhdGVHZW5lcmF0ZUlkKGJhc2VJZCkge1xuICByZXR1cm4gKHN1ZmZpeCkgPT4gYCR7YmFzZUlkKCl9LSR7c3VmZml4fWA7XG59XG5mdW5jdGlvbiBjcmVhdGVHbG9iYWxMaXN0ZW5lcnMoKSB7XG4gIGNvbnN0IGdsb2JhbExpc3RlbmVycyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgTWFwKCk7XG4gIGNvbnN0IGFkZEdsb2JhbExpc3RlbmVyID0gKGV2ZW50VGFyZ2V0LCB0eXBlLCBsaXN0ZW5lciwgb3B0aW9ucykgPT4ge1xuICAgIGNvbnN0IGZuID0gb3B0aW9ucz8ub25jZSA/ICguLi5hcmdzKSA9PiB7XG4gICAgICBnbG9iYWxMaXN0ZW5lcnMuZGVsZXRlKGxpc3RlbmVyKTtcbiAgICAgIGxpc3RlbmVyKC4uLmFyZ3MpO1xuICAgIH0gOiBsaXN0ZW5lcjtcbiAgICBnbG9iYWxMaXN0ZW5lcnMuc2V0KGxpc3RlbmVyLCB7IHR5cGUsIGV2ZW50VGFyZ2V0LCBmbiwgb3B0aW9ucyB9KTtcbiAgICBldmVudFRhcmdldC5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyLCBvcHRpb25zKTtcbiAgfTtcbiAgY29uc3QgcmVtb3ZlR2xvYmFsTGlzdGVuZXIgPSAoZXZlbnRUYXJnZXQsIHR5cGUsIGxpc3RlbmVyLCBvcHRpb25zKSA9PiB7XG4gICAgY29uc3QgZm4gPSBnbG9iYWxMaXN0ZW5lcnMuZ2V0KGxpc3RlbmVyKT8uZm4gfHwgbGlzdGVuZXI7XG4gICAgZXZlbnRUYXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlLCBmbiwgb3B0aW9ucyk7XG4gICAgZ2xvYmFsTGlzdGVuZXJzLmRlbGV0ZShsaXN0ZW5lcik7XG4gIH07XG4gIGNvbnN0IHJlbW92ZUFsbEdsb2JhbExpc3RlbmVycyA9ICgpID0+IHtcbiAgICBnbG9iYWxMaXN0ZW5lcnMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgcmVtb3ZlR2xvYmFsTGlzdGVuZXIodmFsdWUuZXZlbnRUYXJnZXQsIHZhbHVlLnR5cGUsIGtleSwgdmFsdWUub3B0aW9ucyk7XG4gICAgfSk7XG4gIH07XG4gIG9uQ2xlYW51cCgoKSA9PiB7XG4gICAgcmVtb3ZlQWxsR2xvYmFsTGlzdGVuZXJzKCk7XG4gIH0pO1xuICByZXR1cm4geyBhZGRHbG9iYWxMaXN0ZW5lciwgcmVtb3ZlR2xvYmFsTGlzdGVuZXIsIHJlbW92ZUFsbEdsb2JhbExpc3RlbmVycyB9O1xufVxuXG4vLyBzcmMvZG9tLnRzXG5mdW5jdGlvbiBjb250YWlucyhwYXJlbnQsIGNoaWxkKSB7XG4gIGlmICghcGFyZW50KSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiBwYXJlbnQgPT09IGNoaWxkIHx8IHBhcmVudC5jb250YWlucyhjaGlsZCk7XG59XG5mdW5jdGlvbiBnZXRBY3RpdmVFbGVtZW50KG5vZGUsIGFjdGl2ZURlc2NlbmRhbnQgPSBmYWxzZSkge1xuICBjb25zdCB7IGFjdGl2ZUVsZW1lbnQgfSA9IGdldERvY3VtZW50KG5vZGUpO1xuICBpZiAoIWFjdGl2ZUVsZW1lbnQ/Lm5vZGVOYW1lKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaWYgKGlzRnJhbWUoYWN0aXZlRWxlbWVudCkgJiYgYWN0aXZlRWxlbWVudC5jb250ZW50RG9jdW1lbnQpIHtcbiAgICByZXR1cm4gZ2V0QWN0aXZlRWxlbWVudChhY3RpdmVFbGVtZW50LmNvbnRlbnREb2N1bWVudC5ib2R5LCBhY3RpdmVEZXNjZW5kYW50KTtcbiAgfVxuICBpZiAoYWN0aXZlRGVzY2VuZGFudCkge1xuICAgIGNvbnN0IGlkID0gYWN0aXZlRWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJhcmlhLWFjdGl2ZWRlc2NlbmRhbnRcIik7XG4gICAgaWYgKGlkKSB7XG4gICAgICBjb25zdCBlbGVtZW50ID0gZ2V0RG9jdW1lbnQoYWN0aXZlRWxlbWVudCkuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgICAgaWYgKGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBhY3RpdmVFbGVtZW50O1xufVxuZnVuY3Rpb24gZ2V0V2luZG93KG5vZGUpIHtcbiAgcmV0dXJuIGdldERvY3VtZW50KG5vZGUpLmRlZmF1bHRWaWV3IHx8IHdpbmRvdztcbn1cbmZ1bmN0aW9uIGdldERvY3VtZW50KG5vZGUpIHtcbiAgcmV0dXJuIG5vZGUgPyBub2RlLm93bmVyRG9jdW1lbnQgfHwgbm9kZSA6IGRvY3VtZW50O1xufVxuZnVuY3Rpb24gaXNGcmFtZShlbGVtZW50KSB7XG4gIHJldHVybiBlbGVtZW50LnRhZ05hbWUgPT09IFwiSUZSQU1FXCI7XG59XG5cbi8vIHNyYy9lbnVtcy50c1xudmFyIEV2ZW50S2V5ID0gLyogQF9fUFVSRV9fICovICgoRXZlbnRLZXkyKSA9PiB7XG4gIEV2ZW50S2V5MltcIkVzY2FwZVwiXSA9IFwiRXNjYXBlXCI7XG4gIEV2ZW50S2V5MltcIkVudGVyXCJdID0gXCJFbnRlclwiO1xuICBFdmVudEtleTJbXCJUYWJcIl0gPSBcIlRhYlwiO1xuICBFdmVudEtleTJbXCJTcGFjZVwiXSA9IFwiIFwiO1xuICBFdmVudEtleTJbXCJBcnJvd0Rvd25cIl0gPSBcIkFycm93RG93blwiO1xuICBFdmVudEtleTJbXCJBcnJvd0xlZnRcIl0gPSBcIkFycm93TGVmdFwiO1xuICBFdmVudEtleTJbXCJBcnJvd1JpZ2h0XCJdID0gXCJBcnJvd1JpZ2h0XCI7XG4gIEV2ZW50S2V5MltcIkFycm93VXBcIl0gPSBcIkFycm93VXBcIjtcbiAgRXZlbnRLZXkyW1wiRW5kXCJdID0gXCJFbmRcIjtcbiAgRXZlbnRLZXkyW1wiSG9tZVwiXSA9IFwiSG9tZVwiO1xuICBFdmVudEtleTJbXCJQYWdlRG93blwiXSA9IFwiUGFnZURvd25cIjtcbiAgRXZlbnRLZXkyW1wiUGFnZVVwXCJdID0gXCJQYWdlVXBcIjtcbiAgcmV0dXJuIEV2ZW50S2V5Mjtcbn0pKEV2ZW50S2V5IHx8IHt9KTtcblxuLy8gc3JjL3BsYXRmb3JtLnRzXG5mdW5jdGlvbiB0ZXN0VXNlckFnZW50KHJlKSB7XG4gIGlmICh0eXBlb2Ygd2luZG93ID09PSBcInVuZGVmaW5lZFwiIHx8IHdpbmRvdy5uYXZpZ2F0b3IgPT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gKFxuICAgIC8vIEB0cy1pZ25vcmVcbiAgICB3aW5kb3cubmF2aWdhdG9yW1widXNlckFnZW50RGF0YVwiXT8uYnJhbmRzLnNvbWUoXG4gICAgICAoYnJhbmQpID0+IHJlLnRlc3QoYnJhbmQuYnJhbmQpXG4gICAgKSB8fCByZS50ZXN0KHdpbmRvdy5uYXZpZ2F0b3IudXNlckFnZW50KVxuICApO1xufVxuZnVuY3Rpb24gdGVzdFBsYXRmb3JtKHJlKSB7XG4gIHJldHVybiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIHdpbmRvdy5uYXZpZ2F0b3IgIT0gbnVsbCA/IChcbiAgICAvLyBAdHMtaWdub3JlXG4gICAgcmUudGVzdCh3aW5kb3cubmF2aWdhdG9yW1widXNlckFnZW50RGF0YVwiXT8ucGxhdGZvcm0gfHwgd2luZG93Lm5hdmlnYXRvci5wbGF0Zm9ybSlcbiAgKSA6IGZhbHNlO1xufVxuZnVuY3Rpb24gaXNNYWMoKSB7XG4gIHJldHVybiB0ZXN0UGxhdGZvcm0oL15NYWMvaSk7XG59XG5mdW5jdGlvbiBpc0lQaG9uZSgpIHtcbiAgcmV0dXJuIHRlc3RQbGF0Zm9ybSgvXmlQaG9uZS9pKTtcbn1cbmZ1bmN0aW9uIGlzSVBhZCgpIHtcbiAgcmV0dXJuIHRlc3RQbGF0Zm9ybSgvXmlQYWQvaSkgfHwgLy8gaVBhZE9TIDEzIGxpZXMgYW5kIHNheXMgaXQncyBhIE1hYywgYnV0IHdlIGNhbiBkaXN0aW5ndWlzaCBieSBkZXRlY3RpbmcgdG91Y2ggc3VwcG9ydC5cbiAgaXNNYWMoKSAmJiBuYXZpZ2F0b3IubWF4VG91Y2hQb2ludHMgPiAxO1xufVxuZnVuY3Rpb24gaXNJT1MoKSB7XG4gIHJldHVybiBpc0lQaG9uZSgpIHx8IGlzSVBhZCgpO1xufVxuZnVuY3Rpb24gaXNBcHBsZURldmljZSgpIHtcbiAgcmV0dXJuIGlzTWFjKCkgfHwgaXNJT1MoKTtcbn1cbmZ1bmN0aW9uIGlzV2ViS2l0KCkge1xuICByZXR1cm4gdGVzdFVzZXJBZ2VudCgvQXBwbGVXZWJLaXQvaSkgJiYgIWlzQ2hyb21lKCk7XG59XG5mdW5jdGlvbiBpc0Nocm9tZSgpIHtcbiAgcmV0dXJuIHRlc3RVc2VyQWdlbnQoL0Nocm9tZS9pKTtcbn1cbmZ1bmN0aW9uIGlzQW5kcm9pZCgpIHtcbiAgcmV0dXJuIHRlc3RVc2VyQWdlbnQoL0FuZHJvaWQvaSk7XG59XG5cbi8vIHNyYy9ldmVudHMudHNcbmZ1bmN0aW9uIGNhbGxIYW5kbGVyKGV2ZW50LCBoYW5kbGVyKSB7XG4gIGlmIChoYW5kbGVyKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24oaGFuZGxlcikpIHtcbiAgICAgIGhhbmRsZXIoZXZlbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBoYW5kbGVyWzBdKGhhbmRsZXJbMV0sIGV2ZW50KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGV2ZW50Py5kZWZhdWx0UHJldmVudGVkO1xufVxuZnVuY3Rpb24gY29tcG9zZUV2ZW50SGFuZGxlcnMoaGFuZGxlcnMpIHtcbiAgcmV0dXJuIChldmVudCkgPT4ge1xuICAgIGZvciAoY29uc3QgaGFuZGxlciBvZiBoYW5kbGVycykge1xuICAgICAgY2FsbEhhbmRsZXIoZXZlbnQsIGhhbmRsZXIpO1xuICAgIH1cbiAgfTtcbn1cbmZ1bmN0aW9uIGlzQ3RybEtleShlKSB7XG4gIGlmIChpc01hYygpKSB7XG4gICAgcmV0dXJuIGUubWV0YUtleSAmJiAhZS5jdHJsS2V5O1xuICB9XG4gIHJldHVybiBlLmN0cmxLZXkgJiYgIWUubWV0YUtleTtcbn1cblxuLy8gc3JjL2ZvY3VzLXdpdGhvdXQtc2Nyb2xsaW5nLnRzXG5mdW5jdGlvbiBmb2N1c1dpdGhvdXRTY3JvbGxpbmcoZWxlbWVudCkge1xuICBpZiAoIWVsZW1lbnQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHN1cHBvcnRzUHJldmVudFNjcm9sbCgpKSB7XG4gICAgZWxlbWVudC5mb2N1cyh7IHByZXZlbnRTY3JvbGw6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgc2Nyb2xsYWJsZUVsZW1lbnRzID0gZ2V0U2Nyb2xsYWJsZUVsZW1lbnRzKGVsZW1lbnQpO1xuICAgIGVsZW1lbnQuZm9jdXMoKTtcbiAgICByZXN0b3JlU2Nyb2xsUG9zaXRpb24oc2Nyb2xsYWJsZUVsZW1lbnRzKTtcbiAgfVxufVxudmFyIHN1cHBvcnRzUHJldmVudFNjcm9sbENhY2hlZCA9IG51bGw7XG5mdW5jdGlvbiBzdXBwb3J0c1ByZXZlbnRTY3JvbGwoKSB7XG4gIGlmIChzdXBwb3J0c1ByZXZlbnRTY3JvbGxDYWNoZWQgPT0gbnVsbCkge1xuICAgIHN1cHBvcnRzUHJldmVudFNjcm9sbENhY2hlZCA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmb2N1c0VsZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgZm9jdXNFbGVtLmZvY3VzKHtcbiAgICAgICAgZ2V0IHByZXZlbnRTY3JvbGwoKSB7XG4gICAgICAgICAgc3VwcG9ydHNQcmV2ZW50U2Nyb2xsQ2FjaGVkID0gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3VwcG9ydHNQcmV2ZW50U2Nyb2xsQ2FjaGVkO1xufVxuZnVuY3Rpb24gZ2V0U2Nyb2xsYWJsZUVsZW1lbnRzKGVsZW1lbnQpIHtcbiAgbGV0IHBhcmVudCA9IGVsZW1lbnQucGFyZW50Tm9kZTtcbiAgY29uc3Qgc2Nyb2xsYWJsZUVsZW1lbnRzID0gW107XG4gIGNvbnN0IHJvb3RTY3JvbGxpbmdFbGVtZW50ID0gZG9jdW1lbnQuc2Nyb2xsaW5nRWxlbWVudCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIHdoaWxlIChwYXJlbnQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCAmJiBwYXJlbnQgIT09IHJvb3RTY3JvbGxpbmdFbGVtZW50KSB7XG4gICAgaWYgKHBhcmVudC5vZmZzZXRIZWlnaHQgPCBwYXJlbnQuc2Nyb2xsSGVpZ2h0IHx8IHBhcmVudC5vZmZzZXRXaWR0aCA8IHBhcmVudC5zY3JvbGxXaWR0aCkge1xuICAgICAgc2Nyb2xsYWJsZUVsZW1lbnRzLnB1c2goe1xuICAgICAgICBlbGVtZW50OiBwYXJlbnQsXG4gICAgICAgIHNjcm9sbFRvcDogcGFyZW50LnNjcm9sbFRvcCxcbiAgICAgICAgc2Nyb2xsTGVmdDogcGFyZW50LnNjcm9sbExlZnRcbiAgICAgIH0pO1xuICAgIH1cbiAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50Tm9kZTtcbiAgfVxuICBpZiAocm9vdFNjcm9sbGluZ0VsZW1lbnQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgIHNjcm9sbGFibGVFbGVtZW50cy5wdXNoKHtcbiAgICAgIGVsZW1lbnQ6IHJvb3RTY3JvbGxpbmdFbGVtZW50LFxuICAgICAgc2Nyb2xsVG9wOiByb290U2Nyb2xsaW5nRWxlbWVudC5zY3JvbGxUb3AsXG4gICAgICBzY3JvbGxMZWZ0OiByb290U2Nyb2xsaW5nRWxlbWVudC5zY3JvbGxMZWZ0XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIHNjcm9sbGFibGVFbGVtZW50cztcbn1cbmZ1bmN0aW9uIHJlc3RvcmVTY3JvbGxQb3NpdGlvbihzY3JvbGxhYmxlRWxlbWVudHMpIHtcbiAgZm9yIChjb25zdCB7IGVsZW1lbnQsIHNjcm9sbFRvcCwgc2Nyb2xsTGVmdCB9IG9mIHNjcm9sbGFibGVFbGVtZW50cykge1xuICAgIGVsZW1lbnQuc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuICAgIGVsZW1lbnQuc2Nyb2xsTGVmdCA9IHNjcm9sbExlZnQ7XG4gIH1cbn1cblxuLy8gc3JjL3RhYmJhYmxlLnRzXG52YXIgZm9jdXNhYmxlRWxlbWVudHMgPSBbXG4gIFwiaW5wdXQ6bm90KFt0eXBlPSdoaWRkZW4nXSk6bm90KFtkaXNhYmxlZF0pXCIsXG4gIFwic2VsZWN0Om5vdChbZGlzYWJsZWRdKVwiLFxuICBcInRleHRhcmVhOm5vdChbZGlzYWJsZWRdKVwiLFxuICBcImJ1dHRvbjpub3QoW2Rpc2FibGVkXSlcIixcbiAgXCJhW2hyZWZdXCIsXG4gIFwiYXJlYVtocmVmXVwiLFxuICBcIlt0YWJpbmRleF1cIixcbiAgXCJpZnJhbWVcIixcbiAgXCJvYmplY3RcIixcbiAgXCJlbWJlZFwiLFxuICBcImF1ZGlvW2NvbnRyb2xzXVwiLFxuICBcInZpZGVvW2NvbnRyb2xzXVwiLFxuICBcIltjb250ZW50ZWRpdGFibGVdOm5vdChbY29udGVudGVkaXRhYmxlPSdmYWxzZSddKVwiXG5dO1xudmFyIHRhYmJhYmxlRWxlbWVudHMgPSBbLi4uZm9jdXNhYmxlRWxlbWVudHMsICdbdGFiaW5kZXhdOm5vdChbdGFiaW5kZXg9XCItMVwiXSk6bm90KFtkaXNhYmxlZF0pJ107XG52YXIgRk9DVVNBQkxFX0VMRU1FTlRfU0VMRUNUT1IgPSBmb2N1c2FibGVFbGVtZW50cy5qb2luKFwiOm5vdChbaGlkZGVuXSksXCIpICsgXCIsW3RhYmluZGV4XTpub3QoW2Rpc2FibGVkXSk6bm90KFtoaWRkZW5dKVwiO1xudmFyIFRBQkJBQkxFX0VMRU1FTlRfU0VMRUNUT1IgPSB0YWJiYWJsZUVsZW1lbnRzLmpvaW4oXG4gICc6bm90KFtoaWRkZW5dKTpub3QoW3RhYmluZGV4PVwiLTFcIl0pLCdcbik7XG5mdW5jdGlvbiBnZXRBbGxUYWJiYWJsZUluKGNvbnRhaW5lciwgaW5jbHVkZUNvbnRhaW5lcikge1xuICBjb25zdCBlbGVtZW50cyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoRk9DVVNBQkxFX0VMRU1FTlRfU0VMRUNUT1IpKTtcbiAgY29uc3QgdGFiYmFibGVFbGVtZW50czIgPSBlbGVtZW50cy5maWx0ZXIoaXNUYWJiYWJsZSk7XG4gIGlmIChpbmNsdWRlQ29udGFpbmVyICYmIGlzVGFiYmFibGUoY29udGFpbmVyKSkge1xuICAgIHRhYmJhYmxlRWxlbWVudHMyLnVuc2hpZnQoY29udGFpbmVyKTtcbiAgfVxuICB0YWJiYWJsZUVsZW1lbnRzMi5mb3JFYWNoKChlbGVtZW50LCBpKSA9PiB7XG4gICAgaWYgKGlzRnJhbWUoZWxlbWVudCkgJiYgZWxlbWVudC5jb250ZW50RG9jdW1lbnQpIHtcbiAgICAgIGNvbnN0IGZyYW1lQm9keSA9IGVsZW1lbnQuY29udGVudERvY3VtZW50LmJvZHk7XG4gICAgICBjb25zdCBhbGxGcmFtZVRhYmJhYmxlID0gZ2V0QWxsVGFiYmFibGVJbihmcmFtZUJvZHksIGZhbHNlKTtcbiAgICAgIHRhYmJhYmxlRWxlbWVudHMyLnNwbGljZShpLCAxLCAuLi5hbGxGcmFtZVRhYmJhYmxlKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gdGFiYmFibGVFbGVtZW50czI7XG59XG5mdW5jdGlvbiBpc1RhYmJhYmxlKGVsZW1lbnQpIHtcbiAgcmV0dXJuIGlzRm9jdXNhYmxlKGVsZW1lbnQpICYmICFoYXNOZWdhdGl2ZVRhYkluZGV4KGVsZW1lbnQpO1xufVxuZnVuY3Rpb24gaXNGb2N1c2FibGUoZWxlbWVudCkge1xuICByZXR1cm4gZWxlbWVudC5tYXRjaGVzKEZPQ1VTQUJMRV9FTEVNRU5UX1NFTEVDVE9SKSAmJiBpc0VsZW1lbnRWaXNpYmxlKGVsZW1lbnQpO1xufVxuZnVuY3Rpb24gaGFzTmVnYXRpdmVUYWJJbmRleChlbGVtZW50KSB7XG4gIGNvbnN0IHRhYkluZGV4ID0gcGFyc2VJbnQoZWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJ0YWJpbmRleFwiKSB8fCBcIjBcIiwgMTApO1xuICByZXR1cm4gdGFiSW5kZXggPCAwO1xufVxuZnVuY3Rpb24gaXNFbGVtZW50VmlzaWJsZShlbGVtZW50LCBjaGlsZEVsZW1lbnQpIHtcbiAgcmV0dXJuIGVsZW1lbnQubm9kZU5hbWUgIT09IFwiI2NvbW1lbnRcIiAmJiBpc1N0eWxlVmlzaWJsZShlbGVtZW50KSAmJiBpc0F0dHJpYnV0ZVZpc2libGUoZWxlbWVudCwgY2hpbGRFbGVtZW50KSAmJiAoIWVsZW1lbnQucGFyZW50RWxlbWVudCB8fCBpc0VsZW1lbnRWaXNpYmxlKGVsZW1lbnQucGFyZW50RWxlbWVudCwgZWxlbWVudCkpO1xufVxuZnVuY3Rpb24gaXNTdHlsZVZpc2libGUoZWxlbWVudCkge1xuICBpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpICYmICEoZWxlbWVudCBpbnN0YW5jZW9mIFNWR0VsZW1lbnQpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IHsgZGlzcGxheSwgdmlzaWJpbGl0eSB9ID0gZWxlbWVudC5zdHlsZTtcbiAgbGV0IGlzVmlzaWJsZSA9IGRpc3BsYXkgIT09IFwibm9uZVwiICYmIHZpc2liaWxpdHkgIT09IFwiaGlkZGVuXCIgJiYgdmlzaWJpbGl0eSAhPT0gXCJjb2xsYXBzZVwiO1xuICBpZiAoaXNWaXNpYmxlKSB7XG4gICAgaWYgKCFlbGVtZW50Lm93bmVyRG9jdW1lbnQuZGVmYXVsdFZpZXcpIHtcbiAgICAgIHJldHVybiBpc1Zpc2libGU7XG4gICAgfVxuICAgIGNvbnN0IHsgZ2V0Q29tcHV0ZWRTdHlsZSB9ID0gZWxlbWVudC5vd25lckRvY3VtZW50LmRlZmF1bHRWaWV3O1xuICAgIGNvbnN0IHsgZGlzcGxheTogY29tcHV0ZWREaXNwbGF5LCB2aXNpYmlsaXR5OiBjb21wdXRlZFZpc2liaWxpdHkgfSA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgaXNWaXNpYmxlID0gY29tcHV0ZWREaXNwbGF5ICE9PSBcIm5vbmVcIiAmJiBjb21wdXRlZFZpc2liaWxpdHkgIT09IFwiaGlkZGVuXCIgJiYgY29tcHV0ZWRWaXNpYmlsaXR5ICE9PSBcImNvbGxhcHNlXCI7XG4gIH1cbiAgcmV0dXJuIGlzVmlzaWJsZTtcbn1cbmZ1bmN0aW9uIGlzQXR0cmlidXRlVmlzaWJsZShlbGVtZW50LCBjaGlsZEVsZW1lbnQpIHtcbiAgcmV0dXJuICFlbGVtZW50Lmhhc0F0dHJpYnV0ZShcImhpZGRlblwiKSAmJiAoZWxlbWVudC5ub2RlTmFtZSA9PT0gXCJERVRBSUxTXCIgJiYgY2hpbGRFbGVtZW50ICYmIGNoaWxkRWxlbWVudC5ub2RlTmFtZSAhPT0gXCJTVU1NQVJZXCIgPyBlbGVtZW50Lmhhc0F0dHJpYnV0ZShcIm9wZW5cIikgOiB0cnVlKTtcbn1cbmZ1bmN0aW9uIGhhc0ZvY3VzV2l0aGluKGVsZW1lbnQpIHtcbiAgY29uc3QgYWN0aXZlRWxlbWVudCA9IGdldEFjdGl2ZUVsZW1lbnQoZWxlbWVudCk7XG4gIGlmICghYWN0aXZlRWxlbWVudCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoIWNvbnRhaW5zKGVsZW1lbnQsIGFjdGl2ZUVsZW1lbnQpKSB7XG4gICAgY29uc3QgYWN0aXZlRGVzY2VuZGFudCA9IGFjdGl2ZUVsZW1lbnQuZ2V0QXR0cmlidXRlKFwiYXJpYS1hY3RpdmVkZXNjZW5kYW50XCIpO1xuICAgIGlmICghYWN0aXZlRGVzY2VuZGFudCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoIShcImlkXCIgaW4gZWxlbWVudCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGFjdGl2ZURlc2NlbmRhbnQgPT09IGVsZW1lbnQuaWQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gISFlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoYCMke0NTUy5lc2NhcGUoYWN0aXZlRGVzY2VuZGFudCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuLy8gc3JjL2ZvY3VzLW1hbmFnZXIudHNcbmZ1bmN0aW9uIGNyZWF0ZUZvY3VzTWFuYWdlcihyZWYsIGRlZmF1bHRPcHRpb25zID0gKCkgPT4gKHt9KSkge1xuICBjb25zdCBmb2N1c05leHQgPSAob3B0cyA9IHt9KSA9PiB7XG4gICAgY29uc3Qgcm9vdCA9IHJlZigpO1xuICAgIGlmICghcm9vdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB7XG4gICAgICBmcm9tID0gZGVmYXVsdE9wdGlvbnMoKS5mcm9tIHx8IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQsXG4gICAgICB0YWJiYWJsZSA9IGRlZmF1bHRPcHRpb25zKCkudGFiYmFibGUsXG4gICAgICB3cmFwID0gZGVmYXVsdE9wdGlvbnMoKS53cmFwLFxuICAgICAgYWNjZXB0ID0gZGVmYXVsdE9wdGlvbnMoKS5hY2NlcHRcbiAgICB9ID0gb3B0cztcbiAgICBjb25zdCB3YWxrZXIgPSBnZXRGb2N1c2FibGVUcmVlV2Fsa2VyKHJvb3QsIHsgdGFiYmFibGUsIGFjY2VwdCB9KTtcbiAgICBpZiAoZnJvbSAmJiByb290LmNvbnRhaW5zKGZyb20pKSB7XG4gICAgICB3YWxrZXIuY3VycmVudE5vZGUgPSBmcm9tO1xuICAgIH1cbiAgICBsZXQgbmV4dE5vZGUgPSB3YWxrZXIubmV4dE5vZGUoKTtcbiAgICBpZiAoIW5leHROb2RlICYmIHdyYXApIHtcbiAgICAgIHdhbGtlci5jdXJyZW50Tm9kZSA9IHJvb3Q7XG4gICAgICBuZXh0Tm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpO1xuICAgIH1cbiAgICBpZiAobmV4dE5vZGUpIHtcbiAgICAgIGZvY3VzRWxlbWVudChuZXh0Tm9kZSwgdHJ1ZSk7XG4gICAgfVxuICAgIHJldHVybiBuZXh0Tm9kZTtcbiAgfTtcbiAgY29uc3QgZm9jdXNQcmV2aW91cyA9IChvcHRzID0ge30pID0+IHtcbiAgICBjb25zdCByb290ID0gcmVmKCk7XG4gICAgaWYgKCFyb290KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHtcbiAgICAgIGZyb20gPSBkZWZhdWx0T3B0aW9ucygpLmZyb20gfHwgZG9jdW1lbnQuYWN0aXZlRWxlbWVudCxcbiAgICAgIHRhYmJhYmxlID0gZGVmYXVsdE9wdGlvbnMoKS50YWJiYWJsZSxcbiAgICAgIHdyYXAgPSBkZWZhdWx0T3B0aW9ucygpLndyYXAsXG4gICAgICBhY2NlcHQgPSBkZWZhdWx0T3B0aW9ucygpLmFjY2VwdFxuICAgIH0gPSBvcHRzO1xuICAgIGNvbnN0IHdhbGtlciA9IGdldEZvY3VzYWJsZVRyZWVXYWxrZXIocm9vdCwgeyB0YWJiYWJsZSwgYWNjZXB0IH0pO1xuICAgIGlmIChmcm9tICYmIHJvb3QuY29udGFpbnMoZnJvbSkpIHtcbiAgICAgIHdhbGtlci5jdXJyZW50Tm9kZSA9IGZyb207XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IG5leHQgPSBsYXN0KHdhbGtlcik7XG4gICAgICBpZiAobmV4dCkge1xuICAgICAgICBmb2N1c0VsZW1lbnQobmV4dCwgdHJ1ZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmV4dDtcbiAgICB9XG4gICAgbGV0IHByZXZpb3VzTm9kZSA9IHdhbGtlci5wcmV2aW91c05vZGUoKTtcbiAgICBpZiAoIXByZXZpb3VzTm9kZSAmJiB3cmFwKSB7XG4gICAgICB3YWxrZXIuY3VycmVudE5vZGUgPSByb290O1xuICAgICAgcHJldmlvdXNOb2RlID0gbGFzdCh3YWxrZXIpO1xuICAgIH1cbiAgICBpZiAocHJldmlvdXNOb2RlKSB7XG4gICAgICBmb2N1c0VsZW1lbnQocHJldmlvdXNOb2RlLCB0cnVlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByZXZpb3VzTm9kZTtcbiAgfTtcbiAgY29uc3QgZm9jdXNGaXJzdCA9IChvcHRzID0ge30pID0+IHtcbiAgICBjb25zdCByb290ID0gcmVmKCk7XG4gICAgaWYgKCFyb290KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHsgdGFiYmFibGUgPSBkZWZhdWx0T3B0aW9ucygpLnRhYmJhYmxlLCBhY2NlcHQgPSBkZWZhdWx0T3B0aW9ucygpLmFjY2VwdCB9ID0gb3B0cztcbiAgICBjb25zdCB3YWxrZXIgPSBnZXRGb2N1c2FibGVUcmVlV2Fsa2VyKHJvb3QsIHsgdGFiYmFibGUsIGFjY2VwdCB9KTtcbiAgICBjb25zdCBuZXh0Tm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpO1xuICAgIGlmIChuZXh0Tm9kZSkge1xuICAgICAgZm9jdXNFbGVtZW50KG5leHROb2RlLCB0cnVlKTtcbiAgICB9XG4gICAgcmV0dXJuIG5leHROb2RlO1xuICB9O1xuICBjb25zdCBmb2N1c0xhc3QgPSAob3B0cyA9IHt9KSA9PiB7XG4gICAgY29uc3Qgcm9vdCA9IHJlZigpO1xuICAgIGlmICghcm9vdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB7IHRhYmJhYmxlID0gZGVmYXVsdE9wdGlvbnMoKS50YWJiYWJsZSwgYWNjZXB0ID0gZGVmYXVsdE9wdGlvbnMoKS5hY2NlcHQgfSA9IG9wdHM7XG4gICAgY29uc3Qgd2Fsa2VyID0gZ2V0Rm9jdXNhYmxlVHJlZVdhbGtlcihyb290LCB7IHRhYmJhYmxlLCBhY2NlcHQgfSk7XG4gICAgY29uc3QgbmV4dCA9IGxhc3Qod2Fsa2VyKTtcbiAgICBpZiAobmV4dCkge1xuICAgICAgZm9jdXNFbGVtZW50KG5leHQsIHRydWUpO1xuICAgIH1cbiAgICByZXR1cm4gbmV4dDtcbiAgfTtcbiAgcmV0dXJuIHsgZm9jdXNOZXh0LCBmb2N1c1ByZXZpb3VzLCBmb2N1c0ZpcnN0LCBmb2N1c0xhc3QgfTtcbn1cbmZ1bmN0aW9uIGZvY3VzRWxlbWVudChlbGVtZW50LCBzY3JvbGwgPSBmYWxzZSkge1xuICBpZiAoZWxlbWVudCAhPSBudWxsICYmICFzY3JvbGwpIHtcbiAgICB0cnkge1xuICAgICAgZm9jdXNXaXRob3V0U2Nyb2xsaW5nKGVsZW1lbnQpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgIH1cbiAgfSBlbHNlIGlmIChlbGVtZW50ICE9IG51bGwpIHtcbiAgICB0cnkge1xuICAgICAgZWxlbWVudC5mb2N1cygpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgIH1cbiAgfVxufVxuZnVuY3Rpb24gbGFzdCh3YWxrZXIpIHtcbiAgbGV0IG5leHQ7XG4gIGxldCBsYXN0MjtcbiAgZG8ge1xuICAgIGxhc3QyID0gd2Fsa2VyLmxhc3RDaGlsZCgpO1xuICAgIGlmIChsYXN0Mikge1xuICAgICAgbmV4dCA9IGxhc3QyO1xuICAgIH1cbiAgfSB3aGlsZSAobGFzdDIpO1xuICByZXR1cm4gbmV4dDtcbn1cbmZ1bmN0aW9uIGlzRWxlbWVudEluU2NvcGUoZWxlbWVudCwgc2NvcGUpIHtcbiAgcmV0dXJuIHNjb3BlLnNvbWUoKG5vZGUpID0+IG5vZGUuY29udGFpbnMoZWxlbWVudCkpO1xufVxuZnVuY3Rpb24gZ2V0Rm9jdXNhYmxlVHJlZVdhbGtlcihyb290LCBvcHRzLCBzY29wZSkge1xuICBjb25zdCBzZWxlY3RvciA9IG9wdHM/LnRhYmJhYmxlID8gVEFCQkFCTEVfRUxFTUVOVF9TRUxFQ1RPUiA6IEZPQ1VTQUJMRV9FTEVNRU5UX1NFTEVDVE9SO1xuICBjb25zdCB3YWxrZXIgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKHJvb3QsIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5ULCB7XG4gICAgYWNjZXB0Tm9kZShub2RlKSB7XG4gICAgICBpZiAob3B0cz8uZnJvbT8uY29udGFpbnMobm9kZSkpIHtcbiAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVDtcbiAgICAgIH1cbiAgICAgIGlmIChub2RlLm1hdGNoZXMoc2VsZWN0b3IpICYmIGlzRWxlbWVudFZpc2libGUobm9kZSkgJiYgKCFzY29wZSB8fCBpc0VsZW1lbnRJblNjb3BlKG5vZGUsIHNjb3BlKSkgJiYgKCFvcHRzPy5hY2NlcHQgfHwgb3B0cy5hY2NlcHQobm9kZSkpKSB7XG4gICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9BQ0NFUFQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfU0tJUDtcbiAgICB9XG4gIH0pO1xuICBpZiAob3B0cz8uZnJvbSkge1xuICAgIHdhbGtlci5jdXJyZW50Tm9kZSA9IG9wdHMuZnJvbTtcbiAgfVxuICByZXR1cm4gd2Fsa2VyO1xufVxuXG4vLyBzcmMvZ2V0LXNjcm9sbC1wYXJlbnQudHNcbmZ1bmN0aW9uIGdldFNjcm9sbFBhcmVudChub2RlKSB7XG4gIHdoaWxlIChub2RlICYmICFpc1Njcm9sbGFibGUobm9kZSkpIHtcbiAgICBub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xuICB9XG4gIHJldHVybiBub2RlIHx8IGRvY3VtZW50LnNjcm9sbGluZ0VsZW1lbnQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xufVxuZnVuY3Rpb24gaXNTY3JvbGxhYmxlKG5vZGUpIHtcbiAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShub2RlKTtcbiAgcmV0dXJuIC8oYXV0b3xzY3JvbGwpLy50ZXN0KHN0eWxlLm92ZXJmbG93ICsgc3R5bGUub3ZlcmZsb3dYICsgc3R5bGUub3ZlcmZsb3dZKTtcbn1cblxuLy8gc3JjL2lzLXZpcnR1YWwtZXZlbnQudHNcbmZ1bmN0aW9uIGlzVmlydHVhbENsaWNrKGV2ZW50KSB7XG4gIGlmIChldmVudC5tb3pJbnB1dFNvdXJjZSA9PT0gMCAmJiBldmVudC5pc1RydXN0ZWQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBpZiAoaXNBbmRyb2lkKCkgJiYgZXZlbnQucG9pbnRlclR5cGUpIHtcbiAgICByZXR1cm4gZXZlbnQudHlwZSA9PT0gXCJjbGlja1wiICYmIGV2ZW50LmJ1dHRvbnMgPT09IDE7XG4gIH1cbiAgcmV0dXJuIGV2ZW50LmRldGFpbCA9PT0gMCAmJiAhZXZlbnQucG9pbnRlclR5cGU7XG59XG5mdW5jdGlvbiBpc1ZpcnR1YWxQb2ludGVyRXZlbnQoZXZlbnQpIHtcbiAgcmV0dXJuIGV2ZW50LndpZHRoID09PSAwICYmIGV2ZW50LmhlaWdodCA9PT0gMCB8fCBldmVudC53aWR0aCA9PT0gMSAmJiBldmVudC5oZWlnaHQgPT09IDEgJiYgZXZlbnQucHJlc3N1cmUgPT09IDAgJiYgZXZlbnQuZGV0YWlsID09PSAwICYmIGV2ZW50LnBvaW50ZXJUeXBlID09PSBcIm1vdXNlXCI7XG59XG5cbi8vIHNyYy9ub29wLnRzXG5mdW5jdGlvbiBub29wKCkge1xuICByZXR1cm47XG59XG5cbi8vIHNyYy9udW1iZXIudHNcbmZ1bmN0aW9uIGNsYW1wKHZhbHVlLCBtaW4gPSAtSW5maW5pdHksIG1heCA9IEluZmluaXR5KSB7XG4gIHJldHVybiBNYXRoLm1pbihNYXRoLm1heCh2YWx1ZSwgbWluKSwgbWF4KTtcbn1cbmZ1bmN0aW9uIHNuYXBWYWx1ZVRvU3RlcCh2YWx1ZSwgbWluLCBtYXgsIHN0ZXApIHtcbiAgY29uc3QgcmVtYWluZGVyID0gKHZhbHVlIC0gKGlzTmFOKG1pbikgPyAwIDogbWluKSkgJSBzdGVwO1xuICBsZXQgc25hcHBlZFZhbHVlID0gTWF0aC5hYnMocmVtYWluZGVyKSAqIDIgPj0gc3RlcCA/IHZhbHVlICsgTWF0aC5zaWduKHJlbWFpbmRlcikgKiAoc3RlcCAtIE1hdGguYWJzKHJlbWFpbmRlcikpIDogdmFsdWUgLSByZW1haW5kZXI7XG4gIGlmICghaXNOYU4obWluKSkge1xuICAgIGlmIChzbmFwcGVkVmFsdWUgPCBtaW4pIHtcbiAgICAgIHNuYXBwZWRWYWx1ZSA9IG1pbjtcbiAgICB9IGVsc2UgaWYgKCFpc05hTihtYXgpICYmIHNuYXBwZWRWYWx1ZSA+IG1heCkge1xuICAgICAgc25hcHBlZFZhbHVlID0gbWluICsgTWF0aC5mbG9vcigobWF4IC0gbWluKSAvIHN0ZXApICogc3RlcDtcbiAgICB9XG4gIH0gZWxzZSBpZiAoIWlzTmFOKG1heCkgJiYgc25hcHBlZFZhbHVlID4gbWF4KSB7XG4gICAgc25hcHBlZFZhbHVlID0gTWF0aC5mbG9vcihtYXggLyBzdGVwKSAqIHN0ZXA7XG4gIH1cbiAgY29uc3Qgc3RyaW5nID0gc3RlcC50b1N0cmluZygpO1xuICBjb25zdCBpbmRleCA9IHN0cmluZy5pbmRleE9mKFwiLlwiKTtcbiAgY29uc3QgcHJlY2lzaW9uID0gaW5kZXggPj0gMCA/IHN0cmluZy5sZW5ndGggLSBpbmRleCA6IDA7XG4gIGlmIChwcmVjaXNpb24gPiAwKSB7XG4gICAgY29uc3QgcG93ID0gTWF0aC5wb3coMTAsIHByZWNpc2lvbik7XG4gICAgc25hcHBlZFZhbHVlID0gTWF0aC5yb3VuZChzbmFwcGVkVmFsdWUgKiBwb3cpIC8gcG93O1xuICB9XG4gIHJldHVybiBzbmFwcGVkVmFsdWU7XG59XG5cbi8vIHNyYy9wb2x5Z29uLnRzXG5mdW5jdGlvbiBnZXRFdmVudFBvaW50KGV2ZW50KSB7XG4gIHJldHVybiBbZXZlbnQuY2xpZW50WCwgZXZlbnQuY2xpZW50WV07XG59XG5mdW5jdGlvbiBpc1BvaW50SW5Qb2x5Z29uKHBvaW50LCBwb2x5Z29uKSB7XG4gIGNvbnN0IFt4LCB5XSA9IHBvaW50O1xuICBsZXQgaW5zaWRlID0gZmFsc2U7XG4gIGNvbnN0IGxlbmd0aCA9IHBvbHlnb24ubGVuZ3RoO1xuICBmb3IgKGxldCBsID0gbGVuZ3RoLCBpID0gMCwgaiA9IGwgLSAxOyBpIDwgbDsgaiA9IGkrKykge1xuICAgIGNvbnN0IFt4aSwgeWldID0gcG9seWdvbltpXTtcbiAgICBjb25zdCBbeGosIHlqXSA9IHBvbHlnb25bal07XG4gICAgY29uc3QgWywgdnldID0gcG9seWdvbltqID09PSAwID8gbCAtIDEgOiBqIC0gMV0gfHwgWzAsIDBdO1xuICAgIGNvbnN0IHdoZXJlID0gKHlpIC0geWopICogKHggLSB4aSkgLSAoeGkgLSB4aikgKiAoeSAtIHlpKTtcbiAgICBpZiAoeWogPCB5aSkge1xuICAgICAgaWYgKHkgPj0geWogJiYgeSA8IHlpKSB7XG4gICAgICAgIGlmICh3aGVyZSA9PT0gMClcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKHdoZXJlID4gMCkge1xuICAgICAgICAgIGlmICh5ID09PSB5aikge1xuICAgICAgICAgICAgaWYgKHkgPiB2eSkge1xuICAgICAgICAgICAgICBpbnNpZGUgPSAhaW5zaWRlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbnNpZGUgPSAhaW5zaWRlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoeWkgPCB5aikge1xuICAgICAgaWYgKHkgPiB5aSAmJiB5IDw9IHlqKSB7XG4gICAgICAgIGlmICh3aGVyZSA9PT0gMClcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKHdoZXJlIDwgMCkge1xuICAgICAgICAgIGlmICh5ID09PSB5aikge1xuICAgICAgICAgICAgaWYgKHkgPCB2eSkge1xuICAgICAgICAgICAgICBpbnNpZGUgPSAhaW5zaWRlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbnNpZGUgPSAhaW5zaWRlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoeSA9PSB5aSAmJiAoeCA+PSB4aiAmJiB4IDw9IHhpIHx8IHggPj0geGkgJiYgeCA8PSB4aikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gaW5zaWRlO1xufVxuZnVuY3Rpb24gZ2V0UG9seWdvbigpIHtcbiAgY29uc3QgaWQgPSBcImRlYnVnLXBvbHlnb25cIjtcbiAgY29uc3QgZXhpc3RpbmdQb2x5Z29uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICBpZiAoZXhpc3RpbmdQb2x5Z29uKSB7XG4gICAgcmV0dXJuIGV4aXN0aW5nUG9seWdvbjtcbiAgfVxuICBjb25zdCBzdmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiLCBcInN2Z1wiKTtcbiAgc3ZnLnN0eWxlLnRvcCA9IFwiMFwiO1xuICBzdmcuc3R5bGUubGVmdCA9IFwiMFwiO1xuICBzdmcuc3R5bGUud2lkdGggPSBcIjEwMCVcIjtcbiAgc3ZnLnN0eWxlLmhlaWdodCA9IFwiMTAwJVwiO1xuICBzdmcuc3R5bGUuZmlsbCA9IFwiZ3JlZW5cIjtcbiAgc3ZnLnN0eWxlLm9wYWNpdHkgPSBcIjAuMlwiO1xuICBzdmcuc3R5bGUucG9zaXRpb24gPSBcImZpeGVkXCI7XG4gIHN2Zy5zdHlsZS5wb2ludGVyRXZlbnRzID0gXCJub25lXCI7XG4gIHN2Zy5zdHlsZS56SW5kZXggPSBcIjk5OTk5OVwiO1xuICBjb25zdCBwb2x5Z29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgXCJwb2x5Z29uXCIpO1xuICBwb2x5Z29uLnNldEF0dHJpYnV0ZShcImlkXCIsIGlkKTtcbiAgcG9seWdvbi5zZXRBdHRyaWJ1dGUoXCJwb2ludHNcIiwgXCIwLDAgMCwwXCIpO1xuICBzdmcuYXBwZW5kQ2hpbGQocG9seWdvbik7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc3ZnKTtcbiAgcmV0dXJuIHBvbHlnb247XG59XG5mdW5jdGlvbiBkZWJ1Z1BvbHlnb24ocG9seWdvbikge1xuICBjb25zdCBwb2x5Z29uRWxlbWVudCA9IGdldFBvbHlnb24oKTtcbiAgY29uc3QgcG9pbnRzID0gcG9seWdvbi5tYXAoKHBvaW50KSA9PiBwb2ludC5qb2luKFwiLFwiKSkuam9pbihcIiBcIik7XG4gIHBvbHlnb25FbGVtZW50LnNldEF0dHJpYnV0ZShcInBvaW50c1wiLCBwb2ludHMpO1xuICByZXR1cm4gcG9seWdvbkVsZW1lbnQucGFyZW50RWxlbWVudDtcbn1cbmZ1bmN0aW9uIG1lcmdlRGVmYXVsdFByb3BzKGRlZmF1bHRQcm9wcywgcHJvcHMpIHtcbiAgcmV0dXJuIG1lcmdlUHJvcHMoZGVmYXVsdFByb3BzLCBwcm9wcyk7XG59XG5cbi8vIHNyYy9ydW4tYWZ0ZXItdHJhbnNpdGlvbi50c1xudmFyIHRyYW5zaXRpb25zQnlFbGVtZW50ID0gLyogQF9fUFVSRV9fICovIG5ldyBNYXAoKTtcbnZhciB0cmFuc2l0aW9uQ2FsbGJhY2tzID0gLyogQF9fUFVSRV9fICovIG5ldyBTZXQoKTtcbmZ1bmN0aW9uIHNldHVwR2xvYmFsRXZlbnRzKCkge1xuICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBvblRyYW5zaXRpb25TdGFydCA9IChlKSA9PiB7XG4gICAgaWYgKCFlLnRhcmdldCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgdHJhbnNpdGlvbnMgPSB0cmFuc2l0aW9uc0J5RWxlbWVudC5nZXQoZS50YXJnZXQpO1xuICAgIGlmICghdHJhbnNpdGlvbnMpIHtcbiAgICAgIHRyYW5zaXRpb25zID0gLyogQF9fUFVSRV9fICovIG5ldyBTZXQoKTtcbiAgICAgIHRyYW5zaXRpb25zQnlFbGVtZW50LnNldChlLnRhcmdldCwgdHJhbnNpdGlvbnMpO1xuICAgICAgZS50YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcihcInRyYW5zaXRpb25jYW5jZWxcIiwgb25UcmFuc2l0aW9uRW5kKTtcbiAgICB9XG4gICAgdHJhbnNpdGlvbnMuYWRkKGUucHJvcGVydHlOYW1lKTtcbiAgfTtcbiAgY29uc3Qgb25UcmFuc2l0aW9uRW5kID0gKGUpID0+IHtcbiAgICBpZiAoIWUudGFyZ2V0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHByb3BlcnRpZXMgPSB0cmFuc2l0aW9uc0J5RWxlbWVudC5nZXQoZS50YXJnZXQpO1xuICAgIGlmICghcHJvcGVydGllcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBwcm9wZXJ0aWVzLmRlbGV0ZShlLnByb3BlcnR5TmFtZSk7XG4gICAgaWYgKHByb3BlcnRpZXMuc2l6ZSA9PT0gMCkge1xuICAgICAgZS50YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRyYW5zaXRpb25jYW5jZWxcIiwgb25UcmFuc2l0aW9uRW5kKTtcbiAgICAgIHRyYW5zaXRpb25zQnlFbGVtZW50LmRlbGV0ZShlLnRhcmdldCk7XG4gICAgfVxuICAgIGlmICh0cmFuc2l0aW9uc0J5RWxlbWVudC5zaXplID09PSAwKSB7XG4gICAgICBmb3IgKGNvbnN0IGNiIG9mIHRyYW5zaXRpb25DYWxsYmFja3MpIHtcbiAgICAgICAgY2IoKTtcbiAgICAgIH1cbiAgICAgIHRyYW5zaXRpb25DYWxsYmFja3MuY2xlYXIoKTtcbiAgICB9XG4gIH07XG4gIGRvY3VtZW50LmJvZHkuYWRkRXZlbnRMaXN0ZW5lcihcInRyYW5zaXRpb25ydW5cIiwgb25UcmFuc2l0aW9uU3RhcnQpO1xuICBkb2N1bWVudC5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoXCJ0cmFuc2l0aW9uZW5kXCIsIG9uVHJhbnNpdGlvbkVuZCk7XG59XG5pZiAodHlwZW9mIGRvY3VtZW50ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gIGlmIChkb2N1bWVudC5yZWFkeVN0YXRlICE9PSBcImxvYWRpbmdcIikge1xuICAgIHNldHVwR2xvYmFsRXZlbnRzKCk7XG4gIH0gZWxzZSB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIiwgc2V0dXBHbG9iYWxFdmVudHMpO1xuICB9XG59XG5mdW5jdGlvbiBydW5BZnRlclRyYW5zaXRpb24oZm4pIHtcbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICBpZiAodHJhbnNpdGlvbnNCeUVsZW1lbnQuc2l6ZSA9PT0gMCkge1xuICAgICAgZm4oKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdHJhbnNpdGlvbkNhbGxiYWNrcy5hZGQoZm4pO1xuICAgIH1cbiAgfSk7XG59XG5cbi8vIHNyYy9zY3JvbGwtaW50by12aWV3LnRzXG5mdW5jdGlvbiBzY3JvbGxJbnRvVmlldyhzY3JvbGxWaWV3LCBlbGVtZW50KSB7XG4gIGNvbnN0IG9mZnNldFggPSByZWxhdGl2ZU9mZnNldChzY3JvbGxWaWV3LCBlbGVtZW50LCBcImxlZnRcIik7XG4gIGNvbnN0IG9mZnNldFkgPSByZWxhdGl2ZU9mZnNldChzY3JvbGxWaWV3LCBlbGVtZW50LCBcInRvcFwiKTtcbiAgY29uc3Qgd2lkdGggPSBlbGVtZW50Lm9mZnNldFdpZHRoO1xuICBjb25zdCBoZWlnaHQgPSBlbGVtZW50Lm9mZnNldEhlaWdodDtcbiAgbGV0IHggPSBzY3JvbGxWaWV3LnNjcm9sbExlZnQ7XG4gIGxldCB5ID0gc2Nyb2xsVmlldy5zY3JvbGxUb3A7XG4gIGNvbnN0IG1heFggPSB4ICsgc2Nyb2xsVmlldy5vZmZzZXRXaWR0aDtcbiAgY29uc3QgbWF4WSA9IHkgKyBzY3JvbGxWaWV3Lm9mZnNldEhlaWdodDtcbiAgaWYgKG9mZnNldFggPD0geCkge1xuICAgIHggPSBvZmZzZXRYO1xuICB9IGVsc2UgaWYgKG9mZnNldFggKyB3aWR0aCA+IG1heFgpIHtcbiAgICB4ICs9IG9mZnNldFggKyB3aWR0aCAtIG1heFg7XG4gIH1cbiAgaWYgKG9mZnNldFkgPD0geSkge1xuICAgIHkgPSBvZmZzZXRZO1xuICB9IGVsc2UgaWYgKG9mZnNldFkgKyBoZWlnaHQgPiBtYXhZKSB7XG4gICAgeSArPSBvZmZzZXRZICsgaGVpZ2h0IC0gbWF4WTtcbiAgfVxuICBzY3JvbGxWaWV3LnNjcm9sbExlZnQgPSB4O1xuICBzY3JvbGxWaWV3LnNjcm9sbFRvcCA9IHk7XG59XG5mdW5jdGlvbiByZWxhdGl2ZU9mZnNldChhbmNlc3RvciwgY2hpbGQsIGF4aXMpIHtcbiAgY29uc3QgcHJvcCA9IGF4aXMgPT09IFwibGVmdFwiID8gXCJvZmZzZXRMZWZ0XCIgOiBcIm9mZnNldFRvcFwiO1xuICBsZXQgc3VtID0gMDtcbiAgd2hpbGUgKGNoaWxkLm9mZnNldFBhcmVudCkge1xuICAgIHN1bSArPSBjaGlsZFtwcm9wXTtcbiAgICBpZiAoY2hpbGQub2Zmc2V0UGFyZW50ID09PSBhbmNlc3Rvcikge1xuICAgICAgYnJlYWs7XG4gICAgfSBlbHNlIGlmIChjaGlsZC5vZmZzZXRQYXJlbnQuY29udGFpbnMoYW5jZXN0b3IpKSB7XG4gICAgICBzdW0gLT0gYW5jZXN0b3JbcHJvcF07XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2hpbGQgPSBjaGlsZC5vZmZzZXRQYXJlbnQ7XG4gIH1cbiAgcmV0dXJuIHN1bTtcbn1cbmZ1bmN0aW9uIHNjcm9sbEludG9WaWV3cG9ydCh0YXJnZXRFbGVtZW50LCBvcHRzKSB7XG4gIGlmIChkb2N1bWVudC5jb250YWlucyh0YXJnZXRFbGVtZW50KSkge1xuICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5zY3JvbGxpbmdFbGVtZW50IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgICBjb25zdCBpc1Njcm9sbFByZXZlbnRlZCA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHJvb3QpLm92ZXJmbG93ID09PSBcImhpZGRlblwiO1xuICAgIGlmICghaXNTY3JvbGxQcmV2ZW50ZWQpIHtcbiAgICAgIGNvbnN0IHsgbGVmdDogb3JpZ2luYWxMZWZ0LCB0b3A6IG9yaWdpbmFsVG9wIH0gPSB0YXJnZXRFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgdGFyZ2V0RWxlbWVudD8uc2Nyb2xsSW50b1ZpZXc/Lih7IGJsb2NrOiBcIm5lYXJlc3RcIiB9KTtcbiAgICAgIGNvbnN0IHsgbGVmdDogbmV3TGVmdCwgdG9wOiBuZXdUb3AgfSA9IHRhcmdldEVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBpZiAoTWF0aC5hYnMob3JpZ2luYWxMZWZ0IC0gbmV3TGVmdCkgPiAxIHx8IE1hdGguYWJzKG9yaWdpbmFsVG9wIC0gbmV3VG9wKSA+IDEpIHtcbiAgICAgICAgb3B0cz8uY29udGFpbmluZ0VsZW1lbnQ/LnNjcm9sbEludG9WaWV3Py4oeyBibG9jazogXCJjZW50ZXJcIiwgaW5saW5lOiBcImNlbnRlclwiIH0pO1xuICAgICAgICB0YXJnZXRFbGVtZW50LnNjcm9sbEludG9WaWV3Py4oeyBibG9jazogXCJuZWFyZXN0XCIgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGxldCBzY3JvbGxQYXJlbnQgPSBnZXRTY3JvbGxQYXJlbnQodGFyZ2V0RWxlbWVudCk7XG4gICAgICB3aGlsZSAodGFyZ2V0RWxlbWVudCAmJiBzY3JvbGxQYXJlbnQgJiYgdGFyZ2V0RWxlbWVudCAhPT0gcm9vdCAmJiBzY3JvbGxQYXJlbnQgIT09IHJvb3QpIHtcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXcoc2Nyb2xsUGFyZW50LCB0YXJnZXRFbGVtZW50KTtcbiAgICAgICAgdGFyZ2V0RWxlbWVudCA9IHNjcm9sbFBhcmVudDtcbiAgICAgICAgc2Nyb2xsUGFyZW50ID0gZ2V0U2Nyb2xsUGFyZW50KHRhcmdldEVsZW1lbnQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vLyBzcmMvc3R5bGVzLnRzXG52YXIgdmlzdWFsbHlIaWRkZW5TdHlsZXMgPSB7XG4gIGJvcmRlcjogXCIwXCIsXG4gIGNsaXA6IFwicmVjdCgwIDAgMCAwKVwiLFxuICBcImNsaXAtcGF0aFwiOiBcImluc2V0KDUwJSlcIixcbiAgaGVpZ2h0OiBcIjFweFwiLFxuICBtYXJnaW46IFwiMCAtMXB4IC0xcHggMFwiLFxuICBvdmVyZmxvdzogXCJoaWRkZW5cIixcbiAgcGFkZGluZzogXCIwXCIsXG4gIHBvc2l0aW9uOiBcImFic29sdXRlXCIsXG4gIHdpZHRoOiBcIjFweFwiLFxuICBcIndoaXRlLXNwYWNlXCI6IFwibm93cmFwXCJcbn07XG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIGFyaWFraXQuXG4gKiBNSVQgTGljZW5zZWQsIENvcHlyaWdodCAoYykgRGllZ28gSGF6LlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIEFyaWFraXQgdGVhbTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hcmlha2l0L2FyaWFraXQvYmxvYi9kYTE0MjY3MmVkZGVmYTk5MzY1NzczY2VkNzIxNzFmYWNjMDZmZGNiL3BhY2thZ2VzL2FyaWFraXQtdXRpbHMvc3JjL2FycmF5LnRzXG4gKi9cbi8qIVxuICogT3JpZ2luYWwgY29kZSBieSBDaGFrcmEgVUlcbiAqIE1JVCBMaWNlbnNlZCwgQ29weXJpZ2h0IChjKSAyMDE5IFNlZ3VuIEFkZWJheW8uXG4gKlxuICogQ3JlZGl0cyB0byB0aGUgQ2hha3JhIFVJIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vY2hha3JhLXVpL2NoYWtyYS11aS9ibG9iL21haW4vcGFja2FnZXMvdXRpbHMvc3JjL2Fzc2VydGlvbi50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vc29saWRqcy1jb21tdW5pdHkvc29saWQtYXJpYS9ibG9iLzJjNWY1NGZlYjVjZmVhNTE0YjFlZTBhNTJkMDQxNjg3OGY4ODIzNTEvcGFja2FnZXMvdXRpbHMvc3JjL2NyZWF0ZUdsb2JhbExpc3RlbmVycy50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIGFyaWFraXQuXG4gKiBNSVQgTGljZW5zZWQsIENvcHlyaWdodCAoYykgRGllZ28gSGF6LlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIEFyaWFraXQgdGVhbTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hcmlha2l0L2FyaWFraXQvYmxvYi8yMzJiYzc5MDE4ZWMyMDk2N2ZlYzFlMDk3YTk0NzRhYmEzYmI1YmU3L3BhY2thZ2VzL2FyaWFraXQtdXRpbHMvc3JjL2RvbS50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi9jZjlhYjI0ZjMyNTViZTE1MzBkMGY1ODQwNjFhMDFhYTFlODE4MGU2L3BhY2thZ2VzL0ByZWFjdC1hcmlhL3V0aWxzL3NyYy9wbGF0Zm9ybS50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi9hOWRlYThhMzY3MjE3OWU2YzM4YWFmZDE0MjlkYWY0NGM3ZWEyZmY2L3BhY2thZ2VzL0ByZWFjdC1hcmlhL3V0aWxzL3NyYy9mb2N1c1dpdGhvdXRTY3JvbGxpbmcudHNcbiAqL1xuLyohXG4gKiBQb3J0aW9ucyBvZiB0aGlzIGZpbGUgYXJlIGJhc2VkIG9uIGNvZGUgZnJvbSBhcmlha2l0LlxuICogTUlUIExpY2Vuc2VkLCBDb3B5cmlnaHQgKGMpIERpZWdvIEhhei5cbiAqXG4gKiBDcmVkaXRzIHRvIHRoZSBBcmlha2l0IHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYXJpYWtpdC9hcmlha2l0L2Jsb2IvbWFpbi9wYWNrYWdlcy9hcmlha2l0LXV0aWxzL3NyYy9mb2N1cy50c1xuICpcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi9tYWluL3BhY2thZ2VzLyU0MHJlYWN0LWFyaWEvZm9jdXMvc3JjL2lzRWxlbWVudFZpc2libGUudHNcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hZG9iZS9yZWFjdC1zcGVjdHJ1bS9ibG9iLzhmMmYyYWNiM2Q1ODUwMzgyZWJlNjMxZjA1NWY4OGM3MDRhYTdkMTcvcGFja2FnZXMvQHJlYWN0LWFyaWEvZm9jdXMvc3JjL0ZvY3VzU2NvcGUudHN4XG4gKi9cbi8qIVxuICogUG9ydGlvbnMgb2YgdGhpcyBmaWxlIGFyZSBiYXNlZCBvbiBjb2RlIGZyb20gcmVhY3Qtc3BlY3RydW0uXG4gKiBBcGFjaGUgTGljZW5zZSBWZXJzaW9uIDIuMCwgQ29weXJpZ2h0IDIwMjAgQWRvYmUuXG4gKlxuICogQ3JlZGl0cyB0byB0aGUgUmVhY3QgU3BlY3RydW0gdGVhbTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hZG9iZS9yZWFjdC1zcGVjdHJ1bS9ibG9iL2Y2ZTY4NmZlOWQzYjk4M2Q0ODY1MDk4MGMxZWNmZGRlMzIwYmM2MmYvcGFja2FnZXMvQHJlYWN0LWFyaWEvZm9jdXMvc3JjL0ZvY3VzU2NvcGUudHN4XG4gKi9cbi8qIVxuICogUG9ydGlvbnMgb2YgdGhpcyBmaWxlIGFyZSBiYXNlZCBvbiBjb2RlIGZyb20gcmVhY3Qtc3BlY3RydW0uXG4gKiBBcGFjaGUgTGljZW5zZSBWZXJzaW9uIDIuMCwgQ29weXJpZ2h0IDIwMjAgQWRvYmUuXG4gKlxuICogQ3JlZGl0cyB0byB0aGUgUmVhY3QgU3BlY3RydW0gdGVhbTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hZG9iZS9yZWFjdC1zcGVjdHJ1bS9ibG9iL2E5ZGVhOGEzNjcyMTc5ZTZjMzhhYWZkMTQyOWRhZjQ0YzdlYTJmZjYvcGFja2FnZXMvQHJlYWN0LWFyaWEvdXRpbHMvc3JjL2dldFNjcm9sbFBhcmVudC50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi9hOWRlYThhMzY3MjE3OWU2YzM4YWFmZDE0MjlkYWY0NGM3ZWEyZmY2L3BhY2thZ2VzL0ByZWFjdC1hcmlhL3V0aWxzL3NyYy9pc1ZpcnR1YWxFdmVudC50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi9mZjNlNjkwZmZmYzZjNTQzNjdiODA1N2UyOGEwZTViOTIxMWYzN2I1L3BhY2thZ2VzL0ByZWFjdC1zdGF0ZWx5L3V0aWxzL3NyYy9udW1iZXIudHNcbiAqL1xuLyohXG4gKiBQb3J0aW9ucyBvZiB0aGlzIGZpbGUgYXJlIGJhc2VkIG9uIGNvZGUgZnJvbSBhcmlha2l0LlxuICogTUlUIExpY2Vuc2VkLCBDb3B5cmlnaHQgKGMpIERpZWdvIEhhei5cbiAqXG4gKiBDcmVkaXRzIHRvIHRoZSBBcmlha2l0IHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYXJpYWtpdC9hcmlha2l0L2Jsb2IvODRlOTc5NDNhZDYzN2E1ODJjMDFjOWI1NmQ4ODBjZDk1ZjU5NTczNy9wYWNrYWdlcy9hcmlha2l0L3NyYy9ob3ZlcmNhcmQvX191dGlscy9wb2x5Z29uLnRzXG4gKiBodHRwczovL2dpdGh1Yi5jb20vYXJpYWtpdC9hcmlha2l0L2Jsb2IvZjJhOTY5NzNkZTUyM2Q2N2U0MWVlYzk4MzI2MzkzNmM0ODllZjNlMi9wYWNrYWdlcy9hcmlha2l0L3NyYy9ob3ZlcmNhcmQvX191dGlscy9kZWJ1Zy1wb2x5Z29uLnRzXG4gKi9cbi8qIVxuICogUG9ydGlvbnMgb2YgdGhpcyBmaWxlIGFyZSBiYXNlZCBvbiBjb2RlIGZyb20gcmVhY3Qtc3BlY3RydW0uXG4gKiBBcGFjaGUgTGljZW5zZSBWZXJzaW9uIDIuMCwgQ29weXJpZ2h0IDIwMjAgQWRvYmUuXG4gKlxuICogQ3JlZGl0cyB0byB0aGUgUmVhY3QgU3BlY3RydW0gdGVhbTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hZG9iZS9yZWFjdC1zcGVjdHJ1bS9ibG9iL2E5ZGVhOGEzNjcyMTc5ZTZjMzhhYWZkMTQyOWRhZjQ0YzdlYTJmZjYvcGFja2FnZXMvQHJlYWN0LWFyaWEvdXRpbHMvc3JjL3J1bkFmdGVyVHJhbnNpdGlvbi50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi84ZjJmMmFjYjNkNTg1MDM4MmViZTYzMWYwNTVmODhjNzA0YWE3ZDE3L3BhY2thZ2VzL0ByZWFjdC1hcmlhL3V0aWxzL3NyYy9zY3JvbGxJbnRvVmlldy50c1xuICovXG5cbmV4cG9ydCB7IEV2ZW50S2V5LCBGT0NVU0FCTEVfRUxFTUVOVF9TRUxFQ1RPUiwgVEFCQkFCTEVfRUxFTUVOVF9TRUxFQ1RPUiwgYWRkSXRlbVRvQXJyYXksIGNhbGxIYW5kbGVyLCBjbGFtcCwgY29tcG9zZUV2ZW50SGFuZGxlcnMsIGNvbnRhaW5zLCBjcmVhdGVGb2N1c01hbmFnZXIsIGNyZWF0ZUdlbmVyYXRlSWQsIGNyZWF0ZUdsb2JhbExpc3RlbmVycywgZGVidWdQb2x5Z29uLCBmb2N1c1dpdGhvdXRTY3JvbGxpbmcsIGdldEFjdGl2ZUVsZW1lbnQsIGdldEFsbFRhYmJhYmxlSW4sIGdldERvY3VtZW50LCBnZXRFdmVudFBvaW50LCBnZXRGb2N1c2FibGVUcmVlV2Fsa2VyLCBnZXRTY3JvbGxQYXJlbnQsIGdldFdpbmRvdywgaGFzRm9jdXNXaXRoaW4sIGlzQW5kcm9pZCwgaXNBcHBsZURldmljZSwgaXNBcnJheSwgaXNDaHJvbWUsIGlzQ3RybEtleSwgaXNFbGVtZW50VmlzaWJsZSwgaXNGb2N1c2FibGUsIGlzRnJhbWUsIGlzRnVuY3Rpb24sIGlzSU9TLCBpc0lQYWQsIGlzSVBob25lLCBpc01hYywgaXNOdW1iZXIsIGlzUG9pbnRJblBvbHlnb24sIGlzU3RyaW5nLCBpc1RhYmJhYmxlLCBpc1ZpcnR1YWxDbGljaywgaXNWaXJ0dWFsUG9pbnRlckV2ZW50LCBpc1dlYktpdCwgbWVyZ2VEZWZhdWx0UHJvcHMsIG5vb3AsIHJlbW92ZUl0ZW1Gcm9tQXJyYXksIHJ1bkFmdGVyVHJhbnNpdGlvbiwgc2Nyb2xsSW50b1ZpZXcsIHNjcm9sbEludG9WaWV3cG9ydCwgc25hcFZhbHVlVG9TdGVwLCB2aXN1YWxseUhpZGRlblN0eWxlcyB9O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9b3V0LmpzLm1hcFxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aW5kZXguanMubWFwIiwiLy8gc3JjL2Rpc21pc3NhYmxlLWxheWVyL2xheWVyLXN0YWNrLnRzeFxuaW1wb3J0IHsgZ2V0RG9jdW1lbnQgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbnZhciBEQVRBX1RPUF9MQVlFUl9BVFRSID0gXCJkYXRhLWtiLXRvcC1sYXllclwiO1xudmFyIG9yaWdpbmFsQm9keVBvaW50ZXJFdmVudHM7XG52YXIgaGFzRGlzYWJsZWRCb2R5UG9pbnRlckV2ZW50cyA9IGZhbHNlO1xudmFyIGxheWVycyA9IFtdO1xuZnVuY3Rpb24gaW5kZXhPZihub2RlKSB7XG4gIHJldHVybiBsYXllcnMuZmluZEluZGV4KChsYXllcikgPT4gbGF5ZXIubm9kZSA9PT0gbm9kZSk7XG59XG5mdW5jdGlvbiBmaW5kKG5vZGUpIHtcbiAgcmV0dXJuIGxheWVyc1tpbmRleE9mKG5vZGUpXTtcbn1cbmZ1bmN0aW9uIGlzVG9wTW9zdExheWVyKG5vZGUpIHtcbiAgcmV0dXJuIGxheWVyc1tsYXllcnMubGVuZ3RoIC0gMV0ubm9kZSA9PT0gbm9kZTtcbn1cbmZ1bmN0aW9uIGdldFBvaW50ZXJCbG9ja2luZ0xheWVycygpIHtcbiAgcmV0dXJuIGxheWVycy5maWx0ZXIoKGxheWVyKSA9PiBsYXllci5pc1BvaW50ZXJCbG9ja2luZyk7XG59XG5mdW5jdGlvbiBnZXRUb3BNb3N0UG9pbnRlckJsb2NraW5nTGF5ZXIoKSB7XG4gIHJldHVybiBbLi4uZ2V0UG9pbnRlckJsb2NraW5nTGF5ZXJzKCldLnNsaWNlKC0xKVswXTtcbn1cbmZ1bmN0aW9uIGhhc1BvaW50ZXJCbG9ja2luZ0xheWVyKCkge1xuICByZXR1cm4gZ2V0UG9pbnRlckJsb2NraW5nTGF5ZXJzKCkubGVuZ3RoID4gMDtcbn1cbmZ1bmN0aW9uIGlzQmVsb3dQb2ludGVyQmxvY2tpbmdMYXllcihub2RlKSB7XG4gIGNvbnN0IGhpZ2hlc3RCbG9ja2luZ0luZGV4ID0gaW5kZXhPZihnZXRUb3BNb3N0UG9pbnRlckJsb2NraW5nTGF5ZXIoKT8ubm9kZSk7XG4gIHJldHVybiBpbmRleE9mKG5vZGUpIDwgaGlnaGVzdEJsb2NraW5nSW5kZXg7XG59XG5mdW5jdGlvbiBhZGRMYXllcihsYXllcikge1xuICBsYXllcnMucHVzaChsYXllcik7XG59XG5mdW5jdGlvbiByZW1vdmVMYXllcihub2RlKSB7XG4gIGNvbnN0IGluZGV4ID0gaW5kZXhPZihub2RlKTtcbiAgaWYgKGluZGV4IDwgMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBsYXllcnMuc3BsaWNlKGluZGV4LCAxKTtcbn1cbmZ1bmN0aW9uIGFzc2lnblBvaW50ZXJFdmVudFRvTGF5ZXJzKCkge1xuICBmb3IgKGNvbnN0IHsgbm9kZSB9IG9mIGxheWVycykge1xuICAgIG5vZGUuc3R5bGUucG9pbnRlckV2ZW50cyA9IGlzQmVsb3dQb2ludGVyQmxvY2tpbmdMYXllcihub2RlKSA/IFwibm9uZVwiIDogXCJhdXRvXCI7XG4gIH1cbn1cbmZ1bmN0aW9uIGRpc2FibGVCb2R5UG9pbnRlckV2ZW50cyhub2RlKSB7XG4gIGlmIChoYXNQb2ludGVyQmxvY2tpbmdMYXllcigpICYmICFoYXNEaXNhYmxlZEJvZHlQb2ludGVyRXZlbnRzKSB7XG4gICAgY29uc3Qgb3duZXJEb2N1bWVudCA9IGdldERvY3VtZW50KG5vZGUpO1xuICAgIG9yaWdpbmFsQm9keVBvaW50ZXJFdmVudHMgPSBkb2N1bWVudC5ib2R5LnN0eWxlLnBvaW50ZXJFdmVudHM7XG4gICAgb3duZXJEb2N1bWVudC5ib2R5LnN0eWxlLnBvaW50ZXJFdmVudHMgPSBcIm5vbmVcIjtcbiAgICBoYXNEaXNhYmxlZEJvZHlQb2ludGVyRXZlbnRzID0gdHJ1ZTtcbiAgfVxufVxuZnVuY3Rpb24gcmVzdG9yZUJvZHlQb2ludGVyRXZlbnRzKG5vZGUpIHtcbiAgaWYgKGhhc1BvaW50ZXJCbG9ja2luZ0xheWVyKCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgb3duZXJEb2N1bWVudCA9IGdldERvY3VtZW50KG5vZGUpO1xuICBvd25lckRvY3VtZW50LmJvZHkuc3R5bGUucG9pbnRlckV2ZW50cyA9IG9yaWdpbmFsQm9keVBvaW50ZXJFdmVudHM7XG4gIGlmIChvd25lckRvY3VtZW50LmJvZHkuc3R5bGUubGVuZ3RoID09PSAwKSB7XG4gICAgb3duZXJEb2N1bWVudC5ib2R5LnJlbW92ZUF0dHJpYnV0ZShcInN0eWxlXCIpO1xuICB9XG4gIGhhc0Rpc2FibGVkQm9keVBvaW50ZXJFdmVudHMgPSBmYWxzZTtcbn1cbnZhciBsYXllclN0YWNrID0ge1xuICBsYXllcnMsXG4gIGlzVG9wTW9zdExheWVyLFxuICBoYXNQb2ludGVyQmxvY2tpbmdMYXllcixcbiAgaXNCZWxvd1BvaW50ZXJCbG9ja2luZ0xheWVyLFxuICBhZGRMYXllcixcbiAgcmVtb3ZlTGF5ZXIsXG4gIGluZGV4T2YsXG4gIGZpbmQsXG4gIGFzc2lnblBvaW50ZXJFdmVudFRvTGF5ZXJzLFxuICBkaXNhYmxlQm9keVBvaW50ZXJFdmVudHMsXG4gIHJlc3RvcmVCb2R5UG9pbnRlckV2ZW50c1xufTtcblxuZXhwb3J0IHtcbiAgREFUQV9UT1BfTEFZRVJfQVRUUixcbiAgbGF5ZXJTdGFja1xufTtcbiIsImltcG9ydCB7XG4gIERBVEFfVE9QX0xBWUVSX0FUVFJcbn0gZnJvbSBcIi4vM05JNkZUQTIuanN4XCI7XG5cbi8vIHNyYy9wcmltaXRpdmVzL2NyZWF0ZS1mb2N1cy1zY29wZS9jcmVhdGUtZm9jdXMtc2NvcGUudHN4XG5pbXBvcnQge1xuICBhY2Nlc3MsXG4gIGNvbnRhaW5zLFxuICBmb2N1c1dpdGhvdXRTY3JvbGxpbmcsXG4gIGdldEFjdGl2ZUVsZW1lbnQsXG4gIGdldEFsbFRhYmJhYmxlSW4sXG4gIGdldERvY3VtZW50LFxuICBpc0ZvY3VzYWJsZSxcbiAgcmVtb3ZlSXRlbUZyb21BcnJheSxcbiAgdmlzdWFsbHlIaWRkZW5TdHlsZXNcbn0gZnJvbSBcIkBrb2JhbHRlL3V0aWxzXCI7XG5pbXBvcnQgeyBjcmVhdGVFZmZlY3QsIGNyZWF0ZVNpZ25hbCwgb25DbGVhbnVwIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5pbXBvcnQgeyBpc1NlcnZlciB9IGZyb20gXCJzb2xpZC1qcy93ZWJcIjtcbnZhciBBVVRPRk9DVVNfT05fTU9VTlRfRVZFTlQgPSBcImZvY3VzU2NvcGUuYXV0b0ZvY3VzT25Nb3VudFwiO1xudmFyIEFVVE9GT0NVU19PTl9VTk1PVU5UX0VWRU5UID0gXCJmb2N1c1Njb3BlLmF1dG9Gb2N1c09uVW5tb3VudFwiO1xudmFyIEVWRU5UX09QVElPTlMgPSB7IGJ1YmJsZXM6IGZhbHNlLCBjYW5jZWxhYmxlOiB0cnVlIH07XG52YXIgZm9jdXNTY29wZVN0YWNrID0ge1xuICAvKiogQSBzdGFjayBvZiBmb2N1cyBzY29wZXMsIHdpdGggdGhlIGFjdGl2ZSBvbmUgYXQgdGhlIHRvcCAqL1xuICBzdGFjazogW10sXG4gIGFjdGl2ZSgpIHtcbiAgICByZXR1cm4gdGhpcy5zdGFja1swXTtcbiAgfSxcbiAgYWRkKHNjb3BlKSB7XG4gICAgaWYgKHNjb3BlICE9PSB0aGlzLmFjdGl2ZSgpKSB7XG4gICAgICB0aGlzLmFjdGl2ZSgpPy5wYXVzZSgpO1xuICAgIH1cbiAgICB0aGlzLnN0YWNrID0gcmVtb3ZlSXRlbUZyb21BcnJheSh0aGlzLnN0YWNrLCBzY29wZSk7XG4gICAgdGhpcy5zdGFjay51bnNoaWZ0KHNjb3BlKTtcbiAgfSxcbiAgcmVtb3ZlKHNjb3BlKSB7XG4gICAgdGhpcy5zdGFjayA9IHJlbW92ZUl0ZW1Gcm9tQXJyYXkodGhpcy5zdGFjaywgc2NvcGUpO1xuICAgIHRoaXMuYWN0aXZlKCk/LnJlc3VtZSgpO1xuICB9XG59O1xuZnVuY3Rpb24gY3JlYXRlRm9jdXNTY29wZShwcm9wcywgcmVmKSB7XG4gIGNvbnN0IFtpc1BhdXNlZCwgc2V0SXNQYXVzZWRdID0gY3JlYXRlU2lnbmFsKGZhbHNlKTtcbiAgY29uc3QgZm9jdXNTY29wZSA9IHtcbiAgICBwYXVzZSgpIHtcbiAgICAgIHNldElzUGF1c2VkKHRydWUpO1xuICAgIH0sXG4gICAgcmVzdW1lKCkge1xuICAgICAgc2V0SXNQYXVzZWQoZmFsc2UpO1xuICAgIH1cbiAgfTtcbiAgbGV0IGxhc3RGb2N1c2VkRWxlbWVudCA9IG51bGw7XG4gIGNvbnN0IG9uTW91bnRBdXRvRm9jdXMgPSAoZSkgPT4gcHJvcHMub25Nb3VudEF1dG9Gb2N1cz8uKGUpO1xuICBjb25zdCBvblVubW91bnRBdXRvRm9jdXMgPSAoZSkgPT4gcHJvcHMub25Vbm1vdW50QXV0b0ZvY3VzPy4oZSk7XG4gIGNvbnN0IG93bmVyRG9jdW1lbnQgPSAoKSA9PiBnZXREb2N1bWVudChyZWYoKSk7XG4gIGNvbnN0IGNyZWF0ZVNlbnRpbmVsID0gKCkgPT4ge1xuICAgIGNvbnN0IGVsZW1lbnQgPSBvd25lckRvY3VtZW50KCkuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJkYXRhLWZvY3VzLXRyYXBcIiwgXCJcIik7XG4gICAgZWxlbWVudC50YWJJbmRleCA9IDA7XG4gICAgT2JqZWN0LmFzc2lnbihlbGVtZW50LnN0eWxlLCB2aXN1YWxseUhpZGRlblN0eWxlcyk7XG4gICAgcmV0dXJuIGVsZW1lbnQ7XG4gIH07XG4gIGNvbnN0IHRhYmJhYmxlcyA9ICgpID0+IHtcbiAgICBjb25zdCBjb250YWluZXIgPSByZWYoKTtcbiAgICBpZiAoIWNvbnRhaW5lcikge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0QWxsVGFiYmFibGVJbihjb250YWluZXIsIHRydWUpLmZpbHRlcihcbiAgICAgIChlbCkgPT4gIWVsLmhhc0F0dHJpYnV0ZShcImRhdGEtZm9jdXMtdHJhcFwiKVxuICAgICk7XG4gIH07XG4gIGNvbnN0IGZpcnN0VGFiYmFibGUgPSAoKSA9PiB7XG4gICAgY29uc3QgaXRlbXMgPSB0YWJiYWJsZXMoKTtcbiAgICByZXR1cm4gaXRlbXMubGVuZ3RoID4gMCA/IGl0ZW1zWzBdIDogbnVsbDtcbiAgfTtcbiAgY29uc3QgbGFzdFRhYmJhYmxlID0gKCkgPT4ge1xuICAgIGNvbnN0IGl0ZW1zID0gdGFiYmFibGVzKCk7XG4gICAgcmV0dXJuIGl0ZW1zLmxlbmd0aCA+IDAgPyBpdGVtc1tpdGVtcy5sZW5ndGggLSAxXSA6IG51bGw7XG4gIH07XG4gIGNvbnN0IHNob3VsZFByZXZlbnRVbm1vdW50QXV0b0ZvY3VzID0gKCkgPT4ge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IHJlZigpO1xuICAgIGlmICghY29udGFpbmVyKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KGNvbnRhaW5lcik7XG4gICAgaWYgKCFhY3RpdmVFbGVtZW50KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmIChjb250YWlucyhjb250YWluZXIsIGFjdGl2ZUVsZW1lbnQpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBpc0ZvY3VzYWJsZShhY3RpdmVFbGVtZW50KTtcbiAgfTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoaXNTZXJ2ZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29udGFpbmVyID0gcmVmKCk7XG4gICAgaWYgKCFjb250YWluZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9jdXNTY29wZVN0YWNrLmFkZChmb2N1c1Njb3BlKTtcbiAgICBjb25zdCBwcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KFxuICAgICAgY29udGFpbmVyXG4gICAgKTtcbiAgICBjb25zdCBoYXNGb2N1c2VkQ2FuZGlkYXRlID0gY29udGFpbnMoY29udGFpbmVyLCBwcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQpO1xuICAgIGlmICghaGFzRm9jdXNlZENhbmRpZGF0ZSkge1xuICAgICAgY29uc3QgbW91bnRFdmVudCA9IG5ldyBDdXN0b21FdmVudChcbiAgICAgICAgQVVUT0ZPQ1VTX09OX01PVU5UX0VWRU5ULFxuICAgICAgICBFVkVOVF9PUFRJT05TXG4gICAgICApO1xuICAgICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoQVVUT0ZPQ1VTX09OX01PVU5UX0VWRU5ULCBvbk1vdW50QXV0b0ZvY3VzKTtcbiAgICAgIGNvbnRhaW5lci5kaXNwYXRjaEV2ZW50KG1vdW50RXZlbnQpO1xuICAgICAgaWYgKCFtb3VudEV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQpIHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgZm9jdXNXaXRob3V0U2Nyb2xsaW5nKGZpcnN0VGFiYmFibGUoKSk7XG4gICAgICAgICAgaWYgKGdldEFjdGl2ZUVsZW1lbnQoY29udGFpbmVyKSA9PT0gcHJldmlvdXNseUZvY3VzZWRFbGVtZW50KSB7XG4gICAgICAgICAgICBmb2N1c1dpdGhvdXRTY3JvbGxpbmcoY29udGFpbmVyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIDApO1xuICAgICAgfVxuICAgIH1cbiAgICBvbkNsZWFudXAoKCkgPT4ge1xuICAgICAgY29udGFpbmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoQVVUT0ZPQ1VTX09OX01PVU5UX0VWRU5ULCBvbk1vdW50QXV0b0ZvY3VzKTtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCB1bm1vdW50RXZlbnQgPSBuZXcgQ3VzdG9tRXZlbnQoXG4gICAgICAgICAgQVVUT0ZPQ1VTX09OX1VOTU9VTlRfRVZFTlQsXG4gICAgICAgICAgRVZFTlRfT1BUSU9OU1xuICAgICAgICApO1xuICAgICAgICBpZiAoc2hvdWxkUHJldmVudFVubW91bnRBdXRvRm9jdXMoKSkge1xuICAgICAgICAgIHVubW91bnRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgICAgIEFVVE9GT0NVU19PTl9VTk1PVU5UX0VWRU5ULFxuICAgICAgICAgIG9uVW5tb3VudEF1dG9Gb2N1c1xuICAgICAgICApO1xuICAgICAgICBjb250YWluZXIuZGlzcGF0Y2hFdmVudCh1bm1vdW50RXZlbnQpO1xuICAgICAgICBpZiAoIXVubW91bnRFdmVudC5kZWZhdWx0UHJldmVudGVkKSB7XG4gICAgICAgICAgZm9jdXNXaXRob3V0U2Nyb2xsaW5nKFxuICAgICAgICAgICAgcHJldmlvdXNseUZvY3VzZWRFbGVtZW50ID8/IG93bmVyRG9jdW1lbnQoKS5ib2R5XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBjb250YWluZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcihcbiAgICAgICAgICBBVVRPRk9DVVNfT05fVU5NT1VOVF9FVkVOVCxcbiAgICAgICAgICBvblVubW91bnRBdXRvRm9jdXNcbiAgICAgICAgKTtcbiAgICAgICAgZm9jdXNTY29wZVN0YWNrLnJlbW92ZShmb2N1c1Njb3BlKTtcbiAgICAgIH0sIDApO1xuICAgIH0pO1xuICB9KTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoaXNTZXJ2ZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29udGFpbmVyID0gcmVmKCk7XG4gICAgaWYgKCFjb250YWluZXIgfHwgIWFjY2Vzcyhwcm9wcy50cmFwRm9jdXMpIHx8IGlzUGF1c2VkKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgb25Gb2N1c0luID0gKGV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG4gICAgICBpZiAodGFyZ2V0Py5jbG9zZXN0KGBbJHtEQVRBX1RPUF9MQVlFUl9BVFRSfV1gKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoY29udGFpbnMoY29udGFpbmVyLCB0YXJnZXQpKSB7XG4gICAgICAgIGxhc3RGb2N1c2VkRWxlbWVudCA9IHRhcmdldDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvY3VzV2l0aG91dFNjcm9sbGluZyhsYXN0Rm9jdXNlZEVsZW1lbnQpO1xuICAgICAgfVxuICAgIH07XG4gICAgY29uc3Qgb25Gb2N1c091dCA9IChldmVudCkgPT4ge1xuICAgICAgY29uc3QgcmVsYXRlZFRhcmdldCA9IGV2ZW50LnJlbGF0ZWRUYXJnZXQ7XG4gICAgICBjb25zdCB0YXJnZXQgPSByZWxhdGVkVGFyZ2V0ID8/IGdldEFjdGl2ZUVsZW1lbnQoY29udGFpbmVyKTtcbiAgICAgIGlmICh0YXJnZXQ/LmNsb3Nlc3QoYFske0RBVEFfVE9QX0xBWUVSX0FUVFJ9XWApKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmICghY29udGFpbnMoY29udGFpbmVyLCB0YXJnZXQpKSB7XG4gICAgICAgIGZvY3VzV2l0aG91dFNjcm9sbGluZyhsYXN0Rm9jdXNlZEVsZW1lbnQpO1xuICAgICAgfVxuICAgIH07XG4gICAgb3duZXJEb2N1bWVudCgpLmFkZEV2ZW50TGlzdGVuZXIoXCJmb2N1c2luXCIsIG9uRm9jdXNJbik7XG4gICAgb3duZXJEb2N1bWVudCgpLmFkZEV2ZW50TGlzdGVuZXIoXCJmb2N1c291dFwiLCBvbkZvY3VzT3V0KTtcbiAgICBvbkNsZWFudXAoKCkgPT4ge1xuICAgICAgb3duZXJEb2N1bWVudCgpLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJmb2N1c2luXCIsIG9uRm9jdXNJbik7XG4gICAgICBvd25lckRvY3VtZW50KCkucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImZvY3Vzb3V0XCIsIG9uRm9jdXNPdXQpO1xuICAgIH0pO1xuICB9KTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoaXNTZXJ2ZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29udGFpbmVyID0gcmVmKCk7XG4gICAgaWYgKCFjb250YWluZXIgfHwgIWFjY2Vzcyhwcm9wcy50cmFwRm9jdXMpIHx8IGlzUGF1c2VkKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc3RhcnRTZW50aW5lbCA9IGNyZWF0ZVNlbnRpbmVsKCk7XG4gICAgY29udGFpbmVyLmluc2VydEFkamFjZW50RWxlbWVudChcImFmdGVyYmVnaW5cIiwgc3RhcnRTZW50aW5lbCk7XG4gICAgY29uc3QgZW5kU2VudGluZWwgPSBjcmVhdGVTZW50aW5lbCgpO1xuICAgIGNvbnRhaW5lci5pbnNlcnRBZGphY2VudEVsZW1lbnQoXCJiZWZvcmVlbmRcIiwgZW5kU2VudGluZWwpO1xuICAgIGZ1bmN0aW9uIG9uRm9jdXMoZXZlbnQpIHtcbiAgICAgIGNvbnN0IGZpcnN0ID0gZmlyc3RUYWJiYWJsZSgpO1xuICAgICAgY29uc3QgbGFzdCA9IGxhc3RUYWJiYWJsZSgpO1xuICAgICAgaWYgKGV2ZW50LnJlbGF0ZWRUYXJnZXQgPT09IGZpcnN0KSB7XG4gICAgICAgIGZvY3VzV2l0aG91dFNjcm9sbGluZyhsYXN0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvY3VzV2l0aG91dFNjcm9sbGluZyhmaXJzdCk7XG4gICAgICB9XG4gICAgfVxuICAgIHN0YXJ0U2VudGluZWwuYWRkRXZlbnRMaXN0ZW5lcihcImZvY3VzaW5cIiwgb25Gb2N1cyk7XG4gICAgZW5kU2VudGluZWwuYWRkRXZlbnRMaXN0ZW5lcihcImZvY3VzaW5cIiwgb25Gb2N1cyk7XG4gICAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigobXV0YXRpb25zKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IG11dGF0aW9uIG9mIG11dGF0aW9ucykge1xuICAgICAgICBpZiAobXV0YXRpb24ucHJldmlvdXNTaWJsaW5nID09PSBlbmRTZW50aW5lbCkge1xuICAgICAgICAgIGVuZFNlbnRpbmVsLnJlbW92ZSgpO1xuICAgICAgICAgIGNvbnRhaW5lci5pbnNlcnRBZGphY2VudEVsZW1lbnQoXCJiZWZvcmVlbmRcIiwgZW5kU2VudGluZWwpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChtdXRhdGlvbi5uZXh0U2libGluZyA9PT0gc3RhcnRTZW50aW5lbCkge1xuICAgICAgICAgIHN0YXJ0U2VudGluZWwucmVtb3ZlKCk7XG4gICAgICAgICAgY29udGFpbmVyLmluc2VydEFkamFjZW50RWxlbWVudChcImFmdGVyYmVnaW5cIiwgc3RhcnRTZW50aW5lbCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBvYnNlcnZlci5vYnNlcnZlKGNvbnRhaW5lciwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IGZhbHNlIH0pO1xuICAgIG9uQ2xlYW51cCgoKSA9PiB7XG4gICAgICBzdGFydFNlbnRpbmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJmb2N1c2luXCIsIG9uRm9jdXMpO1xuICAgICAgZW5kU2VudGluZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImZvY3VzaW5cIiwgb25Gb2N1cyk7XG4gICAgICBzdGFydFNlbnRpbmVsLnJlbW92ZSgpO1xuICAgICAgZW5kU2VudGluZWwucmVtb3ZlKCk7XG4gICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQge1xuICBjcmVhdGVGb2N1c1Njb3BlXG59O1xuIiwiLy8gc3JjL2xpdmUtYW5ub3VuY2VyL2xpdmUtYW5ub3VuY2VyLnRzeFxuaW1wb3J0IHsgdmlzdWFsbHlIaWRkZW5TdHlsZXMgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbnZhciBMSVZFUkVHSU9OX1RJTUVPVVRfREVMQVkgPSA3ZTM7XG52YXIgbGl2ZUFubm91bmNlciA9IG51bGw7XG52YXIgREFUQV9MSVZFX0FOTk9VTkNFUl9BVFRSID0gXCJkYXRhLWxpdmUtYW5ub3VuY2VyXCI7XG5mdW5jdGlvbiBhbm5vdW5jZShtZXNzYWdlLCBhc3NlcnRpdmVuZXNzID0gXCJhc3NlcnRpdmVcIiwgdGltZW91dCA9IExJVkVSRUdJT05fVElNRU9VVF9ERUxBWSkge1xuICBpZiAoIWxpdmVBbm5vdW5jZXIpIHtcbiAgICBsaXZlQW5ub3VuY2VyID0gbmV3IExpdmVBbm5vdW5jZXIoKTtcbiAgfVxuICBsaXZlQW5ub3VuY2VyLmFubm91bmNlKG1lc3NhZ2UsIGFzc2VydGl2ZW5lc3MsIHRpbWVvdXQpO1xufVxuZnVuY3Rpb24gY2xlYXJBbm5vdW5jZXIoYXNzZXJ0aXZlbmVzcykge1xuICBpZiAobGl2ZUFubm91bmNlcikge1xuICAgIGxpdmVBbm5vdW5jZXIuY2xlYXIoYXNzZXJ0aXZlbmVzcyk7XG4gIH1cbn1cbmZ1bmN0aW9uIGRlc3Ryb3lBbm5vdW5jZXIoKSB7XG4gIGlmIChsaXZlQW5ub3VuY2VyKSB7XG4gICAgbGl2ZUFubm91bmNlci5kZXN0cm95KCk7XG4gICAgbGl2ZUFubm91bmNlciA9IG51bGw7XG4gIH1cbn1cbnZhciBMaXZlQW5ub3VuY2VyID0gY2xhc3Mge1xuICBub2RlO1xuICBhc3NlcnRpdmVMb2c7XG4gIHBvbGl0ZUxvZztcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5ub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0aGlzLm5vZGUuZGF0YXNldC5saXZlQW5ub3VuY2VyID0gXCJ0cnVlXCI7XG4gICAgT2JqZWN0LmFzc2lnbih0aGlzLm5vZGUuc3R5bGUsIHZpc3VhbGx5SGlkZGVuU3R5bGVzKTtcbiAgICB0aGlzLmFzc2VydGl2ZUxvZyA9IHRoaXMuY3JlYXRlTG9nKFwiYXNzZXJ0aXZlXCIpO1xuICAgIHRoaXMubm9kZS5hcHBlbmRDaGlsZCh0aGlzLmFzc2VydGl2ZUxvZyk7XG4gICAgdGhpcy5wb2xpdGVMb2cgPSB0aGlzLmNyZWF0ZUxvZyhcInBvbGl0ZVwiKTtcbiAgICB0aGlzLm5vZGUuYXBwZW5kQ2hpbGQodGhpcy5wb2xpdGVMb2cpO1xuICAgIGRvY3VtZW50LmJvZHkucHJlcGVuZCh0aGlzLm5vZGUpO1xuICB9XG4gIGNyZWF0ZUxvZyhhcmlhTGl2ZSkge1xuICAgIGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG5vZGUuc2V0QXR0cmlidXRlKFwicm9sZVwiLCBcImxvZ1wiKTtcbiAgICBub2RlLnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBhcmlhTGl2ZSk7XG4gICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJhcmlhLXJlbGV2YW50XCIsIFwiYWRkaXRpb25zXCIpO1xuICAgIHJldHVybiBub2RlO1xuICB9XG4gIGRlc3Ryb3koKSB7XG4gICAgaWYgKCF0aGlzLm5vZGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0aGlzLm5vZGUpO1xuICAgIHRoaXMubm9kZSA9IG51bGw7XG4gIH1cbiAgYW5ub3VuY2UobWVzc2FnZSwgYXNzZXJ0aXZlbmVzcyA9IFwiYXNzZXJ0aXZlXCIsIHRpbWVvdXQgPSBMSVZFUkVHSU9OX1RJTUVPVVRfREVMQVkpIHtcbiAgICBpZiAoIXRoaXMubm9kZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBub2RlLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgICBpZiAoYXNzZXJ0aXZlbmVzcyA9PT0gXCJhc3NlcnRpdmVcIikge1xuICAgICAgdGhpcy5hc3NlcnRpdmVMb2cuYXBwZW5kQ2hpbGQobm9kZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucG9saXRlTG9nLmFwcGVuZENoaWxkKG5vZGUpO1xuICAgIH1cbiAgICBpZiAobWVzc2FnZSAhPT0gXCJcIikge1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIG5vZGUucmVtb3ZlKCk7XG4gICAgICB9LCB0aW1lb3V0KTtcbiAgICB9XG4gIH1cbiAgY2xlYXIoYXNzZXJ0aXZlbmVzcykge1xuICAgIGlmICghdGhpcy5ub2RlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghYXNzZXJ0aXZlbmVzcyB8fCBhc3NlcnRpdmVuZXNzID09PSBcImFzc2VydGl2ZVwiKSB7XG4gICAgICB0aGlzLmFzc2VydGl2ZUxvZy5pbm5lckhUTUwgPSBcIlwiO1xuICAgIH1cbiAgICBpZiAoIWFzc2VydGl2ZW5lc3MgfHwgYXNzZXJ0aXZlbmVzcyA9PT0gXCJwb2xpdGVcIikge1xuICAgICAgdGhpcy5wb2xpdGVMb2cuaW5uZXJIVE1MID0gXCJcIjtcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCB7XG4gIERBVEFfTElWRV9BTk5PVU5DRVJfQVRUUixcbiAgYW5ub3VuY2UsXG4gIGNsZWFyQW5ub3VuY2VyLFxuICBkZXN0cm95QW5ub3VuY2VyXG59O1xuIiwiaW1wb3J0IHtcbiAgREFUQV9MSVZFX0FOTk9VTkNFUl9BVFRSXG59IGZyb20gXCIuL0pITU5XT0xZLmpzeFwiO1xuaW1wb3J0IHtcbiAgREFUQV9UT1BfTEFZRVJfQVRUUlxufSBmcm9tIFwiLi8zTkk2RlRBMi5qc3hcIjtcblxuLy8gc3JjL3ByaW1pdGl2ZXMvY3JlYXRlLWhpZGUtb3V0c2lkZS9jcmVhdGUtaGlkZS1vdXRzaWRlLnRzXG5pbXBvcnQgeyBhY2Nlc3MgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7IGNyZWF0ZUVmZmVjdCwgb25DbGVhbnVwIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5mdW5jdGlvbiBjcmVhdGVIaWRlT3V0c2lkZShwcm9wcykge1xuICBjcmVhdGVFZmZlY3QoKCkgPT4ge1xuICAgIGlmIChhY2Nlc3MocHJvcHMuaXNEaXNhYmxlZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgb25DbGVhbnVwKGFyaWFIaWRlT3V0c2lkZShhY2Nlc3MocHJvcHMudGFyZ2V0cyksIGFjY2Vzcyhwcm9wcy5yb290KSkpO1xuICB9KTtcbn1cbnZhciByZWZDb3VudE1hcCA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgV2Vha01hcCgpO1xudmFyIG9ic2VydmVyU3RhY2sgPSBbXTtcbmZ1bmN0aW9uIGFyaWFIaWRlT3V0c2lkZSh0YXJnZXRzLCByb290ID0gZG9jdW1lbnQuYm9keSkge1xuICBjb25zdCB2aXNpYmxlTm9kZXMgPSBuZXcgU2V0KHRhcmdldHMpO1xuICBjb25zdCBoaWRkZW5Ob2RlcyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgU2V0KCk7XG4gIGNvbnN0IHdhbGsgPSAocm9vdDIpID0+IHtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2Ygcm9vdDIucXVlcnlTZWxlY3RvckFsbChcbiAgICAgIGBbJHtEQVRBX0xJVkVfQU5OT1VOQ0VSX0FUVFJ9XSwgWyR7REFUQV9UT1BfTEFZRVJfQVRUUn1dYFxuICAgICkpIHtcbiAgICAgIHZpc2libGVOb2Rlcy5hZGQoZWxlbWVudCk7XG4gICAgfVxuICAgIGNvbnN0IGFjY2VwdE5vZGUgPSAobm9kZSkgPT4ge1xuICAgICAgaWYgKHZpc2libGVOb2Rlcy5oYXMobm9kZSkgfHwgbm9kZS5wYXJlbnRFbGVtZW50ICYmIGhpZGRlbk5vZGVzLmhhcyhub2RlLnBhcmVudEVsZW1lbnQpICYmIG5vZGUucGFyZW50RWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJyb2xlXCIpICE9PSBcInJvd1wiKSB7XG4gICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9SRUpFQ1Q7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHRhcmdldCBvZiB2aXNpYmxlTm9kZXMpIHtcbiAgICAgICAgaWYgKG5vZGUuY29udGFpbnModGFyZ2V0KSkge1xuICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xuICAgIH07XG4gICAgY29uc3Qgd2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihyb290MiwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQsIHtcbiAgICAgIGFjY2VwdE5vZGVcbiAgICB9KTtcbiAgICBjb25zdCBhY2NlcHRSb290ID0gYWNjZXB0Tm9kZShyb290Mik7XG4gICAgaWYgKGFjY2VwdFJvb3QgPT09IE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVCkge1xuICAgICAgaGlkZShyb290Mik7XG4gICAgfVxuICAgIGlmIChhY2NlcHRSb290ICE9PSBOb2RlRmlsdGVyLkZJTFRFUl9SRUpFQ1QpIHtcbiAgICAgIGxldCBub2RlID0gd2Fsa2VyLm5leHROb2RlKCk7XG4gICAgICB3aGlsZSAobm9kZSAhPSBudWxsKSB7XG4gICAgICAgIGhpZGUobm9kZSk7XG4gICAgICAgIG5vZGUgPSB3YWxrZXIubmV4dE5vZGUoKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIGNvbnN0IGhpZGUgPSAobm9kZSkgPT4ge1xuICAgIGNvbnN0IHJlZkNvdW50ID0gcmVmQ291bnRNYXAuZ2V0KG5vZGUpID8/IDA7XG4gICAgaWYgKG5vZGUuZ2V0QXR0cmlidXRlKFwiYXJpYS1oaWRkZW5cIikgPT09IFwidHJ1ZVwiICYmIHJlZkNvdW50ID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChyZWZDb3VudCA9PT0gMCkge1xuICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJhcmlhLWhpZGRlblwiLCBcInRydWVcIik7XG4gICAgfVxuICAgIGhpZGRlbk5vZGVzLmFkZChub2RlKTtcbiAgICByZWZDb3VudE1hcC5zZXQobm9kZSwgcmVmQ291bnQgKyAxKTtcbiAgfTtcbiAgaWYgKG9ic2VydmVyU3RhY2subGVuZ3RoKSB7XG4gICAgb2JzZXJ2ZXJTdGFja1tvYnNlcnZlclN0YWNrLmxlbmd0aCAtIDFdLmRpc2Nvbm5lY3QoKTtcbiAgfVxuICB3YWxrKHJvb3QpO1xuICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKChjaGFuZ2VzKSA9PiB7XG4gICAgZm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuICAgICAgaWYgKGNoYW5nZS50eXBlICE9PSBcImNoaWxkTGlzdFwiIHx8IGNoYW5nZS5hZGRlZE5vZGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICghWy4uLnZpc2libGVOb2RlcywgLi4uaGlkZGVuTm9kZXNdLnNvbWUoXG4gICAgICAgIChub2RlKSA9PiBub2RlLmNvbnRhaW5zKGNoYW5nZS50YXJnZXQpXG4gICAgICApKSB7XG4gICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBjaGFuZ2UucmVtb3ZlZE5vZGVzKSB7XG4gICAgICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICB2aXNpYmxlTm9kZXMuZGVsZXRlKG5vZGUpO1xuICAgICAgICAgICAgaGlkZGVuTm9kZXMuZGVsZXRlKG5vZGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2YgY2hhbmdlLmFkZGVkTm9kZXMpIHtcbiAgICAgICAgICBpZiAoKG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCB8fCBub2RlIGluc3RhbmNlb2YgU1ZHRWxlbWVudCkgJiYgKG5vZGUuZGF0YXNldC5saXZlQW5ub3VuY2VyID09PSBcInRydWVcIiB8fCBub2RlLmRhdGFzZXQucmVhY3RBcmlhVG9wTGF5ZXIgPT09IFwidHJ1ZVwiKSkge1xuICAgICAgICAgICAgdmlzaWJsZU5vZGVzLmFkZChub2RlKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICB3YWxrKG5vZGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIG9ic2VydmVyLm9ic2VydmUocm9vdCwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG4gIGNvbnN0IG9ic2VydmVyV3JhcHBlciA9IHtcbiAgICBvYnNlcnZlKCkge1xuICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShyb290LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICB9LFxuICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgfVxuICB9O1xuICBvYnNlcnZlclN0YWNrLnB1c2gob2JzZXJ2ZXJXcmFwcGVyKTtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgZm9yIChjb25zdCBub2RlIG9mIGhpZGRlbk5vZGVzKSB7XG4gICAgICBjb25zdCBjb3VudCA9IHJlZkNvdW50TWFwLmdldChub2RlKTtcbiAgICAgIGlmIChjb3VudCA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChjb3VudCA9PT0gMSkge1xuICAgICAgICBub2RlLnJlbW92ZUF0dHJpYnV0ZShcImFyaWEtaGlkZGVuXCIpO1xuICAgICAgICByZWZDb3VudE1hcC5kZWxldGUobm9kZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZWZDb3VudE1hcC5zZXQobm9kZSwgY291bnQgLSAxKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG9ic2VydmVyV3JhcHBlciA9PT0gb2JzZXJ2ZXJTdGFja1tvYnNlcnZlclN0YWNrLmxlbmd0aCAtIDFdKSB7XG4gICAgICBvYnNlcnZlclN0YWNrLnBvcCgpO1xuICAgICAgaWYgKG9ic2VydmVyU3RhY2subGVuZ3RoKSB7XG4gICAgICAgIG9ic2VydmVyU3RhY2tbb2JzZXJ2ZXJTdGFjay5sZW5ndGggLSAxXS5vYnNlcnZlKCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG9ic2VydmVyU3RhY2suc3BsaWNlKG9ic2VydmVyU3RhY2suaW5kZXhPZihvYnNlcnZlcldyYXBwZXIpLCAxKTtcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCB7XG4gIGNyZWF0ZUhpZGVPdXRzaWRlLFxuICBhcmlhSGlkZU91dHNpZGVcbn07XG4iLCIvLyBzcmMvcHJpbWl0aXZlcy9jcmVhdGUtZXNjYXBlLWtleS1kb3duL2NyZWF0ZS1lc2NhcGUta2V5LWRvd24udHNcbmltcG9ydCB7IEV2ZW50S2V5LCBhY2Nlc3MsIGdldERvY3VtZW50IH0gZnJvbSBcIkBrb2JhbHRlL3V0aWxzXCI7XG5pbXBvcnQgeyBjcmVhdGVFZmZlY3QsIG9uQ2xlYW51cCB9IGZyb20gXCJzb2xpZC1qc1wiO1xuaW1wb3J0IHsgaXNTZXJ2ZXIgfSBmcm9tIFwic29saWQtanMvd2ViXCI7XG5mdW5jdGlvbiBjcmVhdGVFc2NhcGVLZXlEb3duKHByb3BzKSB7XG4gIGNvbnN0IGhhbmRsZUtleURvd24gPSAoZXZlbnQpID0+IHtcbiAgICBpZiAoZXZlbnQua2V5ID09PSBFdmVudEtleS5Fc2NhcGUpIHtcbiAgICAgIHByb3BzLm9uRXNjYXBlS2V5RG93bj8uKGV2ZW50KTtcbiAgICB9XG4gIH07XG4gIGNyZWF0ZUVmZmVjdCgoKSA9PiB7XG4gICAgaWYgKGlzU2VydmVyKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChhY2Nlc3MocHJvcHMuaXNEaXNhYmxlZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZG9jdW1lbnQgPSBwcm9wcy5vd25lckRvY3VtZW50Py4oKSA/PyBnZXREb2N1bWVudCgpO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUtleURvd24pO1xuICAgIG9uQ2xlYW51cCgoKSA9PiB7XG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVLZXlEb3duKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmV4cG9ydCB7XG4gIGNyZWF0ZUVzY2FwZUtleURvd25cbn07XG4iLCJpbXBvcnQge1xuICBEQVRBX1RPUF9MQVlFUl9BVFRSXG59IGZyb20gXCIuLzNOSTZGVEEyLmpzeFwiO1xuXG4vLyBzcmMvcHJpbWl0aXZlcy9jcmVhdGUtaW50ZXJhY3Qtb3V0c2lkZS9jcmVhdGUtaW50ZXJhY3Qtb3V0c2lkZS50c1xuaW1wb3J0IHtcbiAgYWNjZXNzLFxuICBjb21wb3NlRXZlbnRIYW5kbGVycyxcbiAgY29udGFpbnMsXG4gIGdldERvY3VtZW50LFxuICBpc0N0cmxLZXksXG4gIG5vb3Bcbn0gZnJvbSBcIkBrb2JhbHRlL3V0aWxzXCI7XG5pbXBvcnQgeyBjcmVhdGVFZmZlY3QsIG9uQ2xlYW51cCB9IGZyb20gXCJzb2xpZC1qc1wiO1xuaW1wb3J0IHsgaXNTZXJ2ZXIgfSBmcm9tIFwic29saWQtanMvd2ViXCI7XG52YXIgUE9JTlRFUl9ET1dOX09VVFNJREVfRVZFTlQgPSBcImludGVyYWN0T3V0c2lkZS5wb2ludGVyRG93bk91dHNpZGVcIjtcbnZhciBGT0NVU19PVVRTSURFX0VWRU5UID0gXCJpbnRlcmFjdE91dHNpZGUuZm9jdXNPdXRzaWRlXCI7XG5mdW5jdGlvbiBjcmVhdGVJbnRlcmFjdE91dHNpZGUocHJvcHMsIHJlZikge1xuICBsZXQgcG9pbnRlckRvd25UaW1lb3V0SWQ7XG4gIGxldCBjbGlja0hhbmRsZXIgPSBub29wO1xuICBjb25zdCBvd25lckRvY3VtZW50ID0gKCkgPT4gZ2V0RG9jdW1lbnQocmVmKCkpO1xuICBjb25zdCBvblBvaW50ZXJEb3duT3V0c2lkZSA9IChlKSA9PiBwcm9wcy5vblBvaW50ZXJEb3duT3V0c2lkZT8uKGUpO1xuICBjb25zdCBvbkZvY3VzT3V0c2lkZSA9IChlKSA9PiBwcm9wcy5vbkZvY3VzT3V0c2lkZT8uKGUpO1xuICBjb25zdCBvbkludGVyYWN0T3V0c2lkZSA9IChlKSA9PiBwcm9wcy5vbkludGVyYWN0T3V0c2lkZT8uKGUpO1xuICBjb25zdCBpc0V2ZW50T3V0c2lkZSA9IChlKSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQ7XG4gICAgaWYgKCEodGFyZ2V0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICh0YXJnZXQuY2xvc2VzdChgWyR7REFUQV9UT1BfTEFZRVJfQVRUUn1dYCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFjb250YWlucyhvd25lckRvY3VtZW50KCksIHRhcmdldCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGNvbnRhaW5zKHJlZigpLCB0YXJnZXQpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiAhcHJvcHMuc2hvdWxkRXhjbHVkZUVsZW1lbnQ/Lih0YXJnZXQpO1xuICB9O1xuICBjb25zdCBvblBvaW50ZXJEb3duID0gKGUpID0+IHtcbiAgICBmdW5jdGlvbiBoYW5kbGVyKCkge1xuICAgICAgY29uc3QgY29udGFpbmVyID0gcmVmKCk7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldDtcbiAgICAgIGlmICghY29udGFpbmVyIHx8ICF0YXJnZXQgfHwgIWlzRXZlbnRPdXRzaWRlKGUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGhhbmRsZXIyID0gY29tcG9zZUV2ZW50SGFuZGxlcnMoW1xuICAgICAgICBvblBvaW50ZXJEb3duT3V0c2lkZSxcbiAgICAgICAgb25JbnRlcmFjdE91dHNpZGVcbiAgICAgIF0pO1xuICAgICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoUE9JTlRFUl9ET1dOX09VVFNJREVfRVZFTlQsIGhhbmRsZXIyLCB7XG4gICAgICAgIG9uY2U6IHRydWVcbiAgICAgIH0pO1xuICAgICAgY29uc3QgcG9pbnRlckRvd25PdXRzaWRlRXZlbnQgPSBuZXcgQ3VzdG9tRXZlbnQoXG4gICAgICAgIFBPSU5URVJfRE9XTl9PVVRTSURFX0VWRU5ULFxuICAgICAgICB7XG4gICAgICAgICAgYnViYmxlczogZmFsc2UsXG4gICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcbiAgICAgICAgICBkZXRhaWw6IHtcbiAgICAgICAgICAgIG9yaWdpbmFsRXZlbnQ6IGUsXG4gICAgICAgICAgICBpc0NvbnRleHRNZW51OiBlLmJ1dHRvbiA9PT0gMiB8fCBpc0N0cmxLZXkoZSkgJiYgZS5idXR0b24gPT09IDBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChwb2ludGVyRG93bk91dHNpZGVFdmVudCk7XG4gICAgfVxuICAgIGlmIChlLnBvaW50ZXJUeXBlID09PSBcInRvdWNoXCIpIHtcbiAgICAgIG93bmVyRG9jdW1lbnQoKS5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgaGFuZGxlcik7XG4gICAgICBjbGlja0hhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgb3duZXJEb2N1bWVudCgpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBoYW5kbGVyLCB7IG9uY2U6IHRydWUgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhbmRsZXIoKTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IG9uRm9jdXNJbiA9IChlKSA9PiB7XG4gICAgY29uc3QgY29udGFpbmVyID0gcmVmKCk7XG4gICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQ7XG4gICAgaWYgKCFjb250YWluZXIgfHwgIXRhcmdldCB8fCAhaXNFdmVudE91dHNpZGUoZSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaGFuZGxlciA9IGNvbXBvc2VFdmVudEhhbmRsZXJzKFtcbiAgICAgIG9uRm9jdXNPdXRzaWRlLFxuICAgICAgb25JbnRlcmFjdE91dHNpZGVcbiAgICBdKTtcbiAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcihGT0NVU19PVVRTSURFX0VWRU5ULCBoYW5kbGVyLCB7IG9uY2U6IHRydWUgfSk7XG4gICAgY29uc3QgZm9jdXNPdXRzaWRlRXZlbnQgPSBuZXcgQ3VzdG9tRXZlbnQoRk9DVVNfT1VUU0lERV9FVkVOVCwge1xuICAgICAgYnViYmxlczogZmFsc2UsXG4gICAgICBjYW5jZWxhYmxlOiB0cnVlLFxuICAgICAgZGV0YWlsOiB7XG4gICAgICAgIG9yaWdpbmFsRXZlbnQ6IGUsXG4gICAgICAgIGlzQ29udGV4dE1lbnU6IGZhbHNlXG4gICAgICB9XG4gICAgfSk7XG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQoZm9jdXNPdXRzaWRlRXZlbnQpO1xuICB9O1xuICBjcmVhdGVFZmZlY3QoKCkgPT4ge1xuICAgIGlmIChpc1NlcnZlcikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoYWNjZXNzKHByb3BzLmlzRGlzYWJsZWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHBvaW50ZXJEb3duVGltZW91dElkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgb3duZXJEb2N1bWVudCgpLmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCBvblBvaW50ZXJEb3duLCB0cnVlKTtcbiAgICB9LCAwKTtcbiAgICBvd25lckRvY3VtZW50KCkuYWRkRXZlbnRMaXN0ZW5lcihcImZvY3VzaW5cIiwgb25Gb2N1c0luLCB0cnVlKTtcbiAgICBvbkNsZWFudXAoKCkgPT4ge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dChwb2ludGVyRG93blRpbWVvdXRJZCk7XG4gICAgICBvd25lckRvY3VtZW50KCkucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGNsaWNrSGFuZGxlcik7XG4gICAgICBvd25lckRvY3VtZW50KCkucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJkb3duXCIsIG9uUG9pbnRlckRvd24sIHRydWUpO1xuICAgICAgb3duZXJEb2N1bWVudCgpLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJmb2N1c2luXCIsIG9uRm9jdXNJbiwgdHJ1ZSk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQge1xuICBjcmVhdGVJbnRlcmFjdE91dHNpZGVcbn07XG4iLCIvLyBzcmMvcG9seW1vcnBoaWMvcG9seW1vcnBoaWMudHN4XG5pbXBvcnQgeyBzcGxpdFByb3BzIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5pbXBvcnQgeyBEeW5hbWljIH0gZnJvbSBcInNvbGlkLWpzL3dlYlwiO1xuZnVuY3Rpb24gUG9seW1vcnBoaWMocHJvcHMpIHtcbiAgY29uc3QgW2xvY2FsLCBvdGhlcnNdID0gc3BsaXRQcm9wcyhwcm9wcywgW1wiYXNcIl0pO1xuICBpZiAoIWxvY2FsLmFzKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJba29iYWx0ZV06IFBvbHltb3JwaGljIGlzIG1pc3NpbmcgdGhlIHJlcXVpcmVkIGBhc2AgcHJvcC5cIlxuICAgICk7XG4gIH1cbiAgcmV0dXJuIChcbiAgICAvLyBAdHMtaWdub3JlOiBQcm9wcyBhcmUgdmFsaWQgYnV0IG5vdCB3b3J0aCBjYWxjdWxhdGluZ1xuICAgIDxEeW5hbWljIGNvbXBvbmVudD17bG9jYWwuYXN9IHsuLi5vdGhlcnN9IC8+XG4gICk7XG59XG5cbmV4cG9ydCB7XG4gIFBvbHltb3JwaGljXG59O1xuIiwiaW1wb3J0IHtcbiAgY3JlYXRlRXNjYXBlS2V5RG93blxufSBmcm9tIFwiLi9XTlJBTjVHVi5qc3hcIjtcbmltcG9ydCB7XG4gIGNyZWF0ZUludGVyYWN0T3V0c2lkZVxufSBmcm9tIFwiLi9CTU1DUTdZSi5qc3hcIjtcbmltcG9ydCB7XG4gIGxheWVyU3RhY2tcbn0gZnJvbSBcIi4vM05JNkZUQTIuanN4XCI7XG5pbXBvcnQge1xuICBQb2x5bW9ycGhpY1xufSBmcm9tIFwiLi9FNzNQS0ZCMy5qc3hcIjtcblxuLy8gc3JjL2Rpc21pc3NhYmxlLWxheWVyL2Rpc21pc3NhYmxlLWxheWVyLnRzeFxuaW1wb3J0IHsgY29udGFpbnMsIGdldERvY3VtZW50LCBtZXJnZVJlZnMgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7XG4gIGNyZWF0ZUVmZmVjdCxcbiAgb24sXG4gIG9uQ2xlYW51cCxcbiAgb25Nb3VudCxcbiAgc3BsaXRQcm9wc1xufSBmcm9tIFwic29saWQtanNcIjtcblxuLy8gc3JjL2Rpc21pc3NhYmxlLWxheWVyL2Rpc21pc3NhYmxlLWxheWVyLWNvbnRleHQudHN4XG5pbXBvcnQgeyBjcmVhdGVDb250ZXh0LCB1c2VDb250ZXh0IH0gZnJvbSBcInNvbGlkLWpzXCI7XG52YXIgRGlzbWlzc2FibGVMYXllckNvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5mdW5jdGlvbiB1c2VPcHRpb25hbERpc21pc3NhYmxlTGF5ZXJDb250ZXh0KCkge1xuICByZXR1cm4gdXNlQ29udGV4dChEaXNtaXNzYWJsZUxheWVyQ29udGV4dCk7XG59XG5cbi8vIHNyYy9kaXNtaXNzYWJsZS1sYXllci9kaXNtaXNzYWJsZS1sYXllci50c3hcbmZ1bmN0aW9uIERpc21pc3NhYmxlTGF5ZXIocHJvcHMpIHtcbiAgbGV0IHJlZjtcbiAgY29uc3QgcGFyZW50Q29udGV4dCA9IHVzZU9wdGlvbmFsRGlzbWlzc2FibGVMYXllckNvbnRleHQoKTtcbiAgY29uc3QgW2xvY2FsLCBvdGhlcnNdID0gc3BsaXRQcm9wcyhwcm9wcywgW1xuICAgIFwicmVmXCIsXG4gICAgXCJkaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHNcIixcbiAgICBcImV4Y2x1ZGVkRWxlbWVudHNcIixcbiAgICBcIm9uRXNjYXBlS2V5RG93blwiLFxuICAgIFwib25Qb2ludGVyRG93bk91dHNpZGVcIixcbiAgICBcIm9uRm9jdXNPdXRzaWRlXCIsXG4gICAgXCJvbkludGVyYWN0T3V0c2lkZVwiLFxuICAgIFwib25EaXNtaXNzXCIsXG4gICAgXCJieXBhc3NUb3BNb3N0TGF5ZXJDaGVja1wiXG4gIF0pO1xuICBjb25zdCBuZXN0ZWRMYXllcnMgPSAvKiBAX19QVVJFX18gKi8gbmV3IFNldChbXSk7XG4gIGNvbnN0IHJlZ2lzdGVyTmVzdGVkTGF5ZXIgPSAoZWxlbWVudCkgPT4ge1xuICAgIG5lc3RlZExheWVycy5hZGQoZWxlbWVudCk7XG4gICAgY29uc3QgcGFyZW50VW5yZWdpc3RlciA9IHBhcmVudENvbnRleHQ/LnJlZ2lzdGVyTmVzdGVkTGF5ZXIoZWxlbWVudCk7XG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIG5lc3RlZExheWVycy5kZWxldGUoZWxlbWVudCk7XG4gICAgICBwYXJlbnRVbnJlZ2lzdGVyPy4oKTtcbiAgICB9O1xuICB9O1xuICBjb25zdCBzaG91bGRFeGNsdWRlRWxlbWVudCA9IChlbGVtZW50KSA9PiB7XG4gICAgaWYgKCFyZWYpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIGxvY2FsLmV4Y2x1ZGVkRWxlbWVudHM/LnNvbWUoKG5vZGUpID0+IGNvbnRhaW5zKG5vZGUoKSwgZWxlbWVudCkpIHx8IFsuLi5uZXN0ZWRMYXllcnNdLnNvbWUoKGxheWVyKSA9PiBjb250YWlucyhsYXllciwgZWxlbWVudCkpO1xuICB9O1xuICBjb25zdCBvblBvaW50ZXJEb3duT3V0c2lkZSA9IChlKSA9PiB7XG4gICAgaWYgKCFyZWYgfHwgbGF5ZXJTdGFjay5pc0JlbG93UG9pbnRlckJsb2NraW5nTGF5ZXIocmVmKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIWxvY2FsLmJ5cGFzc1RvcE1vc3RMYXllckNoZWNrICYmICFsYXllclN0YWNrLmlzVG9wTW9zdExheWVyKHJlZikpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbG9jYWwub25Qb2ludGVyRG93bk91dHNpZGU/LihlKTtcbiAgICBsb2NhbC5vbkludGVyYWN0T3V0c2lkZT8uKGUpO1xuICAgIGlmICghZS5kZWZhdWx0UHJldmVudGVkKSB7XG4gICAgICBsb2NhbC5vbkRpc21pc3M/LigpO1xuICAgIH1cbiAgfTtcbiAgY29uc3Qgb25Gb2N1c091dHNpZGUgPSAoZSkgPT4ge1xuICAgIGxvY2FsLm9uRm9jdXNPdXRzaWRlPy4oZSk7XG4gICAgbG9jYWwub25JbnRlcmFjdE91dHNpZGU/LihlKTtcbiAgICBpZiAoIWUuZGVmYXVsdFByZXZlbnRlZCkge1xuICAgICAgbG9jYWwub25EaXNtaXNzPy4oKTtcbiAgICB9XG4gIH07XG4gIGNyZWF0ZUludGVyYWN0T3V0c2lkZShcbiAgICB7XG4gICAgICBzaG91bGRFeGNsdWRlRWxlbWVudCxcbiAgICAgIG9uUG9pbnRlckRvd25PdXRzaWRlLFxuICAgICAgb25Gb2N1c091dHNpZGVcbiAgICB9LFxuICAgICgpID0+IHJlZlxuICApO1xuICBjcmVhdGVFc2NhcGVLZXlEb3duKHtcbiAgICBvd25lckRvY3VtZW50OiAoKSA9PiBnZXREb2N1bWVudChyZWYpLFxuICAgIG9uRXNjYXBlS2V5RG93bjogKGUpID0+IHtcbiAgICAgIGlmICghcmVmIHx8ICFsYXllclN0YWNrLmlzVG9wTW9zdExheWVyKHJlZikpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbG9jYWwub25Fc2NhcGVLZXlEb3duPy4oZSk7XG4gICAgICBpZiAoIWUuZGVmYXVsdFByZXZlbnRlZCAmJiBsb2NhbC5vbkRpc21pc3MpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBsb2NhbC5vbkRpc21pc3MoKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICBvbk1vdW50KCgpID0+IHtcbiAgICBpZiAoIXJlZikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsYXllclN0YWNrLmFkZExheWVyKHtcbiAgICAgIG5vZGU6IHJlZixcbiAgICAgIGlzUG9pbnRlckJsb2NraW5nOiBsb2NhbC5kaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHMsXG4gICAgICBkaXNtaXNzOiBsb2NhbC5vbkRpc21pc3NcbiAgICB9KTtcbiAgICBjb25zdCB1bnJlZ2lzdGVyRnJvbVBhcmVudExheWVyID0gcGFyZW50Q29udGV4dD8ucmVnaXN0ZXJOZXN0ZWRMYXllcihyZWYpO1xuICAgIGxheWVyU3RhY2suYXNzaWduUG9pbnRlckV2ZW50VG9MYXllcnMoKTtcbiAgICBsYXllclN0YWNrLmRpc2FibGVCb2R5UG9pbnRlckV2ZW50cyhyZWYpO1xuICAgIG9uQ2xlYW51cCgoKSA9PiB7XG4gICAgICBpZiAoIXJlZikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsYXllclN0YWNrLnJlbW92ZUxheWVyKHJlZik7XG4gICAgICB1bnJlZ2lzdGVyRnJvbVBhcmVudExheWVyPy4oKTtcbiAgICAgIGxheWVyU3RhY2suYXNzaWduUG9pbnRlckV2ZW50VG9MYXllcnMoKTtcbiAgICAgIGxheWVyU3RhY2sucmVzdG9yZUJvZHlQb2ludGVyRXZlbnRzKHJlZik7XG4gICAgfSk7XG4gIH0pO1xuICBjcmVhdGVFZmZlY3QoXG4gICAgb24oXG4gICAgICBbKCkgPT4gcmVmLCAoKSA9PiBsb2NhbC5kaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHNdLFxuICAgICAgKFtyZWYyLCBkaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHNdKSA9PiB7XG4gICAgICAgIGlmICghcmVmMikge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBsYXllciA9IGxheWVyU3RhY2suZmluZChyZWYyKTtcbiAgICAgICAgaWYgKGxheWVyICYmIGxheWVyLmlzUG9pbnRlckJsb2NraW5nICE9PSBkaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHMpIHtcbiAgICAgICAgICBsYXllci5pc1BvaW50ZXJCbG9ja2luZyA9IGRpc2FibGVPdXRzaWRlUG9pbnRlckV2ZW50cztcbiAgICAgICAgICBsYXllclN0YWNrLmFzc2lnblBvaW50ZXJFdmVudFRvTGF5ZXJzKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRpc2FibGVPdXRzaWRlUG9pbnRlckV2ZW50cykge1xuICAgICAgICAgIGxheWVyU3RhY2suZGlzYWJsZUJvZHlQb2ludGVyRXZlbnRzKHJlZjIpO1xuICAgICAgICB9XG4gICAgICAgIG9uQ2xlYW51cCgoKSA9PiB7XG4gICAgICAgICAgbGF5ZXJTdGFjay5yZXN0b3JlQm9keVBvaW50ZXJFdmVudHMocmVmMik7XG4gICAgICAgIH0pO1xuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgZGVmZXI6IHRydWVcbiAgICAgIH1cbiAgICApXG4gICk7XG4gIGNvbnN0IGNvbnRleHQgPSB7XG4gICAgcmVnaXN0ZXJOZXN0ZWRMYXllclxuICB9O1xuICByZXR1cm4gPERpc21pc3NhYmxlTGF5ZXJDb250ZXh0LlByb3ZpZGVyIHZhbHVlPXtjb250ZXh0fT48UG9seW1vcnBoaWNcbiAgICBhcz1cImRpdlwiXG4gICAgcmVmPXttZXJnZVJlZnMoKGVsKSA9PiByZWYgPSBlbCwgbG9jYWwucmVmKX1cbiAgICB7Li4ub3RoZXJzfVxuICAvPjwvRGlzbWlzc2FibGVMYXllckNvbnRleHQuUHJvdmlkZXI+O1xufVxuXG5leHBvcnQge1xuICBEaXNtaXNzYWJsZUxheWVyXG59O1xuIiwiLy8gc3JjL3ByaW1pdGl2ZXMvY3JlYXRlLWNvbnRyb2xsYWJsZS1zaWduYWwvY3JlYXRlLWNvbnRyb2xsYWJsZS1zaWduYWwudHNcbmltcG9ydCB7IGFjY2Vzc1dpdGggfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7IGNyZWF0ZU1lbW8sIGNyZWF0ZVNpZ25hbCwgdW50cmFjayB9IGZyb20gXCJzb2xpZC1qc1wiO1xuZnVuY3Rpb24gY3JlYXRlQ29udHJvbGxhYmxlU2lnbmFsKHByb3BzKSB7XG4gIGNvbnN0IFtfdmFsdWUsIF9zZXRWYWx1ZV0gPSBjcmVhdGVTaWduYWwocHJvcHMuZGVmYXVsdFZhbHVlPy4oKSk7XG4gIGNvbnN0IGlzQ29udHJvbGxlZCA9IGNyZWF0ZU1lbW8oKCkgPT4gcHJvcHMudmFsdWU/LigpICE9PSB2b2lkIDApO1xuICBjb25zdCB2YWx1ZSA9IGNyZWF0ZU1lbW8oKCkgPT4gaXNDb250cm9sbGVkKCkgPyBwcm9wcy52YWx1ZT8uKCkgOiBfdmFsdWUoKSk7XG4gIGNvbnN0IHNldFZhbHVlID0gKG5leHQpID0+IHtcbiAgICB1bnRyYWNrKCgpID0+IHtcbiAgICAgIGNvbnN0IG5leHRWYWx1ZSA9IGFjY2Vzc1dpdGgobmV4dCwgdmFsdWUoKSk7XG4gICAgICBpZiAoIU9iamVjdC5pcyhuZXh0VmFsdWUsIHZhbHVlKCkpKSB7XG4gICAgICAgIGlmICghaXNDb250cm9sbGVkKCkpIHtcbiAgICAgICAgICBfc2V0VmFsdWUobmV4dFZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICBwcm9wcy5vbkNoYW5nZT8uKG5leHRWYWx1ZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmV4dFZhbHVlO1xuICAgIH0pO1xuICB9O1xuICByZXR1cm4gW3ZhbHVlLCBzZXRWYWx1ZV07XG59XG5mdW5jdGlvbiBjcmVhdGVDb250cm9sbGFibGVCb29sZWFuU2lnbmFsKHByb3BzKSB7XG4gIGNvbnN0IFtfdmFsdWUsIHNldFZhbHVlXSA9IGNyZWF0ZUNvbnRyb2xsYWJsZVNpZ25hbChwcm9wcyk7XG4gIGNvbnN0IHZhbHVlID0gKCkgPT4gX3ZhbHVlKCkgPz8gZmFsc2U7XG4gIHJldHVybiBbdmFsdWUsIHNldFZhbHVlXTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRyb2xsYWJsZUFycmF5U2lnbmFsKHByb3BzKSB7XG4gIGNvbnN0IFtfdmFsdWUsIHNldFZhbHVlXSA9IGNyZWF0ZUNvbnRyb2xsYWJsZVNpZ25hbChwcm9wcyk7XG4gIGNvbnN0IHZhbHVlID0gKCkgPT4gX3ZhbHVlKCkgPz8gW107XG4gIHJldHVybiBbdmFsdWUsIHNldFZhbHVlXTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRyb2xsYWJsZVNldFNpZ25hbChwcm9wcykge1xuICBjb25zdCBbX3ZhbHVlLCBzZXRWYWx1ZV0gPSBjcmVhdGVDb250cm9sbGFibGVTaWduYWwocHJvcHMpO1xuICBjb25zdCB2YWx1ZSA9ICgpID0+IF92YWx1ZSgpID8/IC8qIEBfX1BVUkVfXyAqLyBuZXcgU2V0KCk7XG4gIHJldHVybiBbdmFsdWUsIHNldFZhbHVlXTtcbn1cblxuZXhwb3J0IHtcbiAgY3JlYXRlQ29udHJvbGxhYmxlU2lnbmFsLFxuICBjcmVhdGVDb250cm9sbGFibGVCb29sZWFuU2lnbmFsLFxuICBjcmVhdGVDb250cm9sbGFibGVBcnJheVNpZ25hbCxcbiAgY3JlYXRlQ29udHJvbGxhYmxlU2V0U2lnbmFsXG59O1xuIiwiaW1wb3J0IHtcbiAgY3JlYXRlQ29udHJvbGxhYmxlQm9vbGVhblNpZ25hbFxufSBmcm9tIFwiLi9GTjZFSUNHTy5qc3hcIjtcblxuLy8gc3JjL3ByaW1pdGl2ZXMvY3JlYXRlLWRpc2Nsb3N1cmUtc3RhdGUvY3JlYXRlLWRpc2Nsb3N1cmUtc3RhdGUudHNcbmltcG9ydCB7IGFjY2VzcyB9IGZyb20gXCJAa29iYWx0ZS91dGlsc1wiO1xuZnVuY3Rpb24gY3JlYXRlRGlzY2xvc3VyZVN0YXRlKHByb3BzID0ge30pIHtcbiAgY29uc3QgW2lzT3Blbiwgc2V0SXNPcGVuXSA9IGNyZWF0ZUNvbnRyb2xsYWJsZUJvb2xlYW5TaWduYWwoe1xuICAgIHZhbHVlOiAoKSA9PiBhY2Nlc3MocHJvcHMub3BlbiksXG4gICAgZGVmYXVsdFZhbHVlOiAoKSA9PiAhIWFjY2Vzcyhwcm9wcy5kZWZhdWx0T3BlbiksXG4gICAgb25DaGFuZ2U6ICh2YWx1ZSkgPT4gcHJvcHMub25PcGVuQ2hhbmdlPy4odmFsdWUpXG4gIH0pO1xuICBjb25zdCBvcGVuID0gKCkgPT4ge1xuICAgIHNldElzT3Blbih0cnVlKTtcbiAgfTtcbiAgY29uc3QgY2xvc2UgPSAoKSA9PiB7XG4gICAgc2V0SXNPcGVuKGZhbHNlKTtcbiAgfTtcbiAgY29uc3QgdG9nZ2xlID0gKCkgPT4ge1xuICAgIGlzT3BlbigpID8gY2xvc2UoKSA6IG9wZW4oKTtcbiAgfTtcbiAgcmV0dXJuIHtcbiAgICBpc09wZW4sXG4gICAgc2V0SXNPcGVuLFxuICAgIG9wZW4sXG4gICAgY2xvc2UsXG4gICAgdG9nZ2xlXG4gIH07XG59XG5cbmV4cG9ydCB7XG4gIGNyZWF0ZURpc2Nsb3N1cmVTdGF0ZVxufTtcbiIsIi8vIHNyYy9wcmltaXRpdmVzL2NyZWF0ZS10YWctbmFtZS9jcmVhdGUtdGFnLW5hbWUudHNcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSBcIkBrb2JhbHRlL3V0aWxzXCI7XG5pbXBvcnQgeyBjcmVhdGVFZmZlY3QsIGNyZWF0ZVNpZ25hbCB9IGZyb20gXCJzb2xpZC1qc1wiO1xuZnVuY3Rpb24gY3JlYXRlVGFnTmFtZShyZWYsIGZhbGxiYWNrKSB7XG4gIGNvbnN0IFt0YWdOYW1lLCBzZXRUYWdOYW1lXSA9IGNyZWF0ZVNpZ25hbChzdHJpbmdPclVuZGVmaW5lZChmYWxsYmFjaz8uKCkpKTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBzZXRUYWdOYW1lKHJlZigpPy50YWdOYW1lLnRvTG93ZXJDYXNlKCkgfHwgc3RyaW5nT3JVbmRlZmluZWQoZmFsbGJhY2s/LigpKSk7XG4gIH0pO1xuICByZXR1cm4gdGFnTmFtZTtcbn1cbmZ1bmN0aW9uIHN0cmluZ09yVW5kZWZpbmVkKHZhbHVlKSB7XG4gIHJldHVybiBpc1N0cmluZyh2YWx1ZSkgPyB2YWx1ZSA6IHZvaWQgMDtcbn1cblxuZXhwb3J0IHtcbiAgY3JlYXRlVGFnTmFtZVxufTtcbiIsInZhciBfX2RlZlByb3AgPSBPYmplY3QuZGVmaW5lUHJvcGVydHk7XG52YXIgX19leHBvcnQgPSAodGFyZ2V0LCBhbGwpID0+IHtcbiAgZm9yICh2YXIgbmFtZSBpbiBhbGwpXG4gICAgX19kZWZQcm9wKHRhcmdldCwgbmFtZSwgeyBnZXQ6IGFsbFtuYW1lXSwgZW51bWVyYWJsZTogdHJ1ZSB9KTtcbn07XG5cbmV4cG9ydCB7XG4gIF9fZXhwb3J0XG59O1xuIiwiaW1wb3J0IHtcbiAgY3JlYXRlVGFnTmFtZVxufSBmcm9tIFwiLi9DV0NCNDQ3Ri5qc3hcIjtcbmltcG9ydCB7XG4gIFBvbHltb3JwaGljXG59IGZyb20gXCIuL0U3M1BLRkIzLmpzeFwiO1xuaW1wb3J0IHtcbiAgX19leHBvcnRcbn0gZnJvbSBcIi4vNVdYSEpEQ1ouanN4XCI7XG5cbi8vIHNyYy9idXR0b24vaW5kZXgudHN4XG52YXIgYnV0dG9uX2V4cG9ydHMgPSB7fTtcbl9fZXhwb3J0KGJ1dHRvbl9leHBvcnRzLCB7XG4gIEJ1dHRvbjogKCkgPT4gQnV0dG9uLFxuICBSb290OiAoKSA9PiBCdXR0b25Sb290XG59KTtcblxuLy8gc3JjL2J1dHRvbi9idXR0b24tcm9vdC50c3hcbmltcG9ydCB7IG1lcmdlRGVmYXVsdFByb3BzLCBtZXJnZVJlZnMgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7IGNyZWF0ZU1lbW8sIHNwbGl0UHJvcHMgfSBmcm9tIFwic29saWQtanNcIjtcblxuLy8gc3JjL2J1dHRvbi9pcy1idXR0b24udHNcbnZhciBCVVRUT05fSU5QVVRfVFlQRVMgPSBbXG4gIFwiYnV0dG9uXCIsXG4gIFwiY29sb3JcIixcbiAgXCJmaWxlXCIsXG4gIFwiaW1hZ2VcIixcbiAgXCJyZXNldFwiLFxuICBcInN1Ym1pdFwiXG5dO1xuZnVuY3Rpb24gaXNCdXR0b24oZWxlbWVudCkge1xuICBjb25zdCB0YWdOYW1lID0gZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG4gIGlmICh0YWdOYW1lID09PSBcImJ1dHRvblwiKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKHRhZ05hbWUgPT09IFwiaW5wdXRcIiAmJiBlbGVtZW50LnR5cGUpIHtcbiAgICByZXR1cm4gQlVUVE9OX0lOUFVUX1RZUEVTLmluZGV4T2YoZWxlbWVudC50eXBlKSAhPT0gLTE7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vLyBzcmMvYnV0dG9uL2J1dHRvbi1yb290LnRzeFxuZnVuY3Rpb24gQnV0dG9uUm9vdChwcm9wcykge1xuICBsZXQgcmVmO1xuICBjb25zdCBtZXJnZWRQcm9wcyA9IG1lcmdlRGVmYXVsdFByb3BzKFxuICAgIHsgdHlwZTogXCJidXR0b25cIiB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IFtsb2NhbCwgb3RoZXJzXSA9IHNwbGl0UHJvcHMobWVyZ2VkUHJvcHMsIFtcInJlZlwiLCBcInR5cGVcIiwgXCJkaXNhYmxlZFwiXSk7XG4gIGNvbnN0IHRhZ05hbWUgPSBjcmVhdGVUYWdOYW1lKFxuICAgICgpID0+IHJlZixcbiAgICAoKSA9PiBcImJ1dHRvblwiXG4gICk7XG4gIGNvbnN0IGlzTmF0aXZlQnV0dG9uID0gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgY29uc3QgZWxlbWVudFRhZ05hbWUgPSB0YWdOYW1lKCk7XG4gICAgaWYgKGVsZW1lbnRUYWdOYW1lID09IG51bGwpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIGlzQnV0dG9uKHsgdGFnTmFtZTogZWxlbWVudFRhZ05hbWUsIHR5cGU6IGxvY2FsLnR5cGUgfSk7XG4gIH0pO1xuICBjb25zdCBpc05hdGl2ZUlucHV0ID0gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgcmV0dXJuIHRhZ05hbWUoKSA9PT0gXCJpbnB1dFwiO1xuICB9KTtcbiAgY29uc3QgaXNOYXRpdmVMaW5rID0gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgcmV0dXJuIHRhZ05hbWUoKSA9PT0gXCJhXCIgJiYgcmVmPy5nZXRBdHRyaWJ1dGUoXCJocmVmXCIpICE9IG51bGw7XG4gIH0pO1xuICByZXR1cm4gPFBvbHltb3JwaGljXG4gICAgYXM9XCJidXR0b25cIlxuICAgIHJlZj17bWVyZ2VSZWZzKChlbCkgPT4gcmVmID0gZWwsIGxvY2FsLnJlZil9XG4gICAgdHlwZT17aXNOYXRpdmVCdXR0b24oKSB8fCBpc05hdGl2ZUlucHV0KCkgPyBsb2NhbC50eXBlIDogdm9pZCAwfVxuICAgIHJvbGU9eyFpc05hdGl2ZUJ1dHRvbigpICYmICFpc05hdGl2ZUxpbmsoKSA/IFwiYnV0dG9uXCIgOiB2b2lkIDB9XG4gICAgdGFiSW5kZXg9eyFpc05hdGl2ZUJ1dHRvbigpICYmICFpc05hdGl2ZUxpbmsoKSAmJiAhbG9jYWwuZGlzYWJsZWQgPyAwIDogdm9pZCAwfVxuICAgIGRpc2FibGVkPXtpc05hdGl2ZUJ1dHRvbigpIHx8IGlzTmF0aXZlSW5wdXQoKSA/IGxvY2FsLmRpc2FibGVkIDogdm9pZCAwfVxuICAgIGFyaWEtZGlzYWJsZWQ9eyFpc05hdGl2ZUJ1dHRvbigpICYmICFpc05hdGl2ZUlucHV0KCkgJiYgbG9jYWwuZGlzYWJsZWQgPyB0cnVlIDogdm9pZCAwfVxuICAgIGRhdGEtZGlzYWJsZWQ9e2xvY2FsLmRpc2FibGVkID8gXCJcIiA6IHZvaWQgMH1cbiAgICB7Li4ub3RoZXJzfVxuICAvPjtcbn1cblxuLy8gc3JjL2J1dHRvbi9pbmRleC50c3hcbnZhciBCdXR0b24gPSBCdXR0b25Sb290O1xuXG5leHBvcnQge1xuICBCdXR0b25Sb290LFxuICBCdXR0b24sXG4gIGJ1dHRvbl9leHBvcnRzXG59O1xuIiwiLy8gc3JjL3ByaW1pdGl2ZXMvY3JlYXRlLXJlZ2lzdGVyLWlkL2NyZWF0ZS1yZWdpc3Rlci1pZC50c1xuZnVuY3Rpb24gY3JlYXRlUmVnaXN0ZXJJZChzZXR0ZXIpIHtcbiAgcmV0dXJuIChpZCkgPT4ge1xuICAgIHNldHRlcihpZCk7XG4gICAgcmV0dXJuICgpID0+IHNldHRlcih2b2lkIDApO1xuICB9O1xufVxuXG5leHBvcnQge1xuICBjcmVhdGVSZWdpc3RlcklkXG59O1xuIiwiLy8gc3JjL3JlYWN0aXZpdHkvbGliLnRzXG5pbXBvcnQgXCJzb2xpZC1qc1wiO1xudmFyIGFjY2VzcyA9ICh2KSA9PiB0eXBlb2YgdiA9PT0gXCJmdW5jdGlvblwiID8gdigpIDogdjtcbnZhciBjaGFpbiA9IChjYWxsYmFja3MpID0+IHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgZm9yIChjb25zdCBjYWxsYmFjayBvZiBjYWxsYmFja3MpIGNhbGxiYWNrICYmIGNhbGxiYWNrKC4uLmFyZ3MpO1xuICB9O1xufTtcbnZhciBtZXJnZVJlZnMgPSAoLi4ucmVmcykgPT4ge1xuICByZXR1cm4gY2hhaW4ocmVmcyk7XG59O1xudmFyIHNvbWUgPSAoLi4uc2lnbmFscykgPT4ge1xuICByZXR1cm4gc2lnbmFscy5zb21lKChzaWduYWwpID0+ICEhc2lnbmFsKCkpO1xufTtcblxuZXhwb3J0IHtcbiAgYWNjZXNzLFxuICBjaGFpbixcbiAgbWVyZ2VSZWZzLFxuICBzb21lXG59O1xuIiwiaW1wb3J0IHtcbiAgYWNjZXNzXG59IGZyb20gXCIuL1U0MkVDTU5ELmpzeFwiO1xuXG4vLyBzcmMvY3JlYXRlL3N0eWxlLnRzXG5pbXBvcnQgeyBjcmVhdGVFZmZlY3QsIG9uQ2xlYW51cCB9IGZyb20gXCJzb2xpZC1qc1wiO1xudmFyIGFjdGl2ZVN0eWxlcyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgTWFwKCk7XG52YXIgY3JlYXRlU3R5bGUgPSAocHJvcHMpID0+IHtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBjb25zdCBzdHlsZSA9IGFjY2Vzcyhwcm9wcy5zdHlsZSkgPz8ge307XG4gICAgY29uc3QgcHJvcGVydGllcyA9IGFjY2Vzcyhwcm9wcy5wcm9wZXJ0aWVzKSA/PyBbXTtcbiAgICBjb25zdCBvcmlnaW5hbFN0eWxlcyA9IHt9O1xuICAgIGZvciAoY29uc3Qga2V5IGluIHN0eWxlKSB7XG4gICAgICBvcmlnaW5hbFN0eWxlc1trZXldID0gcHJvcHMuZWxlbWVudC5zdHlsZVtrZXldO1xuICAgIH1cbiAgICBjb25zdCBhY3RpdmVTdHlsZSA9IGFjdGl2ZVN0eWxlcy5nZXQocHJvcHMua2V5KTtcbiAgICBpZiAoYWN0aXZlU3R5bGUpIHtcbiAgICAgIGFjdGl2ZVN0eWxlLmFjdGl2ZUNvdW50Kys7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFjdGl2ZVN0eWxlcy5zZXQocHJvcHMua2V5LCB7XG4gICAgICAgIGFjdGl2ZUNvdW50OiAxLFxuICAgICAgICBvcmlnaW5hbFN0eWxlcyxcbiAgICAgICAgcHJvcGVydGllczogcHJvcGVydGllcy5tYXAoKHByb3BlcnR5KSA9PiBwcm9wZXJ0eS5rZXkpXG4gICAgICB9KTtcbiAgICB9XG4gICAgT2JqZWN0LmFzc2lnbihwcm9wcy5lbGVtZW50LnN0eWxlLCBwcm9wcy5zdHlsZSk7XG4gICAgZm9yIChjb25zdCBwcm9wZXJ0eSBvZiBwcm9wZXJ0aWVzKSB7XG4gICAgICBwcm9wcy5lbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KHByb3BlcnR5LmtleSwgcHJvcGVydHkudmFsdWUpO1xuICAgIH1cbiAgICBvbkNsZWFudXAoKCkgPT4ge1xuICAgICAgY29uc3QgYWN0aXZlU3R5bGUyID0gYWN0aXZlU3R5bGVzLmdldChwcm9wcy5rZXkpO1xuICAgICAgaWYgKCFhY3RpdmVTdHlsZTIpIHJldHVybjtcbiAgICAgIGlmIChhY3RpdmVTdHlsZTIuYWN0aXZlQ291bnQgIT09IDEpIHtcbiAgICAgICAgYWN0aXZlU3R5bGUyLmFjdGl2ZUNvdW50LS07XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGFjdGl2ZVN0eWxlcy5kZWxldGUocHJvcHMua2V5KTtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGFjdGl2ZVN0eWxlMi5vcmlnaW5hbFN0eWxlcykpIHtcbiAgICAgICAgcHJvcHMuZWxlbWVudC5zdHlsZVtrZXldID0gdmFsdWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHByb3BlcnR5IG9mIGFjdGl2ZVN0eWxlMi5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIHByb3BzLmVsZW1lbnQuc3R5bGUucmVtb3ZlUHJvcGVydHkocHJvcGVydHkpO1xuICAgICAgfVxuICAgICAgaWYgKHByb3BzLmVsZW1lbnQuc3R5bGUubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHByb3BzLmVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKFwic3R5bGVcIik7XG4gICAgICB9XG4gICAgICBwcm9wcy5jbGVhbnVwPy4oKTtcbiAgICB9KTtcbiAgfSk7XG59O1xudmFyIHN0eWxlX2RlZmF1bHQgPSBjcmVhdGVTdHlsZTtcblxuZXhwb3J0IHtcbiAgc3R5bGVfZGVmYXVsdFxufTtcbiIsIi8vIHNyYy9zY3JvbGwvbGliLnRzXG52YXIgZ2V0U2Nyb2xsRGltZW5zaW9ucyA9IChlbGVtZW50LCBheGlzKSA9PiB7XG4gIHN3aXRjaCAoYXhpcykge1xuICAgIGNhc2UgXCJ4XCI6XG4gICAgICByZXR1cm4gW2VsZW1lbnQuY2xpZW50V2lkdGgsIGVsZW1lbnQuc2Nyb2xsTGVmdCwgZWxlbWVudC5zY3JvbGxXaWR0aF07XG4gICAgY2FzZSBcInlcIjpcbiAgICAgIHJldHVybiBbZWxlbWVudC5jbGllbnRIZWlnaHQsIGVsZW1lbnQuc2Nyb2xsVG9wLCBlbGVtZW50LnNjcm9sbEhlaWdodF07XG4gIH1cbn07XG52YXIgaXNTY3JvbGxDb250YWluZXIgPSAoZWxlbWVudCwgYXhpcykgPT4ge1xuICBjb25zdCBzdHlsZXMgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICBjb25zdCBvdmVyZmxvdyA9IGF4aXMgPT09IFwieFwiID8gc3R5bGVzLm92ZXJmbG93WCA6IHN0eWxlcy5vdmVyZmxvd1k7XG4gIHJldHVybiBvdmVyZmxvdyA9PT0gXCJhdXRvXCIgfHwgb3ZlcmZsb3cgPT09IFwic2Nyb2xsXCIgfHwgLy8gVGhlIEhUTUwgZWxlbWVudCBpcyBhIHNjcm9sbCBjb250YWluZXIgaWYgaXQgaGFzIG92ZXJmbG93IHZpc2libGVcbiAgZWxlbWVudC50YWdOYW1lID09PSBcIkhUTUxcIiAmJiBvdmVyZmxvdyA9PT0gXCJ2aXNpYmxlXCI7XG59O1xudmFyIGdldFNjcm9sbEF0TG9jYXRpb24gPSAobG9jYXRpb24sIGF4aXMsIHN0b3BBdCkgPT4ge1xuICBjb25zdCBkaXJlY3Rpb25GYWN0b3IgPSBheGlzID09PSBcInhcIiAmJiB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShsb2NhdGlvbikuZGlyZWN0aW9uID09PSBcInJ0bFwiID8gLTEgOiAxO1xuICBsZXQgY3VycmVudEVsZW1lbnQgPSBsb2NhdGlvbjtcbiAgbGV0IGF2YWlsYWJsZVNjcm9sbCA9IDA7XG4gIGxldCBhdmFpbGFibGVTY3JvbGxUb3AgPSAwO1xuICBsZXQgd3JhcHBlclJlYWNoZWQgPSBmYWxzZTtcbiAgZG8ge1xuICAgIGNvbnN0IFtjbGllbnRTaXplLCBzY3JvbGxPZmZzZXQsIHNjcm9sbFNpemVdID0gZ2V0U2Nyb2xsRGltZW5zaW9ucyhcbiAgICAgIGN1cnJlbnRFbGVtZW50LFxuICAgICAgYXhpc1xuICAgICk7XG4gICAgY29uc3Qgc2Nyb2xsZWQgPSBzY3JvbGxTaXplIC0gY2xpZW50U2l6ZSAtIGRpcmVjdGlvbkZhY3RvciAqIHNjcm9sbE9mZnNldDtcbiAgICBpZiAoKHNjcm9sbE9mZnNldCAhPT0gMCB8fCBzY3JvbGxlZCAhPT0gMCkgJiYgaXNTY3JvbGxDb250YWluZXIoY3VycmVudEVsZW1lbnQsIGF4aXMpKSB7XG4gICAgICBhdmFpbGFibGVTY3JvbGwgKz0gc2Nyb2xsZWQ7XG4gICAgICBhdmFpbGFibGVTY3JvbGxUb3AgKz0gc2Nyb2xsT2Zmc2V0O1xuICAgIH1cbiAgICBpZiAoY3VycmVudEVsZW1lbnQgPT09IChzdG9wQXQgPz8gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KSkge1xuICAgICAgd3JhcHBlclJlYWNoZWQgPSB0cnVlO1xuICAgIH0gZWxzZSB7XG4gICAgICBjdXJyZW50RWxlbWVudCA9IGN1cnJlbnRFbGVtZW50Ll8kaG9zdCA/PyBjdXJyZW50RWxlbWVudC5wYXJlbnRFbGVtZW50O1xuICAgIH1cbiAgfSB3aGlsZSAoY3VycmVudEVsZW1lbnQgJiYgIXdyYXBwZXJSZWFjaGVkKTtcbiAgcmV0dXJuIFthdmFpbGFibGVTY3JvbGwsIGF2YWlsYWJsZVNjcm9sbFRvcF07XG59O1xuZXhwb3J0IHtcbiAgZ2V0U2Nyb2xsQXRMb2NhdGlvblxufTtcbiIsIi8vIHNyYy9wcmV2ZW50U2Nyb2xsLnRzXG5pbXBvcnQgeyBhY2Nlc3MgfSBmcm9tIFwiQGNvcnZ1L3V0aWxzL3JlYWN0aXZpdHlcIjtcbmltcG9ydCB7XG4gIGNyZWF0ZUVmZmVjdCxcbiAgY3JlYXRlU2lnbmFsLFxuICBjcmVhdGVVbmlxdWVJZCxcbiAgbWVyZ2VQcm9wcyxcbiAgb25DbGVhbnVwXG59IGZyb20gXCJzb2xpZC1qc1wiO1xuaW1wb3J0IGNyZWF0ZVN0eWxlIGZyb20gXCJAY29ydnUvdXRpbHMvY3JlYXRlL3N0eWxlXCI7XG5pbXBvcnQgeyBnZXRTY3JvbGxBdExvY2F0aW9uIH0gZnJvbSBcIkBjb3J2dS91dGlscy9zY3JvbGxcIjtcbnZhciBbcHJldmVudFNjcm9sbFN0YWNrLCBzZXRQcmV2ZW50U2Nyb2xsU3RhY2tdID0gY3JlYXRlU2lnbmFsKFtdKTtcbnZhciBpc0FjdGl2ZSA9IChpZCkgPT4gcHJldmVudFNjcm9sbFN0YWNrKCkuaW5kZXhPZihpZCkgPT09IHByZXZlbnRTY3JvbGxTdGFjaygpLmxlbmd0aCAtIDE7XG52YXIgY3JlYXRlUHJldmVudFNjcm9sbCA9IChwcm9wcykgPT4ge1xuICBjb25zdCBkZWZhdWx0ZWRQcm9wcyA9IG1lcmdlUHJvcHMoXG4gICAge1xuICAgICAgZWxlbWVudDogbnVsbCxcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBoaWRlU2Nyb2xsYmFyOiB0cnVlLFxuICAgICAgcHJldmVudFNjcm9sbGJhclNoaWZ0OiB0cnVlLFxuICAgICAgcHJldmVudFNjcm9sbGJhclNoaWZ0TW9kZTogXCJwYWRkaW5nXCIsXG4gICAgICByZXN0b3JlU2Nyb2xsUG9zaXRpb246IHRydWUsXG4gICAgICBhbGxvd1BpbmNoWm9vbTogZmFsc2VcbiAgICB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IHByZXZlbnRTY3JvbGxJZCA9IGNyZWF0ZVVuaXF1ZUlkKCk7XG4gIGxldCBjdXJyZW50VG91Y2hTdGFydCA9IFswLCAwXTtcbiAgbGV0IGN1cnJlbnRUb3VjaFN0YXJ0QXhpcyA9IG51bGw7XG4gIGxldCBjdXJyZW50VG91Y2hTdGFydERlbHRhID0gbnVsbDtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoIWFjY2VzcyhkZWZhdWx0ZWRQcm9wcy5lbmFibGVkKSkgcmV0dXJuO1xuICAgIHNldFByZXZlbnRTY3JvbGxTdGFjaygoc3RhY2spID0+IFsuLi5zdGFjaywgcHJldmVudFNjcm9sbElkXSk7XG4gICAgb25DbGVhbnVwKCgpID0+IHtcbiAgICAgIHNldFByZXZlbnRTY3JvbGxTdGFjayhcbiAgICAgICAgKHN0YWNrKSA9PiBzdGFjay5maWx0ZXIoKGlkKSA9PiBpZCAhPT0gcHJldmVudFNjcm9sbElkKVxuICAgICAgKTtcbiAgICB9KTtcbiAgfSk7XG4gIGNyZWF0ZUVmZmVjdCgoKSA9PiB7XG4gICAgaWYgKCFhY2Nlc3MoZGVmYXVsdGVkUHJvcHMuZW5hYmxlZCkgfHwgIWFjY2VzcyhkZWZhdWx0ZWRQcm9wcy5oaWRlU2Nyb2xsYmFyKSlcbiAgICAgIHJldHVybjtcbiAgICBjb25zdCB7IGJvZHkgfSA9IGRvY3VtZW50O1xuICAgIGNvbnN0IHNjcm9sbGJhcldpZHRoID0gd2luZG93LmlubmVyV2lkdGggLSBib2R5Lm9mZnNldFdpZHRoO1xuICAgIGlmIChhY2Nlc3MoZGVmYXVsdGVkUHJvcHMucHJldmVudFNjcm9sbGJhclNoaWZ0KSkge1xuICAgICAgY29uc3Qgc3R5bGUgPSB7IG92ZXJmbG93OiBcImhpZGRlblwiIH07XG4gICAgICBjb25zdCBwcm9wZXJ0aWVzID0gW107XG4gICAgICBpZiAoc2Nyb2xsYmFyV2lkdGggPiAwKSB7XG4gICAgICAgIGlmIChhY2Nlc3MoZGVmYXVsdGVkUHJvcHMucHJldmVudFNjcm9sbGJhclNoaWZ0TW9kZSkgPT09IFwicGFkZGluZ1wiKSB7XG4gICAgICAgICAgc3R5bGUucGFkZGluZ1JpZ2h0ID0gYGNhbGMoJHt3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShib2R5KS5wYWRkaW5nUmlnaHR9ICsgJHtzY3JvbGxiYXJXaWR0aH1weClgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0eWxlLm1hcmdpblJpZ2h0ID0gYGNhbGMoJHt3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShib2R5KS5tYXJnaW5SaWdodH0gKyAke3Njcm9sbGJhcldpZHRofXB4KWA7XG4gICAgICAgIH1cbiAgICAgICAgcHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IFwiLS1zY3JvbGxiYXItd2lkdGhcIixcbiAgICAgICAgICB2YWx1ZTogYCR7c2Nyb2xsYmFyV2lkdGh9cHhgXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgY29uc3Qgb2Zmc2V0VG9wID0gd2luZG93LnNjcm9sbFk7XG4gICAgICBjb25zdCBvZmZzZXRMZWZ0ID0gd2luZG93LnNjcm9sbFg7XG4gICAgICBjcmVhdGVTdHlsZSh7XG4gICAgICAgIGtleTogXCJwcmV2ZW50LXNjcm9sbFwiLFxuICAgICAgICBlbGVtZW50OiBib2R5LFxuICAgICAgICBzdHlsZSxcbiAgICAgICAgcHJvcGVydGllcyxcbiAgICAgICAgY2xlYW51cDogKCkgPT4ge1xuICAgICAgICAgIGlmIChhY2Nlc3MoZGVmYXVsdGVkUHJvcHMucmVzdG9yZVNjcm9sbFBvc2l0aW9uKSAmJiBzY3JvbGxiYXJXaWR0aCA+IDApIHtcbiAgICAgICAgICAgIHdpbmRvdy5zY3JvbGxUbyhvZmZzZXRMZWZ0LCBvZmZzZXRUb3ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNyZWF0ZVN0eWxlKHtcbiAgICAgICAga2V5OiBcInByZXZlbnQtc2Nyb2xsXCIsXG4gICAgICAgIGVsZW1lbnQ6IGJvZHksXG4gICAgICAgIHN0eWxlOiB7XG4gICAgICAgICAgb3ZlcmZsb3c6IFwiaGlkZGVuXCJcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoIWlzQWN0aXZlKHByZXZlbnRTY3JvbGxJZCkgfHwgIWFjY2VzcyhkZWZhdWx0ZWRQcm9wcy5lbmFibGVkKSkgcmV0dXJuO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJ3aGVlbFwiLCBtYXliZVByZXZlbnRXaGVlbCwge1xuICAgICAgcGFzc2l2ZTogZmFsc2VcbiAgICB9KTtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCBsb2dUb3VjaFN0YXJ0LCB7XG4gICAgICBwYXNzaXZlOiBmYWxzZVxuICAgIH0pO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgbWF5YmVQcmV2ZW50VG91Y2gsIHtcbiAgICAgIHBhc3NpdmU6IGZhbHNlXG4gICAgfSk7XG4gICAgb25DbGVhbnVwKCgpID0+IHtcbiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ3aGVlbFwiLCBtYXliZVByZXZlbnRXaGVlbCk7XG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCBsb2dUb3VjaFN0YXJ0KTtcbiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgbWF5YmVQcmV2ZW50VG91Y2gpO1xuICAgIH0pO1xuICB9KTtcbiAgY29uc3QgbG9nVG91Y2hTdGFydCA9IChldmVudCkgPT4ge1xuICAgIGN1cnJlbnRUb3VjaFN0YXJ0ID0gZ2V0VG91Y2hYWShldmVudCk7XG4gICAgY3VycmVudFRvdWNoU3RhcnRBeGlzID0gbnVsbDtcbiAgICBjdXJyZW50VG91Y2hTdGFydERlbHRhID0gbnVsbDtcbiAgfTtcbiAgY29uc3QgbWF5YmVQcmV2ZW50V2hlZWwgPSAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG4gICAgY29uc3Qgd3JhcHBlciA9IGFjY2VzcyhkZWZhdWx0ZWRQcm9wcy5lbGVtZW50KTtcbiAgICBjb25zdCBkZWx0YSA9IGdldERlbHRhWFkoZXZlbnQpO1xuICAgIGNvbnN0IGF4aXMgPSBNYXRoLmFicyhkZWx0YVswXSkgPiBNYXRoLmFicyhkZWx0YVsxXSkgPyBcInhcIiA6IFwieVwiO1xuICAgIGNvbnN0IGF4aXNEZWx0YSA9IGF4aXMgPT09IFwieFwiID8gZGVsdGFbMF0gOiBkZWx0YVsxXTtcbiAgICBjb25zdCByZXN1bHRzSW5TY3JvbGwgPSB3b3VsZFNjcm9sbCh0YXJnZXQsIGF4aXMsIGF4aXNEZWx0YSwgd3JhcHBlcik7XG4gICAgbGV0IHNob3VsZENhbmNlbDtcbiAgICBpZiAod3JhcHBlciAmJiBjb250YWlucyh3cmFwcGVyLCB0YXJnZXQpKSB7XG4gICAgICBzaG91bGRDYW5jZWwgPSAhcmVzdWx0c0luU2Nyb2xsO1xuICAgIH0gZWxzZSB7XG4gICAgICBzaG91bGRDYW5jZWwgPSB0cnVlO1xuICAgIH1cbiAgICBpZiAoc2hvdWxkQ2FuY2VsICYmIGV2ZW50LmNhbmNlbGFibGUpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxuICB9O1xuICBjb25zdCBtYXliZVByZXZlbnRUb3VjaCA9IChldmVudCkgPT4ge1xuICAgIGNvbnN0IHdyYXBwZXIgPSBhY2Nlc3MoZGVmYXVsdGVkUHJvcHMuZWxlbWVudCk7XG4gICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0O1xuICAgIGxldCBzaG91bGRDYW5jZWw7XG4gICAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoID09PSAyKSB7XG4gICAgICBzaG91bGRDYW5jZWwgPSAhYWNjZXNzKGRlZmF1bHRlZFByb3BzLmFsbG93UGluY2hab29tKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGN1cnJlbnRUb3VjaFN0YXJ0QXhpcyA9PSBudWxsIHx8IGN1cnJlbnRUb3VjaFN0YXJ0RGVsdGEgPT09IG51bGwpIHtcbiAgICAgICAgY29uc3QgZGVsdGEgPSBnZXRUb3VjaFhZKGV2ZW50KS5tYXAoXG4gICAgICAgICAgKHRvdWNoLCBpKSA9PiBjdXJyZW50VG91Y2hTdGFydFtpXSAtIHRvdWNoXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IGF4aXMgPSBNYXRoLmFicyhkZWx0YVswXSkgPiBNYXRoLmFicyhkZWx0YVsxXSkgPyBcInhcIiA6IFwieVwiO1xuICAgICAgICBjdXJyZW50VG91Y2hTdGFydEF4aXMgPSBheGlzO1xuICAgICAgICBjdXJyZW50VG91Y2hTdGFydERlbHRhID0gYXhpcyA9PT0gXCJ4XCIgPyBkZWx0YVswXSA6IGRlbHRhWzFdO1xuICAgICAgfVxuICAgICAgaWYgKHRhcmdldC50eXBlID09PSBcInJhbmdlXCIpIHtcbiAgICAgICAgc2hvdWxkQ2FuY2VsID0gZmFsc2U7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCB3b3VsZFJlc3VsdEluU2Nyb2xsID0gd291bGRTY3JvbGwoXG4gICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgIGN1cnJlbnRUb3VjaFN0YXJ0QXhpcyxcbiAgICAgICAgICBjdXJyZW50VG91Y2hTdGFydERlbHRhLFxuICAgICAgICAgIHdyYXBwZXJcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHdyYXBwZXIgJiYgY29udGFpbnMod3JhcHBlciwgdGFyZ2V0KSkge1xuICAgICAgICAgIHNob3VsZENhbmNlbCA9ICF3b3VsZFJlc3VsdEluU2Nyb2xsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNob3VsZENhbmNlbCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHNob3VsZENhbmNlbCAmJiBldmVudC5jYW5jZWxhYmxlKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbiAgfTtcbn07XG52YXIgZ2V0RGVsdGFYWSA9IChldmVudCkgPT4gW1xuICBldmVudC5kZWx0YVgsXG4gIGV2ZW50LmRlbHRhWVxuXTtcbnZhciBnZXRUb3VjaFhZID0gKGV2ZW50KSA9PiBldmVudC5jaGFuZ2VkVG91Y2hlc1swXSA/IFtldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRYLCBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRZXSA6IFswLCAwXTtcbnZhciB3b3VsZFNjcm9sbCA9ICh0YXJnZXQsIGF4aXMsIGRlbHRhLCB3cmFwcGVyKSA9PiB7XG4gIGNvbnN0IHRhcmdldEluV3JhcHBlciA9IHdyYXBwZXIgIT09IG51bGwgJiYgY29udGFpbnMod3JhcHBlciwgdGFyZ2V0KTtcbiAgY29uc3QgW2F2YWlsYWJsZVNjcm9sbCwgYXZhaWxhYmxlU2Nyb2xsVG9wXSA9IGdldFNjcm9sbEF0TG9jYXRpb24oXG4gICAgdGFyZ2V0LFxuICAgIGF4aXMsXG4gICAgdGFyZ2V0SW5XcmFwcGVyID8gd3JhcHBlciA6IHZvaWQgMFxuICApO1xuICBpZiAoZGVsdGEgPiAwICYmIE1hdGguYWJzKGF2YWlsYWJsZVNjcm9sbCkgPD0gMSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZGVsdGEgPCAwICYmIE1hdGguYWJzKGF2YWlsYWJsZVNjcm9sbFRvcCkgPCAxKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufTtcbnZhciBjb250YWlucyA9ICh3cmFwcGVyLCB0YXJnZXQpID0+IHtcbiAgaWYgKHdyYXBwZXIuY29udGFpbnModGFyZ2V0KSkgcmV0dXJuIHRydWU7XG4gIGxldCBjdXJyZW50RWxlbWVudCA9IHRhcmdldDtcbiAgd2hpbGUgKGN1cnJlbnRFbGVtZW50KSB7XG4gICAgaWYgKGN1cnJlbnRFbGVtZW50ID09PSB3cmFwcGVyKSByZXR1cm4gdHJ1ZTtcbiAgICBjdXJyZW50RWxlbWVudCA9IGN1cnJlbnRFbGVtZW50Ll8kaG9zdCA/PyBjdXJyZW50RWxlbWVudC5wYXJlbnRFbGVtZW50O1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG52YXIgcHJldmVudFNjcm9sbF9kZWZhdWx0ID0gY3JlYXRlUHJldmVudFNjcm9sbDtcblxuLy8gc3JjL2luZGV4LnRzXG52YXIgc3JjX2RlZmF1bHQgPSBwcmV2ZW50U2Nyb2xsX2RlZmF1bHQ7XG5leHBvcnQge1xuICBzcmNfZGVmYXVsdCBhcyBkZWZhdWx0XG59O1xuIiwiLy8gc3JjL3ByZXNlbmNlLnRzXG5pbXBvcnQgeyBhY2Nlc3MgfSBmcm9tIFwiQGNvcnZ1L3V0aWxzL3JlYWN0aXZpdHlcIjtcbmltcG9ydCB7XG4gIGNyZWF0ZUVmZmVjdCxcbiAgY3JlYXRlTWVtbyxcbiAgY3JlYXRlU2lnbmFsLFxuICBvbkNsZWFudXAsXG4gIHVudHJhY2tcbn0gZnJvbSBcInNvbGlkLWpzXCI7XG52YXIgY3JlYXRlUHJlc2VuY2UgPSAocHJvcHMpID0+IHtcbiAgY29uc3QgcmVmU3R5bGVzID0gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgY29uc3QgZWxlbWVudCA9IGFjY2Vzcyhwcm9wcy5lbGVtZW50KTtcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybjtcbiAgICByZXR1cm4gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgfSk7XG4gIGNvbnN0IGdldEFuaW1hdGlvbk5hbWUgPSAoKSA9PiB7XG4gICAgcmV0dXJuIHJlZlN0eWxlcygpPy5hbmltYXRpb25OYW1lID8/IFwibm9uZVwiO1xuICB9O1xuICBjb25zdCBbcHJlc2VudFN0YXRlLCBzZXRQcmVzZW50U3RhdGVdID0gY3JlYXRlU2lnbmFsKGFjY2Vzcyhwcm9wcy5zaG93KSA/IFwicHJlc2VudFwiIDogXCJoaWRkZW5cIik7XG4gIGxldCBhbmltYXRpb25OYW1lID0gXCJub25lXCI7XG4gIGNyZWF0ZUVmZmVjdCgocHJldlNob3cpID0+IHtcbiAgICBjb25zdCBzaG93ID0gYWNjZXNzKHByb3BzLnNob3cpO1xuICAgIHVudHJhY2soKCkgPT4ge1xuICAgICAgaWYgKHByZXZTaG93ID09PSBzaG93KSByZXR1cm4gc2hvdztcbiAgICAgIGNvbnN0IHByZXZBbmltYXRpb25OYW1lID0gYW5pbWF0aW9uTmFtZTtcbiAgICAgIGNvbnN0IGN1cnJlbnRBbmltYXRpb25OYW1lID0gZ2V0QW5pbWF0aW9uTmFtZSgpO1xuICAgICAgaWYgKHNob3cpIHtcbiAgICAgICAgc2V0UHJlc2VudFN0YXRlKFwicHJlc2VudFwiKTtcbiAgICAgIH0gZWxzZSBpZiAoY3VycmVudEFuaW1hdGlvbk5hbWUgPT09IFwibm9uZVwiIHx8IHJlZlN0eWxlcygpPy5kaXNwbGF5ID09PSBcIm5vbmVcIikge1xuICAgICAgICBzZXRQcmVzZW50U3RhdGUoXCJoaWRkZW5cIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBpc0FuaW1hdGluZyA9IHByZXZBbmltYXRpb25OYW1lICE9PSBjdXJyZW50QW5pbWF0aW9uTmFtZTtcbiAgICAgICAgaWYgKHByZXZTaG93ID09PSB0cnVlICYmIGlzQW5pbWF0aW5nKSB7XG4gICAgICAgICAgc2V0UHJlc2VudFN0YXRlKFwiaGlkaW5nXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNldFByZXNlbnRTdGF0ZShcImhpZGRlblwiKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBzaG93O1xuICB9KTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBjb25zdCBlbGVtZW50ID0gYWNjZXNzKHByb3BzLmVsZW1lbnQpO1xuICAgIGlmICghZWxlbWVudCkgcmV0dXJuO1xuICAgIGNvbnN0IGhhbmRsZUFuaW1hdGlvblN0YXJ0ID0gKGV2ZW50KSA9PiB7XG4gICAgICBpZiAoZXZlbnQudGFyZ2V0ID09PSBlbGVtZW50KSB7XG4gICAgICAgIGFuaW1hdGlvbk5hbWUgPSBnZXRBbmltYXRpb25OYW1lKCk7XG4gICAgICB9XG4gICAgfTtcbiAgICBjb25zdCBoYW5kbGVBbmltYXRpb25FbmQgPSAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRBbmltYXRpb25OYW1lID0gZ2V0QW5pbWF0aW9uTmFtZSgpO1xuICAgICAgY29uc3QgaXNDdXJyZW50QW5pbWF0aW9uID0gY3VycmVudEFuaW1hdGlvbk5hbWUuaW5jbHVkZXMoXG4gICAgICAgIGV2ZW50LmFuaW1hdGlvbk5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoZXZlbnQudGFyZ2V0ID09PSBlbGVtZW50ICYmIGlzQ3VycmVudEFuaW1hdGlvbiAmJiBwcmVzZW50U3RhdGUoKSA9PT0gXCJoaWRpbmdcIikge1xuICAgICAgICBzZXRQcmVzZW50U3RhdGUoXCJoaWRkZW5cIik7XG4gICAgICB9XG4gICAgfTtcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJhbmltYXRpb25zdGFydFwiLCBoYW5kbGVBbmltYXRpb25TdGFydCk7XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKFwiYW5pbWF0aW9uY2FuY2VsXCIsIGhhbmRsZUFuaW1hdGlvbkVuZCk7XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKFwiYW5pbWF0aW9uZW5kXCIsIGhhbmRsZUFuaW1hdGlvbkVuZCk7XG4gICAgb25DbGVhbnVwKCgpID0+IHtcbiAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFuaW1hdGlvbnN0YXJ0XCIsIGhhbmRsZUFuaW1hdGlvblN0YXJ0KTtcbiAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFuaW1hdGlvbmNhbmNlbFwiLCBoYW5kbGVBbmltYXRpb25FbmQpO1xuICAgICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYW5pbWF0aW9uZW5kXCIsIGhhbmRsZUFuaW1hdGlvbkVuZCk7XG4gICAgfSk7XG4gIH0pO1xuICByZXR1cm4ge1xuICAgIHByZXNlbnQ6ICgpID0+IHByZXNlbnRTdGF0ZSgpID09PSBcInByZXNlbnRcIiB8fCBwcmVzZW50U3RhdGUoKSA9PT0gXCJoaWRpbmdcIixcbiAgICBzdGF0ZTogcHJlc2VudFN0YXRlXG4gIH07XG59O1xudmFyIHByZXNlbmNlX2RlZmF1bHQgPSBjcmVhdGVQcmVzZW5jZTtcblxuLy8gc3JjL2luZGV4LnRzXG52YXIgc3JjX2RlZmF1bHQgPSBwcmVzZW5jZV9kZWZhdWx0O1xuZXhwb3J0IHtcbiAgc3JjX2RlZmF1bHQgYXMgZGVmYXVsdFxufTtcbiIsImltcG9ydCB7XG4gIGNyZWF0ZUZvY3VzU2NvcGVcbn0gZnJvbSBcIi4vN0EzR0RGNFkuanN4XCI7XG5pbXBvcnQge1xuICBjcmVhdGVIaWRlT3V0c2lkZVxufSBmcm9tIFwiLi9QNlhVNzVaRy5qc3hcIjtcbmltcG9ydCB7XG4gIERpc21pc3NhYmxlTGF5ZXJcbn0gZnJvbSBcIi4vTk5HTVJZMk8uanN4XCI7XG5pbXBvcnQge1xuICBjcmVhdGVEaXNjbG9zdXJlU3RhdGVcbn0gZnJvbSBcIi4vRTUzREI3QlMuanN4XCI7XG5pbXBvcnQge1xuICBCdXR0b25Sb290XG59IGZyb20gXCIuL1NBMjdWNVlKLmpzeFwiO1xuaW1wb3J0IHtcbiAgY3JlYXRlUmVnaXN0ZXJJZFxufSBmcm9tIFwiLi9KTkNDRjZNUC5qc3hcIjtcbmltcG9ydCB7XG4gIFBvbHltb3JwaGljXG59IGZyb20gXCIuL0U3M1BLRkIzLmpzeFwiO1xuaW1wb3J0IHtcbiAgX19leHBvcnRcbn0gZnJvbSBcIi4vNVdYSEpEQ1ouanN4XCI7XG5cbi8vIHNyYy9kaWFsb2cvaW5kZXgudHN4XG52YXIgZGlhbG9nX2V4cG9ydHMgPSB7fTtcbl9fZXhwb3J0KGRpYWxvZ19leHBvcnRzLCB7XG4gIENsb3NlQnV0dG9uOiAoKSA9PiBEaWFsb2dDbG9zZUJ1dHRvbixcbiAgQ29udGVudDogKCkgPT4gRGlhbG9nQ29udGVudCxcbiAgRGVzY3JpcHRpb246ICgpID0+IERpYWxvZ0Rlc2NyaXB0aW9uLFxuICBEaWFsb2c6ICgpID0+IERpYWxvZyxcbiAgT3ZlcmxheTogKCkgPT4gRGlhbG9nT3ZlcmxheSxcbiAgUG9ydGFsOiAoKSA9PiBEaWFsb2dQb3J0YWwsXG4gIFJvb3Q6ICgpID0+IERpYWxvZ1Jvb3QsXG4gIFRpdGxlOiAoKSA9PiBEaWFsb2dUaXRsZSxcbiAgVHJpZ2dlcjogKCkgPT4gRGlhbG9nVHJpZ2dlclxufSk7XG5cbi8vIHNyYy9kaWFsb2cvZGlhbG9nLWNsb3NlLWJ1dHRvbi50c3hcbmltcG9ydCB7IGNhbGxIYW5kbGVyIH0gZnJvbSBcIkBrb2JhbHRlL3V0aWxzXCI7XG5pbXBvcnQgeyBzcGxpdFByb3BzIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5cbi8vIHNyYy9kaWFsb2cvZGlhbG9nLWNvbnRleHQudHN4XG5pbXBvcnQgeyBjcmVhdGVDb250ZXh0LCB1c2VDb250ZXh0IH0gZnJvbSBcInNvbGlkLWpzXCI7XG52YXIgRGlhbG9nQ29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcbmZ1bmN0aW9uIHVzZURpYWxvZ0NvbnRleHQoKSB7XG4gIGNvbnN0IGNvbnRleHQgPSB1c2VDb250ZXh0KERpYWxvZ0NvbnRleHQpO1xuICBpZiAoY29udGV4dCA9PT0gdm9pZCAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJba29iYWx0ZV06IGB1c2VEaWFsb2dDb250ZXh0YCBtdXN0IGJlIHVzZWQgd2l0aGluIGEgYERpYWxvZ2AgY29tcG9uZW50XCJcbiAgICApO1xuICB9XG4gIHJldHVybiBjb250ZXh0O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy1jbG9zZS1idXR0b24udHN4XG5mdW5jdGlvbiBEaWFsb2dDbG9zZUJ1dHRvbihwcm9wcykge1xuICBjb25zdCBjb250ZXh0ID0gdXNlRGlhbG9nQ29udGV4dCgpO1xuICBjb25zdCBbbG9jYWwsIG90aGVyc10gPSBzcGxpdFByb3BzKHByb3BzLCBbXG4gICAgXCJhcmlhLWxhYmVsXCIsXG4gICAgXCJvbkNsaWNrXCJcbiAgXSk7XG4gIGNvbnN0IG9uQ2xpY2sgPSAoZSkgPT4ge1xuICAgIGNhbGxIYW5kbGVyKGUsIGxvY2FsLm9uQ2xpY2spO1xuICAgIGNvbnRleHQuY2xvc2UoKTtcbiAgfTtcbiAgcmV0dXJuIDxCdXR0b25Sb290XG4gICAgYXJpYS1sYWJlbD17bG9jYWxbXCJhcmlhLWxhYmVsXCJdIHx8IGNvbnRleHQudHJhbnNsYXRpb25zKCkuZGlzbWlzc31cbiAgICBvbkNsaWNrPXtvbkNsaWNrfVxuICAgIHsuLi5vdGhlcnN9XG4gIC8+O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy1jb250ZW50LnRzeFxuaW1wb3J0IHtcbiAgY29udGFpbnMsXG4gIGZvY3VzV2l0aG91dFNjcm9sbGluZyxcbiAgbWVyZ2VEZWZhdWx0UHJvcHMsXG4gIG1lcmdlUmVmc1xufSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7XG4gIFNob3csXG4gIGNyZWF0ZUVmZmVjdCxcbiAgb25DbGVhbnVwLFxuICBzcGxpdFByb3BzIGFzIHNwbGl0UHJvcHMyXG59IGZyb20gXCJzb2xpZC1qc1wiO1xuaW1wb3J0IGNyZWF0ZVByZXZlbnRTY3JvbGwgZnJvbSBcInNvbGlkLXByZXZlbnQtc2Nyb2xsXCI7XG5mdW5jdGlvbiBEaWFsb2dDb250ZW50KHByb3BzKSB7XG4gIGxldCByZWY7XG4gIGNvbnN0IGNvbnRleHQgPSB1c2VEaWFsb2dDb250ZXh0KCk7XG4gIGNvbnN0IG1lcmdlZFByb3BzID0gbWVyZ2VEZWZhdWx0UHJvcHMoXG4gICAge1xuICAgICAgaWQ6IGNvbnRleHQuZ2VuZXJhdGVJZChcImNvbnRlbnRcIilcbiAgICB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IFtsb2NhbCwgb3RoZXJzXSA9IHNwbGl0UHJvcHMyKG1lcmdlZFByb3BzLCBbXG4gICAgXCJyZWZcIixcbiAgICBcIm9uT3BlbkF1dG9Gb2N1c1wiLFxuICAgIFwib25DbG9zZUF1dG9Gb2N1c1wiLFxuICAgIFwib25Qb2ludGVyRG93bk91dHNpZGVcIixcbiAgICBcIm9uRm9jdXNPdXRzaWRlXCIsXG4gICAgXCJvbkludGVyYWN0T3V0c2lkZVwiXG4gIF0pO1xuICBsZXQgaGFzSW50ZXJhY3RlZE91dHNpZGUgPSBmYWxzZTtcbiAgbGV0IGhhc1BvaW50ZXJEb3duT3V0c2lkZSA9IGZhbHNlO1xuICBjb25zdCBvblBvaW50ZXJEb3duT3V0c2lkZSA9IChlKSA9PiB7XG4gICAgbG9jYWwub25Qb2ludGVyRG93bk91dHNpZGU/LihlKTtcbiAgICBpZiAoY29udGV4dC5tb2RhbCgpICYmIGUuZGV0YWlsLmlzQ29udGV4dE1lbnUpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IG9uRm9jdXNPdXRzaWRlID0gKGUpID0+IHtcbiAgICBsb2NhbC5vbkZvY3VzT3V0c2lkZT8uKGUpO1xuICAgIGlmIChjb250ZXh0Lm1vZGFsKCkpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IG9uSW50ZXJhY3RPdXRzaWRlID0gKGUpID0+IHtcbiAgICBsb2NhbC5vbkludGVyYWN0T3V0c2lkZT8uKGUpO1xuICAgIGlmIChjb250ZXh0Lm1vZGFsKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFlLmRlZmF1bHRQcmV2ZW50ZWQpIHtcbiAgICAgIGhhc0ludGVyYWN0ZWRPdXRzaWRlID0gdHJ1ZTtcbiAgICAgIGlmIChlLmRldGFpbC5vcmlnaW5hbEV2ZW50LnR5cGUgPT09IFwicG9pbnRlcmRvd25cIikge1xuICAgICAgICBoYXNQb2ludGVyRG93bk91dHNpZGUgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoY29udGFpbnMoY29udGV4dC50cmlnZ2VyUmVmKCksIGUudGFyZ2V0KSkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbiAgICBpZiAoZS5kZXRhaWwub3JpZ2luYWxFdmVudC50eXBlID09PSBcImZvY3VzaW5cIiAmJiBoYXNQb2ludGVyRG93bk91dHNpZGUpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IG9uQ2xvc2VBdXRvRm9jdXMgPSAoZSkgPT4ge1xuICAgIGxvY2FsLm9uQ2xvc2VBdXRvRm9jdXM/LihlKTtcbiAgICBpZiAoY29udGV4dC5tb2RhbCgpKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBmb2N1c1dpdGhvdXRTY3JvbGxpbmcoY29udGV4dC50cmlnZ2VyUmVmKCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWUuZGVmYXVsdFByZXZlbnRlZCkge1xuICAgICAgICBpZiAoIWhhc0ludGVyYWN0ZWRPdXRzaWRlKSB7XG4gICAgICAgICAgZm9jdXNXaXRob3V0U2Nyb2xsaW5nKGNvbnRleHQudHJpZ2dlclJlZigpKTtcbiAgICAgICAgfVxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9XG4gICAgICBoYXNJbnRlcmFjdGVkT3V0c2lkZSA9IGZhbHNlO1xuICAgICAgaGFzUG9pbnRlckRvd25PdXRzaWRlID0gZmFsc2U7XG4gICAgfVxuICB9O1xuICBjcmVhdGVIaWRlT3V0c2lkZSh7XG4gICAgaXNEaXNhYmxlZDogKCkgPT4gIShjb250ZXh0LmlzT3BlbigpICYmIGNvbnRleHQubW9kYWwoKSksXG4gICAgdGFyZ2V0czogKCkgPT4gcmVmID8gW3JlZl0gOiBbXVxuICB9KTtcbiAgY3JlYXRlUHJldmVudFNjcm9sbCh7XG4gICAgZWxlbWVudDogKCkgPT4gcmVmID8/IG51bGwsXG4gICAgZW5hYmxlZDogKCkgPT4gY29udGV4dC5pc09wZW4oKSAmJiBjb250ZXh0LnByZXZlbnRTY3JvbGwoKVxuICB9KTtcbiAgY3JlYXRlRm9jdXNTY29wZShcbiAgICB7XG4gICAgICB0cmFwRm9jdXM6ICgpID0+IGNvbnRleHQuaXNPcGVuKCkgJiYgY29udGV4dC5tb2RhbCgpLFxuICAgICAgb25Nb3VudEF1dG9Gb2N1czogbG9jYWwub25PcGVuQXV0b0ZvY3VzLFxuICAgICAgb25Vbm1vdW50QXV0b0ZvY3VzOiBvbkNsb3NlQXV0b0ZvY3VzXG4gICAgfSxcbiAgICAoKSA9PiByZWZcbiAgKTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IG9uQ2xlYW51cChjb250ZXh0LnJlZ2lzdGVyQ29udGVudElkKG90aGVycy5pZCkpKTtcbiAgcmV0dXJuIDxTaG93IHdoZW49e2NvbnRleHQuY29udGVudFByZXNlbnQoKX0+PERpc21pc3NhYmxlTGF5ZXJcbiAgICByZWY9e21lcmdlUmVmcygoZWwpID0+IHtcbiAgICAgIGNvbnRleHQuc2V0Q29udGVudFJlZihlbCk7XG4gICAgICByZWYgPSBlbDtcbiAgICB9LCBsb2NhbC5yZWYpfVxuICAgIHJvbGU9XCJkaWFsb2dcIlxuICAgIHRhYkluZGV4PXstMX1cbiAgICBkaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHM9e2NvbnRleHQubW9kYWwoKSAmJiBjb250ZXh0LmlzT3BlbigpfVxuICAgIGV4Y2x1ZGVkRWxlbWVudHM9e1tjb250ZXh0LnRyaWdnZXJSZWZdfVxuICAgIGFyaWEtbGFiZWxsZWRieT17Y29udGV4dC50aXRsZUlkKCl9XG4gICAgYXJpYS1kZXNjcmliZWRieT17Y29udGV4dC5kZXNjcmlwdGlvbklkKCl9XG4gICAgZGF0YS1leHBhbmRlZD17Y29udGV4dC5pc09wZW4oKSA/IFwiXCIgOiB2b2lkIDB9XG4gICAgZGF0YS1jbG9zZWQ9eyFjb250ZXh0LmlzT3BlbigpID8gXCJcIiA6IHZvaWQgMH1cbiAgICBvblBvaW50ZXJEb3duT3V0c2lkZT17b25Qb2ludGVyRG93bk91dHNpZGV9XG4gICAgb25Gb2N1c091dHNpZGU9e29uRm9jdXNPdXRzaWRlfVxuICAgIG9uSW50ZXJhY3RPdXRzaWRlPXtvbkludGVyYWN0T3V0c2lkZX1cbiAgICBvbkRpc21pc3M9e2NvbnRleHQuY2xvc2V9XG4gICAgey4uLm90aGVyc31cbiAgLz48L1Nob3c+O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy1kZXNjcmlwdGlvbi50c3hcbmltcG9ydCB7IG1lcmdlRGVmYXVsdFByb3BzIGFzIG1lcmdlRGVmYXVsdFByb3BzMiB9IGZyb20gXCJAa29iYWx0ZS91dGlsc1wiO1xuaW1wb3J0IHsgY3JlYXRlRWZmZWN0IGFzIGNyZWF0ZUVmZmVjdDIsIG9uQ2xlYW51cCBhcyBvbkNsZWFudXAyLCBzcGxpdFByb3BzIGFzIHNwbGl0UHJvcHMzIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5mdW5jdGlvbiBEaWFsb2dEZXNjcmlwdGlvbihwcm9wcykge1xuICBjb25zdCBjb250ZXh0ID0gdXNlRGlhbG9nQ29udGV4dCgpO1xuICBjb25zdCBtZXJnZWRQcm9wcyA9IG1lcmdlRGVmYXVsdFByb3BzMihcbiAgICB7XG4gICAgICBpZDogY29udGV4dC5nZW5lcmF0ZUlkKFwiZGVzY3JpcHRpb25cIilcbiAgICB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IFtsb2NhbCwgb3RoZXJzXSA9IHNwbGl0UHJvcHMzKG1lcmdlZFByb3BzLCBbXCJpZFwiXSk7XG4gIGNyZWF0ZUVmZmVjdDIoKCkgPT4gb25DbGVhbnVwMihjb250ZXh0LnJlZ2lzdGVyRGVzY3JpcHRpb25JZChsb2NhbC5pZCkpKTtcbiAgcmV0dXJuIDxQb2x5bW9ycGhpY1xuICAgIGFzPVwicFwiXG4gICAgaWQ9e2xvY2FsLmlkfVxuICAgIHsuLi5vdGhlcnN9XG4gIC8+O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy1vdmVybGF5LnRzeFxuaW1wb3J0IHsgY2FsbEhhbmRsZXIgYXMgY2FsbEhhbmRsZXIyLCBtZXJnZVJlZnMgYXMgbWVyZ2VSZWZzMiB9IGZyb20gXCJAa29iYWx0ZS91dGlsc1wiO1xuaW1wb3J0IHsgU2hvdyBhcyBTaG93Miwgc3BsaXRQcm9wcyBhcyBzcGxpdFByb3BzNCB9IGZyb20gXCJzb2xpZC1qc1wiO1xuZnVuY3Rpb24gRGlhbG9nT3ZlcmxheShwcm9wcykge1xuICBjb25zdCBjb250ZXh0ID0gdXNlRGlhbG9nQ29udGV4dCgpO1xuICBjb25zdCBbbG9jYWwsIG90aGVyc10gPSBzcGxpdFByb3BzNChwcm9wcywgW1xuICAgIFwicmVmXCIsXG4gICAgXCJzdHlsZVwiLFxuICAgIFwib25Qb2ludGVyRG93blwiXG4gIF0pO1xuICBjb25zdCBvblBvaW50ZXJEb3duID0gKGUpID0+IHtcbiAgICBjYWxsSGFuZGxlcjIoZSwgbG9jYWwub25Qb2ludGVyRG93bik7XG4gICAgaWYgKGUudGFyZ2V0ID09PSBlLmN1cnJlbnRUYXJnZXQpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH07XG4gIHJldHVybiA8U2hvdzIgd2hlbj17Y29udGV4dC5vdmVybGF5UHJlc2VudCgpfT48UG9seW1vcnBoaWNcbiAgICBhcz1cImRpdlwiXG4gICAgcmVmPXttZXJnZVJlZnMyKGNvbnRleHQuc2V0T3ZlcmxheVJlZiwgbG9jYWwucmVmKX1cbiAgICBzdHlsZT17eyBcInBvaW50ZXItZXZlbnRzXCI6IFwiYXV0b1wiLCAuLi5sb2NhbC5zdHlsZSB9fVxuICAgIGRhdGEtZXhwYW5kZWQ9e2NvbnRleHQuaXNPcGVuKCkgPyBcIlwiIDogdm9pZCAwfVxuICAgIGRhdGEtY2xvc2VkPXshY29udGV4dC5pc09wZW4oKSA/IFwiXCIgOiB2b2lkIDB9XG4gICAgb25Qb2ludGVyRG93bj17b25Qb2ludGVyRG93bn1cbiAgICB7Li4ub3RoZXJzfVxuICAvPjwvU2hvdzI+O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy1wb3J0YWwudHN4XG5pbXBvcnQgeyBTaG93IGFzIFNob3czIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5pbXBvcnQgeyBQb3J0YWwgfSBmcm9tIFwic29saWQtanMvd2ViXCI7XG5mdW5jdGlvbiBEaWFsb2dQb3J0YWwocHJvcHMpIHtcbiAgY29uc3QgY29udGV4dCA9IHVzZURpYWxvZ0NvbnRleHQoKTtcbiAgcmV0dXJuIDxTaG93MyB3aGVuPXtjb250ZXh0LmNvbnRlbnRQcmVzZW50KCkgfHwgY29udGV4dC5vdmVybGF5UHJlc2VudCgpfT48UG9ydGFsIHsuLi5wcm9wc30gLz48L1Nob3czPjtcbn1cblxuLy8gc3JjL2RpYWxvZy9kaWFsb2ctcm9vdC50c3hcbmltcG9ydCB7IGNyZWF0ZUdlbmVyYXRlSWQsIG1lcmdlRGVmYXVsdFByb3BzIGFzIG1lcmdlRGVmYXVsdFByb3BzMyB9IGZyb20gXCJAa29iYWx0ZS91dGlsc1wiO1xuaW1wb3J0IHsgY3JlYXRlU2lnbmFsLCBjcmVhdGVVbmlxdWVJZCB9IGZyb20gXCJzb2xpZC1qc1wiO1xuaW1wb3J0IGNyZWF0ZVByZXNlbmNlIGZyb20gXCJzb2xpZC1wcmVzZW5jZVwiO1xuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy5pbnRsLnRzXG52YXIgRElBTE9HX0lOVExfVFJBTlNMQVRJT05TID0ge1xuICAvLyBgYXJpYS1sYWJlbGAgb2YgRGlhbG9nLkNsb3NlQnV0dG9uLlxuICBkaXNtaXNzOiBcIkRpc21pc3NcIlxufTtcblxuLy8gc3JjL2RpYWxvZy9kaWFsb2ctcm9vdC50c3hcbmZ1bmN0aW9uIERpYWxvZ1Jvb3QocHJvcHMpIHtcbiAgY29uc3QgZGVmYXVsdElkID0gYGRpYWxvZy0ke2NyZWF0ZVVuaXF1ZUlkKCl9YDtcbiAgY29uc3QgbWVyZ2VkUHJvcHMgPSBtZXJnZURlZmF1bHRQcm9wczMoXG4gICAge1xuICAgICAgaWQ6IGRlZmF1bHRJZCxcbiAgICAgIG1vZGFsOiB0cnVlLFxuICAgICAgdHJhbnNsYXRpb25zOiBESUFMT0dfSU5UTF9UUkFOU0xBVElPTlNcbiAgICB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IFtjb250ZW50SWQsIHNldENvbnRlbnRJZF0gPSBjcmVhdGVTaWduYWwoKTtcbiAgY29uc3QgW3RpdGxlSWQsIHNldFRpdGxlSWRdID0gY3JlYXRlU2lnbmFsKCk7XG4gIGNvbnN0IFtkZXNjcmlwdGlvbklkLCBzZXREZXNjcmlwdGlvbklkXSA9IGNyZWF0ZVNpZ25hbCgpO1xuICBjb25zdCBbb3ZlcmxheVJlZiwgc2V0T3ZlcmxheVJlZl0gPSBjcmVhdGVTaWduYWwoKTtcbiAgY29uc3QgW2NvbnRlbnRSZWYsIHNldENvbnRlbnRSZWZdID0gY3JlYXRlU2lnbmFsKCk7XG4gIGNvbnN0IFt0cmlnZ2VyUmVmLCBzZXRUcmlnZ2VyUmVmXSA9IGNyZWF0ZVNpZ25hbCgpO1xuICBjb25zdCBkaXNjbG9zdXJlU3RhdGUgPSBjcmVhdGVEaXNjbG9zdXJlU3RhdGUoe1xuICAgIG9wZW46ICgpID0+IG1lcmdlZFByb3BzLm9wZW4sXG4gICAgZGVmYXVsdE9wZW46ICgpID0+IG1lcmdlZFByb3BzLmRlZmF1bHRPcGVuLFxuICAgIG9uT3BlbkNoYW5nZTogKGlzT3BlbikgPT4gbWVyZ2VkUHJvcHMub25PcGVuQ2hhbmdlPy4oaXNPcGVuKVxuICB9KTtcbiAgY29uc3Qgc2hvdWxkTW91bnQgPSAoKSA9PiBtZXJnZWRQcm9wcy5mb3JjZU1vdW50IHx8IGRpc2Nsb3N1cmVTdGF0ZS5pc09wZW4oKTtcbiAgY29uc3QgeyBwcmVzZW50OiBvdmVybGF5UHJlc2VudCB9ID0gY3JlYXRlUHJlc2VuY2Uoe1xuICAgIHNob3c6IHNob3VsZE1vdW50LFxuICAgIGVsZW1lbnQ6ICgpID0+IG92ZXJsYXlSZWYoKSA/PyBudWxsXG4gIH0pO1xuICBjb25zdCB7IHByZXNlbnQ6IGNvbnRlbnRQcmVzZW50IH0gPSBjcmVhdGVQcmVzZW5jZSh7XG4gICAgc2hvdzogc2hvdWxkTW91bnQsXG4gICAgZWxlbWVudDogKCkgPT4gY29udGVudFJlZigpID8/IG51bGxcbiAgfSk7XG4gIGNvbnN0IGNvbnRleHQgPSB7XG4gICAgdHJhbnNsYXRpb25zOiAoKSA9PiBtZXJnZWRQcm9wcy50cmFuc2xhdGlvbnMgPz8gRElBTE9HX0lOVExfVFJBTlNMQVRJT05TLFxuICAgIGlzT3BlbjogZGlzY2xvc3VyZVN0YXRlLmlzT3BlbixcbiAgICBtb2RhbDogKCkgPT4gbWVyZ2VkUHJvcHMubW9kYWwgPz8gdHJ1ZSxcbiAgICBwcmV2ZW50U2Nyb2xsOiAoKSA9PiBtZXJnZWRQcm9wcy5wcmV2ZW50U2Nyb2xsID8/IGNvbnRleHQubW9kYWwoKSxcbiAgICBjb250ZW50SWQsXG4gICAgdGl0bGVJZCxcbiAgICBkZXNjcmlwdGlvbklkLFxuICAgIHRyaWdnZXJSZWYsXG4gICAgb3ZlcmxheVJlZixcbiAgICBzZXRPdmVybGF5UmVmLFxuICAgIGNvbnRlbnRSZWYsXG4gICAgc2V0Q29udGVudFJlZixcbiAgICBvdmVybGF5UHJlc2VudCxcbiAgICBjb250ZW50UHJlc2VudCxcbiAgICBjbG9zZTogZGlzY2xvc3VyZVN0YXRlLmNsb3NlLFxuICAgIHRvZ2dsZTogZGlzY2xvc3VyZVN0YXRlLnRvZ2dsZSxcbiAgICBzZXRUcmlnZ2VyUmVmLFxuICAgIGdlbmVyYXRlSWQ6IGNyZWF0ZUdlbmVyYXRlSWQoKCkgPT4gbWVyZ2VkUHJvcHMuaWQpLFxuICAgIHJlZ2lzdGVyQ29udGVudElkOiBjcmVhdGVSZWdpc3RlcklkKHNldENvbnRlbnRJZCksXG4gICAgcmVnaXN0ZXJUaXRsZUlkOiBjcmVhdGVSZWdpc3RlcklkKHNldFRpdGxlSWQpLFxuICAgIHJlZ2lzdGVyRGVzY3JpcHRpb25JZDogY3JlYXRlUmVnaXN0ZXJJZChzZXREZXNjcmlwdGlvbklkKVxuICB9O1xuICByZXR1cm4gPERpYWxvZ0NvbnRleHQuUHJvdmlkZXIgdmFsdWU9e2NvbnRleHR9PnttZXJnZWRQcm9wcy5jaGlsZHJlbn08L0RpYWxvZ0NvbnRleHQuUHJvdmlkZXI+O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy10aXRsZS50c3hcbmltcG9ydCB7IG1lcmdlRGVmYXVsdFByb3BzIGFzIG1lcmdlRGVmYXVsdFByb3BzNCB9IGZyb20gXCJAa29iYWx0ZS91dGlsc1wiO1xuaW1wb3J0IHsgY3JlYXRlRWZmZWN0IGFzIGNyZWF0ZUVmZmVjdDMsIG9uQ2xlYW51cCBhcyBvbkNsZWFudXAzLCBzcGxpdFByb3BzIGFzIHNwbGl0UHJvcHM1IH0gZnJvbSBcInNvbGlkLWpzXCI7XG5mdW5jdGlvbiBEaWFsb2dUaXRsZShwcm9wcykge1xuICBjb25zdCBjb250ZXh0ID0gdXNlRGlhbG9nQ29udGV4dCgpO1xuICBjb25zdCBtZXJnZWRQcm9wcyA9IG1lcmdlRGVmYXVsdFByb3BzNChcbiAgICB7XG4gICAgICBpZDogY29udGV4dC5nZW5lcmF0ZUlkKFwidGl0bGVcIilcbiAgICB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IFtsb2NhbCwgb3RoZXJzXSA9IHNwbGl0UHJvcHM1KG1lcmdlZFByb3BzLCBbXCJpZFwiXSk7XG4gIGNyZWF0ZUVmZmVjdDMoKCkgPT4gb25DbGVhbnVwMyhjb250ZXh0LnJlZ2lzdGVyVGl0bGVJZChsb2NhbC5pZCkpKTtcbiAgcmV0dXJuIDxQb2x5bW9ycGhpYyBhcz1cImgyXCIgaWQ9e2xvY2FsLmlkfSB7Li4ub3RoZXJzfSAvPjtcbn1cblxuLy8gc3JjL2RpYWxvZy9kaWFsb2ctdHJpZ2dlci50c3hcbmltcG9ydCB7IGNhbGxIYW5kbGVyIGFzIGNhbGxIYW5kbGVyMywgbWVyZ2VSZWZzIGFzIG1lcmdlUmVmczMgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7IHNwbGl0UHJvcHMgYXMgc3BsaXRQcm9wczYgfSBmcm9tIFwic29saWQtanNcIjtcbmZ1bmN0aW9uIERpYWxvZ1RyaWdnZXIocHJvcHMpIHtcbiAgY29uc3QgY29udGV4dCA9IHVzZURpYWxvZ0NvbnRleHQoKTtcbiAgY29uc3QgW2xvY2FsLCBvdGhlcnNdID0gc3BsaXRQcm9wczYocHJvcHMsIFtcbiAgICBcInJlZlwiLFxuICAgIFwib25DbGlja1wiXG4gIF0pO1xuICBjb25zdCBvbkNsaWNrID0gKGUpID0+IHtcbiAgICBjYWxsSGFuZGxlcjMoZSwgbG9jYWwub25DbGljayk7XG4gICAgY29udGV4dC50b2dnbGUoKTtcbiAgfTtcbiAgcmV0dXJuIDxCdXR0b25Sb290XG4gICAgcmVmPXttZXJnZVJlZnMzKGNvbnRleHQuc2V0VHJpZ2dlclJlZiwgbG9jYWwucmVmKX1cbiAgICBhcmlhLWhhc3BvcHVwPVwiZGlhbG9nXCJcbiAgICBhcmlhLWV4cGFuZGVkPXtjb250ZXh0LmlzT3BlbigpfVxuICAgIGFyaWEtY29udHJvbHM9e2NvbnRleHQuaXNPcGVuKCkgPyBjb250ZXh0LmNvbnRlbnRJZCgpIDogdm9pZCAwfVxuICAgIGRhdGEtZXhwYW5kZWQ9e2NvbnRleHQuaXNPcGVuKCkgPyBcIlwiIDogdm9pZCAwfVxuICAgIGRhdGEtY2xvc2VkPXshY29udGV4dC5pc09wZW4oKSA/IFwiXCIgOiB2b2lkIDB9XG4gICAgb25DbGljaz17b25DbGlja31cbiAgICB7Li4ub3RoZXJzfVxuICAvPjtcbn1cblxuLy8gc3JjL2RpYWxvZy9pbmRleC50c3hcbnZhciBEaWFsb2cgPSBPYmplY3QuYXNzaWduKERpYWxvZ1Jvb3QsIHtcbiAgQ2xvc2VCdXR0b246IERpYWxvZ0Nsb3NlQnV0dG9uLFxuICBDb250ZW50OiBEaWFsb2dDb250ZW50LFxuICBEZXNjcmlwdGlvbjogRGlhbG9nRGVzY3JpcHRpb24sXG4gIE92ZXJsYXk6IERpYWxvZ092ZXJsYXksXG4gIFBvcnRhbDogRGlhbG9nUG9ydGFsLFxuICBUaXRsZTogRGlhbG9nVGl0bGUsXG4gIFRyaWdnZXI6IERpYWxvZ1RyaWdnZXJcbn0pO1xuXG5leHBvcnQge1xuICBEaWFsb2dDbG9zZUJ1dHRvbixcbiAgRGlhbG9nQ29udGVudCxcbiAgRGlhbG9nRGVzY3JpcHRpb24sXG4gIERpYWxvZ092ZXJsYXksXG4gIERpYWxvZ1BvcnRhbCxcbiAgRGlhbG9nUm9vdCxcbiAgRGlhbG9nVGl0bGUsXG4gIERpYWxvZ1RyaWdnZXIsXG4gIERpYWxvZyxcbiAgZGlhbG9nX2V4cG9ydHNcbn07XG4iLCJpbXBvcnQgeyBDb21wb25lbnRQcm9wcywgc3BsaXRQcm9wcyB9IGZyb20gXCJzb2xpZC1qc1wiO1xyXG5pbXBvcnQgeyB0d01lcmdlIH0gZnJvbSBcInRhaWx3aW5kLW1lcmdlXCI7XHJcblxyXG50eXBlIFZhcmlhbnQgPSBcImRlZmF1bHRcIiB8IFwiZ2hvc3RcIiB8IFwib3V0bGluZVwiIHwgXCJhY2NlbnRcIiB8IFwiZGVzdHJ1Y3RpdmVcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBidXR0b25WYXJpYW50czogUmVjb3JkPFZhcmlhbnQsIHN0cmluZz4gPSB7XHJcbiAgZGVmYXVsdDpcclxuICAgIFwiaW5saW5lLWZsZXggaC1bdmFyKC0taW5wdXQtaGVpZ2h0KV0gY3Vyc29yLVt2YXIoLS1jdXJzb3IpXSBzZWxlY3Qtbm9uZSBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgd2hpdGVzcGFjZS1ub3dyYXAgcm91bmRlZC1idXR0b24gYm9yZGVyLTAgcC1idXR0b24gdGV4dC1bbGVuZ3RoOnZhcigtLWZvbnQtdWktc21hbGwpXSBmb250LVt2YXIoLS1pbnB1dC1mb250LXdlaWdodCldIHRleHQtbm9ybWFsIG91dGxpbmUtbm9uZSBiZy1pbnRlcmFjdGl2ZS1ub3JtYWwgaG92ZXI6YmctaW50ZXJhY3RpdmUtaG92ZXIgc2hhZG93LVsndmFyKC0taW5wdXQtc2hhZG93KSddXCIsXHJcbiAgZ2hvc3Q6IFwiYmctdHJhbnNwYXJlbnQgc2hhZG93LW5vbmVcIixcclxuICAvLyBUT0RPIGZpbmQgYmV0dGVyIHdpZHRoIGhlcmVcclxuICBvdXRsaW5lOlxyXG4gICAgXCJiZy10cmFuc3BhcmVudCBzaGFkb3ctbm9uZSBib3JkZXItYm9yZGVyIGJvcmRlci1bbGVuZ3RoOnZhcigtLXByb21wdC1ib3JkZXItd2lkdGgpXVwiLFxyXG4gIGFjY2VudDpcclxuICAgIFwiYmctaW50ZXJhY3RpdmUtYWNjZW50IHRleHQtb24tYWNjZW50IGhvdmVyOmJnLWludGVyYWN0aXZlLWFjY2VudC1ob3ZlciBob3Zlcjp0ZXh0LWFjY2VudC1ob3ZlclwiLFxyXG4gIGRlc3RydWN0aXZlOiBcImJnLWVycm9yIGhvdmVyOmJnLWVycm9yIGhvdmVyOm9wYWNpdHktNzAgdGV4dC1vbi1lcnJvclwiLFxyXG59O1xyXG5cclxuLy8gY29uc3QgY2xhc3MgPSBcIlwiXHJcblxyXG50eXBlIEJ1dHRvbkxvY2FsUHJvcHMgPSB7XHJcbiAgdmFyaWFudD86IFZhcmlhbnQ7XHJcbn07XHJcbmV4cG9ydCB0eXBlIEJ1dHRvblByb3BzID0gQnV0dG9uTG9jYWxQcm9wcyAmIENvbXBvbmVudFByb3BzPFwiYnV0dG9uXCI+O1xyXG5leHBvcnQgY29uc3QgQnV0dG9uID0gKHByb3BzOiBCdXR0b25Qcm9wcykgPT4ge1xyXG4gIGNvbnN0IFtsb2NhbCwgcmVzdF0gPSBzcGxpdFByb3BzKHByb3BzLCBbXCJ2YXJpYW50XCIsIFwiY2xhc3NcIl0pO1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPGJ1dHRvblxyXG4gICAgICB7Li4ucmVzdH1cclxuICAgICAgY2xhc3M9e3R3TWVyZ2UoXHJcbiAgICAgICAgYnV0dG9uVmFyaWFudHNbXCJkZWZhdWx0XCJdLFxyXG4gICAgICAgIGxvY2FsLnZhcmlhbnQgJiYgYnV0dG9uVmFyaWFudHNbbG9jYWwudmFyaWFudF0sXHJcbiAgICAgICAgbG9jYWwuY2xhc3MsXHJcbiAgICAgICl9XHJcbiAgICAvPlxyXG4gICk7XHJcbn07XHJcblxyXG4vLyBpbXBvcnQgeyBjbiB9IGZyb20gXCJAL2xpYnMvY25cIjtcclxuLy8gaW1wb3J0IHR5cGUgeyBCdXR0b25Sb290UHJvcHMgfSBmcm9tIFwiQGtvYmFsdGUvY29yZS9idXR0b25cIjtcclxuLy8gaW1wb3J0IHsgQnV0dG9uIGFzIEJ1dHRvblByaW1pdGl2ZSB9IGZyb20gXCJAa29iYWx0ZS9jb3JlL2J1dHRvblwiO1xyXG4vLyBpbXBvcnQgdHlwZSB7IFBvbHltb3JwaGljUHJvcHMgfSBmcm9tIFwiQGtvYmFsdGUvY29yZS9wb2x5bW9ycGhpY1wiO1xyXG4vLyBpbXBvcnQgdHlwZSB7IFZhcmlhbnRQcm9wcyB9IGZyb20gXCJjbGFzcy12YXJpYW5jZS1hdXRob3JpdHlcIjtcclxuLy8gaW1wb3J0IHsgY3ZhIH0gZnJvbSBcImNsYXNzLXZhcmlhbmNlLWF1dGhvcml0eVwiO1xyXG4vLyBpbXBvcnQgdHlwZSB7IFZhbGlkQ29tcG9uZW50IH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcbi8vIGltcG9ydCB7IHNwbGl0UHJvcHMgfSBmcm9tIFwic29saWQtanNcIjtcclxuXHJcbi8vIGV4cG9ydCBjb25zdCBidXR0b25WYXJpYW50cyA9IGN2YShcclxuLy8gXHRcImlubGluZS1mbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciByb3VuZGVkLW1kIHRleHQtc20gZm9udC1tZWRpdW0gdHJhbnNpdGlvbi1bY29sb3IsYmFja2dyb3VuZC1jb2xvcixib3gtc2hhZG93XSBmb2N1cy12aXNpYmxlOm91dGxpbmUtbm9uZSBmb2N1cy12aXNpYmxlOnJpbmctWzEuNXB4XSBmb2N1cy12aXNpYmxlOnJpbmctcmluZyBkaXNhYmxlZDpwb2ludGVyLWV2ZW50cy1ub25lIGRpc2FibGVkOm9wYWNpdHktNTBcIixcclxuLy8gXHR7XHJcbi8vIFx0XHR2YXJpYW50czoge1xyXG4vLyBcdFx0XHR2YXJpYW50OiB7XHJcbi8vIFx0XHRcdFx0ZGVmYXVsdDpcclxuLy8gXHRcdFx0XHRcdFwiYmctcHJpbWFyeSB0ZXh0LXByaW1hcnktZm9yZWdyb3VuZCBzaGFkb3cgaG92ZXI6YmctcHJpbWFyeS85MFwiLFxyXG4vLyBcdFx0XHRcdGRlc3RydWN0aXZlOlxyXG4vLyBcdFx0XHRcdFx0XCJiZy1kZXN0cnVjdGl2ZSB0ZXh0LWRlc3RydWN0aXZlLWZvcmVncm91bmQgc2hhZG93LXNtIGhvdmVyOmJnLWRlc3RydWN0aXZlLzkwXCIsXHJcbi8vIFx0XHRcdFx0b3V0bGluZTpcclxuLy8gXHRcdFx0XHRcdFwiYm9yZGVyIGJvcmRlci1pbnB1dCBiZy1iYWNrZ3JvdW5kIHNoYWRvdy1zbSBob3ZlcjpiZy1hY2NlbnQgaG92ZXI6dGV4dC1hY2NlbnQtZm9yZWdyb3VuZFwiLFxyXG4vLyBcdFx0XHRcdHNlY29uZGFyeTpcclxuLy8gXHRcdFx0XHRcdFwiYmctc2Vjb25kYXJ5IHRleHQtc2Vjb25kYXJ5LWZvcmVncm91bmQgc2hhZG93LXNtIGhvdmVyOmJnLXNlY29uZGFyeS84MFwiLFxyXG4vLyBcdFx0XHRcdGdob3N0OiBcImhvdmVyOmJnLWFjY2VudCBob3Zlcjp0ZXh0LWFjY2VudC1mb3JlZ3JvdW5kXCIsXHJcbi8vIFx0XHRcdFx0bGluazogXCJ0ZXh0LXByaW1hcnkgdW5kZXJsaW5lLW9mZnNldC00IGhvdmVyOnVuZGVybGluZVwiLFxyXG4vLyBcdFx0XHR9LFxyXG4vLyBcdFx0XHRzaXplOiB7XHJcbi8vIFx0XHRcdFx0ZGVmYXVsdDogXCJoLTkgcHgtNCBweS0yXCIsXHJcbi8vIFx0XHRcdFx0c206IFwiaC04IHJvdW5kZWQtbWQgcHgtMyB0ZXh0LXhzXCIsXHJcbi8vIFx0XHRcdFx0bGc6IFwiaC0xMCByb3VuZGVkLW1kIHB4LThcIixcclxuLy8gXHRcdFx0XHRpY29uOiBcImgtOSB3LTlcIixcclxuLy8gXHRcdFx0fSxcclxuLy8gXHRcdH0sXHJcbi8vIFx0XHRkZWZhdWx0VmFyaWFudHM6IHtcclxuLy8gXHRcdFx0dmFyaWFudDogXCJkZWZhdWx0XCIsXHJcbi8vIFx0XHRcdHNpemU6IFwiZGVmYXVsdFwiLFxyXG4vLyBcdFx0fSxcclxuLy8gXHR9LFxyXG4vLyApO1xyXG5cclxuLy8gdHlwZSBidXR0b25Qcm9wczxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImJ1dHRvblwiPiA9IEJ1dHRvblJvb3RQcm9wczxUPiAmXHJcbi8vIFx0VmFyaWFudFByb3BzPHR5cGVvZiBidXR0b25WYXJpYW50cz4gJiB7XHJcbi8vIFx0XHRjbGFzcz86IHN0cmluZztcclxuLy8gXHR9O1xyXG5cclxuLy8gZXhwb3J0IGNvbnN0IEJ1dHRvbiA9IDxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImJ1dHRvblwiPihcclxuLy8gXHRwcm9wczogUG9seW1vcnBoaWNQcm9wczxULCBidXR0b25Qcm9wczxUPj4sXHJcbi8vICkgPT4ge1xyXG4vLyBcdGNvbnN0IFtsb2NhbCwgcmVzdF0gPSBzcGxpdFByb3BzKHByb3BzIGFzIGJ1dHRvblByb3BzLCBbXHJcbi8vIFx0XHRcImNsYXNzXCIsXHJcbi8vIFx0XHRcInZhcmlhbnRcIixcclxuLy8gXHRcdFwic2l6ZVwiLFxyXG4vLyBcdF0pO1xyXG5cclxuLy8gXHRyZXR1cm4gKFxyXG4vLyBcdFx0PEJ1dHRvblByaW1pdGl2ZVxyXG4vLyBcdFx0XHRjbGFzcz17Y24oXHJcbi8vIFx0XHRcdFx0YnV0dG9uVmFyaWFudHMoe1xyXG4vLyBcdFx0XHRcdFx0c2l6ZTogbG9jYWwuc2l6ZSxcclxuLy8gXHRcdFx0XHRcdHZhcmlhbnQ6IGxvY2FsLnZhcmlhbnQsXHJcbi8vIFx0XHRcdFx0fSksXHJcbi8vIFx0XHRcdFx0bG9jYWwuY2xhc3MsXHJcbi8vIFx0XHRcdCl9XHJcbi8vIFx0XHRcdHsuLi5yZXN0fVxyXG4vLyBcdFx0Lz5cclxuLy8gXHQpO1xyXG4vLyB9O1xyXG4iLCJpbXBvcnQgeyBjbiB9IGZyb20gXCJAL2xpYnMvY25cIjtcclxuaW1wb3J0IHR5cGUge1xyXG4gIERpYWxvZ0NvbnRlbnRQcm9wcyxcclxuICBEaWFsb2dEZXNjcmlwdGlvblByb3BzLFxyXG4gIERpYWxvZ1RpdGxlUHJvcHMsXHJcbiAgRGlhbG9nQ2xvc2VCdXR0b25Qcm9wcyxcclxufSBmcm9tIFwiQGtvYmFsdGUvY29yZS9kaWFsb2dcIjtcclxuaW1wb3J0IHsgRGlhbG9nIGFzIERpYWxvZ1ByaW1pdGl2ZSB9IGZyb20gXCJAa29iYWx0ZS9jb3JlL2RpYWxvZ1wiO1xyXG5pbXBvcnQgdHlwZSB7IFBvbHltb3JwaGljUHJvcHMgfSBmcm9tIFwiQGtvYmFsdGUvY29yZS9wb2x5bW9ycGhpY1wiO1xyXG5pbXBvcnQgdHlwZSB7IENvbXBvbmVudFByb3BzLCBQYXJlbnRQcm9wcywgVmFsaWRDb21wb25lbnQgfSBmcm9tIFwic29saWQtanNcIjtcclxuaW1wb3J0IHsgc3BsaXRQcm9wcyB9IGZyb20gXCJzb2xpZC1qc1wiO1xyXG5pbXBvcnQgeyBidXR0b25WYXJpYW50cyB9IGZyb20gXCIuL2J1dHRvblwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IERpYWxvZyA9IERpYWxvZ1ByaW1pdGl2ZTtcclxuZXhwb3J0IGNvbnN0IERpYWxvZ1RyaWdnZXIgPSBEaWFsb2dQcmltaXRpdmUuVHJpZ2dlcjtcclxuXHJcbnR5cGUgZGlhbG9nQ2xvc2VQcm9wczxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImJ1dHRvblwiPiA9IFBvbHltb3JwaGljUHJvcHM8XHJcbiAgVCxcclxuICBEaWFsb2dDbG9zZUJ1dHRvblByb3BzPFQ+XHJcbj47XHJcblxyXG5leHBvcnQgY29uc3QgRGlhbG9nQ2xvc2UgPSAocHJvcHM6IGRpYWxvZ0Nsb3NlUHJvcHMpID0+IHtcclxuICBjb25zdCBbbG9jYWwsIHJlc3RdID0gc3BsaXRQcm9wcyhwcm9wcywgW1wiY2xhc3NcIl0pO1xyXG4gIHJldHVybiAoXHJcbiAgICA8RGlhbG9nUHJpbWl0aXZlLkNsb3NlQnV0dG9uXHJcbiAgICAgIHsuLi5yZXN0fVxyXG4gICAgICBjbGFzcz17Y24oYnV0dG9uVmFyaWFudHMuZGVmYXVsdCwgbG9jYWwuY2xhc3MpfVxyXG4gICAgLz5cclxuICApO1xyXG59O1xyXG5leHBvcnQgY29uc3QgRGlhbG9nQ2xvc2VYID0gKCkgPT4gKFxyXG4gIDxEaWFsb2dQcmltaXRpdmUuQ2xvc2VCdXR0b24gY2xhc3M9XCJjbGlja2FibGUtaWNvbiBhYnNvbHV0ZSByaWdodC00IHRvcC00IHJvdW5kZWQtc20gcC0xIG9wYWNpdHktNzAgcmluZy1vZmZzZXQtYmFja2dyb3VuZCB0cmFuc2l0aW9uLVtvcGFjaXR5LGJveC1zaGFkb3ddIGhvdmVyOm9wYWNpdHktMTAwIGZvY3VzOm91dGxpbmUtbm9uZSBmb2N1czpyaW5nLVsxLjVweF0gZm9jdXM6cmluZy1zZWxlY3Rpb24gZm9jdXM6cmluZy1vZmZzZXQtMiBkaXNhYmxlZDpwb2ludGVyLWV2ZW50cy1ub25lXCI+XHJcbiAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgY2xhc3M9XCJoLTQgdy00XCI+XHJcbiAgICAgIDxwYXRoXHJcbiAgICAgICAgZmlsbD1cIm5vbmVcIlxyXG4gICAgICAgIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiXHJcbiAgICAgICAgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiXHJcbiAgICAgICAgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIlxyXG4gICAgICAgIHN0cm9rZS13aWR0aD1cIjJcIlxyXG4gICAgICAgIGQ9XCJNMTggNkw2IDE4TTYgNmwxMiAxMlwiXHJcbiAgICAgIC8+XHJcbiAgICAgIHsvKiA8dGl0bGU+Q2xvc2U8L3RpdGxlPiAqL31cclxuICAgIDwvc3ZnPlxyXG4gIDwvRGlhbG9nUHJpbWl0aXZlLkNsb3NlQnV0dG9uPlxyXG4pO1xyXG5cclxuLy8gb2JzaWRpYW4gbmF0aXZlbHkgZG9lc24ndCB1c2UgYW5pbWF0aW9ucyBmb3IgZGlhbG9nc1xyXG4vLyBidXQgSSBtaWdodCB3YW50IHRvIHVzZSB0aGlzIGF0IHNvbWUgcG9pbnRcclxuZXhwb3J0IGNvbnN0IGFuaW1hdGVPdmVybGF5Q2xhc3MgPVxyXG4gIFwiZGF0YS1bZXhwYW5kZWRdOmFuaW1hdGUtaW4gZGF0YS1bY2xvc2VkXTphbmltYXRlLW91dCBkYXRhLVtjbG9zZWRdOmZhZGUtb3V0LTAgZGF0YS1bZXhwYW5kZWRdOmZhZGUtaW4tMFwiO1xyXG5leHBvcnQgY29uc3QgYW5pbWF0ZUNvbnRlbnRDbGFzcyA9XHJcbiAgXCJkYXRhLVtjbG9zZWRdOmR1cmF0aW9uLTIwMCBkYXRhLVtleHBhbmRlZF06ZHVyYXRpb24tMjAwIGRhdGEtW2V4cGFuZGVkXTphbmltYXRlLWluIGRhdGEtW2Nsb3NlZF06YW5pbWF0ZS1vdXQgZGF0YS1bY2xvc2VkXTpmYWRlLW91dC0wIGRhdGEtW2V4cGFuZGVkXTpmYWRlLWluLTAgZGF0YS1bY2xvc2VkXTp6b29tLW91dC05NSBkYXRhLVtleHBhbmRlZF06em9vbS1pbi05NSBkYXRhLVtjbG9zZWRdOnNsaWRlLW91dC10by1sZWZ0LTEvMiBkYXRhLVtjbG9zZWRdOnNsaWRlLW91dC10by10b3AtWzQ4JV0gZGF0YS1bZXhwYW5kZWRdOnNsaWRlLWluLWZyb20tbGVmdC0xLzIgZGF0YS1bZXhwYW5kZWRdOnNsaWRlLWluLWZyb20tdG9wLVs0OCVdXCI7XHJcblxyXG50eXBlIGRpYWxvZ0NvbnRlbnRQcm9wczxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImRpdlwiPiA9IFBhcmVudFByb3BzPFxyXG4gIERpYWxvZ0NvbnRlbnRQcm9wczxUPiAmIHtcclxuICAgIGNsYXNzPzogc3RyaW5nO1xyXG4gIH1cclxuPjtcclxuXHJcbmV4cG9ydCBjb25zdCBEaWFsb2dDb250ZW50ID0gPFQgZXh0ZW5kcyBWYWxpZENvbXBvbmVudCA9IFwiZGl2XCI+KFxyXG4gIHByb3BzOiBQb2x5bW9ycGhpY1Byb3BzPFQsIGRpYWxvZ0NvbnRlbnRQcm9wczxUPj4sXHJcbikgPT4ge1xyXG4gIGNvbnN0IFtsb2NhbCwgcmVzdF0gPSBzcGxpdFByb3BzKHByb3BzIGFzIGRpYWxvZ0NvbnRlbnRQcm9wcywgW1xyXG4gICAgXCJjbGFzc1wiLFxyXG4gICAgXCJjaGlsZHJlblwiLFxyXG4gIF0pO1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPERpYWxvZ1ByaW1pdGl2ZS5Qb3J0YWw+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJ0d2Nzc1wiPlxyXG4gICAgICAgIDxEaWFsb2dQcmltaXRpdmUuT3ZlcmxheVxyXG4gICAgICAgICAgY2xhc3M9e2NuKFwibW9kYWwtYmcgei01MCBvcGFjaXR5LTg1XCIpfVxyXG4gICAgICAgICAgey4uLnJlc3R9XHJcbiAgICAgICAgLz5cclxuICAgICAgICA8RGlhbG9nUHJpbWl0aXZlLkNvbnRlbnRcclxuICAgICAgICAgIGNsYXNzPXtjbihcclxuICAgICAgICAgICAgXCJwcm9tcHQgbGVmdC0xLzIgei01MCB3LWZ1bGwgLXRyYW5zbGF0ZS14LTEvMiBnYXAtNCBib3JkZXItW2xlbmd0aDp2YXIoLS1wcm9tcHQtYm9yZGVyLXdpZHRoKV0gYm9yZGVyLW1vZGFsIHAtNlwiLFxyXG4gICAgICAgICAgICBsb2NhbC5jbGFzcyxcclxuICAgICAgICAgICl9XHJcbiAgICAgICAgICB7Li4ucmVzdH1cclxuICAgICAgICA+XHJcbiAgICAgICAgICB7bG9jYWwuY2hpbGRyZW59XHJcbiAgICAgICAgICA8RGlhbG9nQ2xvc2VYIC8+XHJcbiAgICAgICAgPC9EaWFsb2dQcmltaXRpdmUuQ29udGVudD5cclxuICAgICAgPC9kaXY+XHJcbiAgICA8L0RpYWxvZ1ByaW1pdGl2ZS5Qb3J0YWw+XHJcbiAgKTtcclxufTtcclxuXHJcbnR5cGUgZGlhbG9nVGl0bGVQcm9wczxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImgyXCI+ID0gRGlhbG9nVGl0bGVQcm9wczxUPiAmIHtcclxuICBjbGFzcz86IHN0cmluZztcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBEaWFsb2dUaXRsZSA9IDxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImgyXCI+KFxyXG4gIHByb3BzOiBQb2x5bW9ycGhpY1Byb3BzPFQsIGRpYWxvZ1RpdGxlUHJvcHM8VD4+LFxyXG4pID0+IHtcclxuICBjb25zdCBbbG9jYWwsIHJlc3RdID0gc3BsaXRQcm9wcyhwcm9wcyBhcyBkaWFsb2dUaXRsZVByb3BzLCBbXCJjbGFzc1wiXSk7XHJcblxyXG4gIHJldHVybiAoXHJcbiAgICA8RGlhbG9nUHJpbWl0aXZlLlRpdGxlXHJcbiAgICAgIGNsYXNzPXtjbihcInRleHQtZm9yZWdyb3VuZCB0ZXh0LWxnIGZvbnQtc2VtaWJvbGRcIiwgbG9jYWwuY2xhc3MpfVxyXG4gICAgICB7Li4ucmVzdH1cclxuICAgIC8+XHJcbiAgKTtcclxufTtcclxuXHJcbnR5cGUgZGlhbG9nRGVzY3JpcHRpb25Qcm9wczxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcInBcIj4gPVxyXG4gIERpYWxvZ0Rlc2NyaXB0aW9uUHJvcHM8VD4gJiB7XHJcbiAgICBjbGFzcz86IHN0cmluZztcclxuICB9O1xyXG5cclxuZXhwb3J0IGNvbnN0IERpYWxvZ0Rlc2NyaXB0aW9uID0gPFQgZXh0ZW5kcyBWYWxpZENvbXBvbmVudCA9IFwicFwiPihcclxuICBwcm9wczogUG9seW1vcnBoaWNQcm9wczxULCBkaWFsb2dEZXNjcmlwdGlvblByb3BzPFQ+PixcclxuKSA9PiB7XHJcbiAgY29uc3QgW2xvY2FsLCByZXN0XSA9IHNwbGl0UHJvcHMocHJvcHMgYXMgZGlhbG9nRGVzY3JpcHRpb25Qcm9wcywgW1wiY2xhc3NcIl0pO1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPERpYWxvZ1ByaW1pdGl2ZS5EZXNjcmlwdGlvblxyXG4gICAgICBjbGFzcz17Y24oXCJ0ZXh0LW11dGVkLWZvcmVncm91bmQgdGV4dC1zbVwiLCBsb2NhbC5jbGFzcyl9XHJcbiAgICAgIHsuLi5yZXN0fVxyXG4gICAgLz5cclxuICApO1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IERpYWxvZ0hlYWRlciA9IChwcm9wczogQ29tcG9uZW50UHJvcHM8XCJkaXZcIj4pID0+IHtcclxuICBjb25zdCBbbG9jYWwsIHJlc3RdID0gc3BsaXRQcm9wcyhwcm9wcywgW1wiY2xhc3NcIl0pO1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPGRpdlxyXG4gICAgICBjbGFzcz17Y24oXHJcbiAgICAgICAgXCJmbGV4IGZsZXgtY29sIHNwYWNlLXktMiB0ZXh0LWNlbnRlciBzbTp0ZXh0LWxlZnRcIixcclxuICAgICAgICBsb2NhbC5jbGFzcyxcclxuICAgICAgKX1cclxuICAgICAgey4uLnJlc3R9XHJcbiAgICAvPlxyXG4gICk7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgRGlhbG9nRm9vdGVyID0gKHByb3BzOiBDb21wb25lbnRQcm9wczxcImRpdlwiPikgPT4ge1xyXG4gIGNvbnN0IFtsb2NhbCwgcmVzdF0gPSBzcGxpdFByb3BzKHByb3BzLCBbXCJjbGFzc1wiXSk7XHJcblxyXG4gIHJldHVybiAoXHJcbiAgICA8ZGl2XHJcbiAgICAgIGNsYXNzPXtjbihcclxuICAgICAgICBcImZsZXggZmxleC1jb2wtcmV2ZXJzZSBzbTpmbGV4LXJvdyBzbTpqdXN0aWZ5LWVuZCBzbTpzcGFjZS14LTJcIixcclxuICAgICAgICBsb2NhbC5jbGFzcyxcclxuICAgICAgKX1cclxuICAgICAgey4uLnJlc3R9XHJcbiAgICAvPlxyXG4gICk7XHJcbn07XHJcbiIsImltcG9ydCB7IENvbXBvbmVudFByb3BzIH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcblxyXG5leHBvcnQgY29uc3QgRXh0ZXJuYWxMaW5rID0gKHByb3BzOiBDb21wb25lbnRQcm9wczxcImFcIj4pID0+IChcclxuICA8PlxyXG4gICAgPHNwYW4gY2xhc3M9XCJjbS1saW5rXCI+XHJcbiAgICAgIDxhIHsuLi5wcm9wc30gY2xhc3M9XCJ0ZXh0LWFjY2VudCB1bmRlcmxpbmUgaG92ZXI6dGV4dC1hY2NlbnQtaG92ZXJcIj48L2E+XHJcbiAgICA8L3NwYW4+XHJcbiAgICA8c3BhbiBjbGFzcz1cImV4dGVybmFsLWxpbmtcIj48L3NwYW4+XHJcbiAgPC8+XHJcbik7XHJcbiIsIi8qKlxuKiBAbGljZW5zZSBsdWNpZGUtc29saWQgdjAuNDEyLjAgLSBJU0NcbipcbiogVGhpcyBzb3VyY2UgY29kZSBpcyBsaWNlbnNlZCB1bmRlciB0aGUgSVNDIGxpY2Vuc2UuXG4qIFNlZSB0aGUgTElDRU5TRSBmaWxlIGluIHRoZSByb290IGRpcmVjdG9yeSBvZiB0aGlzIHNvdXJjZSB0cmVlLlxuKi9cblxuLy8gc3JjL2ljb25zL21pbnVzLnRzeFxuaW1wb3J0IEljb24gZnJvbSBcIi4uL0ljb25cIjtcbnZhciBpY29uTm9kZSA9IFtbXCJwYXRoXCIsIHsgZDogXCJNNSAxMmgxNFwiLCBrZXk6IFwiMWF5czBoXCIgfV1dO1xudmFyIE1pbnVzID0gKHByb3BzKSA9PiA8SWNvbiB7Li4ucHJvcHN9IG5hbWU9XCJNaW51c1wiIGljb25Ob2RlPXtpY29uTm9kZX0gLz47XG52YXIgbWludXNfZGVmYXVsdCA9IE1pbnVzO1xuZXhwb3J0IHtcbiAgbWludXNfZGVmYXVsdCBhcyBkZWZhdWx0XG59O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9bWludXMuanN4Lm1hcFxuIiwiLyoqXG4qIEBsaWNlbnNlIGx1Y2lkZS1zb2xpZCB2MC40MTIuMCAtIElTQ1xuKlxuKiBUaGlzIHNvdXJjZSBjb2RlIGlzIGxpY2Vuc2VkIHVuZGVyIHRoZSBJU0MgbGljZW5zZS5cbiogU2VlIHRoZSBMSUNFTlNFIGZpbGUgaW4gdGhlIHJvb3QgZGlyZWN0b3J5IG9mIHRoaXMgc291cmNlIHRyZWUuXG4qL1xuXG4vLyBzcmMvaWNvbnMvcGFyZW50aGVzZXMudHN4XG5pbXBvcnQgSWNvbiBmcm9tIFwiLi4vSWNvblwiO1xudmFyIGljb25Ob2RlID0gW1xuICBbXCJwYXRoXCIsIHsgZDogXCJNOCAyMXMtNC0zLTQtOSA0LTkgNC05XCIsIGtleTogXCJ1dG85dWRcIiB9XSxcbiAgW1wicGF0aFwiLCB7IGQ6IFwiTTE2IDNzNCAzIDQgOS00IDktNCA5XCIsIGtleTogXCI0dzJ2c3FcIiB9XVxuXTtcbnZhciBQYXJlbnRoZXNlcyA9IChwcm9wcykgPT4gPEljb24gey4uLnByb3BzfSBuYW1lPVwiUGFyZW50aGVzZXNcIiBpY29uTm9kZT17aWNvbk5vZGV9IC8+O1xudmFyIHBhcmVudGhlc2VzX2RlZmF1bHQgPSBQYXJlbnRoZXNlcztcbmV4cG9ydCB7XG4gIHBhcmVudGhlc2VzX2RlZmF1bHQgYXMgZGVmYXVsdFxufTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXBhcmVudGhlc2VzLmpzeC5tYXBcbiIsImltcG9ydCB7IHVwZGF0ZU1ldGFkYXRhUHJvcGVydHksIHRvTnVtYmVyIH0gZnJvbSBcIkAvbGliL3V0aWxcIjtcclxuaW1wb3J0IERhdGFFZGl0IGZyb20gXCJAL21haW5cIjtcclxuaW1wb3J0IHsgY3JlYXRlU2lnbmFsLCBTaG93IH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcbmltcG9ydCB7IFRhYmxlRGF0YUVkaXRQcm9wcywgVGFibGVEYXRhUHJvcHMgfSBmcm9tIFwiLi4vVGFibGUvVGFibGVEYXRhXCI7XHJcbmltcG9ydCB7XHJcbiAgRGlhbG9nLFxyXG4gIERpYWxvZ1RyaWdnZXIsXHJcbiAgRGlhbG9nQ29udGVudCxcclxuICBEaWFsb2dIZWFkZXIsXHJcbiAgRGlhbG9nVGl0bGUsXHJcbiAgRGlhbG9nRGVzY3JpcHRpb24sXHJcbiAgRGlhbG9nRm9vdGVyLFxyXG59IGZyb20gXCIuLi91aS9kaWFsb2dcIjtcclxuaW1wb3J0IHsgRXh0ZXJuYWxMaW5rIH0gZnJvbSBcIkAvY29tcG9uZW50cy91aS9leHRlcm5hbC1saW5rXCI7XHJcbmltcG9ydCBNaW51cyBmcm9tIFwibHVjaWRlLXNvbGlkL2ljb25zL01pbnVzXCI7XHJcbmltcG9ydCBQYXJlbnRoZXNlcyBmcm9tIFwibHVjaWRlLXNvbGlkL2ljb25zL1BhcmVudGhlc2VzXCI7XHJcbmltcG9ydCBQbHVzIGZyb20gXCJsdWNpZGUtc29saWQvaWNvbnMvUGx1c1wiO1xyXG5pbXBvcnQgeyBhdXRvZm9jdXMgfSBmcm9tIFwiQHNvbGlkLXByaW1pdGl2ZXMvYXV0b2ZvY3VzXCI7XHJcbi8vIFRvIHByZXZlbnQgdHJlZXNoYWtpbmdcclxuYXV0b2ZvY3VzO1xyXG5cclxuZXhwb3J0IGNvbnN0IE51bWJlcklucHV0ID0gKHByb3BzOiBUYWJsZURhdGFFZGl0UHJvcHMpID0+IHtcclxuICBjb25zdCBbc2l6ZSwgc2V0U2l6ZV0gPSBjcmVhdGVTaWduYWwocHJvcHMudmFsdWU/LnRvU3RyaW5nKCkubGVuZ3RoID8/IDUpO1xyXG4gIGNvbnN0IHsgcGx1Z2luIH0gPSBwcm9wcy5jb2RlQmxvY2tJbmZvO1xyXG4gIHJldHVybiAoXHJcbiAgICA8aW5wdXRcclxuICAgICAgdXNlOmF1dG9mb2N1c1xyXG4gICAgICBhdXRvZm9jdXNcclxuICAgICAgY2xhc3M9XCJoLWF1dG8gcm91bmRlZC1ub25lIGJvcmRlci1ub25lIGJnLXRyYW5zcGFyZW50IHAtMCAhc2hhZG93LW5vbmVcIlxyXG4gICAgICAvLyBzdHlsZT17eyBcImJveC1zaGFkb3dcIjogXCJub25lXCIgfX1cclxuICAgICAgc2l6ZT17c2l6ZSgpfVxyXG4gICAgICB0eXBlPVwibnVtYmVyXCJcclxuICAgICAgdmFsdWU9e3Byb3BzLnZhbHVlPy50b1N0cmluZygpID8/IFwiXCJ9XHJcbiAgICAgIG9uQmx1cj17YXN5bmMgKGUpID0+IHtcclxuICAgICAgICBhd2FpdCB1cGRhdGVNZXRhZGF0YVByb3BlcnR5KFxyXG4gICAgICAgICAgcHJvcHMucHJvcGVydHksXHJcbiAgICAgICAgICB0b051bWJlcihlLnRhcmdldC52YWx1ZSksXHJcbiAgICAgICAgICBwcm9wcy5maWxlUGF0aCxcclxuICAgICAgICAgIHBsdWdpbixcclxuICAgICAgICAgIHByb3BzLnZhbHVlLFxyXG4gICAgICAgICk7XHJcbiAgICAgICAgcHJvcHMuc2V0RWRpdGluZyhmYWxzZSk7XHJcbiAgICAgIH19XHJcbiAgICAgIG9uSW5wdXQ9eyhlKSA9PiB7XHJcbiAgICAgICAgc2V0U2l6ZShlLnRhcmdldC52YWx1ZS5sZW5ndGgpO1xyXG4gICAgICB9fVxyXG4gICAgLz5cclxuICApO1xyXG59O1xyXG5cclxudHlwZSBOdW1iZXJCdXR0b25zUHJvcHMgPSBUYWJsZURhdGFQcm9wczxudW1iZXI+ICYgeyBwbHVnaW46IERhdGFFZGl0IH07XHJcbmV4cG9ydCBjb25zdCBOdW1iZXJCdXR0b25zID0gKHByb3BzOiBOdW1iZXJCdXR0b25zUHJvcHMpID0+IChcclxuICA8ZGl2IGNsYXNzPVwiZmxleCB3LWZ1bGwgaXRlbXMtY2VudGVyIGdhcC0xXCI+XHJcbiAgICA8YnV0dG9uXHJcbiAgICAgIGNsYXNzPVwiY2xpY2thYmxlLWljb24gc2l6ZS1maXQgcC0xXCJcclxuICAgICAgb25DbGljaz17YXN5bmMgKGUpID0+IHtcclxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgYXdhaXQgdXBkYXRlTWV0YWRhdGFQcm9wZXJ0eShcclxuICAgICAgICAgIHByb3BzLnByb3BlcnR5LFxyXG4gICAgICAgICAgcHJvcHMudmFsdWUgLSAxLFxyXG4gICAgICAgICAgcHJvcHMuZmlsZVBhdGgsXHJcbiAgICAgICAgICBwcm9wcy5wbHVnaW4sXHJcbiAgICAgICAgICBwcm9wcy52YWx1ZSxcclxuICAgICAgICApO1xyXG4gICAgICB9fVxyXG4gICAgPlxyXG4gICAgICA8TWludXMgY2xhc3M9XCJwb2ludGVyLWV2ZW50cy1ub25lIHNpemUtM1wiIC8+XHJcbiAgICA8L2J1dHRvbj5cclxuICAgIDxOdW1iZXJFeHByZXNzaW9uQnV0dG9uIHsuLi5wcm9wc30gLz5cclxuICAgIDxidXR0b25cclxuICAgICAgY2xhc3M9XCJjbGlja2FibGUtaWNvbiBzaXplLWZpdCBwLTFcIlxyXG4gICAgICBvbkNsaWNrPXthc3luYyAoZSkgPT4ge1xyXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBhd2FpdCB1cGRhdGVNZXRhZGF0YVByb3BlcnR5KFxyXG4gICAgICAgICAgcHJvcHMucHJvcGVydHksXHJcbiAgICAgICAgICBwcm9wcy52YWx1ZSArIDEsXHJcbiAgICAgICAgICBwcm9wcy5maWxlUGF0aCxcclxuICAgICAgICAgIHByb3BzLnBsdWdpbixcclxuICAgICAgICAgIHByb3BzLnZhbHVlLFxyXG4gICAgICAgICk7XHJcbiAgICAgIH19XHJcbiAgICA+XHJcbiAgICAgIDxQbHVzIGNsYXNzPVwicG9pbnRlci1ldmVudHMtbm9uZSBzaXplLTNcIiAvPlxyXG4gICAgPC9idXR0b24+XHJcbiAgPC9kaXY+XHJcbik7XHJcblxyXG5jb25zdCBOdW1iZXJFeHByZXNzaW9uQnV0dG9uID0gKHByb3BzOiBOdW1iZXJCdXR0b25zUHJvcHMpID0+IHtcclxuICAvLyBjb25zdCB7XHJcbiAgLy8gICBkYXRhdmlld0FQSTogeyBldmFsdWF0ZSB9LFxyXG4gIC8vIH0gPSB1c2VEYXRhRWRpdCgpO1xyXG4gIGNvbnN0IFtpc09wZW4sIHNldE9wZW5dID0gY3JlYXRlU2lnbmFsKGZhbHNlKTtcclxuICBjb25zdCBbY2FsY3VsYXRlZCwgc2V0Q2FsY3VsYXRlZF0gPSBjcmVhdGVTaWduYWwoTnVtYmVyKHByb3BzLnZhbHVlKSk7XHJcblxyXG4gIGNvbnN0IHVwZGF0ZVByb3BlcnR5ID0gYXN5bmMgKHY6IG51bWJlcikgPT4ge1xyXG4gICAgYXdhaXQgdXBkYXRlTWV0YWRhdGFQcm9wZXJ0eShcclxuICAgICAgcHJvcHMucHJvcGVydHksXHJcbiAgICAgIHYsXHJcbiAgICAgIHByb3BzLmZpbGVQYXRoLFxyXG4gICAgICBwcm9wcy5wbHVnaW4sXHJcbiAgICAgIHByb3BzLnZhbHVlLFxyXG4gICAgKTtcclxuICB9O1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPERpYWxvZyBtb2RhbCBvcGVuPXtpc09wZW4oKX0gb25PcGVuQ2hhbmdlPXsoYikgPT4gc2V0T3BlbihiKX0+XHJcbiAgICAgIDxEaWFsb2dUcmlnZ2VyIGNsYXNzPVwiY2xpY2thYmxlLWljb24gc2l6ZS1maXQgcC0xXCI+XHJcbiAgICAgICAgPFBhcmVudGhlc2VzIGNsYXNzPVwicG9pbnRlci1ldmVudHMtbm9uZSBzaXplLTNcIiAvPlxyXG4gICAgICA8L0RpYWxvZ1RyaWdnZXI+XHJcbiAgICAgIDxEaWFsb2dDb250ZW50PlxyXG4gICAgICAgIDxEaWFsb2dIZWFkZXI+XHJcbiAgICAgICAgICA8RGlhbG9nVGl0bGU+VXBkYXRlIGJ5IGV4cHJlc3Npb248L0RpYWxvZ1RpdGxlPlxyXG4gICAgICAgICAgPERpYWxvZ0Rlc2NyaXB0aW9uPlxyXG4gICAgICAgICAgICBFbnRlciBhIHZhbGlke1wiIFwifVxyXG4gICAgICAgICAgICA8RXh0ZXJuYWxMaW5rIGhyZWY9XCJodHRwczovL2JsYWNrc21pdGhndS5naXRodWIuaW8vb2JzaWRpYW4tZGF0YXZpZXcvcmVmZXJlbmNlL2V4cHJlc3Npb25zL1wiPlxyXG4gICAgICAgICAgICAgIERhdGF2aWV3IG1hdGhlbWF0aWNhbCBleHByZXNzaW9uXHJcbiAgICAgICAgICAgIDwvRXh0ZXJuYWxMaW5rPlxyXG4gICAgICAgICAgICA8YnIgLz5cclxuICAgICAgICAgICAgWW91IGNhbiB1c2UgPGNvZGU+eDwvY29kZT4gYXMgdGhlIGN1cnJlbnQgdmFsdWUuXHJcbiAgICAgICAgICA8L0RpYWxvZ0Rlc2NyaXB0aW9uPlxyXG4gICAgICAgIDwvRGlhbG9nSGVhZGVyPlxyXG4gICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgdXNlOmF1dG9mb2N1c1xyXG4gICAgICAgICAgYXV0b2ZvY3VzXHJcbiAgICAgICAgICBjbGFzcz1cImJvcmRlci1ib3JkZXIgcHgtMVwiXHJcbiAgICAgICAgICB0eXBlPVwidGV4dFwiXHJcbiAgICAgICAgICBwbGFjZWhvbGRlcj1cInggKyAyIC8geCAqIDNcIlxyXG4gICAgICAgICAgb25LZXlEb3duPXthc3luYyAoZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIiAmJiAhTnVtYmVyLmlzTmFOKGNhbGN1bGF0ZWQoKSkpIHtcclxuICAgICAgICAgICAgICBhd2FpdCB1cGRhdGVQcm9wZXJ0eShjYWxjdWxhdGVkKCkpO1xyXG4gICAgICAgICAgICAgIHNldE9wZW4oZmFsc2UpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9fVxyXG4gICAgICAgICAgb25JbnB1dD17YXN5bmMgKGUpID0+IHtcclxuICAgICAgICAgICAgLyogXHJcbiAgICAgICAgICAgICAgICAgIFRPRE8gbWFrZSB0aGlzIGJldHRlclxyXG4gICAgICAgICAgICAgICAgICAtIGV2YWw6IHNvbGlkIGRvZXNuJ3QgbGlrZSBpdCB3aGVuIGludGVyb3BwZWQgd2l0aCBzaWduYWxzIGl0IHNlZW1zXHJcbiAgICAgICAgICAgICAgICAgIC0gbWF0aGpzOiBzb2xpZCBhbHNvIHNlZW1zIHRvIG5vdCBsaWtlIGl0J3MgZXZhbHVhdGUgZnVuY3Rpb24uIEl0IGFsc28gYWRkcyA1MDBrYiB0byB0aGUgYnVuZGxlIDovXHJcbiAgICAgICAgICAgICAgICAqL1xyXG4gICAgICAgICAgICBjb25zdCBleHAgPSBlLnRhcmdldC52YWx1ZVxyXG4gICAgICAgICAgICAgIC5yZXBsYWNlQWxsKFwieFwiLCBwcm9wcy52YWx1ZS50b1N0cmluZygpKVxyXG4gICAgICAgICAgICAgIC50cmltKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9XHJcbiAgICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvclxyXG4gICAgICAgICAgICAgIGF3YWl0IGFwcC5wbHVnaW5zLnBsdWdpbnMuZGF0YXZpZXcuYXBpLmV2YWx1YXRlKGV4cCk7XHJcblxyXG4gICAgICAgICAgICBzZXRDYWxjdWxhdGVkKCgpID0+IHtcclxuICAgICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3NmdWwpIHJldHVybiBOdW1iZXIocmVzdWx0LnZhbHVlKTtcclxuICAgICAgICAgICAgICByZXR1cm4gTmFOO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH19XHJcbiAgICAgICAgLz5cclxuICAgICAgICA8cD5cclxuICAgICAgICAgIDxzcGFuPkNhbGN1bGF0ZWQ6Jm5ic3A7PC9zcGFuPlxyXG4gICAgICAgICAgPFNob3dcclxuICAgICAgICAgICAgd2hlbj17TnVtYmVyLmlzTmFOKGNhbGN1bGF0ZWQoKSl9XHJcbiAgICAgICAgICAgIGZhbGxiYWNrPXs8c3BhbiBjbGFzcz1cInRleHQtc3VjY2Vzc1wiPntjYWxjdWxhdGVkKCl9PC9zcGFuPn1cclxuICAgICAgICAgID5cclxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0ZXh0LWVycm9yXCI+ZXJyb3I8L3NwYW4+XHJcbiAgICAgICAgICA8L1Nob3c+XHJcbiAgICAgICAgPC9wPlxyXG4gICAgICAgIDxEaWFsb2dGb290ZXI+XHJcbiAgICAgICAgICA8YnV0dG9uXHJcbiAgICAgICAgICAgIGNsYXNzPVwicm91bmRlZC1idXR0b24gYmctaW50ZXJhY3RpdmUtYWNjZW50IHAtYnV0dG9uIHRleHQtb24tYWNjZW50IGhvdmVyOmJnLWludGVyYWN0aXZlLWFjY2VudC1ob3ZlclwiXHJcbiAgICAgICAgICAgIGRpc2FibGVkPXtOdW1iZXIuaXNOYU4oY2FsY3VsYXRlZCgpKX1cclxuICAgICAgICAgICAgb25DbGljaz17YXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgIGF3YWl0IHVwZGF0ZVByb3BlcnR5KGNhbGN1bGF0ZWQoKSk7XHJcbiAgICAgICAgICAgICAgc2V0T3BlbihmYWxzZSk7XHJcbiAgICAgICAgICAgIH19XHJcbiAgICAgICAgICA+XHJcbiAgICAgICAgICAgIHVwZGF0ZVxyXG4gICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgPC9EaWFsb2dGb290ZXI+XHJcbiAgICAgIDwvRGlhbG9nQ29udGVudD5cclxuICAgIDwvRGlhbG9nPlxyXG4gICk7XHJcbn07XHJcbiIsImltcG9ydCB7IENvZGVCbG9ja0luZm8gfSBmcm9tIFwiQC9BcHBcIjtcclxuaW1wb3J0IHsgQ09NUExFWF9QUk9QRVJUWV9QTEFDRUhPTERFUiB9IGZyb20gXCJAL2xpYi9jb25zdGFudHNcIjtcclxuaW1wb3J0IHtcclxuICBEYXRhdmlld1Byb3BlcnR5VmFsdWUsXHJcbiAgRGF0YXZpZXdQcm9wZXJ0eVZhbHVlQXJyYXksXHJcbiAgUHJvcGVydHlWYWx1ZVR5cGUsXHJcbn0gZnJvbSBcIkAvbGliL3R5cGVzXCI7XHJcbmltcG9ydCB7XHJcbiAgY2hlY2tJZkRhdGVIYXNUaW1lLFxyXG4gIGdldFZhbHVlVHlwZSxcclxuICB0cnlEYXRhdmlld0xpbmtUb01hcmtkb3duLFxyXG59IGZyb20gXCJAL2xpYi91dGlsXCI7XHJcbmltcG9ydCB7IGNyZWF0ZVNpZ25hbCwgY3JlYXRlTWVtbywgU2hvdywgU2V0dGVyLCBKU1ggfSBmcm9tIFwic29saWQtanNcIjtcclxuaW1wb3J0IHsgTWFya2Rvd24gfSBmcm9tIFwiQC9jb21wb25lbnRzL01hcmtkb3duXCI7XHJcbmltcG9ydCB7IERhdGVUaW1lIH0gZnJvbSBcImx1eG9uXCI7XHJcbmltcG9ydCB7IENoZWNrYm94SW5wdXQgfSBmcm9tIFwiQC9jb21wb25lbnRzL0lucHV0cy9jaGVja2JveFwiO1xyXG5pbXBvcnQgeyBEYXRlRGF0ZXRpbWVJbnB1dCB9IGZyb20gXCJAL2NvbXBvbmVudHMvSW5wdXRzL2RhdGVkYXRldGltZVwiO1xyXG5pbXBvcnQgeyBMaXN0VGFibGVEYXRhV3JhcHBlciB9IGZyb20gXCJAL2NvbXBvbmVudHMvSW5wdXRzL2xpc3RcIjtcclxuaW1wb3J0IHsgTnVtYmVyQnV0dG9ucywgTnVtYmVySW5wdXQgfSBmcm9tIFwiQC9jb21wb25lbnRzL0lucHV0cy9udW1iZXJcIjtcclxuaW1wb3J0IHsgVGV4dElucHV0IH0gZnJvbSBcIkAvY29tcG9uZW50cy9JbnB1dHMvdGV4dFwiO1xyXG5pbXBvcnQgeyBOb3RpY2UgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuXHJcbmV4cG9ydCB0eXBlIFRhYmxlRGF0YVByb3BzPFQgPSBEYXRhdmlld1Byb3BlcnR5VmFsdWU+ID0ge1xyXG4gIHZhbHVlOiBUO1xyXG4gIGhlYWRlcjogc3RyaW5nO1xyXG4gIHByb3BlcnR5OiBzdHJpbmc7XHJcbiAgZmlsZVBhdGg6IHN0cmluZztcclxuICBzdHlsZTogc3RyaW5nIHwgSlNYLkNTU1Byb3BlcnRpZXMgfCB1bmRlZmluZWQ7XHJcbiAgb25Nb3VzZU1vdmU6IChlOiBNb3VzZUV2ZW50KSA9PiB2b2lkO1xyXG4gIGNvZGVCbG9ja0luZm86IENvZGVCbG9ja0luZm87XHJcbn07XHJcbmV4cG9ydCBjb25zdCBUYWJsZURhdGEgPSAocHJvcHM6IFRhYmxlRGF0YVByb3BzKSA9PiB7XHJcbiAgY29uc3QgW2lzRWRpdGluZywgc2V0RWRpdGluZ10gPSBjcmVhdGVTaWduYWwoZmFsc2UpO1xyXG4gIGNvbnN0IHtcclxuICAgIHBsdWdpbixcclxuICAgIGRhdGF2aWV3QVBJOiB7XHJcbiAgICAgIHNldHRpbmdzOiB7IHRhYmxlSWRDb2x1bW5OYW1lIH0sXHJcbiAgICAgIGx1eG9uLFxyXG4gICAgfSxcclxuICAgIGNvbmZpZyxcclxuICB9ID0gcHJvcHMuY29kZUJsb2NrSW5mbztcclxuICBjb25zdCB2YWx1ZVR5cGUgPSBjcmVhdGVNZW1vKCgpID0+IHtcclxuICAgIHJldHVybiBnZXRWYWx1ZVR5cGUocHJvcHMudmFsdWUsIHByb3BzLmhlYWRlciwgbHV4b24pO1xyXG4gIH0pO1xyXG4gIGNvbnN0IGlzRWRpdGFibGVQcm9wZXJ0eSA9IChwcm9wZXJ0eTogc3RyaW5nKSA9PiB7XHJcbiAgICAvLyBjb25zb2xlLmxvZyhcInByb3BlcnR5OiBcIiwgcHJvcGVydHkpO1xyXG4gICAgY29uc3Qgc3RyID0gKHByb3BlcnR5ID8/IFwiXCIpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBpZiAoc3RyID09PSBDT01QTEVYX1BST1BFUlRZX1BMQUNFSE9MREVSLnRvTG93ZXJDYXNlKCkpIHJldHVybiBmYWxzZTtcclxuICAgIGlmIChzdHIgPT09IHRhYmxlSWRDb2x1bW5OYW1lLnRvTG93ZXJDYXNlKCkpIHJldHVybiBmYWxzZTtcclxuICAgIGlmIChzdHIuaW5jbHVkZXMoXCJmaWxlLlwiKSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfTtcclxuICByZXR1cm4gKFxyXG4gICAgPHRkXHJcbiAgICAgIGNsYXNzPVwid2hpdGVzcGFjZS1ub3JtYWwgdGV4dC1ub3dyYXBcIlxyXG4gICAgICB0YWJJbmRleD17MH1cclxuICAgICAgb25DbGljaz17KGUpID0+IHtcclxuICAgICAgICAvLyBuZXcgTm90aWNlKGUudGFyZ2V0LnRhZ05hbWUpO1xyXG4gICAgICAgIC8vIGlmIG51bWJlciBidXR0b25zIGFyZSBjbGlja2VkXHJcbiAgICAgICAgaWYgKGUudGFyZ2V0LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gXCJidXR0b25cIikgcmV0dXJuO1xyXG4gICAgICAgIGlmICh2YWx1ZVR5cGUoKSA9PT0gXCJsaXN0XCIpIHJldHVybjtcclxuICAgICAgICBzZXRFZGl0aW5nKHRydWUpO1xyXG4gICAgICB9fVxyXG4gICAgICBvbk1vdXNlTW92ZT17cHJvcHMub25Nb3VzZU1vdmV9XHJcbiAgICAgIHN0eWxlPXtwcm9wcy5zdHlsZX1cclxuICAgID5cclxuICAgICAgPFNob3dcclxuICAgICAgICB3aGVuPXt2YWx1ZVR5cGUoKSAhPT0gXCJsaXN0XCJ9XHJcbiAgICAgICAgZmFsbGJhY2s9e1xyXG4gICAgICAgICAgPExpc3RUYWJsZURhdGFXcmFwcGVyXHJcbiAgICAgICAgICAgIHsuLi4ocHJvcHMgYXMgVGFibGVEYXRhUHJvcHM8RGF0YXZpZXdQcm9wZXJ0eVZhbHVlQXJyYXk+KX1cclxuICAgICAgICAgIC8+XHJcbiAgICAgICAgfVxyXG4gICAgICA+XHJcbiAgICAgICAgPFNob3dcclxuICAgICAgICAgIHdoZW49e1xyXG4gICAgICAgICAgICAhY29uZmlnLmxvY2tFZGl0aW5nICYmXHJcbiAgICAgICAgICAgIGlzRWRpdGluZygpICYmXHJcbiAgICAgICAgICAgIGlzRWRpdGFibGVQcm9wZXJ0eShwcm9wcy5wcm9wZXJ0eSlcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGZhbGxiYWNrPXtcclxuICAgICAgICAgICAgPGRpdlxyXG4gICAgICAgICAgICAgIG9uQ2xpY2s9e1xyXG4gICAgICAgICAgICAgICAgaXNFZGl0YWJsZVByb3BlcnR5KHByb3BzLnByb3BlcnR5KVxyXG4gICAgICAgICAgICAgICAgICA/IHVuZGVmaW5lZFxyXG4gICAgICAgICAgICAgICAgICA6IGNvbmZpZy5sb2NrRWRpdGluZ1xyXG4gICAgICAgICAgICAgICAgICAgID8gdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICAgICAgICAgOiAoKSA9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFwiVGhpcyBpcyBhIGNhbGN1bGF0ZWQgcHJvcGVydHksIHNvIHlvdSBjYW4ndCBlZGl0IGl0IVwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICApXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgPFRhYmxlRGF0YURpc3BsYXlcclxuICAgICAgICAgICAgICAgIHsuLi5wcm9wc31cclxuICAgICAgICAgICAgICAgIHNldEVkaXRpbmc9e3NldEVkaXRpbmd9XHJcbiAgICAgICAgICAgICAgICB2YWx1ZVR5cGU9e3ZhbHVlVHlwZSgpfVxyXG4gICAgICAgICAgICAgIC8+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgfVxyXG4gICAgICAgID5cclxuICAgICAgICAgIDxUYWJsZURhdGFFZGl0XHJcbiAgICAgICAgICAgIHsuLi5wcm9wc31cclxuICAgICAgICAgICAgc2V0RWRpdGluZz17c2V0RWRpdGluZ31cclxuICAgICAgICAgICAgdmFsdWVUeXBlPXt2YWx1ZVR5cGUoKX1cclxuICAgICAgICAgIC8+XHJcbiAgICAgICAgPC9TaG93PlxyXG4gICAgICAgIDxTaG93XHJcbiAgICAgICAgICB3aGVuPXtcclxuICAgICAgICAgICAgdmFsdWVUeXBlKCkgPT09IFwibnVtYmVyXCIgJiZcclxuICAgICAgICAgICAgaXNFZGl0YWJsZVByb3BlcnR5KHByb3BzLnByb3BlcnR5KSAmJlxyXG4gICAgICAgICAgICAhY29uZmlnLmxvY2tFZGl0aW5nXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgPlxyXG4gICAgICAgICAgPE51bWJlckJ1dHRvbnNcclxuICAgICAgICAgICAgey4uLihwcm9wcyBhcyBUYWJsZURhdGFQcm9wczxudW1iZXI+KX1cclxuICAgICAgICAgICAgcGx1Z2luPXtwbHVnaW59XHJcbiAgICAgICAgICAvPlxyXG4gICAgICAgIDwvU2hvdz5cclxuICAgICAgPC9TaG93PlxyXG4gICAgPC90ZD5cclxuICApO1xyXG59O1xyXG5cclxuZXhwb3J0IHR5cGUgVGFibGVEYXRhRGlzcGxheVByb3BzID0gVGFibGVEYXRhUHJvcHMgJiB7XHJcbiAgc2V0RWRpdGluZzogU2V0dGVyPGJvb2xlYW4+O1xyXG4gIHZhbHVlVHlwZTogUHJvcGVydHlWYWx1ZVR5cGU7XHJcbn07XHJcbmV4cG9ydCBjb25zdCBUYWJsZURhdGFEaXNwbGF5ID0gKHByb3BzOiBUYWJsZURhdGFEaXNwbGF5UHJvcHMpID0+IHtcclxuICBjb25zdCB7XHJcbiAgICBwbHVnaW4sXHJcbiAgICBjdHgsXHJcbiAgICBkYXRhdmlld0FQSToge1xyXG4gICAgICBzZXR0aW5nczogeyBkZWZhdWx0RGF0ZUZvcm1hdCwgZGVmYXVsdERhdGVUaW1lRm9ybWF0IH0sXHJcbiAgICB9LFxyXG4gIH0gPSBwcm9wcy5jb2RlQmxvY2tJbmZvO1xyXG4gIHJldHVybiAoXHJcbiAgICA8PlxyXG4gICAgICA8U2hvdyB3aGVuPXtwcm9wcy52YWx1ZVR5cGUgPT09IFwidGV4dFwiIHx8IHByb3BzLnZhbHVlVHlwZSA9PT0gXCJudW1iZXJcIn0+XHJcbiAgICAgICAgPE1hcmtkb3duXHJcbiAgICAgICAgICBjbGFzcz1cInNpemUtZnVsbFwiXHJcbiAgICAgICAgICBhcHA9e3BsdWdpbi5hcHB9XHJcbiAgICAgICAgICBtYXJrZG93bj17dHJ5RGF0YXZpZXdMaW5rVG9NYXJrZG93bihwcm9wcy52YWx1ZSl9XHJcbiAgICAgICAgICBzb3VyY2VQYXRoPXtjdHguc291cmNlUGF0aH1cclxuICAgICAgICAvPlxyXG4gICAgICA8L1Nob3c+XHJcbiAgICAgIDxTaG93IHdoZW49e3Byb3BzLnZhbHVlVHlwZSA9PT0gXCJjaGVja2JveFwifT5cclxuICAgICAgICA8Q2hlY2tib3hJbnB1dCB7Li4ucHJvcHN9IC8+XHJcbiAgICAgIDwvU2hvdz5cclxuICAgICAgPFNob3cgd2hlbj17cHJvcHMudmFsdWVUeXBlID09PSBcImRhdGVcIiB8fCBwcm9wcy52YWx1ZVR5cGUgPT09IFwiZGF0ZXRpbWVcIn0+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInNpemUtZnVsbFwiPlxyXG4gICAgICAgICAgeyhwcm9wcy52YWx1ZSBhcyBEYXRlVGltZSkudG9Gb3JtYXQoXHJcbiAgICAgICAgICAgIGNoZWNrSWZEYXRlSGFzVGltZShwcm9wcy52YWx1ZSBhcyBEYXRlVGltZSlcclxuICAgICAgICAgICAgICA/IGRlZmF1bHREYXRlVGltZUZvcm1hdFxyXG4gICAgICAgICAgICAgIDogZGVmYXVsdERhdGVGb3JtYXQsXHJcbiAgICAgICAgICApfVxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICA8L1Nob3c+XHJcbiAgICA8Lz5cclxuICApO1xyXG59O1xyXG5cclxuZXhwb3J0IHR5cGUgVGFibGVEYXRhRWRpdFByb3BzPFQgPSB1bmtub3duPiA9IFRhYmxlRGF0YVByb3BzPFQ+ICYge1xyXG4gIHNldEVkaXRpbmc6IFNldHRlcjxib29sZWFuPjtcclxuICB2YWx1ZVR5cGU6IFByb3BlcnR5VmFsdWVUeXBlO1xyXG59O1xyXG5leHBvcnQgY29uc3QgVGFibGVEYXRhRWRpdCA9IChwcm9wczogVGFibGVEYXRhRWRpdFByb3BzKSA9PiB7XHJcbiAgLy8gcmV0dXJuIDxUZXh0SW5wdXQgey4uLnByb3BzfSAvPjtcclxuXHJcbiAgcmV0dXJuIChcclxuICAgIDw+XHJcbiAgICAgIDxTaG93IHdoZW49e3Byb3BzLnZhbHVlVHlwZSA9PT0gXCJ0ZXh0XCJ9PlxyXG4gICAgICAgIDxUZXh0SW5wdXQgey4uLnByb3BzfSAvPlxyXG4gICAgICA8L1Nob3c+XHJcbiAgICAgIDxTaG93IHdoZW49e3Byb3BzLnZhbHVlVHlwZSA9PT0gXCJudW1iZXJcIn0+XHJcbiAgICAgICAgPE51bWJlcklucHV0IHsuLi5wcm9wc30gLz5cclxuICAgICAgPC9TaG93PlxyXG4gICAgICA8U2hvdyB3aGVuPXtwcm9wcy52YWx1ZVR5cGUgPT09IFwiZGF0ZVwiIHx8IHByb3BzLnZhbHVlVHlwZSA9PT0gXCJkYXRldGltZVwifT5cclxuICAgICAgICA8RGF0ZURhdGV0aW1lSW5wdXQgey4uLihwcm9wcyBhcyBUYWJsZURhdGFFZGl0UHJvcHM8RGF0ZVRpbWU+KX0gLz5cclxuICAgICAgPC9TaG93PlxyXG4gICAgPC8+XHJcbiAgKTtcclxufTtcclxuIiwiaW1wb3J0IHsgQ29kZUJsb2NrSW5mbyB9IGZyb20gXCJAL0FwcFwiO1xyXG5pbXBvcnQge1xyXG4gIERhdGF2aWV3UXVlcnlSZXN1bHRIZWFkZXJzLFxyXG4gIERhdGF2aWV3UXVlcnlSZXN1bHRWYWx1ZXMsXHJcbiAgRGF0YXZpZXdMaW5rLFxyXG59IGZyb20gXCJAL2xpYi90eXBlc1wiO1xyXG5pbXBvcnQgeyBnZXRJZENvbHVtbkluZGV4IH0gZnJvbSBcIkAvbGliL3V0aWxcIjtcclxuaW1wb3J0IHsgRm9yLCBTZXR0ZXIgfSBmcm9tIFwic29saWQtanNcIjtcclxuaW1wb3J0IHsgVGFibGVEYXRhIH0gZnJvbSBcIi4uL1RhYmxlRGF0YVwiO1xyXG5cclxuY29uc3QgaGlnaGxpZ2h0U3R5bGUgPSB7XHJcbiAgXCJib3JkZXItbGVmdC13aWR0aFwiOiBcIjJweFwiLFxyXG4gIFwiYm9yZGVyLXJpZ2h0LXdpZHRoXCI6IFwiMnB4XCIsXHJcbiAgXCJib3JkZXItbGVmdC1jb2xvclwiOiBcImhzbCh2YXIoLS1hY2NlbnQtaCkgdmFyKC0tYWNjZW50LXMpIHZhcigtLWFjY2VudC1sKSlcIixcclxuICBcImJvcmRlci1yaWdodC1jb2xvclwiOiBcImhzbCh2YXIoLS1hY2NlbnQtaCkgdmFyKC0tYWNjZW50LXMpIHZhcigtLWFjY2VudC1sKSlcIixcclxuICBcImJhY2tncm91bmQtY29sb3JcIjogYGhzbCh2YXIoLS1hY2NlbnQtaCkgdmFyKC0tYWNjZW50LXMpIHZhcigtLWFjY2VudC1sKSAvIDEwJSlgLFxyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IGRyYWdnZWRPdmVyUmlnaHQgPSB7XHJcbiAgXCJib3JkZXItcmlnaHQtd2lkdGhcIjogXCIycHhcIixcclxuICBcImJvcmRlci1yaWdodC1jb2xvclwiOiBcImhzbCh2YXIoLS1hY2NlbnQtaCkgdmFyKC0tYWNjZW50LXMpIHZhcigtLWFjY2VudC1sKSlcIixcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBkcmFnZ2VkT3ZlckxlZnQgPSB7XHJcbiAgXCJib3JkZXItbGVmdC13aWR0aFwiOiBcIjJweFwiLFxyXG4gIFwiYm9yZGVyLWxlZnQtY29sb3JcIjogXCJoc2wodmFyKC0tYWNjZW50LWgpIHZhcigtLWFjY2VudC1zKSB2YXIoLS1hY2NlbnQtbCkpXCIsXHJcbn07XHJcblxyXG5jb25zdCBsYXN0Q2VsbEhpZ2hsaWdodCA9IHtcclxuICBcImJvcmRlci1ib3R0b20td2lkdGhcIjogXCIycHhcIixcclxuICBcImJvcmRlci1ib3R0b20tY29sb3JcIjogXCJoc2wodmFyKC0tYWNjZW50LWgpIHZhcigtLWFjY2VudC1zKSB2YXIoLS1hY2NlbnQtbCkpXCIsXHJcbn07XHJcblxyXG50eXBlIFRhYmxlQm9keVByb3BzID0ge1xyXG4gIGhlYWRlcnM6IERhdGF2aWV3UXVlcnlSZXN1bHRIZWFkZXJzO1xyXG4gIHByb3BlcnRpZXM6IHN0cmluZ1tdO1xyXG4gIHJvd3M6IERhdGF2aWV3UXVlcnlSZXN1bHRWYWx1ZXM7XHJcbiAgaGlnaGxpZ2h0SW5kZXg6IG51bWJlcjtcclxuICBzZXRIaWdobGlnaHRJbmRleDogU2V0dGVyPG51bWJlcj47XHJcbiAgZHJhZ2dlZE92ZXJJbmRleDogbnVtYmVyO1xyXG4gIHNldERyYWdnZWRPdmVySW5kZXg6IFNldHRlcjxudW1iZXI+O1xyXG4gIGNvZGVCbG9ja0luZm86IENvZGVCbG9ja0luZm87XHJcbn07XHJcbmV4cG9ydCBjb25zdCBUYWJsZUJvZHkgPSAocHJvcHM6IFRhYmxlQm9keVByb3BzKSA9PiB7XHJcbiAgY29uc3Qge1xyXG4gICAgZGF0YXZpZXdBUEk6IHtcclxuICAgICAgc2V0dGluZ3M6IHsgdGFibGVJZENvbHVtbk5hbWUgfSxcclxuICAgIH0sXHJcbiAgfSA9IHByb3BzLmNvZGVCbG9ja0luZm87XHJcblxyXG4gIHJldHVybiAoXHJcbiAgICA8dGJvZHk+XHJcbiAgICAgIDxGb3IgZWFjaD17cHJvcHMucm93c30+XHJcbiAgICAgICAgeyhyb3csIHJvd0luZGV4KSA9PiAoXHJcbiAgICAgICAgICA8dHI+XHJcbiAgICAgICAgICAgIDxGb3IgZWFjaD17cm93fT5cclxuICAgICAgICAgICAgICB7KHZhbHVlLCB2YWx1ZUluZGV4KSA9PiAoXHJcbiAgICAgICAgICAgICAgICA8VGFibGVEYXRhXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlPXt2YWx1ZX1cclxuICAgICAgICAgICAgICAgICAgaGVhZGVyPXtwcm9wcy5oZWFkZXJzW3ZhbHVlSW5kZXgoKV19XHJcbiAgICAgICAgICAgICAgICAgIHByb3BlcnR5PXtwcm9wcy5wcm9wZXJ0aWVzW3ZhbHVlSW5kZXgoKV19XHJcbiAgICAgICAgICAgICAgICAgIGZpbGVQYXRoPXtcclxuICAgICAgICAgICAgICAgICAgICAoXHJcbiAgICAgICAgICAgICAgICAgICAgICByb3dbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGdldElkQ29sdW1uSW5kZXgocHJvcHMuaGVhZGVycywgdGFibGVJZENvbHVtbk5hbWUpXHJcbiAgICAgICAgICAgICAgICAgICAgICBdIGFzIERhdGF2aWV3TGlua1xyXG4gICAgICAgICAgICAgICAgICAgICkucGF0aCA/PyBcIlwiXHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgb25Nb3VzZU1vdmU9eygpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAocHJvcHMuaGlnaGxpZ2h0SW5kZXggPT09IC0xKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgcHJvcHMuc2V0RHJhZ2dlZE92ZXJJbmRleCh2YWx1ZUluZGV4KCkpO1xyXG4gICAgICAgICAgICAgICAgICB9fVxyXG4gICAgICAgICAgICAgICAgICBzdHlsZT17XHJcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVJbmRleCgpID09PSBwcm9wcy5oaWdobGlnaHRJbmRleFxyXG4gICAgICAgICAgICAgICAgICAgICAgPyByb3dJbmRleCgpID09PSBwcm9wcy5yb3dzLmxlbmd0aCAtIDFcclxuICAgICAgICAgICAgICAgICAgICAgICAgPyB7IC4uLmhpZ2hsaWdodFN0eWxlLCAuLi5sYXN0Q2VsbEhpZ2hsaWdodCB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDogaGlnaGxpZ2h0U3R5bGVcclxuICAgICAgICAgICAgICAgICAgICAgIDogdmFsdWVJbmRleCgpID09PSBwcm9wcy5kcmFnZ2VkT3ZlckluZGV4XHJcbiAgICAgICAgICAgICAgICAgICAgICAgID8gcHJvcHMuaGlnaGxpZ2h0SW5kZXggPCB2YWx1ZUluZGV4KClcclxuICAgICAgICAgICAgICAgICAgICAgICAgICA/IGRyYWdnZWRPdmVyUmlnaHRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICA6IGRyYWdnZWRPdmVyTGVmdFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA6IHt9XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgY29kZUJsb2NrSW5mbz17cHJvcHMuY29kZUJsb2NrSW5mb31cclxuICAgICAgICAgICAgICAgIC8+XHJcbiAgICAgICAgICAgICAgKX1cclxuICAgICAgICAgICAgPC9Gb3I+XHJcbiAgICAgICAgICA8L3RyPlxyXG4gICAgICAgICl9XHJcbiAgICAgIDwvRm9yPlxyXG4gICAgPC90Ym9keT5cclxuICApO1xyXG59O1xyXG4iLCIvKipcbiogQGxpY2Vuc2UgbHVjaWRlLXNvbGlkIHYwLjQxMi4wIC0gSVNDXG4qXG4qIFRoaXMgc291cmNlIGNvZGUgaXMgbGljZW5zZWQgdW5kZXIgdGhlIElTQyBsaWNlbnNlLlxuKiBTZWUgdGhlIExJQ0VOU0UgZmlsZSBpbiB0aGUgcm9vdCBkaXJlY3Rvcnkgb2YgdGhpcyBzb3VyY2UgdHJlZS5cbiovXG5cbi8vIHNyYy9pY29ucy9ncmlwLWhvcml6b250YWwudHN4XG5pbXBvcnQgSWNvbiBmcm9tIFwiLi4vSWNvblwiO1xudmFyIGljb25Ob2RlID0gW1xuICBbXCJjaXJjbGVcIiwgeyBjeDogXCIxMlwiLCBjeTogXCI5XCIsIHI6IFwiMVwiLCBrZXk6IFwiMTI0bXR5XCIgfV0sXG4gIFtcImNpcmNsZVwiLCB7IGN4OiBcIjE5XCIsIGN5OiBcIjlcIiwgcjogXCIxXCIsIGtleTogXCIxcnV6bzJcIiB9XSxcbiAgW1wiY2lyY2xlXCIsIHsgY3g6IFwiNVwiLCBjeTogXCI5XCIsIHI6IFwiMVwiLCBrZXk6IFwiMWE4YjI4XCIgfV0sXG4gIFtcImNpcmNsZVwiLCB7IGN4OiBcIjEyXCIsIGN5OiBcIjE1XCIsIHI6IFwiMVwiLCBrZXk6IFwiMWU1NnhnXCIgfV0sXG4gIFtcImNpcmNsZVwiLCB7IGN4OiBcIjE5XCIsIGN5OiBcIjE1XCIsIHI6IFwiMVwiLCBrZXk6IFwiMWE5MmVwXCIgfV0sXG4gIFtcImNpcmNsZVwiLCB7IGN4OiBcIjVcIiwgY3k6IFwiMTVcIiwgcjogXCIxXCIsIGtleTogXCI1cjFqd3lcIiB9XVxuXTtcbnZhciBHcmlwSG9yaXpvbnRhbCA9IChwcm9wcykgPT4gPEljb24gey4uLnByb3BzfSBuYW1lPVwiR3JpcEhvcml6b250YWxcIiBpY29uTm9kZT17aWNvbk5vZGV9IC8+O1xudmFyIGdyaXBfaG9yaXpvbnRhbF9kZWZhdWx0ID0gR3JpcEhvcml6b250YWw7XG5leHBvcnQge1xuICBncmlwX2hvcml6b250YWxfZGVmYXVsdCBhcyBkZWZhdWx0XG59O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9Z3JpcC1ob3Jpem9udGFsLmpzeC5tYXBcbiIsImltcG9ydCB7IE1hcmtkb3duIH0gZnJvbSBcIkAvY29tcG9uZW50cy9NYXJrZG93blwiO1xyXG5pbXBvcnQgeyBDb2RlQmxvY2tJbmZvLCB1c2VEYXRhRWRpdCB9IGZyb20gXCJAL0FwcFwiO1xyXG5pbXBvcnQgeyBEYXRhdmlld1F1ZXJ5UmVzdWx0SGVhZGVycyB9IGZyb20gXCJAL2xpYi90eXBlc1wiO1xyXG5pbXBvcnQgeyBjcmVhdGVTaWduYWwsIEZvciwgb25DbGVhbnVwLCBTZXR0ZXIgfSBmcm9tIFwic29saWQtanNcIjtcclxuaW1wb3J0IEdyaXBIb3Jpem9udGFsIGZyb20gXCJsdWNpZGUtc29saWQvaWNvbnMvR3JpcC1ob3Jpem9udGFsXCI7XHJcbmltcG9ydCB7IGRyYWdnZWRPdmVyTGVmdCwgZHJhZ2dlZE92ZXJSaWdodCB9IGZyb20gXCIuLi9UYWJsZUJvZHlcIjtcclxuaW1wb3J0IHsgZ2V0VGFibGVMaW5lIH0gZnJvbSBcIkAvbGliL3V0aWxcIjtcclxuXHJcbmV4cG9ydCB0eXBlIFRhYmxlSGVhZFByb3BzID0ge1xyXG4gIGhlYWRlcnM6IERhdGF2aWV3UXVlcnlSZXN1bHRIZWFkZXJzO1xyXG4gIHByb3BlcnRpZXM6IHN0cmluZ1tdO1xyXG4gIGhpZ2hsaWdodEluZGV4OiBudW1iZXI7XHJcbiAgc2V0SGlnaGxpZ2h0SW5kZXg6IFNldHRlcjxudW1iZXI+O1xyXG4gIGRyYWdnZWRPdmVySW5kZXg6IG51bWJlcjtcclxuICBzZXREcmFnZ2VkT3ZlckluZGV4OiBTZXR0ZXI8bnVtYmVyPjtcclxuICBjb2RlQmxvY2tJbmZvOiBDb2RlQmxvY2tJbmZvO1xyXG59O1xyXG5leHBvcnQgY29uc3QgVGFibGVIZWFkID0gKHByb3BzOiBUYWJsZUhlYWRQcm9wcykgPT4ge1xyXG4gIGNvbnN0IFt0cmFuc2xhdGVYLCBzZXRUcmFuc2xhdGVYXSA9IGNyZWF0ZVNpZ25hbCgwKTtcclxuICBsZXQgbGFzdE1vdXNlUG9zID0gMDtcclxuXHJcbiAgY29uc3Qgb25Nb3VzZU1vdmUgPSAoZTogTW91c2VFdmVudCkgPT4ge1xyXG4gICAgLy8gY29uc29sZS5sb2coXCJtb3VzZSBtb3ZlIGNhbGxlZFwiKTtcclxuICAgIGlmIChwcm9wcy5oaWdobGlnaHRJbmRleCA9PT0gLTEpIHJldHVybjtcclxuICAgIHNldFRyYW5zbGF0ZVgoKCkgPT4gZS5jbGllbnRYIC0gbGFzdE1vdXNlUG9zKTtcclxuICB9O1xyXG5cclxuICBjb25zdCBvbk1vdXNlVXAgPSBhc3luYyAoKSA9PiB7XHJcbiAgICAvLyBpZiBkcmFnZ2VkIG92ZXIgYSBjb2x1bW4gb3RoZXIgdGhhbiB0aGUgaGlnaGxpZ2h0ZWQgKGRyYWdnaW5nKSBvbmVcclxuICAgIGlmIChcclxuICAgICAgcHJvcHMuZHJhZ2dlZE92ZXJJbmRleCAhPT0gLTEgJiZcclxuICAgICAgcHJvcHMuZHJhZ2dlZE92ZXJJbmRleCAhPT0gcHJvcHMuaGlnaGxpZ2h0SW5kZXhcclxuICAgICkge1xyXG4gICAgICBjb25zdCB7XHJcbiAgICAgICAgcGx1Z2luLFxyXG4gICAgICAgIGN0eCxcclxuICAgICAgICBlbCxcclxuICAgICAgICBxdWVyeSxcclxuICAgICAgICBkYXRhdmlld0FQSToge1xyXG4gICAgICAgICAgc2V0dGluZ3M6IHsgdGFibGVJZENvbHVtbk5hbWUgfSxcclxuICAgICAgICB9LFxyXG4gICAgICB9ID0gcHJvcHMuY29kZUJsb2NrSW5mbztcclxuICAgICAgY29uc3Qge1xyXG4gICAgICAgIGFwcDogeyB2YXVsdCB9LFxyXG4gICAgICB9ID0gcGx1Z2luO1xyXG4gICAgICBjb25zdCBzZWN0aW9uSW5mbyA9IGN0eC5nZXRTZWN0aW9uSW5mbyhlbCk7XHJcbiAgICAgIC8vIHlvdSBzaG91bGRuJ3QgYmUgYWJsZSB0byBnZXQgdG8gdGhpcyBwb2ludCBpZiBpdCdzIG51bGxcclxuICAgICAgaWYgKCFzZWN0aW9uSW5mbykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoaXMgc2hvdWxkIGJlIGltcG9zc2libGVcIik7XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgeyBsaW5lU3RhcnQsIHRleHQ6IGNvbnRlbnQgfSA9IHNlY3Rpb25JbmZvO1xyXG4gICAgICBjb25zdCBmaWxlID0gdmF1bHQuZ2V0RmlsZUJ5UGF0aChjdHguc291cmNlUGF0aCk7XHJcbiAgICAgIC8vIHlvdSBzaG91bGRuJ3QgYmUgYWJsZSB0byBnZXQgdG8gdGhpcyBwb2ludCBpZiBpdCdzIG51bGxcclxuICAgICAgaWYgKCFmaWxlKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhpcyBzaG91bGQgYmUgaW1wb3NzaWJsZVwiKTtcclxuICAgICAgfVxyXG4gICAgICBjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoXCJcXG5cIik7XHJcbiAgICAgIGNvbnN0IHsgbGluZTogcHJlVGFibGVMaW5lLCBpbmRleCB9ID0gZ2V0VGFibGVMaW5lKHF1ZXJ5KTtcclxuICAgICAgLy8gaW5kZXggaXMgcmVsYXRpdmUgdG8gdGhlIHByb3ZpZGVkIHNvdXJjZSwgc28gdGhpcyBvZmZzZXRzIHRvIGFuIGluZGV4IG9mIHRoZSB3aG9sZSBub3RlXHJcbiAgICAgIC8vIGFkZCBvbmUgYmVjYXVzZSBgc291cmNlYCBkb2Vzbid0IGluY2x1ZGUgYmFja3RpY2tzLCBidXQgbGluZVN0YXJ0IGlzIHRoZSBmaXJzdCBiYWNrdGlja3NcclxuICAgICAgY29uc3QgdGFibGVMaW5lSW5kZXggPSBsaW5lU3RhcnQgKyBpbmRleCArIDE7XHJcbiAgICAgIGNvbnN0IGlzV2l0aG91dElkID0gbmV3IFJlZ0V4cCgvVEFCTEVcXHMrV0lUSE9VVFxccytJRC9naW0pLnRlc3QoXHJcbiAgICAgICAgcHJlVGFibGVMaW5lLFxyXG4gICAgICApO1xyXG4gICAgICBjb25zdCBpc0RyYWdnaW5nRGVmYXVsdElkID1cclxuICAgICAgICAvLyBpZiBxdWVyeSBoYXMgJ1dJVEhPVVQgSUQnIHdlIGRvbid0IGNhcmVcclxuICAgICAgICAhaXNXaXRob3V0SWQgJiZcclxuICAgICAgICAvLyBkZWZhdWx0IGlkIGNvbCBpcyBhbHdheXMgZmlyc3RcclxuICAgICAgICBwcm9wcy5oaWdobGlnaHRJbmRleCA9PT0gMCAmJlxyXG4gICAgICAgIC8vIHRoZSBoZWFkZXIgd2lsbCBhbHdheXMgYmUgdGhlIG5hbWUgZnJvbSBkYXRhdmlldyBzZXR0aW5nc1xyXG4gICAgICAgIHByb3BzLmhlYWRlcnNbcHJvcHMuaGlnaGxpZ2h0SW5kZXhdID09PSB0YWJsZUlkQ29sdW1uTmFtZTtcclxuICAgICAgLy8gbmVlZCB0byBjaGVjayBzZXBhcmF0ZWx5IGZvciBkcmFnZ2VkIG92ZXIgYmVjYXVzZSBpdCB3aWxsIGNoYW5nZSBob3cgd2UgYWRqdXN0IHRoZSBoZWFkZXJzXHJcbiAgICAgIGNvbnN0IGlzRHJhZ2dlZE92ZXJEZWZhdWx0SWQgPVxyXG4gICAgICAgICFpc1dpdGhvdXRJZCAmJlxyXG4gICAgICAgIHByb3BzLmRyYWdnZWRPdmVySW5kZXggPT09IDAgJiZcclxuICAgICAgICBwcm9wcy5oZWFkZXJzW3Byb3BzLmRyYWdnZWRPdmVySW5kZXhdID09PSB0YWJsZUlkQ29sdW1uTmFtZTtcclxuICAgICAgY29uc3QgaXNSZWxhdGluZ1RvRGVmYXVsdElkID1cclxuICAgICAgICBpc0RyYWdnaW5nRGVmYXVsdElkIHx8IGlzRHJhZ2dlZE92ZXJEZWZhdWx0SWQ7XHJcbiAgICAgIGNvbnN0IHRhYmxlTGluZSA9IGlzUmVsYXRpbmdUb0RlZmF1bHRJZFxyXG4gICAgICAgID8gLy8gdG8gJ21vdmUnIHRoZSBkZWZhdWx0IGlkIGNvbCwgd2UgaGF2ZSB0byBtb2RpZnkgdGhlIHF1ZXJ5IHRvIGhhdmUgdGhpcyBhbmQgYSBmaWxlLmxpbmsgY29sXHJcbiAgICAgICAgICBwcmVUYWJsZUxpbmUucmVwbGFjZSgvdGFibGUvaSwgXCJUQUJMRSBXSVRIT1VUIElEXCIpXHJcbiAgICAgICAgOiBwcmVUYWJsZUxpbmU7XHJcbiAgICAgIC8vIFRBQkxFIHZzIFRBQkxFIFdJVEhPVVQgSURcclxuICAgICAgY29uc3QgdGFibGVLZXl3b3JkID0gdGFibGVMaW5lXHJcbiAgICAgICAgLnNsaWNlKDAsIGlzV2l0aG91dElkIHx8IGlzUmVsYXRpbmdUb0RlZmF1bHRJZCA/IDE2IDogNSlcclxuICAgICAgICAudHJpbSgpO1xyXG4gICAgICBjb25zdCBwcmVDb2xzID0gdGFibGVMaW5lXHJcbiAgICAgICAgLnNsaWNlKGlzV2l0aG91dElkIHx8IGlzUmVsYXRpbmdUb0RlZmF1bHRJZCA/IDE3IDogNilcclxuICAgICAgICAvLyBzcGxpdCBvbiBjb21tYSB1bmxlc3Mgc3Vycm91bmRlZCBieSBkb3VibGUgcXVvdGVzXHJcbiAgICAgICAgLnNwbGl0KC8sKD89KD86KD86W15cIl0qXCIpezJ9KSpbXlwiXSokKS8pXHJcbiAgICAgICAgLm1hcCgoYykgPT4gYy50cmltKCkpO1xyXG4gICAgICBjb25zdCBjb2xzID0gaXNSZWxhdGluZ1RvRGVmYXVsdElkXHJcbiAgICAgICAgPyAvLyB0aGlzIGlzIGhvdyB3ZSBhbGxvdyB0aGUgZGVmYXVsdCBpZCBjb2wgdG8gYmUgJ21vdmVkJ1xyXG4gICAgICAgICAgW1wiZmlsZS5saW5rIEFTIFwiICsgdGFibGVJZENvbHVtbk5hbWUsIC4uLnByZUNvbHNdXHJcbiAgICAgICAgOiBwcmVDb2xzO1xyXG4gICAgICAvLyBuZWVkIHRvIG9mZnNldCBib3RoIGJ5IDEgYmVjYXVzZSBpZiBxdWVyeSBkb2Vzbid0IGhhdmUgJ1dJVEhPVVQgSUQnIHRoZW4gdGhlIGZpcnN0IGNvbHVtbiBpcyB0aGUgZGVmYXVsdCBpZCBjb2xcclxuICAgICAgY29uc3QgaGlnaGxpZ2h0SW5kZXggPVxyXG4gICAgICAgIHByb3BzLmhpZ2hsaWdodEluZGV4IC0gKGlzV2l0aG91dElkIHx8IGlzUmVsYXRpbmdUb0RlZmF1bHRJZCA/IDAgOiAxKTtcclxuICAgICAgY29uc3QgZHJhZ2dlZEluZGV4ID1cclxuICAgICAgICBwcm9wcy5kcmFnZ2VkT3ZlckluZGV4IC0gKGlzV2l0aG91dElkIHx8IGlzUmVsYXRpbmdUb0RlZmF1bHRJZCA/IDAgOiAxKTtcclxuICAgICAgY29uc3QgY29sc1dpdGhvdXRIaWdobGlnaHQgPSBjb2xzLnRvU3BsaWNlZChoaWdobGlnaHRJbmRleCwgMSk7XHJcbiAgICAgIC8vIGluc2VydCB0aGUgaGlnaGxpZ2h0IGNvbCB3aGVyZSB0aGUgaW5kaWNhdG9yIGlzXHJcbiAgICAgIGNvbnN0IG5ld0NvbHMgPSBjb2xzV2l0aG91dEhpZ2hsaWdodC50b1NwbGljZWQoXHJcbiAgICAgICAgZHJhZ2dlZEluZGV4LFxyXG4gICAgICAgIDAsXHJcbiAgICAgICAgY29sc1toaWdobGlnaHRJbmRleF0sXHJcbiAgICAgICk7XHJcbiAgICAgIC8vIHJlY29uc3RydWN0IHRoZSBxdWVyeSBsaW5lXHJcbiAgICAgIGxpbmVzW3RhYmxlTGluZUluZGV4XSA9IHRhYmxlS2V5d29yZCArIFwiIFwiICsgbmV3Q29scy5qb2luKFwiLCBcIik7XHJcbiAgICAgIGNvbnN0IG5ld0NvbnRlbnQgPSBsaW5lcy5qb2luKFwiXFxuXCIpO1xyXG4gICAgICAvLyB1cGRhdGUgdGhlIGZpbGUgd2l0aCBuZXcgbGluZVxyXG4gICAgICBhd2FpdCB2YXVsdC5tb2RpZnkoZmlsZSwgbmV3Q29udGVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJvcHMuc2V0SGlnaGxpZ2h0SW5kZXgoLTEpO1xyXG4gICAgcHJvcHMuc2V0RHJhZ2dlZE92ZXJJbmRleCgtMSk7XHJcbiAgICBzZXRUcmFuc2xhdGVYKDApO1xyXG4gICAgbGFzdE1vdXNlUG9zID0gMDtcclxuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIG9uTW91c2VNb3ZlKTtcclxuICB9O1xyXG5cclxuICAvLyB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XHJcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIG9uTW91c2VVcCk7XHJcblxyXG4gIG9uQ2xlYW51cCgoKSA9PiB7XHJcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XHJcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIChcclxuICAgIDx0aGVhZD5cclxuICAgICAgPHRyPlxyXG4gICAgICAgIDxGb3IgZWFjaD17cHJvcHMuaGVhZGVyc30+XHJcbiAgICAgICAgICB7KF8sIGluZGV4KSA9PiAoXHJcbiAgICAgICAgICAgIDx0aFxyXG4gICAgICAgICAgICAgIG9uTW91c2VEb3duPXsoZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgcHJvcHMuc2V0SGlnaGxpZ2h0SW5kZXgoaW5kZXgoKSk7XHJcbiAgICAgICAgICAgICAgICBzZXRUcmFuc2xhdGVYKDApO1xyXG4gICAgICAgICAgICAgICAgbGFzdE1vdXNlUG9zID0gZS5jbGllbnRYO1xyXG4gICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xyXG4gICAgICAgICAgICAgIH19XHJcbiAgICAgICAgICAgICAgb25Nb3VzZU1vdmU9eygpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChwcm9wcy5oaWdobGlnaHRJbmRleCA9PT0gLTEpIHJldHVybjtcclxuICAgICAgICAgICAgICAgIHByb3BzLnNldERyYWdnZWRPdmVySW5kZXgoaW5kZXgoKSk7XHJcbiAgICAgICAgICAgICAgfX1cclxuICAgICAgICAgICAgICAvLyBvbk1vdXNlVXA9eygpID0+IHtcclxuICAgICAgICAgICAgICAvLyAgIHByb3BzLnNldEhpZ2hsaWdodEluZGV4KC0xKTtcclxuICAgICAgICAgICAgICAvLyAgIHNldFRyYW5zbGF0ZVgoMCk7XHJcbiAgICAgICAgICAgICAgLy8gICBsYXN0TW91c2VQb3MgPSAwO1xyXG4gICAgICAgICAgICAgIC8vIH19XHJcbiAgICAgICAgICAgICAgLy8gb25Nb3VzZU1vdmU9eyhlKSA9PiB7XHJcbiAgICAgICAgICAgICAgLy8gICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgICAgLy8gICBzZXRUcmFuc2xhdGVYKCgpID0+IGUuY2xpZW50WCAtIGxhc3RNb3VzZVBvcyk7XHJcbiAgICAgICAgICAgICAgLy8gfX1cclxuICAgICAgICAgICAgICBjbGFzcz17YHJlbGF0aXZlIG0tMCBjdXJzb3ItZ3JhYiBvdmVyZmxvdy12aXNpYmxlIGJvcmRlci14LXRyYW5zcGFyZW50IGJvcmRlci10LXRyYW5zcGFyZW50IHAtMCB0ZXh0LW11dGVkIGFjdGl2ZTpjdXJzb3ItZ3JhYmJpbmcgJHtpbmRleCgpID09PSBwcm9wcy5oaWdobGlnaHRJbmRleCA/IFwib3BhY2l0eS0xMDBcIiA6IFwib3BhY2l0eS0wXCJ9ICR7cHJvcHMuaGlnaGxpZ2h0SW5kZXggPT09IC0xID8gXCJob3ZlcjpvcGFjaXR5LTEwMFwiIDogXCJcIn1gfVxyXG4gICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgPGRpdlxyXG4gICAgICAgICAgICAgICAgYXJpYS1yb2xlZGVzY3JpcHRpb249XCJjb2x1bW4tZHJhZy1oYW5kbGVcIlxyXG4gICAgICAgICAgICAgICAgY2xhc3M9e2BmbGV4IHNpemUtZnVsbCBpdGVtcy1lbmQganVzdGlmeS1jZW50ZXJgfVxyXG4gICAgICAgICAgICAgICAgc3R5bGU9e1xyXG4gICAgICAgICAgICAgICAgICBpbmRleCgpID09PSBwcm9wcy5oaWdobGlnaHRJbmRleFxyXG4gICAgICAgICAgICAgICAgICAgID8ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFwiaHNsKHZhcigtLWFjY2VudC1oKSB2YXIoLS1hY2NlbnQtcykgdmFyKC0tYWNjZW50LWwpKVwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcImJvcmRlci1yYWRpdXNcIjogXCJ2YXIoLS1yYWRpdXMtcykgdmFyKC0tcmFkaXVzLXMpIDAgMFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2xhdGU6IHRyYW5zbGF0ZVgoKSArIFwicHggMFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcInBvaW50ZXItZXZlbnRzXCI6IFwibm9uZVwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIDogcHJvcHMuaGlnaGxpZ2h0SW5kZXggIT09IC0xXHJcbiAgICAgICAgICAgICAgICAgICAgICA/IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJzb3I6IFwiZ3JhYmJpbmdcIixcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgOiB7fVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgIDxHcmlwSG9yaXpvbnRhbCBzaXplPVwiMXJlbVwiIC8+XHJcbiAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDwvdGg+XHJcbiAgICAgICAgICApfVxyXG4gICAgICAgIDwvRm9yPlxyXG4gICAgICA8L3RyPlxyXG4gICAgICA8dHI+XHJcbiAgICAgICAgPEZvciBlYWNoPXtwcm9wcy5oZWFkZXJzfT5cclxuICAgICAgICAgIHsoaCwgaW5kZXgpID0+IChcclxuICAgICAgICAgICAgPHRoXHJcbiAgICAgICAgICAgICAgb25Nb3VzZU1vdmU9eygpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChwcm9wcy5oaWdobGlnaHRJbmRleCA9PT0gLTEpIHJldHVybjtcclxuICAgICAgICAgICAgICAgIHByb3BzLnNldERyYWdnZWRPdmVySW5kZXgoaW5kZXgoKSk7XHJcbiAgICAgICAgICAgICAgfX1cclxuICAgICAgICAgICAgICBjbGFzcz1cInJlbGF0aXZlIHRleHQtbm93cmFwXCJcclxuICAgICAgICAgICAgICBzdHlsZT17XHJcbiAgICAgICAgICAgICAgICBpbmRleCgpID09PSBwcm9wcy5oaWdobGlnaHRJbmRleFxyXG4gICAgICAgICAgICAgICAgICA/IHtcclxuICAgICAgICAgICAgICAgICAgICAgIFwiYm9yZGVyLXRvcC13aWR0aFwiOiBcIjJweFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgXCJib3JkZXItbGVmdC13aWR0aFwiOiBcIjJweFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgXCJib3JkZXItcmlnaHQtd2lkdGhcIjogXCIycHhcIixcclxuICAgICAgICAgICAgICAgICAgICAgIFwiYm9yZGVyLXRvcC1jb2xvclwiOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcImhzbCh2YXIoLS1hY2NlbnQtaCkgdmFyKC0tYWNjZW50LXMpIHZhcigtLWFjY2VudC1sKSlcIixcclxuICAgICAgICAgICAgICAgICAgICAgIFwiYm9yZGVyLWxlZnQtY29sb3JcIjpcclxuICAgICAgICAgICAgICAgICAgICAgICAgXCJoc2wodmFyKC0tYWNjZW50LWgpIHZhcigtLWFjY2VudC1zKSB2YXIoLS1hY2NlbnQtbCkpXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICBcImJvcmRlci1yaWdodC1jb2xvclwiOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcImhzbCh2YXIoLS1hY2NlbnQtaCkgdmFyKC0tYWNjZW50LXMpIHZhcigtLWFjY2VudC1sKSlcIixcclxuICAgICAgICAgICAgICAgICAgICAgIFwiYmFja2dyb3VuZC1jb2xvclwiOiBgaHNsKHZhcigtLWFjY2VudC1oKSB2YXIoLS1hY2NlbnQtcykgdmFyKC0tYWNjZW50LWwpIC8gMTAlKWAsXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICA6IHByb3BzLmhpZ2hsaWdodEluZGV4ICE9PSAtMSAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgaW5kZXgoKSA9PT0gcHJvcHMuZHJhZ2dlZE92ZXJJbmRleFxyXG4gICAgICAgICAgICAgICAgICAgID8gcHJvcHMuaGlnaGxpZ2h0SW5kZXggPCBpbmRleCgpXHJcbiAgICAgICAgICAgICAgICAgICAgICA/IGRyYWdnZWRPdmVyUmlnaHRcclxuICAgICAgICAgICAgICAgICAgICAgIDogZHJhZ2dlZE92ZXJMZWZ0XHJcbiAgICAgICAgICAgICAgICAgICAgOiB7fVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgIDxNYXJrZG93blxyXG4gICAgICAgICAgICAgICAgYXBwPXtwcm9wcy5jb2RlQmxvY2tJbmZvLnBsdWdpbi5hcHB9XHJcbiAgICAgICAgICAgICAgICBtYXJrZG93bj17aH1cclxuICAgICAgICAgICAgICAgIHNvdXJjZVBhdGg9e3Byb3BzLmNvZGVCbG9ja0luZm8uY3R4LnNvdXJjZVBhdGh9XHJcbiAgICAgICAgICAgICAgLz5cclxuICAgICAgICAgICAgPC90aD5cclxuICAgICAgICAgICl9XHJcbiAgICAgICAgPC9Gb3I+XHJcbiAgICAgIDwvdHI+XHJcbiAgICA8L3RoZWFkPlxyXG4gICk7XHJcbn07XHJcbiIsImltcG9ydCB7XHJcbiAgTW9kaWZpZWREYXRhdmlld1F1ZXJ5UmVzdWx0LFxyXG4gIERhdGF2aWV3UXVlcnlSZXN1bHRTdWNjZXNzLFxyXG4gIERhdGF2aWV3UXVlcnlSZXN1bHQsXHJcbiAgRGF0YXZpZXdRdWVyeVJlc3VsdEZhaWwsXHJcbn0gZnJvbSBcIkAvbGliL3R5cGVzXCI7XHJcbmltcG9ydCB7IGNyZWF0ZVNpZ25hbCwgRm9yLCBTaG93LCBjcmVhdGVNZW1vLCBTZXR0ZXIgfSBmcm9tIFwic29saWQtanNcIjtcclxuaW1wb3J0IHsgVGFibGVCb2R5IH0gZnJvbSBcIi4vVGFibGVCb2R5XCI7XHJcbmltcG9ydCB7IFRhYmxlSGVhZCB9IGZyb20gXCIuL1RhYmxlSGVhZFwiO1xyXG5pbXBvcnQgUGx1cyBmcm9tIFwibHVjaWRlLXNvbGlkL2ljb25zL1BsdXNcIjtcclxuaW1wb3J0IHsgYXV0b2ZvY3VzIH0gZnJvbSBcIkBzb2xpZC1wcmltaXRpdmVzL2F1dG9mb2N1c1wiO1xyXG5pbXBvcnQgeyBDb2RlQmxvY2tJbmZvIH0gZnJvbSBcIkAvQXBwXCI7XHJcbmltcG9ydCB7XHJcbiAgRGlhbG9nLFxyXG4gIERpYWxvZ0NvbnRlbnQsXHJcbiAgRGlhbG9nVGl0bGUsXHJcbiAgRGlhbG9nVHJpZ2dlcixcclxufSBmcm9tIFwiLi4vdWkvZGlhbG9nXCI7XHJcbmltcG9ydCB7IGdldEV4aXN0aW5nUHJvcGVydGllcywgZ2V0VGFibGVMaW5lIH0gZnJvbSBcIkAvbGliL3V0aWxcIjtcclxuaW1wb3J0IHsgTWFya2Rvd24gfSBmcm9tIFwiLi4vTWFya2Rvd25cIjtcclxuLy8gcHJldmVudHMgZnJvbSBiZWluZyB0cmVlLXNoYWtlbiBieSBUU1xyXG5hdXRvZm9jdXM7XHJcblxyXG50eXBlIFRhYmxlUHJvcHMgPSB7XHJcbiAgY29kZUJsb2NrSW5mbzogQ29kZUJsb2NrSW5mbztcclxuICBxdWVyeVJlc3VsdHM6IE1vZGlmaWVkRGF0YXZpZXdRdWVyeVJlc3VsdDtcclxufTtcclxuZXhwb3J0IGNvbnN0IFRhYmxlID0gKHByb3BzOiBUYWJsZVByb3BzKSA9PiB7XHJcbiAgY29uc3QgW2hpZ2hsaWdodEluZGV4LCBzZXRIaWdobGlnaHRJbmRleF0gPSBjcmVhdGVTaWduYWwoLTEpO1xyXG4gIGNvbnN0IFtkcmFnZ2VkT3ZlckluZGV4LCBzZXREcmFnZ2VkT3ZlckluZGV4XSA9IGNyZWF0ZVNpZ25hbCgtMSk7XHJcbiAgY29uc3QgW2lzQWRkQ29sdW1uRGlhbG9nT3Blbiwgc2V0QWRkQ29sdW1uRGlhbG9nT3Blbl0gPSBjcmVhdGVTaWduYWwoZmFsc2UpO1xyXG4gIHJldHVybiAoXHJcbiAgICA8U2hvd1xyXG4gICAgICB3aGVuPXtwcm9wcy5xdWVyeVJlc3VsdHMuc3VjY2Vzc2Z1bH1cclxuICAgICAgZmFsbGJhY2s9ezxUYWJsZUZhbGxiYWNrIHF1ZXJ5UmVzdWx0cz17cHJvcHMucXVlcnlSZXN1bHRzfSAvPn1cclxuICAgID5cclxuICAgICAgPGRpdlxyXG4gICAgICAgIGNsYXNzPVwicmVsYXRpdmUgbWItNCBtci00IGgtZml0IHctZml0XCJcclxuICAgICAgICAvLyBzdHlsZT17eyBcIm92ZXJmbG93LXlcIjogXCJ2aXNpYmxlXCIgfX1cclxuICAgICAgPlxyXG4gICAgICAgIDx0YWJsZVxyXG4gICAgICAgICAgLy8gY2xhc3M9XCJoLWZpdCBvdmVyZmxvdy15LXZpc2libGVcIlxyXG4gICAgICAgICAgc3R5bGU9e1xyXG4gICAgICAgICAgICBoaWdobGlnaHRJbmRleCgpICE9PSAtMVxyXG4gICAgICAgICAgICAgID8ge1xyXG4gICAgICAgICAgICAgICAgICBcInVzZXItc2VsZWN0XCI6IFwibm9uZVwiLFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIDoge31cclxuICAgICAgICAgIH1cclxuICAgICAgICA+XHJcbiAgICAgICAgICA8VGFibGVIZWFkXHJcbiAgICAgICAgICAgIGhlYWRlcnM9e1xyXG4gICAgICAgICAgICAgIChwcm9wcy5xdWVyeVJlc3VsdHMgYXMgRGF0YXZpZXdRdWVyeVJlc3VsdFN1Y2Nlc3MpLnZhbHVlLmhlYWRlcnNcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBwcm9wZXJ0aWVzPXtwcm9wcy5xdWVyeVJlc3VsdHMudHJ1ZVByb3BlcnR5TmFtZXN9XHJcbiAgICAgICAgICAgIGhpZ2hsaWdodEluZGV4PXtoaWdobGlnaHRJbmRleCgpfVxyXG4gICAgICAgICAgICBzZXRIaWdobGlnaHRJbmRleD17c2V0SGlnaGxpZ2h0SW5kZXh9XHJcbiAgICAgICAgICAgIGRyYWdnZWRPdmVySW5kZXg9e2RyYWdnZWRPdmVySW5kZXgoKX1cclxuICAgICAgICAgICAgc2V0RHJhZ2dlZE92ZXJJbmRleD17c2V0RHJhZ2dlZE92ZXJJbmRleH1cclxuICAgICAgICAgICAgY29kZUJsb2NrSW5mbz17cHJvcHMuY29kZUJsb2NrSW5mb31cclxuICAgICAgICAgIC8+XHJcbiAgICAgICAgICA8VGFibGVCb2R5XHJcbiAgICAgICAgICAgIGhlYWRlcnM9e1xyXG4gICAgICAgICAgICAgIChwcm9wcy5xdWVyeVJlc3VsdHMgYXMgRGF0YXZpZXdRdWVyeVJlc3VsdFN1Y2Nlc3MpLnZhbHVlLmhlYWRlcnNcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBwcm9wZXJ0aWVzPXtwcm9wcy5xdWVyeVJlc3VsdHMudHJ1ZVByb3BlcnR5TmFtZXN9XHJcbiAgICAgICAgICAgIHJvd3M9e1xyXG4gICAgICAgICAgICAgIChwcm9wcy5xdWVyeVJlc3VsdHMgYXMgRGF0YXZpZXdRdWVyeVJlc3VsdFN1Y2Nlc3MpLnZhbHVlLnZhbHVlc1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGhpZ2hsaWdodEluZGV4PXtoaWdobGlnaHRJbmRleCgpfVxyXG4gICAgICAgICAgICBzZXRIaWdobGlnaHRJbmRleD17c2V0SGlnaGxpZ2h0SW5kZXh9XHJcbiAgICAgICAgICAgIGRyYWdnZWRPdmVySW5kZXg9e2RyYWdnZWRPdmVySW5kZXgoKX1cclxuICAgICAgICAgICAgc2V0RHJhZ2dlZE92ZXJJbmRleD17c2V0RHJhZ2dlZE92ZXJJbmRleH1cclxuICAgICAgICAgICAgY29kZUJsb2NrSW5mbz17cHJvcHMuY29kZUJsb2NrSW5mb31cclxuICAgICAgICAgIC8+XHJcbiAgICAgICAgPC90YWJsZT5cclxuICAgICAgICA8QWRkQ29sdW1uQnV0dG9uXHJcbiAgICAgICAgICBvcGVuPXtpc0FkZENvbHVtbkRpYWxvZ09wZW4oKX1cclxuICAgICAgICAgIHNldE9wZW49e3NldEFkZENvbHVtbkRpYWxvZ09wZW59XHJcbiAgICAgICAgICBjb2RlQmxvY2tJbmZvPXtwcm9wcy5jb2RlQmxvY2tJbmZvfVxyXG4gICAgICAgIC8+XHJcbiAgICAgICAgPHNwYW5cclxuICAgICAgICAgIGFyaWEtbGFiZWw9XCJBZGQgcm93IGFmdGVyXCJcclxuICAgICAgICAgIGNsYXNzPVwiYWJzb2x1dGUgYm90dG9tLVstMXJlbV0gbGVmdC0wIGZsZXggdy1mdWxsIGN1cnNvci1ucy1yZXNpemUgaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHJvdW5kZWQtWzFweF0gYm9yZGVyIGJvcmRlci10LTAgYm9yZGVyLWJvcmRlciBvcGFjaXR5LTAgaG92ZXI6b3BhY2l0eS01MFwiXHJcbiAgICAgICAgPlxyXG4gICAgICAgICAgPFBsdXMgc2l6ZT1cIjFyZW1cIiAvPlxyXG4gICAgICAgIDwvc3Bhbj5cclxuICAgICAgPC9kaXY+XHJcbiAgICA8L1Nob3c+XHJcbiAgKTtcclxufTtcclxuXHJcbnR5cGUgVGFibGVGYWxsYmFja1Byb3BzID0geyBxdWVyeVJlc3VsdHM6IERhdGF2aWV3UXVlcnlSZXN1bHQgfTtcclxuY29uc3QgVGFibGVGYWxsYmFjayA9IChwcm9wczogVGFibGVGYWxsYmFja1Byb3BzKSA9PiB7XHJcbiAgLy9cclxuICByZXR1cm4gKFxyXG4gICAgPGRpdj5cclxuICAgICAgPGgyPkRhdGF2aWV3IGVycm9yPC9oMj5cclxuICAgICAgPHA+eyhwcm9wcy5xdWVyeVJlc3VsdHMgYXMgRGF0YXZpZXdRdWVyeVJlc3VsdEZhaWwpLmVycm9yfTwvcD5cclxuICAgIDwvZGl2PlxyXG4gICk7XHJcbn07XHJcblxyXG5jb25zdCBBZGRDb2x1bW5CdXR0b24gPSAocHJvcHM6IHtcclxuICBvcGVuOiBib29sZWFuO1xyXG4gIHNldE9wZW46IFNldHRlcjxib29sZWFuPjtcclxuICBjb2RlQmxvY2tJbmZvOiBDb2RlQmxvY2tJbmZvO1xyXG59KSA9PiB7XHJcbiAgY29uc3Qge1xyXG4gICAgcGx1Z2luOiB7IGFwcCB9LFxyXG4gICAgY3R4LFxyXG4gICAgZWwsXHJcbiAgICBxdWVyeSxcclxuICB9ID0gcHJvcHMuY29kZUJsb2NrSW5mbztcclxuXHJcbiAgY29uc3Qgc2VjdGlvbkluZm8gPSBjdHguZ2V0U2VjdGlvbkluZm8oZWwpO1xyXG4gIGlmICghc2VjdGlvbkluZm8pIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIlRoaXMgc2hvdWxkIGJlIGltcG9zc2libGVcIik7XHJcbiAgfVxyXG4gIGNvbnN0IHsgbGluZVN0YXJ0LCB0ZXh0IH0gPSBzZWN0aW9uSW5mbztcclxuXHJcbiAgY29uc3QgW3Byb3BlcnR5VmFsdWUsIHNldFByb3BlcnR5VmFsdWVdID0gY3JlYXRlU2lnbmFsKFwiXCIpO1xyXG4gIGNvbnN0IFthbGlhc1ZhbHVlLCBzZXRBbGlhc1ZhbHVlXSA9IGNyZWF0ZVNpZ25hbChcIlwiKTtcclxuXHJcbiAgY29uc3QgbWFya2Rvd24gPSBjcmVhdGVNZW1vKCgpID0+IHtcclxuICAgIGNvbnN0IHByb3AgPSBwcm9wZXJ0eVZhbHVlKCkudHJpbSgpO1xyXG4gICAgY29uc3QgbGluZXMgPSAoXCJgYGBkYXRhdmlld1xcblwiICsgcXVlcnkgKyBcIlxcbmBgYFwiKS5zcGxpdChcIlxcblwiKTtcclxuICAgIGlmICghcHJvcCkgcmV0dXJuIGxpbmVzLmpvaW4oXCJcXG5cIik7XHJcbiAgICBjb25zdCBhbGlhcyA9IGFsaWFzVmFsdWUoKTtcclxuICAgIGNvbnN0IGFsaWFzU3RyID0gYWxpYXNcclxuICAgICAgPyBcIiBBUyBcIiArIChhbGlhcy5pbmNsdWRlcyhcIiBcIikgPyAnXCInICsgYWxpYXMgKyAnXCInIDogYWxpYXMpXHJcbiAgICAgIDogXCJcIjtcclxuICAgIGNvbnN0IHsgaW5kZXggfSA9IGdldFRhYmxlTGluZShxdWVyeSk7XHJcbiAgICAvLyBvZmZzZXQgYnkgMSBzaW5jZSBzb3VyY2UgZG9lc24ndCBpbmNsdWRlIGJhY2t0aWNrcyB3ZSBhZGRlZCB0byBsaW5lc1xyXG4gICAgbGluZXNbaW5kZXggKyAxXSArPSBcIiwgXCIgKyBwcm9wICsgYWxpYXNTdHI7XHJcbiAgICByZXR1cm4gbGluZXMuam9pbihcIlxcblwiKTtcclxuICB9KTtcclxuXHJcbiAgY29uc3QgYWRkQ29sID0gYXN5bmMgKG1hcmtkb3duOiBzdHJpbmcpID0+IHtcclxuICAgIGNvbnN0IHsgdmF1bHQgfSA9IGFwcDtcclxuICAgIGNvbnN0IGZpbGUgPSB2YXVsdC5nZXRGaWxlQnlQYXRoKGN0eC5zb3VyY2VQYXRoKTtcclxuICAgIGlmICghZmlsZSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGlzIHNob3VsZCBiZSBpbXBvc3NpYmxlXCIpO1xyXG4gICAgfVxyXG4gICAgLy8gY29uc3QgY29udGVudCA9IGF3YWl0IHZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XHJcbiAgICBjb25zdCBjb250ZW50ID0gdGV4dDtcclxuICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdChcIlxcblwiKTtcclxuICAgIGxpbmVzW2xpbmVTdGFydCArIDFdID0gbWFya2Rvd24uc3BsaXQoXCJcXG5cIilbMV07XHJcbiAgICBjb25zdCBuZXdDb250ZW50ID0gbGluZXMuam9pbihcIlxcblwiKTtcclxuICAgIGF3YWl0IHZhdWx0Lm1vZGlmeShmaWxlLCBuZXdDb250ZW50KTtcclxuICB9O1xyXG5cclxuICBjb25zdCBwcm9wZXJ0aWVzID0gZ2V0RXhpc3RpbmdQcm9wZXJ0aWVzKGFwcCk7XHJcbiAgY29uc3QgcHJvcGVydHlOYW1lcyA9IE9iamVjdC5rZXlzKHByb3BlcnRpZXMpLnNvcnQoKTtcclxuICByZXR1cm4gKFxyXG4gICAgPERpYWxvZyBvcGVuPXtwcm9wcy5vcGVufSBvbk9wZW5DaGFuZ2U9eyhiKSA9PiBwcm9wcy5zZXRPcGVuKGIpfT5cclxuICAgICAgPERpYWxvZ1RyaWdnZXJcclxuICAgICAgICBhcmlhLWxhYmVsPVwiQWRkIGNvbHVtbiBhZnRlclwiXHJcbiAgICAgICAgY2xhc3M9XCJhYnNvbHV0ZSByaWdodC1bLTFyZW1dIHRvcC1bY2FsYygxcmVtK3ZhcigtLWJvcmRlci13aWR0aCkpXSBtLTAgZmxleCBzaXplLWZpdCBoLVtjYWxjKDEwMCUtMXJlbS12YXIoLS1ib3JkZXItd2lkdGgpKV0gY3Vyc29yLWV3LXJlc2l6ZSBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgcm91bmRlZC1ub25lIGJvcmRlciBib3JkZXItbC0wIGJvcmRlci1ib3JkZXIgYmctdHJhbnNwYXJlbnQgcC0wIG9wYWNpdHktMCBzaGFkb3ctbm9uZSBob3ZlcjpvcGFjaXR5LTUwXCJcclxuICAgICAgPlxyXG4gICAgICAgIHsvKiA8c3BhblxyXG4gICAgICAgICAgY2xhc3M9XCJhYnNvbHV0ZSByaWdodC1bLTFyZW1dIHRvcC1bY2FsYygxcmVtK3ZhcigtLWJvcmRlci13aWR0aCkpXSBmbGV4IGgtW2NhbGMoMTAwJS0xcmVtLXZhcigtLWJvcmRlci13aWR0aCkpXSBjdXJzb3ItZXctcmVzaXplIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBib3JkZXIgYm9yZGVyLWwtMCBib3JkZXItYm9yZGVyIG9wYWNpdHktMCBob3ZlcjpvcGFjaXR5LTUwXCJcclxuICAgICAgICA+ICovfVxyXG4gICAgICAgIDxQbHVzIHNpemU9XCIxcmVtXCIgLz5cclxuICAgICAgICB7LyogPC9zcGFuPiAqL31cclxuICAgICAgPC9EaWFsb2dUcmlnZ2VyPlxyXG4gICAgICA8RGlhbG9nQ29udGVudD5cclxuICAgICAgICA8RGlhbG9nVGl0bGU+QWRkIGNvbHVtbjwvRGlhbG9nVGl0bGU+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImZsZXggdy1mdWxsIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW5cIj5cclxuICAgICAgICAgIDxsYWJlbCBmb3I9XCJwcm9wZXJ0eS1pbnB1dFwiPlByb3BlcnR5OiA8L2xhYmVsPlxyXG4gICAgICAgICAgPGlucHV0XHJcbiAgICAgICAgICAgIHVzZTphdXRvZm9jdXNcclxuICAgICAgICAgICAgYXV0b2ZvY3VzXHJcbiAgICAgICAgICAgIG5hbWU9XCJwcm9wZXJ0eS1pbnB1dFwiXHJcbiAgICAgICAgICAgIGlkPVwicHJvcGVydHktaW5wdXRcIlxyXG4gICAgICAgICAgICB0eXBlPVwidGV4dFwiXHJcbiAgICAgICAgICAgIGxpc3Q9XCJwcm9wZXJ0aWVzLWRhdGFsaXN0XCJcclxuICAgICAgICAgICAgdmFsdWU9e3Byb3BlcnR5VmFsdWUoKX1cclxuICAgICAgICAgICAgb25JbnB1dD17KGUpID0+IHNldFByb3BlcnR5VmFsdWUoZS50YXJnZXQudmFsdWUpfVxyXG4gICAgICAgICAgLz5cclxuICAgICAgICAgIDxkYXRhbGlzdCBpZD1cInByb3BlcnRpZXMtZGF0YWxpc3RcIj5cclxuICAgICAgICAgICAgPEZvciBlYWNoPXtwcm9wZXJ0eU5hbWVzfT5cclxuICAgICAgICAgICAgICB7KHByb3ApID0+IDxvcHRpb24gdmFsdWU9e3Byb3B9Pntwcm9wZXJ0aWVzW3Byb3BdLnR5cGV9PC9vcHRpb24+fVxyXG4gICAgICAgICAgICA8L0Zvcj5cclxuICAgICAgICAgIDwvZGF0YWxpc3Q+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImZsZXggdy1mdWxsIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW5cIj5cclxuICAgICAgICAgIDxsYWJlbCBmb3I9XCJhbGlhcy1pbnB1dFwiPkFsaWFzIChvcHRpb25hbCk6IDwvbGFiZWw+XHJcbiAgICAgICAgICA8aW5wdXRcclxuICAgICAgICAgICAgbmFtZT1cImFsaWFzLWlucHV0XCJcclxuICAgICAgICAgICAgaWQ9XCJhbGlhcy1pbnB1dFwiXHJcbiAgICAgICAgICAgIHR5cGU9XCJ0ZXh0XCJcclxuICAgICAgICAgICAgdmFsdWU9e2FsaWFzVmFsdWUoKX1cclxuICAgICAgICAgICAgb25JbnB1dD17KGUpID0+IHNldEFsaWFzVmFsdWUoZS50YXJnZXQudmFsdWUpfVxyXG4gICAgICAgICAgLz5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8TWFya2Rvd24gYXBwPXthcHB9IG1hcmtkb3duPXttYXJrZG93bigpfSBzb3VyY2VQYXRoPXtjdHguc291cmNlUGF0aH0gLz5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwidy1mdWxsXCI+XHJcbiAgICAgICAgICA8YnV0dG9uXHJcbiAgICAgICAgICAgIGRpc2FibGVkPXshcHJvcGVydHlWYWx1ZSgpfVxyXG4gICAgICAgICAgICBvbkNsaWNrPXthc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgYXdhaXQgYWRkQ29sKG1hcmtkb3duKCkpO1xyXG4gICAgICAgICAgICAgIHByb3BzLnNldE9wZW4oZmFsc2UpO1xyXG4gICAgICAgICAgICB9fVxyXG4gICAgICAgICAgICBjbGFzcz1cImZsb2F0LXJpZ2h0IGJnLWludGVyYWN0aXZlLWFjY2VudCBwLWJ1dHRvbiB0ZXh0LW9uLWFjY2VudCBob3ZlcjpiZy1pbnRlcmFjdGl2ZS1hY2NlbnQtaG92ZXIgaG92ZXI6dGV4dC1hY2NlbnQtaG92ZXIgZGlzYWJsZWQ6Y3Vyc29yLW5vdC1hbGxvd2VkXCJcclxuICAgICAgICAgID5cclxuICAgICAgICAgICAgYWRkXHJcbiAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgPC9EaWFsb2dDb250ZW50PlxyXG4gICAgPC9EaWFsb2c+XHJcbiAgKTtcclxufTtcclxuXHJcbi8vIFRPRE8gZml4IG5lc3RlZFxyXG4iLCJpbXBvcnQgeyBDb21wb25lbnRQcm9wcywgY3JlYXRlU2lnbmFsLCBzcGxpdFByb3BzIH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcblxyXG5leHBvcnQgdHlwZSBUb2dnbGVQcm9wcyA9IE9taXQ8XHJcbiAgQ29tcG9uZW50UHJvcHM8XCJpbnB1dFwiPixcclxuICBcIm9uQ2xpY2tcIiB8IFwidHlwZVwiIHwgXCJ2YWx1ZVwiXHJcbj4gJiB7XHJcbiAgb25DaGVja2VkQ2hhbmdlPzogKGI6IGJvb2xlYW4pID0+IHZvaWQ7XHJcbiAgY29udGFpbmVyQ2xhc3M/OiBzdHJpbmc7XHJcbn07XHJcbmV4cG9ydCBjb25zdCBUb2dnbGUgPSAocHJvcHM6IFRvZ2dsZVByb3BzKSA9PiB7XHJcbiAgY29uc3QgW2xvY2FsLCByZXN0XSA9IHNwbGl0UHJvcHMocHJvcHMsIFtcclxuICAgIFwiY29udGFpbmVyQ2xhc3NcIixcclxuICAgIFwib25DaGVja2VkQ2hhbmdlXCIsXHJcbiAgXSk7XHJcbiAgY29uc3QgW2lzQ2hlY2tlZCwgc2V0Q2hlY2tlZF0gPSBjcmVhdGVTaWduYWwoISFyZXN0LmNoZWNrZWQpO1xyXG4gIHJldHVybiAoXHJcbiAgICA8ZGl2XHJcbiAgICAgIGNsYXNzPXtgY2hlY2tib3gtY29udGFpbmVyICR7aXNDaGVja2VkKCkgPyBcImlzLWVuYWJsZWRcIiA6IFwiIFwifWB9XHJcbiAgICAgIG9uQ2xpY2s9eygpID0+IHtcclxuICAgICAgICBzZXRDaGVja2VkKChwcmV2KSA9PiB7XHJcbiAgICAgICAgICBpZiAobG9jYWwub25DaGVja2VkQ2hhbmdlKSBsb2NhbC5vbkNoZWNrZWRDaGFuZ2UoIXByZXYpO1xyXG4gICAgICAgICAgcmV0dXJuICFwcmV2O1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9fVxyXG4gICAgPlxyXG4gICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgey4uLnJlc3R9IGNoZWNrZWQ9e2lzQ2hlY2tlZCgpfSAvPlxyXG4gICAgPC9kaXY+XHJcbiAgKTtcclxufTtcclxuIiwiaW1wb3J0IHtcclxuICBBY2Nlc3NvcixcclxuICBjcmVhdGVFZmZlY3QsXHJcbiAgY3JlYXRlTWVtbyxcclxuICBjcmVhdGVTaWduYWwsXHJcbiAgY3JlYXRlVW5pcXVlSWQsXHJcbiAgRm9yLFxyXG4gIEpTWEVsZW1lbnQsXHJcbiAgTWF0Y2gsXHJcbiAgb25DbGVhbnVwLFxyXG4gIFNldHRlcixcclxuICBTaG93LFxyXG4gIFN3aXRjaCxcclxufSBmcm9tIFwic29saWQtanNcIjtcclxuaW1wb3J0IFwiQC9BcHAuY3NzXCI7XHJcbmltcG9ydCB7IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IERhdGFFZGl0IGZyb20gXCJAL21haW5cIjtcclxuaW1wb3J0IHsgRGF0YXZpZXdBUEksIE1vZGlmaWVkRGF0YXZpZXdRdWVyeVJlc3VsdCB9IGZyb20gXCJAL2xpYi90eXBlc1wiO1xyXG5pbXBvcnQgeyBjcmVhdGVTdG9yZSwgU2V0U3RvcmVGdW5jdGlvbiwgU3RvcmVTZXR0ZXIgfSBmcm9tIFwic29saWQtanMvc3RvcmVcIjtcclxuaW1wb3J0IHtcclxuICBEYXRhRWRpdEJsb2NrQ29uZmlnLFxyXG4gIERhdGFFZGl0QmxvY2tDb25maWdLZXksXHJcbiAgZGVmYXVsdERhdGFFZGl0QmxvY2tDb25maWcsXHJcbiAgZ2V0Q29sdW1uUHJvcGVydHlOYW1lcyxcclxuICByZWdpc3RlckRhdGF2aWV3RXZlbnRzLFxyXG4gIHNldEJsb2NrQ29uZmlnLFxyXG4gIHRyeURhdGF2aWV3QXJyYXlUb0FycmF5LFxyXG4gIHVucmVnaXN0ZXJEYXRhdmlld0V2ZW50cyxcclxuICB1cGRhdGVCbG9ja0NvbmZpZyxcclxufSBmcm9tIFwiQC9saWIvdXRpbFwiO1xyXG4vLyBpbXBvcnQgeyBNaW51cywgUGx1cyB9IGZyb20gXCJsdWNpZGUtc29saWRcIjtcclxuaW1wb3J0IExvY2sgZnJvbSBcImx1Y2lkZS1zb2xpZC9pY29ucy9Mb2NrXCI7XHJcbmltcG9ydCBMb2NrT3BlbiBmcm9tIFwibHVjaWRlLXNvbGlkL2ljb25zL0xvY2stb3BlblwiO1xyXG5pbXBvcnQgR2VhciBmcm9tIFwibHVjaWRlLXNvbGlkL2ljb25zL1NldHRpbmdzXCI7XHJcbi8qXHJcbiAgVE9ET1xyXG4gIC0gcHJvYmxlbTogYnVpbGQgcHJvY2VzcyBidW5kbGVzICphbGwqIGx1Y2lkZSBpY29ucywgYnV0ICpkb2VzKiBjb3JyZWN0bHkgdHJlZXNoYWtlIGZvciBmaW5hbCBidW5kbGUuIFRoaXMgY2F1c2VzIDUwMCUgaW5jcmVhc2UgdG8gYnVpbGQgdGltZSBkZXNwaXRlIGJ1bmRsZSBiZWluZyBjb3JyZWN0LlxyXG4gIC0gd29ya2Fyb3VuZDpcclxuICAgIC0gZWZmZWN0OiBjb3JyZWN0cyBidWlsZCBwcm9jZXNzIHRpbWUgXHJcbiAgICAtIGZyb20gaHR0cHM6Ly9jaHJpc3RvcGhlci5lbmdpbmVlcmluZy9lbi9ibG9nL2x1Y2lkZS1pY29ucy13aXRoLXZpdGUtZGV2LXNlcnZlci9cclxuICAgIC0gaXNzdWU6IG5vIGF1dG9jb21wbGV0ZVxyXG4qL1xyXG5pbXBvcnQgeyBkZWZhdWx0UXVlcnlSZXN1bHQgfSBmcm9tIFwiQC9saWIvY29uc3RhbnRzXCI7XHJcbmltcG9ydCB7IFRhYmxlIH0gZnJvbSBcIkAvY29tcG9uZW50cy9UYWJsZVwiO1xyXG5pbXBvcnQge1xyXG4gIERpYWxvZyxcclxuICBEaWFsb2dDbG9zZSxcclxuICBEaWFsb2dDb250ZW50LFxyXG4gIERpYWxvZ0Rlc2NyaXB0aW9uLFxyXG4gIERpYWxvZ0Zvb3RlcixcclxuICBEaWFsb2dUaXRsZSxcclxuICBEaWFsb2dUcmlnZ2VyLFxyXG59IGZyb20gXCIuL2NvbXBvbmVudHMvdWkvZGlhbG9nXCI7XHJcbmltcG9ydCB7IEV4dGVybmFsTGluayB9IGZyb20gXCIuL2NvbXBvbmVudHMvdWkvZXh0ZXJuYWwtbGlua1wiO1xyXG5pbXBvcnQgeyBidXR0b25WYXJpYW50cyB9IGZyb20gXCIuL2NvbXBvbmVudHMvdWkvYnV0dG9uXCI7XHJcbmltcG9ydCB7IFRvZ2dsZSB9IGZyb20gXCIuL2NvbXBvbmVudHMvdWkvdG9nZ2xlXCI7XHJcblxyXG5leHBvcnQgdHlwZSBDb2RlQmxvY2tJbmZvID0ge1xyXG4gIHBsdWdpbjogRGF0YUVkaXQ7XHJcbiAgZWw6IEhUTUxFbGVtZW50O1xyXG4gIHNvdXJjZTogc3RyaW5nO1xyXG4gIHF1ZXJ5OiBzdHJpbmc7XHJcbiAgY29uZmlnOiBEYXRhRWRpdEJsb2NrQ29uZmlnO1xyXG4gIGN0eDogTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dDtcclxuICBkYXRhdmlld0FQSTogRGF0YXZpZXdBUEk7XHJcbn07XHJcblxyXG5leHBvcnQgdHlwZSBBcHBQcm9wcyA9IENvZGVCbG9ja0luZm8gJiB7XHJcbiAgdWlkOiBzdHJpbmc7XHJcbiAgcXVlcnlSZXN1bHRTdG9yZTogUmVjb3JkPHN0cmluZywgTW9kaWZpZWREYXRhdmlld1F1ZXJ5UmVzdWx0PjtcclxuICBzZXRRdWVyeVJlc3VsdFN0b3JlOiBTZXRTdG9yZUZ1bmN0aW9uPFxyXG4gICAgUmVjb3JkPHN0cmluZywgTW9kaWZpZWREYXRhdmlld1F1ZXJ5UmVzdWx0PlxyXG4gID47XHJcbn07XHJcblxyXG5mdW5jdGlvbiBBcHAocHJvcHM6IEFwcFByb3BzKSB7XHJcbiAgY29uc29sZS5sb2coXCJnb3Qgc291cmNlOiBcIiwgcHJvcHMuc291cmNlKTtcclxuICAvLyBjb25zb2xlLmxvZyhcImFwcCByZW5kZXJlZFwiKTtcclxuICAvLyBjb25zdCBbcXVlcnlSZXN1bHRzLCBzZXRRdWVyeVJlc3VsdHNdID1cclxuICAvLyAgIGNyZWF0ZVN0b3JlPE1vZGlmaWVkRGF0YXZpZXdRdWVyeVJlc3VsdD4oZGVmYXVsdFF1ZXJ5UmVzdWx0KTtcclxuICBjb25zdCBxdWVyeVJlc3VsdHM6IEFjY2Vzc29yPE1vZGlmaWVkRGF0YXZpZXdRdWVyeVJlc3VsdD4gPSBjcmVhdGVNZW1vKCgpID0+IHtcclxuICAgIGNvbnN0IF8gPSBwcm9wcy5xdWVyeVJlc3VsdFN0b3JlWzBdO1xyXG4gICAgXztcclxuICAgIHJldHVybiAoXHJcbiAgICAgIHByb3BzLnF1ZXJ5UmVzdWx0U3RvcmVbcHJvcHMudWlkXSA/PyB7IHN1Y2Nlc3NmdWw6IGZhbHNlLCBlcnJvcjogXCJpbml0XCIgfVxyXG4gICAgKTtcclxuICB9KTtcclxuICBjcmVhdGVFZmZlY3QoKCkgPT4ge1xyXG4gICAgY29uc29sZS5sb2coXCJlZmYgc291cmNlOiBcIiwgcHJvcHMuc291cmNlKTtcclxuICAgIGNvbnNvbGUubG9nKFwiZWZmOiBxdWVyeSByZXN1bHRzOiBcIiwgcXVlcnlSZXN1bHRzKCkpO1xyXG4gIH0pO1xyXG5cclxuICBjcmVhdGVFZmZlY3QoKCkgPT4ge1xyXG4gICAgcHJvcHMucXVlcnlSZXN1bHRTdG9yZVswXTtcclxuICAgIGNvbnNvbGUubG9nKFwicXVlcnlSZXN1bHRTdG9yZSBjaGFuZ2VkOiBcIiwgcHJvcHMucXVlcnlSZXN1bHRTdG9yZSk7XHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IHVwZGF0ZVF1ZXJ5UmVzdWx0cyA9IGFzeW5jICgpID0+IHtcclxuICAgIC8vIGNvbnNvbGUubG9nKFwid2Ugb3V0IGhlcmVcIiwgcHJvcHMucXVlcnkpO1xyXG4gICAgY29uc3QgdHJ1ZVByb3BlcnR5TmFtZXMgPSBnZXRDb2x1bW5Qcm9wZXJ0eU5hbWVzKHByb3BzLnF1ZXJ5KTtcclxuICAgIC8vIGNvbnNvbGUubG9nKFwidHJ1ZSBwcm9wczsgXCIsIHRydWVQcm9wZXJ0eU5hbWVzKTtcclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3BzLmRhdGF2aWV3QVBJLnF1ZXJ5KHByb3BzLnF1ZXJ5KTtcclxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3NmdWwpIHtcclxuICAgICAgY29uc29sZS5sb2coXCJkdiByZXN1bHQgdW5zdWNjZXNzZnVsXCIpO1xyXG4gICAgICAvLyBzZXRRdWVyeVJlc3VsdFN0b3JlKChwcmV2KSA9PiAoe1xyXG4gICAgICAvLyAgIC4uLnByZXYsXHJcbiAgICAgIC8vICAgW3Byb3BzLnVpZF06IHJlc3VsdCBhcyBNb2RpZmllZERhdGF2aWV3UXVlcnlSZXN1bHQsXHJcbiAgICAgIC8vIH0pKTtcclxuICAgICAgcHJvcHMuc2V0UXVlcnlSZXN1bHRTdG9yZShwcm9wcy51aWQsIHsgLi4ucmVzdWx0LCB0cnVlUHJvcGVydHlOYW1lcyB9KTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgcmVzdWx0LnZhbHVlLnZhbHVlcyA9IHJlc3VsdC52YWx1ZS52YWx1ZXMubWFwKChhcnIpID0+XHJcbiAgICAgIGFyci5tYXAoKHYpID0+IHRyeURhdGF2aWV3QXJyYXlUb0FycmF5KHYpKSxcclxuICAgICk7XHJcbiAgICBjb25zb2xlLmxvZyhwZXJmb3JtYW5jZS5ub3coKSk7XHJcbiAgICBjb25zb2xlLmxvZyhwcm9wcy5zb3VyY2UpO1xyXG4gICAgY29uc29sZS5sb2coXCJyZXN1bHQ6IFwiLCByZXN1bHQpO1xyXG4gICAgLy8gc2V0UXVlcnlSZXN1bHRzKHsgLi4ucmVzdWx0LCB0cnVlUHJvcGVydHlOYW1lcyB9KTtcclxuICAgIC8vIHNldFF1ZXJ5UmVzdWx0U3RvcmUoKHByZXYpID0+ICh7XHJcbiAgICAvLyAgIC4uLnByZXYsXHJcbiAgICAvLyAgIFtwcm9wcy51aWRdOiByZXN1bHQgYXMgTW9kaWZpZWREYXRhdmlld1F1ZXJ5UmVzdWx0LFxyXG4gICAgLy8gfSkpO1xyXG4gICAgcHJvcHMuc2V0UXVlcnlSZXN1bHRTdG9yZShwcm9wcy51aWQsIHsgLi4ucmVzdWx0LCB0cnVlUHJvcGVydHlOYW1lcyB9KTtcclxuICB9O1xyXG5cclxuICB1cGRhdGVRdWVyeVJlc3VsdHMoKTtcclxuICByZWdpc3RlckRhdGF2aWV3RXZlbnRzKHByb3BzLnBsdWdpbiwgdXBkYXRlUXVlcnlSZXN1bHRzKTtcclxuXHJcbiAgb25DbGVhbnVwKCgpID0+IHtcclxuICAgIHVucmVnaXN0ZXJEYXRhdmlld0V2ZW50cyhwcm9wcy5wbHVnaW4sIHVwZGF0ZVF1ZXJ5UmVzdWx0cyk7XHJcbiAgfSk7XHJcblxyXG4gIHJldHVybiAoXHJcbiAgICA8PlxyXG4gICAgICA8ZGl2IGNsYXNzPVwiaC1maXQgdy1mdWxsIG92ZXJmbG93LXgtc2Nyb2xsXCI+XHJcbiAgICAgICAgPFRhYmxlIHF1ZXJ5UmVzdWx0cz17cXVlcnlSZXN1bHRzKCl9IGNvZGVCbG9ja0luZm89e3Byb3BzfSAvPlxyXG4gICAgICA8L2Rpdj5cclxuICAgICAgPGRpdiBjbGFzcz1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI+XHJcbiAgICAgICAgPFRvb2xiYXIgY29uZmlnPXtwcm9wcy5jb25maWd9IGNvZGVCbG9ja0luZm89e3Byb3BzfSAvPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIDwvPlxyXG4gICk7XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IEFwcDtcclxuXHJcbmV4cG9ydCBjb25zdCBUb29sYmFyID0gKHByb3BzOiB7XHJcbiAgY29uZmlnOiBEYXRhRWRpdEJsb2NrQ29uZmlnO1xyXG4gIGNvZGVCbG9ja0luZm86IENvZGVCbG9ja0luZm87XHJcbn0pID0+IHtcclxuICBjb25zdCBkYXRhRWRpdEluZm9zID0gcHJvcHMuY29kZUJsb2NrSW5mbztcclxuICBjb25zdCBbaXNDb25maWdPcGVuLCBzZXRDb25maWdPcGVuXSA9IGNyZWF0ZVNpZ25hbChmYWxzZSk7XHJcbiAgY29uc3QgdXBkYXRlQ29uZmlnID0gYXN5bmMgKFxyXG4gICAga2V5OiBEYXRhRWRpdEJsb2NrQ29uZmlnS2V5LFxyXG4gICAgdmFsdWU6IERhdGFFZGl0QmxvY2tDb25maWdbdHlwZW9mIGtleV0sXHJcbiAgKSA9PiB7XHJcbiAgICBhd2FpdCB1cGRhdGVCbG9ja0NvbmZpZyhrZXksIHZhbHVlLCBkYXRhRWRpdEluZm9zKTtcclxuICB9O1xyXG4gIHJldHVybiAoXHJcbiAgICA8PlxyXG4gICAgICA8QmxvY2tDb25maWdNb2RhbFxyXG4gICAgICAgIGNvbmZpZz17cHJvcHMuY29uZmlnfVxyXG4gICAgICAgIGNvZGVCbG9ja0luZm89e3Byb3BzLmNvZGVCbG9ja0luZm99XHJcbiAgICAgICAgb3Blbj17aXNDb25maWdPcGVuKCl9XHJcbiAgICAgICAgc2V0T3Blbj17c2V0Q29uZmlnT3Blbn1cclxuICAgICAgLz5cclxuICAgICAgPGRpdlxyXG4gICAgICAgIGNsYXNzPVwiY2xpY2thYmxlLWljb25cIlxyXG4gICAgICAgIG9uQ2xpY2s9eygpID0+IHNldENvbmZpZ09wZW4oKHByZXYpID0+ICFwcmV2KX1cclxuICAgICAgPlxyXG4gICAgICAgIDxHZWFyIHNpemU9XCIxcmVtXCIgLz5cclxuICAgICAgPC9kaXY+XHJcbiAgICAgIDxGb3IgZWFjaD17T2JqZWN0LmtleXMocHJvcHMuY29uZmlnKSBhcyBEYXRhRWRpdEJsb2NrQ29uZmlnS2V5W119PlxyXG4gICAgICAgIHsoa2V5KSA9PiB7XHJcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb3BzLmNvbmZpZ1trZXldO1xyXG4gICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgPFN3aXRjaD5cclxuICAgICAgICAgICAgICA8TWF0Y2ggd2hlbj17a2V5ID09PSBcImxvY2tFZGl0aW5nXCJ9PlxyXG4gICAgICAgICAgICAgICAgPGRpdlxyXG4gICAgICAgICAgICAgICAgICBjbGFzcz1cImNsaWNrYWJsZS1pY29uXCJcclxuICAgICAgICAgICAgICAgICAgb25DbGljaz17YXN5bmMgKCkgPT4gYXdhaXQgdXBkYXRlQ29uZmlnKGtleSwgIXZhbHVlKX1cclxuICAgICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgICAgPFNob3dcclxuICAgICAgICAgICAgICAgICAgICB3aGVuPXt2YWx1ZSA9PT0gdHJ1ZX1cclxuICAgICAgICAgICAgICAgICAgICBmYWxsYmFjaz17PExvY2tPcGVuIHNpemU9e1wiMXJlbVwifSAvPn1cclxuICAgICAgICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgICAgICAgIDxMb2NrIHNpemU9e1wiMXJlbVwifSAvPlxyXG4gICAgICAgICAgICAgICAgICA8L1Nob3c+XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICA8L01hdGNoPlxyXG4gICAgICAgICAgICA8L1N3aXRjaD5cclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfX1cclxuICAgICAgPC9Gb3I+XHJcbiAgICA8Lz5cclxuICApO1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IEJsb2NrQ29uZmlnTW9kYWwgPSAocHJvcHM6IHtcclxuICBjb25maWc6IERhdGFFZGl0QmxvY2tDb25maWc7XHJcbiAgY29kZUJsb2NrSW5mbzogQ29kZUJsb2NrSW5mbztcclxuICBvcGVuPzogYm9vbGVhbjtcclxuICBzZXRPcGVuPzogU2V0dGVyPGJvb2xlYW4+O1xyXG4gIHRyaWdnZXI/OiBKU1hFbGVtZW50O1xyXG59KSA9PiB7XHJcbiAgY29uc3QgW2Zvcm0sIHNldEZvcm1dID0gY3JlYXRlU3RvcmUocHJvcHMuY29uZmlnKTtcclxuXHJcbiAgY29uc3QgdXBkYXRlRm9ybSA9IChcclxuICAgIGtleToga2V5b2YgRGF0YUVkaXRCbG9ja0NvbmZpZyxcclxuICAgIHZhbHVlOiBEYXRhRWRpdEJsb2NrQ29uZmlnW3R5cGVvZiBrZXldLFxyXG4gICkgPT4ge1xyXG4gICAgc2V0Rm9ybSgocHJldikgPT4gKHsgLi4ucHJldiwgW2tleV06IHZhbHVlIH0pKTtcclxuICB9O1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPERpYWxvZyBvcGVuPXtwcm9wcy5vcGVufSBvbk9wZW5DaGFuZ2U9e3Byb3BzLnNldE9wZW59PlxyXG4gICAgICA8U2hvdyB3aGVuPXtwcm9wcy50cmlnZ2VyfT5cclxuICAgICAgICA8RGlhbG9nVHJpZ2dlcj57cHJvcHMudHJpZ2dlciF9PC9EaWFsb2dUcmlnZ2VyPlxyXG4gICAgICA8L1Nob3c+XHJcbiAgICAgIDxEaWFsb2dDb250ZW50PlxyXG4gICAgICAgIDxEaWFsb2dUaXRsZT5CbG9jayBjb25maWd1cmF0aW9uPC9EaWFsb2dUaXRsZT5cclxuICAgICAgICA8RGlhbG9nRGVzY3JpcHRpb24+XHJcbiAgICAgICAgICBzZWUgdGhlIGRvY3N7XCIgXCJ9XHJcbiAgICAgICAgICA8RXh0ZXJuYWxMaW5rIGhyZWY9XCJodHRwczovL2dpdGh1Yi5jb20vdW54b2svb2JzaWRpYW4tZGF0YWVkaXRcIj5cclxuICAgICAgICAgICAgaGVyZVxyXG4gICAgICAgICAgPC9FeHRlcm5hbExpbms+e1wiIFwifVxyXG4gICAgICAgICAgZm9yIG1vcmUgaW5mb3JtYXRpb25cclxuICAgICAgICA8L0RpYWxvZ0Rlc2NyaXB0aW9uPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJmbGV4IHNpemUtZnVsbCBtYXgtaC1bOTAlXSBmbGV4LWNvbCBnYXAtMiBvdmVyZmxvdy15LWF1dG8gcHItMlwiPlxyXG4gICAgICAgICAgPFNldHRpbmdcclxuICAgICAgICAgICAgdGl0bGU9XCJMb2NrIGVkaXRpbmdcIlxyXG4gICAgICAgICAgICBkZXNjcmlwdGlvbj1cInByZXZlbnRzIGVkaXRpbmcgaW4gYWxsIGNlbGxzIHdoaWNoIG1ha2VzIGxpbmtzIGFuZCB0YWdzXHJcbiAgICAgICAgICAgICAgICBjbGlja2FibGUuXCJcclxuICAgICAgICAgID5cclxuICAgICAgICAgICAgPFRvZ2dsZVxyXG4gICAgICAgICAgICAgIGNoZWNrZWQ9e2Zvcm0ubG9ja0VkaXRpbmd9XHJcbiAgICAgICAgICAgICAgb25DaGVja2VkQ2hhbmdlPXsoYikgPT4gdXBkYXRlRm9ybShcImxvY2tFZGl0aW5nXCIsIGIpfVxyXG4gICAgICAgICAgICAvPlxyXG4gICAgICAgICAgPC9TZXR0aW5nPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDxEaWFsb2dGb290ZXI+XHJcbiAgICAgICAgICA8RGlhbG9nQ2xvc2VcclxuICAgICAgICAgICAgLy8gdmFyaWFudD1cIm91dGxpbmVcIlxyXG4gICAgICAgICAgICBjbGFzcz17YnV0dG9uVmFyaWFudHMub3V0bGluZX1cclxuICAgICAgICAgICAgb25DbGljaz17YXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgIGF3YWl0IHNldEJsb2NrQ29uZmlnKFxyXG4gICAgICAgICAgICAgICAgZGVmYXVsdERhdGFFZGl0QmxvY2tDb25maWcsXHJcbiAgICAgICAgICAgICAgICBwcm9wcy5jb2RlQmxvY2tJbmZvLFxyXG4gICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH19XHJcbiAgICAgICAgICA+XHJcbiAgICAgICAgICAgIHJlc2V0XHJcbiAgICAgICAgICA8L0RpYWxvZ0Nsb3NlPlxyXG4gICAgICAgICAgPERpYWxvZ0Nsb3NlXHJcbiAgICAgICAgICAgIC8vIHZhcmlhbnQ9XCJnaG9zdFwiXHJcbiAgICAgICAgICAgIGNsYXNzPXtidXR0b25WYXJpYW50cy5naG9zdH1cclxuICAgICAgICAgICAgb25DbGljaz17KCkgPT4gcHJvcHMuc2V0T3BlbiAmJiBwcm9wcy5zZXRPcGVuKGZhbHNlKX1cclxuICAgICAgICAgID5cclxuICAgICAgICAgICAgY2FuY2VsXHJcbiAgICAgICAgICA8L0RpYWxvZ0Nsb3NlPlxyXG4gICAgICAgICAgPERpYWxvZ0Nsb3NlXHJcbiAgICAgICAgICAgIC8vIHZhcmlhbnQ9XCJhY2NlbnRcIlxyXG4gICAgICAgICAgICBjbGFzcz17YnV0dG9uVmFyaWFudHMuYWNjZW50fVxyXG4gICAgICAgICAgICBvbkNsaWNrPXthc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgYXdhaXQgc2V0QmxvY2tDb25maWcoZm9ybSwgcHJvcHMuY29kZUJsb2NrSW5mbyk7XHJcbiAgICAgICAgICAgICAgaWYgKCFwcm9wcy5zZXRPcGVuKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgcHJvcHMuc2V0T3BlbihmYWxzZSk7XHJcbiAgICAgICAgICAgIH19XHJcbiAgICAgICAgICA+XHJcbiAgICAgICAgICAgIHNhdmVcclxuICAgICAgICAgIDwvRGlhbG9nQ2xvc2U+XHJcbiAgICAgICAgPC9EaWFsb2dGb290ZXI+XHJcbiAgICAgIDwvRGlhbG9nQ29udGVudD5cclxuICAgIDwvRGlhbG9nPlxyXG4gICk7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgU2V0dGluZyA9IChwcm9wczoge1xyXG4gIHRpdGxlOiBzdHJpbmc7XHJcbiAgZGVzY3JpcHRpb246IHN0cmluZztcclxuICBjaGlsZHJlbjogSlNYRWxlbWVudDtcclxufSkgPT4gKFxyXG4gIDxkaXYgY2xhc3M9XCJmbGV4IHctZnVsbCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGJvcmRlci0wIGJvcmRlci10LVsxcHhdIGJvcmRlci1zb2xpZCBib3JkZXItdC1bdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXIpXSBwdC0yXCI+XHJcbiAgICA8ZGl2PlxyXG4gICAgICA8ZGl2IGNsYXNzPVwic2V0dGluZy1pdGVtLW5hbWVcIj57cHJvcHMudGl0bGV9PC9kaXY+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb25cIj57cHJvcHMuZGVzY3JpcHRpb259PC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuICAgIHtwcm9wcy5jaGlsZHJlbn1cclxuICA8L2Rpdj5cclxuKTtcclxuIiwiLy8gQHJlZnJlc2ggcmVsb2FkXHJcblxyXG5pbXBvcnQgeyByZW5kZXIgfSBmcm9tIFwic29saWQtanMvd2ViXCI7XHJcbmltcG9ydCBBcHAgZnJvbSBcIi4vQXBwLnRzeFwiO1xyXG5pbXBvcnQgXCIuL2luZGV4LmNzc1wiO1xyXG5pbXBvcnQge1xyXG4gIEFwcCBhcyBPYnNpZGlhbkFwcCxcclxuICBOb3RpY2UsXHJcbiAgUGx1Z2luLFxyXG4gIE1hcmtkb3duUmVuZGVyQ2hpbGQsXHJcbn0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7IERhdGF2aWV3QVBJLCBNb2RpZmllZERhdGF2aWV3UXVlcnlSZXN1bHQgfSBmcm9tIFwiLi9saWIvdHlwZXMudHNcIjtcclxuaW1wb3J0IHsgc3BsaXRRdWVyeU9uQ29uZmlnIH0gZnJvbSBcIi4vbGliL3V0aWwudHNcIjtcclxuaW1wb3J0IHsgY3JlYXRlU3RvcmUgfSBmcm9tIFwic29saWQtanMvc3RvcmVcIjtcclxuaW1wb3J0IHsgY3JlYXRlVW5pcXVlSWQgfSBmcm9tIFwic29saWQtanNcIjtcclxuXHJcbmNvbnN0IGdldERhdGF2aWV3QVBJID0gKHBBcHA/OiBPYnNpZGlhbkFwcCkgPT4ge1xyXG4gIGlmIChwQXBwKSB7XHJcbiAgICAvLyBAdHMtaWdub3JlXHJcbiAgICBjb25zdCB7IHBsdWdpbnMgfSA9IHBBcHAucGx1Z2lucztcclxuICAgIGlmIChwbHVnaW5zLmhhc093blByb3BlcnR5KFwiZGF0YXZpZXdcIikpIHtcclxuICAgICAgcmV0dXJuIHBsdWdpbnMuZGF0YXZpZXcuYXBpIGFzIERhdGF2aWV3QVBJO1xyXG4gICAgfVxyXG4gIH1cclxuICAvLyBAdHMtaWdub3JlXHJcbiAgY29uc3QgZ1BsdWdpbnMgPSBhcHAucGx1Z2lucy5wbHVnaW5zO1xyXG4gIGlmIChnUGx1Z2lucy5oYXNPd25Qcm9wZXJ0eShcImRhdGF2aWV3XCIpKSB7XHJcbiAgICByZXR1cm4gZ1BsdWdpbnMuZGF0YXZpZXcuYXBpIGFzIERhdGF2aWV3QVBJO1xyXG4gIH1cclxuICBjb25zdCBtc2cgPSBcIkZhaWxlZCB0byBnZXQgRGF0YXZpZXcgQVBJLiBJcyBEYXRhdmlldyBpbnN0YWxsZWQgJiBlbmFibGVkP1wiO1xyXG4gIG5ldyBOb3RpY2UobXNnKTtcclxuICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERhdGFFZGl0IGV4dGVuZHMgUGx1Z2luIHtcclxuICBhc3luYyBvbmxvYWQoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAvLyBAdHMtaWdub3JlXHJcbiAgICBhd2FpdCBhcHAucGx1Z2lucy5sb2FkUGx1Z2luKFwiZGF0YXZpZXdcIik7XHJcbiAgICAvLyBjb25zdCBkYXRhdmlld0FQSSA9IGdldEFQSSh0aGlzLmFwcCkgYXMgRGF0YXZpZXdBUEk7XHJcblxyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwiZGF0YWVkaXRcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xyXG4gICAgICBjb25zdCBkYXRhdmlld0FQSSA9IGdldERhdGF2aWV3QVBJKHRoaXMuYXBwKSBhcyBEYXRhdmlld0FQSTtcclxuICAgICAgLy8gYmVzdCBwcmFjdGljZSB0byBlbXB0eSB3aGVuIHJlZ2lzdGVyaW5nXHJcbiAgICAgIGVsLmVtcHR5KCk7XHJcbiAgICAgIC8vIGFsbG93cyBhbGwgZGVzY2VuZGVudHMgdG8gdXNlIHR3IHV0aWx5IGNsYXNzZXNcclxuICAgICAgZWwuY2xhc3NMaXN0LnRvZ2dsZShcInR3Y3NzXCIsIHRydWUpO1xyXG4gICAgICAvLyBiZWNhdXNlIHVzZXJzIHdpbGwgc3BlbmQgYSBsb3Qgb2YgdGltZSBob3ZlcmluZyB3aXRoaW5cclxuICAgICAgLy8gSSBkZWNpZGVkIHRvIHJlbW92ZSB0aGUgc2hhZG93IHRoYXQgYXBwZWFycyBvbiBob3ZlclxyXG4gICAgICBlbC5wYXJlbnRFbGVtZW50IS5zdHlsZS5ib3hTaGFkb3cgPSBcIm5vbmVcIjtcclxuICAgICAgLy8gY29uc3QgeyB0ZXh0IH0gPSBjdHguZ2V0U2VjdGlvbkluZm8oZWwpITtcclxuICAgICAgY29uc3QgeyBxdWVyeSwgY29uZmlnIH0gPSBzcGxpdFF1ZXJ5T25Db25maWcoc291cmNlKTtcclxuICAgICAgY29uc3QgdWlkID0gY3JlYXRlVW5pcXVlSWQoKTtcclxuICAgICAgLy8gZm9yIHNvbWUgcmVhc29uLCBkb2luZyB0aGlzIGFzIGEgc2lnbmFsIGluc2lkZSBlYWNoIDxBcHAgLz4gY2F1c2VzIGdsaXRjaGVzIHdoZW4gdXBkYXRpbmcgZnJvbSBkYXRhdmlldyBldmVudHNcclxuICAgICAgLy8gYnV0IHRoaXMgd29ya3MganVzdCBmaW5lXHJcbiAgICAgIGNvbnN0IFtxdWVyeVJlc3VsdFN0b3JlLCBzZXRRdWVyeVJlc3VsdFN0b3JlXSA9IGNyZWF0ZVN0b3JlPFxyXG4gICAgICAgIFJlY29yZDxzdHJpbmcsIE1vZGlmaWVkRGF0YXZpZXdRdWVyeVJlc3VsdD5cclxuICAgICAgPih7fSk7XHJcbiAgICAgIGNvbnN0IGRpc3Bvc2UgPSByZW5kZXIoKCkgPT4ge1xyXG4gICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICA8QXBwXHJcbiAgICAgICAgICAgIHBsdWdpbj17dGhpc31cclxuICAgICAgICAgICAgZWw9e2VsfVxyXG4gICAgICAgICAgICBzb3VyY2U9e3NvdXJjZX1cclxuICAgICAgICAgICAgcXVlcnk9e3F1ZXJ5fVxyXG4gICAgICAgICAgICBjb25maWc9e2NvbmZpZ31cclxuICAgICAgICAgICAgY3R4PXtjdHh9XHJcbiAgICAgICAgICAgIGRhdGF2aWV3QVBJPXtkYXRhdmlld0FQSX1cclxuICAgICAgICAgICAgdWlkPXt1aWR9XHJcbiAgICAgICAgICAgIHF1ZXJ5UmVzdWx0U3RvcmU9e3F1ZXJ5UmVzdWx0U3RvcmV9XHJcbiAgICAgICAgICAgIHNldFF1ZXJ5UmVzdWx0U3RvcmU9e3NldFF1ZXJ5UmVzdWx0U3RvcmV9XHJcbiAgICAgICAgICAvPlxyXG4gICAgICAgICk7XHJcbiAgICAgIH0sIGVsKTtcclxuICAgICAgLyogXHJcbiAgICAgIHRoZSByZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yIGNhbGxiYWNrIGlzIGNhbGxlZFxyXG4gICAgICBldmVyeSB0aW1lIHRoZSBjb2RlIGJsb2NrIGlzIHJlbmRlcmVkLiBEb2luZyB0aGUgYmVsb3dcclxuICAgICAgd2lsbCBjYXVzZSB0aGUgYXNzb2NpYXRlZCBtZENoaWxkIHRvIHRlbGwgc29saWQgdG8gZGlzcG9zZVxyXG4gICAgICBvZiB0aGlzIHJvb3QgYW5kIG5vdCB0cmFjayBpdHMgY29udGV4dC5cclxuICAgICAgKi9cclxuICAgICAgY29uc3QgbWRDaGlsZCA9IG5ldyBNYXJrZG93blJlbmRlckNoaWxkKGVsKTtcclxuICAgICAgbWRDaGlsZC5yZWdpc3RlcigoKSA9PiB7XHJcbiAgICAgICAgZGlzcG9zZSgpO1xyXG4gICAgICAgIHNldFF1ZXJ5UmVzdWx0U3RvcmUoKHByZXYpID0+IHtcclxuICAgICAgICAgIGRlbGV0ZSBwcmV2W3VpZF07XHJcbiAgICAgICAgICByZXR1cm4gcHJldjtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgICAgIGN0eC5hZGRDaGlsZChtZENoaWxkKTtcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXSwibmFtZXMiOlsidmFsdWUiLCJjaGlsZHJlbiIsImkiLCJzb3VyY2VzIiwiZGlzcG9zZSIsImRvY3VtZW50IiwidW53cmFwIiwiTm90aWNlIiwiYXBwIiwicGFyc2VZYW1sIiwic3RyaW5naWZ5WWFtbCIsImRlZmF1bHRBdHRyaWJ1dGVzIiwieG1sbnMiLCJ3aWR0aCIsImhlaWdodCIsInZpZXdCb3giLCJmaWxsIiwic3Ryb2tlIiwiZGVmYXVsdEF0dHJpYnV0ZXNfZGVmYXVsdCIsIkljb24iLCJwcm9wcyIsImxvY2FsUHJvcHMiLCJyZXN0Iiwic3BsaXRQcm9wcyIsIl9lbCQiLCJfdG1wbCQiLCJfJG1lcmdlUHJvcHMiLCJzaXplIiwiY29sb3IiLCJfJG1lbW8iLCJhYnNvbHV0ZVN0cm9rZVdpZHRoIiwiTnVtYmVyIiwic3Ryb2tlV2lkdGgiLCJtZXJnZUNsYXNzZXMiLCJuYW1lIiwidG9LZWJhYkNhc2UiLCJjbGFzcyIsIl8kY3JlYXRlQ29tcG9uZW50IiwiRm9yIiwiZWFjaCIsImljb25Ob2RlIiwiZWxlbWVudE5hbWUiLCJhdHRycyIsIkR5bmFtaWMiLCJjb21wb25lbnQiLCJJY29uX2RlZmF1bHQiLCJ4IiwieSIsInJ4IiwicnkiLCJrZXkiLCJkIiwiTG9jayIsImxvY2tfZGVmYXVsdCIsIkxvY2tPcGVuIiwibG9ja19vcGVuX2RlZmF1bHQiLCJjeCIsImN5IiwiciIsIlNldHRpbmdzIiwic2V0dGluZ3NfZGVmYXVsdCIsIk1hcmtkb3duIiwicmVmIiwiZGl2UHJvcHMiLCJtZCIsImNyZWF0ZU1lbW8iLCJzdHIiLCJtYXJrZG93biIsIkFycmF5IiwiaXNBcnJheSIsImpvaW4iLCJ0b1N0cmluZyIsIkNvbXBvbmVudCIsImNyZWF0ZUVmZmVjdCIsImVtcHR5IiwicmVuZGVyIiwic291cmNlUGF0aCIsIkNoZWNrYm94SW5wdXQiLCJwbHVnaW4iLCJjb25maWciLCJjb2RlQmxvY2tJbmZvIiwiJCRjbGljayIsImUiLCJ1cGRhdGVNZXRhZGF0YVByb3BlcnR5IiwicHJvcGVydHkiLCJjdXJyZW50VGFyZ2V0IiwiY2hlY2tlZCIsImZpbGVQYXRoIiwiXyRlZmZlY3QiLCJkaXNhYmxlZCIsImxvY2tFZGl0aW5nIiwiXyRkZWxlZ2F0ZUV2ZW50cyIsIkRhdGVEYXRldGltZUlucHV0IiwiZGF0YXZpZXdBUEkiLCJsdXhvbiIsIkRhdGVUaW1lIiwiaXNUaW1lIiwiY2hlY2tJZkRhdGVIYXNUaW1lIiwiYWRkRXZlbnRMaXN0ZW5lciIsImlzVmFsaWQiLCJ0YXJnZXQiLCJ2YWxpZGl0eSIsInNldEVkaXRpbmciLCJmb3JtYXQiLCJkdCIsImZyb21Gb3JtYXQiLCJuZXdWYWx1ZSIsInRvRm9ybWF0IiwiZm9ybWF0dGVkT2xkIiwiYXV0b2ZvY3VzIiwiXyRzZXRBdHRyaWJ1dGUiLCJQbHVzIiwicGx1c19kZWZhdWx0IiwiVGV4dElucHV0Iiwic2V0U2l6ZSIsImNyZWF0ZVNpZ25hbCIsImxlbmd0aCIsIiQkaW5wdXQiLCJ1cGRhdGVQcm9wZXJ0eSIsIkxpc3RUYWJsZURhdGFXcmFwcGVyIiwiY3R4IiwiX2VsJDIiLCJmaXJzdENoaWxkIiwidmFsIiwiaW5kZXgiLCJMaXN0VGFibGVEYXRhSXRlbSIsIml0ZW1WYWx1ZSIsIml0ZW1JbmRleCIsInByZXZlbnREZWZhdWx0IiwiaXNFZGl0aW5nIiwiX2VsJDMiLCJfdG1wbCQyIiwiU2hvdyIsIndoZW4iLCJmYWxsYmFjayIsInRyeURhdGF2aWV3TGlua1RvTWFya2Rvd24iLCJvbkNsaWNrIiwidW5kZWZpbmVkIiwiTGlzdElucHV0IiwidmFsdWVUeXBlIiwibmV3VmFsIiwiYXJyIiwiZmlsdGVyIiwiXyIsImNsYXNzTmFtZSIsImNsYXNzR3JvdXAiLCJjbGFzc0xpc3QiLCJhY2Nlc3MiLCJjb250YWlucyIsImdldENvbXB1dGVkU3R5bGUiLCJEQVRBX1RPUF9MQVlFUl9BVFRSIiwib3JpZ2luYWxCb2R5UG9pbnRlckV2ZW50cyIsImhhc0Rpc2FibGVkQm9keVBvaW50ZXJFdmVudHMiLCJsYXllcnMiLCJpbmRleE9mIiwibm9kZSIsImZpbmRJbmRleCIsImxheWVyIiwiZmluZCIsImlzVG9wTW9zdExheWVyIiwiZ2V0UG9pbnRlckJsb2NraW5nTGF5ZXJzIiwiaXNQb2ludGVyQmxvY2tpbmciLCJnZXRUb3BNb3N0UG9pbnRlckJsb2NraW5nTGF5ZXIiLCJzbGljZSIsImhhc1BvaW50ZXJCbG9ja2luZ0xheWVyIiwiaXNCZWxvd1BvaW50ZXJCbG9ja2luZ0xheWVyIiwiaGlnaGVzdEJsb2NraW5nSW5kZXgiLCJhZGRMYXllciIsInB1c2giLCJyZW1vdmVMYXllciIsInNwbGljZSIsImFzc2lnblBvaW50ZXJFdmVudFRvTGF5ZXJzIiwic3R5bGUiLCJwb2ludGVyRXZlbnRzIiwiZGlzYWJsZUJvZHlQb2ludGVyRXZlbnRzIiwib3duZXJEb2N1bWVudCIsImdldERvY3VtZW50IiwiYm9keSIsInJlc3RvcmVCb2R5UG9pbnRlckV2ZW50cyIsInJlbW92ZUF0dHJpYnV0ZSIsImxheWVyU3RhY2siLCJBVVRPRk9DVVNfT05fTU9VTlRfRVZFTlQiLCJBVVRPRk9DVVNfT05fVU5NT1VOVF9FVkVOVCIsIkVWRU5UX09QVElPTlMiLCJidWJibGVzIiwiY2FuY2VsYWJsZSIsImZvY3VzU2NvcGVTdGFjayIsInN0YWNrIiwiYWN0aXZlIiwiYWRkIiwic2NvcGUiLCJwYXVzZSIsInJlbW92ZUl0ZW1Gcm9tQXJyYXkiLCJ1bnNoaWZ0IiwicmVtb3ZlIiwicmVzdW1lIiwiY3JlYXRlRm9jdXNTY29wZSIsImlzUGF1c2VkIiwic2V0SXNQYXVzZWQiLCJmb2N1c1Njb3BlIiwibGFzdEZvY3VzZWRFbGVtZW50Iiwib25Nb3VudEF1dG9Gb2N1cyIsIm9uVW5tb3VudEF1dG9Gb2N1cyIsImNyZWF0ZVNlbnRpbmVsIiwiZWxlbWVudCIsImNyZWF0ZUVsZW1lbnQiLCJzZXRBdHRyaWJ1dGUiLCJ0YWJJbmRleCIsImFzc2lnbiIsInZpc3VhbGx5SGlkZGVuU3R5bGVzIiwidGFiYmFibGVzIiwiY29udGFpbmVyIiwiZ2V0QWxsVGFiYmFibGVJbiIsImVsIiwiaGFzQXR0cmlidXRlIiwiZmlyc3RUYWJiYWJsZSIsIml0ZW1zIiwibGFzdFRhYmJhYmxlIiwic2hvdWxkUHJldmVudFVubW91bnRBdXRvRm9jdXMiLCJhY3RpdmVFbGVtZW50IiwiZ2V0QWN0aXZlRWxlbWVudCIsImlzRm9jdXNhYmxlIiwicHJldmlvdXNseUZvY3VzZWRFbGVtZW50IiwiaGFzRm9jdXNlZENhbmRpZGF0ZSIsIm1vdW50RXZlbnQiLCJDdXN0b21FdmVudCIsImRpc3BhdGNoRXZlbnQiLCJkZWZhdWx0UHJldmVudGVkIiwic2V0VGltZW91dCIsImZvY3VzV2l0aG91dFNjcm9sbGluZyIsIm9uQ2xlYW51cCIsInJlbW92ZUV2ZW50TGlzdGVuZXIiLCJ1bm1vdW50RXZlbnQiLCJ0cmFwRm9jdXMiLCJvbkZvY3VzSW4iLCJldmVudCIsImNsb3Nlc3QiLCJvbkZvY3VzT3V0IiwicmVsYXRlZFRhcmdldCIsInN0YXJ0U2VudGluZWwiLCJpbnNlcnRBZGphY2VudEVsZW1lbnQiLCJlbmRTZW50aW5lbCIsIm9uRm9jdXMiLCJmaXJzdCIsImxhc3QiLCJvYnNlcnZlciIsIk11dGF0aW9uT2JzZXJ2ZXIiLCJtdXRhdGlvbnMiLCJtdXRhdGlvbiIsInByZXZpb3VzU2libGluZyIsIm5leHRTaWJsaW5nIiwib2JzZXJ2ZSIsImNoaWxkTGlzdCIsInN1YnRyZWUiLCJkaXNjb25uZWN0IiwiREFUQV9MSVZFX0FOTk9VTkNFUl9BVFRSIiwiY3JlYXRlSGlkZU91dHNpZGUiLCJpc0Rpc2FibGVkIiwiYXJpYUhpZGVPdXRzaWRlIiwidGFyZ2V0cyIsInJvb3QiLCJyZWZDb3VudE1hcCIsIldlYWtNYXAiLCJvYnNlcnZlclN0YWNrIiwidmlzaWJsZU5vZGVzIiwiU2V0IiwiaGlkZGVuTm9kZXMiLCJ3YWxrIiwicm9vdDIiLCJxdWVyeVNlbGVjdG9yQWxsIiwiYWNjZXB0Tm9kZSIsImhhcyIsInBhcmVudEVsZW1lbnQiLCJnZXRBdHRyaWJ1dGUiLCJOb2RlRmlsdGVyIiwiRklMVEVSX1JFSkVDVCIsIkZJTFRFUl9TS0lQIiwiRklMVEVSX0FDQ0VQVCIsIndhbGtlciIsImNyZWF0ZVRyZWVXYWxrZXIiLCJTSE9XX0VMRU1FTlQiLCJhY2NlcHRSb290IiwiaGlkZSIsIm5leHROb2RlIiwicmVmQ291bnQiLCJnZXQiLCJzZXQiLCJjaGFuZ2VzIiwiY2hhbmdlIiwidHlwZSIsImFkZGVkTm9kZXMiLCJzb21lIiwicmVtb3ZlZE5vZGVzIiwiRWxlbWVudCIsImRlbGV0ZSIsIkhUTUxFbGVtZW50IiwiU1ZHRWxlbWVudCIsImRhdGFzZXQiLCJsaXZlQW5ub3VuY2VyIiwicmVhY3RBcmlhVG9wTGF5ZXIiLCJvYnNlcnZlcldyYXBwZXIiLCJjb3VudCIsInBvcCIsImNyZWF0ZUVzY2FwZUtleURvd24iLCJoYW5kbGVLZXlEb3duIiwiRXZlbnRLZXkiLCJFc2NhcGUiLCJvbkVzY2FwZUtleURvd24iLCJQT0lOVEVSX0RPV05fT1VUU0lERV9FVkVOVCIsIkZPQ1VTX09VVFNJREVfRVZFTlQiLCJjcmVhdGVJbnRlcmFjdE91dHNpZGUiLCJwb2ludGVyRG93blRpbWVvdXRJZCIsImNsaWNrSGFuZGxlciIsIm5vb3AiLCJvblBvaW50ZXJEb3duT3V0c2lkZSIsIm9uRm9jdXNPdXRzaWRlIiwib25JbnRlcmFjdE91dHNpZGUiLCJpc0V2ZW50T3V0c2lkZSIsInNob3VsZEV4Y2x1ZGVFbGVtZW50Iiwib25Qb2ludGVyRG93biIsImhhbmRsZXIiLCJoYW5kbGVyMiIsImNvbXBvc2VFdmVudEhhbmRsZXJzIiwib25jZSIsInBvaW50ZXJEb3duT3V0c2lkZUV2ZW50IiwiZGV0YWlsIiwib3JpZ2luYWxFdmVudCIsImlzQ29udGV4dE1lbnUiLCJidXR0b24iLCJpc0N0cmxLZXkiLCJwb2ludGVyVHlwZSIsImZvY3VzT3V0c2lkZUV2ZW50Iiwid2luZG93IiwiY2xlYXJUaW1lb3V0IiwiUG9seW1vcnBoaWMiLCJsb2NhbCIsIm90aGVycyIsImFzIiwiRXJyb3IiLCJEaXNtaXNzYWJsZUxheWVyQ29udGV4dCIsImNyZWF0ZUNvbnRleHQiLCJ1c2VPcHRpb25hbERpc21pc3NhYmxlTGF5ZXJDb250ZXh0IiwidXNlQ29udGV4dCIsIkRpc21pc3NhYmxlTGF5ZXIiLCJwYXJlbnRDb250ZXh0IiwibmVzdGVkTGF5ZXJzIiwicmVnaXN0ZXJOZXN0ZWRMYXllciIsInBhcmVudFVucmVnaXN0ZXIiLCJleGNsdWRlZEVsZW1lbnRzIiwiYnlwYXNzVG9wTW9zdExheWVyQ2hlY2siLCJvbkRpc21pc3MiLCJvbk1vdW50IiwiZGlzYWJsZU91dHNpZGVQb2ludGVyRXZlbnRzIiwiZGlzbWlzcyIsInVucmVnaXN0ZXJGcm9tUGFyZW50TGF5ZXIiLCJvbiIsInJlZjIiLCJkZWZlciIsImNvbnRleHQiLCJQcm92aWRlciIsInIkIiwiX3JlZiQiLCJtZXJnZVJlZnMiLCJjcmVhdGVDb250cm9sbGFibGVTaWduYWwiLCJfdmFsdWUiLCJfc2V0VmFsdWUiLCJkZWZhdWx0VmFsdWUiLCJpc0NvbnRyb2xsZWQiLCJzZXRWYWx1ZSIsIm5leHQiLCJ1bnRyYWNrIiwibmV4dFZhbHVlIiwiYWNjZXNzV2l0aCIsIk9iamVjdCIsImlzIiwib25DaGFuZ2UiLCJjcmVhdGVDb250cm9sbGFibGVCb29sZWFuU2lnbmFsIiwiY3JlYXRlRGlzY2xvc3VyZVN0YXRlIiwiaXNPcGVuIiwic2V0SXNPcGVuIiwib3BlbiIsImRlZmF1bHRPcGVuIiwib25PcGVuQ2hhbmdlIiwiY2xvc2UiLCJ0b2dnbGUiLCJjcmVhdGVUYWdOYW1lIiwidGFnTmFtZSIsInNldFRhZ05hbWUiLCJzdHJpbmdPclVuZGVmaW5lZCIsInRvTG93ZXJDYXNlIiwiaXNTdHJpbmciLCJfX2RlZlByb3AiLCJkZWZpbmVQcm9wZXJ0eSIsIl9fZXhwb3J0IiwiYWxsIiwiZW51bWVyYWJsZSIsImJ1dHRvbl9leHBvcnRzIiwiQnV0dG9uIiwiUm9vdCIsIkJ1dHRvblJvb3QiLCJCVVRUT05fSU5QVVRfVFlQRVMiLCJpc0J1dHRvbiIsIm1lcmdlZFByb3BzIiwibWVyZ2VEZWZhdWx0UHJvcHMiLCJpc05hdGl2ZUJ1dHRvbiIsImVsZW1lbnRUYWdOYW1lIiwiaXNOYXRpdmVJbnB1dCIsImlzTmF0aXZlTGluayIsInJvbGUiLCJjcmVhdGVSZWdpc3RlcklkIiwic2V0dGVyIiwiaWQiLCJ2IiwiYWN0aXZlU3R5bGVzIiwiTWFwIiwiY3JlYXRlU3R5bGUiLCJwcm9wZXJ0aWVzIiwib3JpZ2luYWxTdHlsZXMiLCJhY3RpdmVTdHlsZSIsImFjdGl2ZUNvdW50IiwibWFwIiwic2V0UHJvcGVydHkiLCJhY3RpdmVTdHlsZTIiLCJlbnRyaWVzIiwicmVtb3ZlUHJvcGVydHkiLCJjbGVhbnVwIiwic3R5bGVfZGVmYXVsdCIsImdldFNjcm9sbERpbWVuc2lvbnMiLCJheGlzIiwiY2xpZW50V2lkdGgiLCJzY3JvbGxMZWZ0Iiwic2Nyb2xsV2lkdGgiLCJjbGllbnRIZWlnaHQiLCJzY3JvbGxUb3AiLCJzY3JvbGxIZWlnaHQiLCJpc1Njcm9sbENvbnRhaW5lciIsInN0eWxlcyIsIm92ZXJmbG93Iiwib3ZlcmZsb3dYIiwib3ZlcmZsb3dZIiwiZ2V0U2Nyb2xsQXRMb2NhdGlvbiIsImxvY2F0aW9uIiwic3RvcEF0IiwiZGlyZWN0aW9uRmFjdG9yIiwiZGlyZWN0aW9uIiwiY3VycmVudEVsZW1lbnQiLCJhdmFpbGFibGVTY3JvbGwiLCJhdmFpbGFibGVTY3JvbGxUb3AiLCJ3cmFwcGVyUmVhY2hlZCIsImNsaWVudFNpemUiLCJzY3JvbGxPZmZzZXQiLCJzY3JvbGxTaXplIiwic2Nyb2xsZWQiLCJkb2N1bWVudEVsZW1lbnQiLCJfJGhvc3QiLCJwcmV2ZW50U2Nyb2xsU3RhY2siLCJzZXRQcmV2ZW50U2Nyb2xsU3RhY2siLCJpc0FjdGl2ZSIsImNyZWF0ZVByZXZlbnRTY3JvbGwiLCJkZWZhdWx0ZWRQcm9wcyIsIm1lcmdlUHJvcHMiLCJlbmFibGVkIiwiaGlkZVNjcm9sbGJhciIsInByZXZlbnRTY3JvbGxiYXJTaGlmdCIsInByZXZlbnRTY3JvbGxiYXJTaGlmdE1vZGUiLCJyZXN0b3JlU2Nyb2xsUG9zaXRpb24iLCJhbGxvd1BpbmNoWm9vbSIsInByZXZlbnRTY3JvbGxJZCIsImNyZWF0ZVVuaXF1ZUlkIiwiY3VycmVudFRvdWNoU3RhcnQiLCJjdXJyZW50VG91Y2hTdGFydEF4aXMiLCJjdXJyZW50VG91Y2hTdGFydERlbHRhIiwic2Nyb2xsYmFyV2lkdGgiLCJpbm5lcldpZHRoIiwib2Zmc2V0V2lkdGgiLCJwYWRkaW5nUmlnaHQiLCJtYXJnaW5SaWdodCIsIm9mZnNldFRvcCIsInNjcm9sbFkiLCJvZmZzZXRMZWZ0Iiwic2Nyb2xsWCIsInNjcm9sbFRvIiwibWF5YmVQcmV2ZW50V2hlZWwiLCJwYXNzaXZlIiwibG9nVG91Y2hTdGFydCIsIm1heWJlUHJldmVudFRvdWNoIiwiZ2V0VG91Y2hYWSIsIndyYXBwZXIiLCJkZWx0YSIsImdldERlbHRhWFkiLCJNYXRoIiwiYWJzIiwiYXhpc0RlbHRhIiwicmVzdWx0c0luU2Nyb2xsIiwid291bGRTY3JvbGwiLCJzaG91bGRDYW5jZWwiLCJ0b3VjaGVzIiwidG91Y2giLCJ3b3VsZFJlc3VsdEluU2Nyb2xsIiwiZGVsdGFYIiwiZGVsdGFZIiwiY2hhbmdlZFRvdWNoZXMiLCJjbGllbnRYIiwiY2xpZW50WSIsInRhcmdldEluV3JhcHBlciIsInByZXZlbnRTY3JvbGxfZGVmYXVsdCIsInNyY19kZWZhdWx0IiwiY3JlYXRlUHJlc2VuY2UiLCJyZWZTdHlsZXMiLCJnZXRBbmltYXRpb25OYW1lIiwiYW5pbWF0aW9uTmFtZSIsInByZXNlbnRTdGF0ZSIsInNldFByZXNlbnRTdGF0ZSIsInNob3ciLCJwcmV2U2hvdyIsInByZXZBbmltYXRpb25OYW1lIiwiY3VycmVudEFuaW1hdGlvbk5hbWUiLCJkaXNwbGF5IiwiaXNBbmltYXRpbmciLCJoYW5kbGVBbmltYXRpb25TdGFydCIsImhhbmRsZUFuaW1hdGlvbkVuZCIsImlzQ3VycmVudEFuaW1hdGlvbiIsImluY2x1ZGVzIiwicHJlc2VudCIsInN0YXRlIiwicHJlc2VuY2VfZGVmYXVsdCIsImRpYWxvZ19leHBvcnRzIiwiQ2xvc2VCdXR0b24iLCJEaWFsb2dDbG9zZUJ1dHRvbiIsIkNvbnRlbnQiLCJEaWFsb2dDb250ZW50IiwiRGVzY3JpcHRpb24iLCJEaWFsb2dEZXNjcmlwdGlvbiIsIkRpYWxvZyIsIk92ZXJsYXkiLCJEaWFsb2dPdmVybGF5IiwiUG9ydGFsIiwiRGlhbG9nUG9ydGFsIiwiRGlhbG9nUm9vdCIsIlRpdGxlIiwiRGlhbG9nVGl0bGUiLCJUcmlnZ2VyIiwiRGlhbG9nVHJpZ2dlciIsIkRpYWxvZ0NvbnRleHQiLCJ1c2VEaWFsb2dDb250ZXh0IiwidHJhbnNsYXRpb25zIiwiZ2VuZXJhdGVJZCIsInNwbGl0UHJvcHMyIiwiaGFzSW50ZXJhY3RlZE91dHNpZGUiLCJoYXNQb2ludGVyRG93bk91dHNpZGUiLCJtb2RhbCIsInRyaWdnZXJSZWYiLCJvbkNsb3NlQXV0b0ZvY3VzIiwicHJldmVudFNjcm9sbCIsIm9uT3BlbkF1dG9Gb2N1cyIsInJlZ2lzdGVyQ29udGVudElkIiwiY29udGVudFByZXNlbnQiLCJzZXRDb250ZW50UmVmIiwidGl0bGVJZCIsImRlc2NyaXB0aW9uSWQiLCJtZXJnZURlZmF1bHRQcm9wczIiLCJzcGxpdFByb3BzMyIsImNyZWF0ZUVmZmVjdDIiLCJvbkNsZWFudXAyIiwicmVnaXN0ZXJEZXNjcmlwdGlvbklkIiwic3BsaXRQcm9wczQiLCJTaG93MiIsIm92ZXJsYXlQcmVzZW50IiwiX3JlZiQyIiwibWVyZ2VSZWZzMiIsInNldE92ZXJsYXlSZWYiLCJTaG93MyIsIkRJQUxPR19JTlRMX1RSQU5TTEFUSU9OUyIsImRlZmF1bHRJZCIsIm1lcmdlRGVmYXVsdFByb3BzMyIsImNvbnRlbnRJZCIsInNldENvbnRlbnRJZCIsInNldFRpdGxlSWQiLCJzZXREZXNjcmlwdGlvbklkIiwib3ZlcmxheVJlZiIsImNvbnRlbnRSZWYiLCJzZXRUcmlnZ2VyUmVmIiwiZGlzY2xvc3VyZVN0YXRlIiwic2hvdWxkTW91bnQiLCJmb3JjZU1vdW50IiwiY3JlYXRlR2VuZXJhdGVJZCIsInJlZ2lzdGVyVGl0bGVJZCIsIm1lcmdlRGVmYXVsdFByb3BzNCIsInNwbGl0UHJvcHM1IiwiY3JlYXRlRWZmZWN0MyIsIm9uQ2xlYW51cDMiLCJzcGxpdFByb3BzNiIsIl9yZWYkMyIsIm1lcmdlUmVmczMiLCJidXR0b25WYXJpYW50cyIsImRlZmF1bHQiLCJnaG9zdCIsIm91dGxpbmUiLCJhY2NlbnQiLCJkZXN0cnVjdGl2ZSIsIkRpYWxvZ1ByaW1pdGl2ZSIsIkRpYWxvZ0Nsb3NlIiwiY24iLCJEaWFsb2dDbG9zZVgiLCJfJGluc2VydCIsIkRpYWxvZ0hlYWRlciIsIl90bXBsJDMiLCJfJHNwcmVhZCIsIkRpYWxvZ0Zvb3RlciIsIl9lbCQ0IiwiRXh0ZXJuYWxMaW5rIiwiTWludXMiLCJtaW51c19kZWZhdWx0IiwiUGFyZW50aGVzZXMiLCJwYXJlbnRoZXNlc19kZWZhdWx0IiwiTnVtYmVySW5wdXQiLCJ0b051bWJlciIsIk51bWJlckJ1dHRvbnMiLCJOdW1iZXJFeHByZXNzaW9uQnV0dG9uIiwic2V0T3BlbiIsImNhbGN1bGF0ZWQiLCJzZXRDYWxjdWxhdGVkIiwiYiIsImhyZWYiLCJfdG1wbCQ0IiwiX2VsJDciLCJfdG1wbCQ1IiwiZXhwIiwicmVwbGFjZUFsbCIsInRyaW0iLCJyZXN1bHQiLCJwbHVnaW5zIiwiZGF0YXZpZXciLCJhcGkiLCJldmFsdWF0ZSIsInN1Y2Nlc3NmdWwiLCJOYU4iLCIkJGtleWRvd24iLCJpc05hTiIsIl9lbCQ4IiwiX3RtcGwkNyIsIl9lbCQxMiIsIl90bXBsJDkiLCJfdG1wbCQ2IiwiX2VsJDExIiwiX3RtcGwkOCIsIlRhYmxlRGF0YSIsInNldHRpbmdzIiwidGFibGVJZENvbHVtbk5hbWUiLCJnZXRWYWx1ZVR5cGUiLCJoZWFkZXIiLCJpc0VkaXRhYmxlUHJvcGVydHkiLCJDT01QTEVYX1BST1BFUlRZX1BMQUNFSE9MREVSIiwiXyRhZGRFdmVudExpc3RlbmVyIiwib25Nb3VzZU1vdmUiLCJUYWJsZURhdGFEaXNwbGF5IiwiVGFibGVEYXRhRWRpdCIsIl8kcCIsIl8kc3R5bGUiLCJkZWZhdWx0RGF0ZUZvcm1hdCIsImRlZmF1bHREYXRlVGltZUZvcm1hdCIsImhpZ2hsaWdodFN0eWxlIiwiZHJhZ2dlZE92ZXJSaWdodCIsImRyYWdnZWRPdmVyTGVmdCIsImxhc3RDZWxsSGlnaGxpZ2h0IiwiVGFibGVCb2R5Iiwicm93cyIsInJvdyIsInJvd0luZGV4IiwidmFsdWVJbmRleCIsImhlYWRlcnMiLCJnZXRJZENvbHVtbkluZGV4IiwicGF0aCIsImhpZ2hsaWdodEluZGV4Iiwic2V0RHJhZ2dlZE92ZXJJbmRleCIsImRyYWdnZWRPdmVySW5kZXgiLCJHcmlwSG9yaXpvbnRhbCIsImdyaXBfaG9yaXpvbnRhbF9kZWZhdWx0IiwiVGFibGVIZWFkIiwidHJhbnNsYXRlWCIsInNldFRyYW5zbGF0ZVgiLCJsYXN0TW91c2VQb3MiLCJvbk1vdXNlVXAiLCJxdWVyeSIsInZhdWx0Iiwic2VjdGlvbkluZm8iLCJnZXRTZWN0aW9uSW5mbyIsImxpbmVTdGFydCIsInRleHQiLCJjb250ZW50IiwiZmlsZSIsImdldEZpbGVCeVBhdGgiLCJsaW5lcyIsInNwbGl0IiwibGluZSIsInByZVRhYmxlTGluZSIsImdldFRhYmxlTGluZSIsInRhYmxlTGluZUluZGV4IiwiaXNXaXRob3V0SWQiLCJSZWdFeHAiLCJ0ZXN0IiwiaXNEcmFnZ2luZ0RlZmF1bHRJZCIsImlzRHJhZ2dlZE92ZXJEZWZhdWx0SWQiLCJpc1JlbGF0aW5nVG9EZWZhdWx0SWQiLCJ0YWJsZUxpbmUiLCJyZXBsYWNlIiwidGFibGVLZXl3b3JkIiwicHJlQ29scyIsImMiLCJjb2xzIiwiZHJhZ2dlZEluZGV4IiwiY29sc1dpdGhvdXRIaWdobGlnaHQiLCJ0b1NwbGljZWQiLCJuZXdDb2xzIiwibmV3Q29udGVudCIsIm1vZGlmeSIsInNldEhpZ2hsaWdodEluZGV4IiwiX2VsJDUiLCIkJG1vdXNlbW92ZSIsIiQkbW91c2Vkb3duIiwiX3AkIiwiX3YkIiwiX3YkMiIsImJhY2tncm91bmQiLCJ0cmFuc2xhdGUiLCJjdXJzb3IiLCJfJGNsYXNzTmFtZSIsInQiLCJoIiwiX2VsJDYiLCJUYWJsZSIsImlzQWRkQ29sdW1uRGlhbG9nT3BlbiIsInNldEFkZENvbHVtbkRpYWxvZ09wZW4iLCJxdWVyeVJlc3VsdHMiLCJUYWJsZUZhbGxiYWNrIiwidHJ1ZVByb3BlcnR5TmFtZXMiLCJ2YWx1ZXMiLCJBZGRDb2x1bW5CdXR0b24iLCJlcnJvciIsInByb3BlcnR5VmFsdWUiLCJzZXRQcm9wZXJ0eVZhbHVlIiwiYWxpYXNWYWx1ZSIsInNldEFsaWFzVmFsdWUiLCJwcm9wIiwiYWxpYXMiLCJhbGlhc1N0ciIsImFkZENvbCIsImdldEV4aXN0aW5nUHJvcGVydGllcyIsInByb3BlcnR5TmFtZXMiLCJrZXlzIiwic29ydCIsIl9lbCQ5IiwiX2VsJDEwIiwiX2VsJDE2IiwiX2VsJDEzIiwiX2VsJDE0IiwiX2VsJDE1IiwiVG9nZ2xlIiwiaXNDaGVja2VkIiwic2V0Q2hlY2tlZCIsInByZXYiLCJvbkNoZWNrZWRDaGFuZ2UiLCJBcHAiLCJsb2ciLCJzb3VyY2UiLCJxdWVyeVJlc3VsdFN0b3JlIiwidWlkIiwidXBkYXRlUXVlcnlSZXN1bHRzIiwiZ2V0Q29sdW1uUHJvcGVydHlOYW1lcyIsImNvbnNvbGUiLCJzZXRRdWVyeVJlc3VsdFN0b3JlIiwidHJ5RGF0YXZpZXdBcnJheVRvQXJyYXkiLCJwZXJmb3JtYW5jZSIsIm5vdyIsIlRvb2xiYXIiLCJkYXRhRWRpdEluZm9zIiwiaXNDb25maWdPcGVuIiwic2V0Q29uZmlnT3BlbiIsInVwZGF0ZUNvbmZpZyIsInVwZGF0ZUJsb2NrQ29uZmlnIiwiQmxvY2tDb25maWdNb2RhbCIsIkdlYXIiLCJTd2l0Y2giLCJNYXRjaCIsImZvcm0iLCJzZXRGb3JtIiwiY3JlYXRlU3RvcmUiLCJ1cGRhdGVGb3JtIiwidHJpZ2dlciIsIlNldHRpbmciLCJ0aXRsZSIsImRlc2NyaXB0aW9uIiwic2V0QmxvY2tDb25maWciLCJkZWZhdWx0RGF0YUVkaXRCbG9ja0NvbmZpZyIsImdldERhdGF2aWV3QVBJIiwicEFwcCIsImhhc093blByb3BlcnR5IiwiZ1BsdWdpbnMiLCJtc2ciLCJEYXRhRWRpdCIsIlBsdWdpbiIsIm9ubG9hZCIsImxvYWRQbHVnaW4iLCJyZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yIiwiYm94U2hhZG93Iiwic3BsaXRRdWVyeU9uQ29uZmlnIiwiX3NlbGYkIiwibWRDaGlsZCIsIk1hcmtkb3duUmVuZGVyQ2hpbGQiLCJyZWdpc3RlciIsImFkZENoaWxkIl0sIm1hcHBpbmdzIjoiOztBQXNIQSxNQUFNLGVBQWU7QUFBQSxFQUNuQixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQ1o7QUFZQSxNQUFNLFVBQVUsQ0FBQyxHQUFHLE1BQU0sTUFBTTtBQUNoQyxNQUFNLFNBQVMsT0FBTyxhQUFhO0FBQ25DLE1BQU0sU0FBUyxPQUFPLGFBQWE7QUFFbkMsTUFBTSxnQkFBZ0I7QUFBQSxFQUNwQixRQUFRO0FBQ1Y7QUFFQSxJQUFJLGFBQWE7QUFDakIsTUFBTSxRQUFRO0FBQ2QsTUFBTSxVQUFVO0FBQ2hCLE1BQU0sVUFBVTtBQUFBLEVBQ2QsT0FBTztBQUFBLEVBQ1AsVUFBVTtBQUFBLEVBQ1YsU0FBUztBQUFBLEVBQ1QsT0FBTztBQUNUO0FBRUEsSUFBSSxRQUFRO0FBQ1osSUFBSSxhQUFhO0FBRWpCLElBQUksdUJBQXVCO0FBQzNCLElBQUksV0FBVztBQUNmLElBQUksVUFBVTtBQUNkLElBQUksVUFBVTtBQUNkLElBQUksWUFBWTtBQUNoQixTQUFTLFdBQVcsSUFBSSxlQUFlO0FBQ3JDLFFBQU0sV0FBVyxVQUNmLFFBQVEsT0FDUixVQUFVLEdBQUcsV0FBVyxHQUN4QixVQUFVLGtCQUFrQixTQUFZLFFBQVEsZUFDaEQsT0FBTyxVQUNILFVBQ0E7QUFBQSxJQUNFLE9BQU87QUFBQSxJQUNQLFVBQVU7QUFBQSxJQUNWLFNBQVMsVUFBVSxRQUFRLFVBQVU7QUFBQSxJQUNyQyxPQUFPO0FBQUEsRUFDUixHQUNMLFdBQVcsVUFBVSxLQUFLLE1BQU0sR0FBRyxNQUFNLFFBQVEsTUFBTSxVQUFVLElBQUksQ0FBQyxDQUFDO0FBQ3pFLFVBQVE7QUFDUixhQUFXO0FBQ1gsTUFBSTtBQUNGLFdBQU8sV0FBVyxVQUFVLElBQUk7QUFBQSxFQUNwQyxVQUFZO0FBQ1IsZUFBVztBQUNYLFlBQVE7QUFBQSxFQUNUO0FBQ0g7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ckU7QUFDQSxNQUFNLGtCQUFnQyxvQkFBSSxJQUFJO0FBQUEsRUFDNUM7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRixDQUFDO0FBQ0QsTUFBTSxjQUE0QixvQkFBSSxJQUFJO0FBQUEsRUFDeEM7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7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QUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxRQUFRLFNBQVMsT0FBTyxVQUFVLFNBQVM7QUFBQSxNQUNsRSxDQUFPO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BTUQsR0FBRyxDQUFDO0FBQUEsUUFDRixHQUFHLENBQUMsT0FBTztBQUFBLE1BQ25CLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsR0FBRyxDQUFDO0FBQUEsUUFDRixHQUFHLENBQUMsTUFBTTtBQUFBLE1BQ2xCLENBQU87QUFBQTtB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QUNSLFNBQVMsQ0FBQyxZQUFZO0FBQUEsTUFDOUIsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxhQUFhLENBQUM7QUFBQSxRQUNaLGFBQWEsQ0FBQyxZQUFZO0FBQUEsTUFDbEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxhQUFhLENBQUM7QUFBQSxRQUNaLGFBQWEsQ0FBQyxZQUFZO0FBQUEsTUFDbEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxhQUFhLENBQUM7QUFBQSxRQUNaLGFBQWEsQ0FBQyxZQUFZO0FBQUEsTUFDbEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxhQUFhLENBQUM7QUFBQSxRQUNaLGFBQWEsQ0FBQyxZQUFZO0FBQUEsTUFDbEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxhQUFhLENBQUM7QUFBQSxRQUNaLGFBQWEsQ0FBQyxZQUFZO0FBQUEsTUFDbEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxhQUFhLENBQUM7QUFBQSxRQUNaLGFBQWEsQ0FBQyxZQUFZO0FBQUEsTUFDbEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxZQUFZLENBQUM7QUFBQSxRQUNYLFFBQVEsQ0FBQyxXQUFXO0FBQUEsTUFDNUIsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLFlBQVksQ0FBQyxXQUFXO0FBQUEsTUFDaEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLFlBQVksQ0FBQyxXQUFXO0FBQUEsTUFDaEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLFlBQVksQ0FBQyxXQUFXO0FBQUEsTUFDaEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLFlBQVksQ0FBQyxXQUFXO0FBQUEsTUFDaEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLFlBQVksQ0FBQyxXQUFXO0FBQUEsTUFDaEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLFlBQVksQ0FBQyxXQUFXO0FBQUEsTUFDaEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLFlBQVksQ0FBQyxXQUFX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QUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsWUFBWSxDQUFDO0FBQUEsUUFDWCxZQUFZLHdCQUF5QjtBQUFBLE1BQzdDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtB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UUFBQSxJQUFJNWMsTUFBTTRjLEdBQUc7QUFDckI7QUFFQSxNQUFxQkMsaUJBQWlCQyxTQUFBQSxPQUFPO0FBQUEsRUFDM0MsTUFBTUMsU0FBd0I7QUFFdEJ6eEIsVUFBQUEsSUFBSSttQixRQUFRMkssV0FBVyxVQUFVO0FBR3ZDLFNBQUtDLG1DQUFtQyxZQUFZLENBQUN2QyxRQUFRdmlCLElBQUk3RixRQUFRO0FBQ2pFM0IsWUFBQUEsY0FBYzZyQixlQUFlLEtBQUtseEIsR0FBRztBQUUzQzZNLFNBQUczSSxNQUFNO0FBRU53RSxTQUFBQSxVQUFVOE8sT0FBTyxTQUFTLElBQUk7QUFHOUJoSCxTQUFBQSxjQUFlcEcsTUFBTXduQixZQUFZO0FBRTlCLFlBQUE7QUFBQSxRQUFFekg7QUFBQUEsUUFBTzVsQjtBQUFBQSxNQUFBQSxJQUFXc3RCLG1CQUFtQnpDLE1BQU07QUFDbkQsWUFBTUUsTUFBTTFTO0FBR1osWUFBTSxDQUFDeVMsa0JBQWtCSyxtQkFBbUIsSUFBSWdCLFlBRTlDLENBQUUsQ0FBQTtBQUNFOXdCLFlBQUFBLFdBQVV1RSxPQUFPLE1BQU07QUFBQSxjQUFBMnRCLFNBQUE7QUFDM0IsZUFBQWp3QixnQkFDR3F0QixLQUFHO0FBQUEsVUFDRjVxQixRQUFNd3RCO0FBQUFBLFVBQ05qbEI7QUFBQUEsVUFDQXVpQjtBQUFBQSxVQUNBakY7QUFBQUEsVUFDQTVsQjtBQUFBQSxVQUNBeUM7QUFBQUEsVUFDQTNCO0FBQUFBLFVBQ0FpcUI7QUFBQUEsVUFDQUQ7QUFBQUEsVUFDQUs7QUFBQUEsUUFBQUEsQ0FBd0M7QUFBQSxTQUczQzdpQixFQUFFO0FBT0NrbEIsWUFBQUEsVUFBVSxJQUFJQyw2QkFBb0JubEIsRUFBRTtBQUMxQ2tsQixjQUFRRSxTQUFTLE1BQU07QUFDYixRQUFBcnlCO0FBQ1I4dkIsNEJBQXFCVixDQUFTLFNBQUE7QUFDNUIsaUJBQU9BLEtBQUtNLEdBQUc7QUFDUk4saUJBQUFBO0FBQUFBLFFBQUFBLENBQ1I7QUFBQSxNQUFBLENBQ0Y7QUFDRGhvQixVQUFJa3JCLFNBQVNILE9BQU87QUFBQSxJQUFBLENBQ3JCO0FBQUEsRUFDSDtBQUNGOzsiLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCwxLDIsNSw2LDcsOCw5LDEyLDE0LDE3LDE4LDIwLDIxLDIyLDIzLDI0LDI1LDI2LDI3LDI4LDI5LDMwLDMxLDMyLDMzLDM0LDM1LDM2LDM3LDM4LDM5LDQwLDQxLDQyLDQ2LDQ3LDUxXX0=
