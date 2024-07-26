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
const defaultQueryResult = {
  successful: true,
  value: {
    headers: [""],
    values: [[null]],
    type: "table"
  },
  truePropertyNames: []
};
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
    return {
      query,
      config: {
        ...defaultDataEditBlockConfig,
        ...config
      }
    };
  } catch (e) {
    return { query, config: defaultDataEditBlockConfig };
  }
};
const updateBlockConfig = async (key, value, codeBlockInfo) => {
  const {
    config,
    ctx,
    el,
    plugin: {
      app: { vault, workspace }
    },
    query
  } = codeBlockInfo;
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
  const before = performance.now();
  await vault.modify(file, newLines.join("\n"));
  console.log("time to modify: ", performance.now() - before);
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
const CodeBlockContext = createContext({
  plugin: {},
  el: {},
  source: "",
  query: "",
  config: {},
  ctx: {},
  dataviewAPI: {}
});
const uesCodeBlock = () => useContext(CodeBlockContext);
var _tmpl$$c = /* @__PURE__ */ template(`<input class=""type=checkbox>`);
const CheckboxInput = (props) => {
  const {
    plugin,
    config
  } = uesCodeBlock();
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
  } = uesCodeBlock();
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
  } = uesCodeBlock();
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
  } = uesCodeBlock();
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
  } = uesCodeBlock();
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
        tableIdColumnName,
        defaultDateFormat,
        defaultDateTimeFormat
      },
      luxon
    },
    config,
    ctx
  } = uesCodeBlock();
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
                },
                plugin,
                ctx,
                defaultDateFormat,
                defaultDateTimeFormat
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
  return [createComponent(Show, {
    get when() {
      return props.valueType === "text" || props.valueType === "number";
    },
    get children() {
      return createComponent(Markdown, {
        "class": "size-full",
        get app() {
          return props.plugin.app;
        },
        get markdown() {
          return tryDataviewLinkToMarkdown(props.value);
        },
        get sourcePath() {
          return props.ctx.sourcePath;
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
      insert(_el$3, () => props.value.toFormat(checkIfDateHasTime(props.value) ? props.defaultDateTimeFormat : props.defaultDateFormat));
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
  } = uesCodeBlock();
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
  } = uesCodeBlock();
  const [translateX, setTranslateX] = createSignal(0);
  let lastMousePos = 0;
  const onMouseMove = (e) => {
    if (props.highlightIndex === -1) return;
    setTranslateX(() => e.clientX - lastMousePos);
  };
  const onMouseUp = () => {
    if (props.draggedOverIndex !== -1 && props.draggedOverIndex !== props.highlightIndex) {
      const {
        app: {
          workspace
        }
      } = plugin;
      const view = workspace.getActiveViewOfType(obsidian.MarkdownView);
      const sectionInfo = ctx.getSectionInfo(el);
      if (!sectionInfo || !view) {
        throw new Error("This should be impossible");
      }
      const {
        lineStart
      } = sectionInfo;
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
      const scrollEls = Array.from(document.querySelectorAll(".cm-scroller"));
      const scroller = scrollEls.find((el2) => el2.contains(view.contentEl)) ?? scrollEls[0];
      const prevScroll = scroller.scrollTop;
      view.editor.setLine(tableLineIndex, tableKeyword + " " + newCols.join(", "));
      setTimeout(() => scroller.scrollTo({
        top: prevScroll,
        behavior: "instant"
      }), 0);
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
            return plugin.app;
          },
          markdown: h,
          get sourcePath() {
            return ctx.sourcePath;
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
        setDraggedOverIndex
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
        setDraggedOverIndex
      }), null);
      insert(_el$, createComponent(AddColumnButton, {
        get open() {
          return isAddColumnDialogOpen();
        },
        setOpen: setAddColumnDialogOpen
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
  } = uesCodeBlock();
  const view = app2.workspace.getActiveViewOfType(obsidian.MarkdownView);
  if (!view) {
    return;
  }
  const sectionInfo = ctx.getSectionInfo(el);
  if (!sectionInfo) {
    return;
  }
  const {
    lineStart
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
  const addCol = () => {
    const prop = propertyValue().trim();
    const alias = aliasValue();
    const aliasStr = alias ? " AS " + (alias.includes(" ") ? '"' + alias + '"' : alias) : "";
    const {
      line,
      index
    } = getTableLine(query);
    const relativeIndex = lineStart + index + 1;
    view.editor.setLine(relativeIndex, line + ", " + prop + aliasStr);
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
              addCol();
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
  const [local, codeBlockInfo] = splitProps(props, ["uid", "queryResultStore", "setQueryResultStore"]);
  const {
    plugin,
    query,
    config,
    dataviewAPI
  } = codeBlockInfo;
  const queryResults = createMemo(() => {
    return props.queryResultStore[props.uid] ?? defaultQueryResult;
  }, defaultQueryResult);
  const updateQueryResults = async () => {
    const truePropertyNames = getColumnPropertyNames(query);
    const result = await dataviewAPI.query(query);
    if (!result.successful) {
      local.setQueryResultStore(local.uid, {
        ...result,
        truePropertyNames
      });
      return;
    }
    result.value.values = result.value.values.map((arr) => arr.map((v) => tryDataviewArrayToArray(v)));
    local.setQueryResultStore(local.uid, {
      ...result,
      truePropertyNames
    });
  };
  updateQueryResults();
  registerDataviewEvents(plugin, updateQueryResults);
  onCleanup(() => {
    unregisterDataviewEvents(plugin, updateQueryResults);
  });
  return createComponent(CodeBlockContext.Provider, {
    value: codeBlockInfo,
    get children() {
      return [(() => {
        var _el$ = _tmpl$();
        insert(_el$, createComponent(Table, {
          get queryResults() {
            return queryResults();
          }
        }));
        return _el$;
      })(), (() => {
        var _el$2 = _tmpl$2();
        insert(_el$2, createComponent(Toolbar, {
          config
        }));
        return _el$2;
      })()];
    }
  });
}
const Toolbar = (props) => {
  const codeBlockInfo = uesCodeBlock();
  const [isConfigOpen, setConfigOpen] = createSignal(false);
  const updateConfig = async (key, value) => {
    await updateBlockConfig(key, value, codeBlockInfo);
  };
  return [createComponent(BlockConfigModal, {
    get config() {
      return props.config;
    },
    codeBlockInfo,
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
    this.registerMarkdownCodeBlockProcessor("dataedit", async (source, el, ctx) => {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibm9kZV9tb2R1bGVzL3NvbGlkLWpzL2Rpc3Qvc29saWQuanMiLCJub2RlX21vZHVsZXMvc29saWQtanMvd2ViL2Rpc3Qvd2ViLmpzIiwibm9kZV9tb2R1bGVzL3NvbGlkLWpzL3N0b3JlL2Rpc3Qvc3RvcmUuanMiLCJzcmMvbGliL2NvbnN0YW50cy50cyIsInNyYy9saWIvdXRpbC50cyIsIm5vZGVfbW9kdWxlcy9sdWNpZGUtc29saWQvZGlzdC9zb3VyY2UvZGVmYXVsdEF0dHJpYnV0ZXMuanN4Iiwibm9kZV9tb2R1bGVzL2x1Y2lkZS1zb2xpZC9kaXN0L3NvdXJjZS9JY29uLmpzeCIsIm5vZGVfbW9kdWxlcy9sdWNpZGUtc29saWQvZGlzdC9zb3VyY2UvaWNvbnMvbG9jay5qc3giLCJub2RlX21vZHVsZXMvbHVjaWRlLXNvbGlkL2Rpc3Qvc291cmNlL2ljb25zL2xvY2stb3Blbi5qc3giLCJub2RlX21vZHVsZXMvbHVjaWRlLXNvbGlkL2Rpc3Qvc291cmNlL2ljb25zL3NldHRpbmdzLmpzeCIsInNyYy9jb21wb25lbnRzL01hcmtkb3duL2luZGV4LnRzeCIsInNyYy9ob29rcy91c2VEYXRhRWRpdC50c3giLCJzcmMvY29tcG9uZW50cy9JbnB1dHMvY2hlY2tib3gudHN4Iiwibm9kZV9tb2R1bGVzL0Bzb2xpZC1wcmltaXRpdmVzL2F1dG9mb2N1cy9kaXN0L2luZGV4LmpzIiwic3JjL2NvbXBvbmVudHMvSW5wdXRzL2RhdGVkYXRldGltZS50c3giLCJub2RlX21vZHVsZXMvbHVjaWRlLXNvbGlkL2Rpc3Qvc291cmNlL2ljb25zL3BsdXMuanN4Iiwic3JjL2NvbXBvbmVudHMvSW5wdXRzL3RleHQudHN4Iiwic3JjL2NvbXBvbmVudHMvSW5wdXRzL2xpc3QudHN4Iiwibm9kZV9tb2R1bGVzL2Nsc3gvZGlzdC9jbHN4Lm1qcyIsIm5vZGVfbW9kdWxlcy90YWlsd2luZC1tZXJnZS9kaXN0L2J1bmRsZS1tanMubWpzIiwic3JjL2xpYnMvY24udHMiLCJub2RlX21vZHVsZXMvQHNvbGlkLXByaW1pdGl2ZXMvdXRpbHMvZGlzdC9jaHVuay9SNTY3NVlNVS5qcyIsIm5vZGVfbW9kdWxlcy9Ac29saWQtcHJpbWl0aXZlcy9yZWZzL2Rpc3QvaW5kZXguanMiLCJub2RlX21vZHVsZXMvQGtvYmFsdGUvdXRpbHMvZGlzdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9Aa29iYWx0ZS9jb3JlL2Rpc3QvY2h1bmsvM05JNkZUQTIuanN4Iiwibm9kZV9tb2R1bGVzL0Brb2JhbHRlL2NvcmUvZGlzdC9jaHVuay83QTNHREY0WS5qc3giLCJub2RlX21vZHVsZXMvQGtvYmFsdGUvY29yZS9kaXN0L2NodW5rL0pITU5XT0xZLmpzeCIsIm5vZGVfbW9kdWxlcy9Aa29iYWx0ZS9jb3JlL2Rpc3QvY2h1bmsvUDZYVTc1WkcuanN4Iiwibm9kZV9tb2R1bGVzL0Brb2JhbHRlL2NvcmUvZGlzdC9jaHVuay9XTlJBTjVHVi5qc3giLCJub2RlX21vZHVsZXMvQGtvYmFsdGUvY29yZS9kaXN0L2NodW5rL0JNTUNRN1lKLmpzeCIsIm5vZGVfbW9kdWxlcy9Aa29iYWx0ZS9jb3JlL2Rpc3QvY2h1bmsvRTczUEtGQjMuanN4Iiwibm9kZV9tb2R1bGVzL0Brb2JhbHRlL2NvcmUvZGlzdC9jaHVuay9OTkdNUlkyTy5qc3giLCJub2RlX21vZHVsZXMvQGtvYmFsdGUvY29yZS9kaXN0L2NodW5rL0ZONkVJQ0dPLmpzeCIsIm5vZGVfbW9kdWxlcy9Aa29iYWx0ZS9jb3JlL2Rpc3QvY2h1bmsvRTUzREI3QlMuanN4Iiwibm9kZV9tb2R1bGVzL0Brb2JhbHRlL2NvcmUvZGlzdC9jaHVuay9DV0NCNDQ3Ri5qc3giLCJub2RlX21vZHVsZXMvQGtvYmFsdGUvY29yZS9kaXN0L2NodW5rLzVXWEhKRENaLmpzeCIsIm5vZGVfbW9kdWxlcy9Aa29iYWx0ZS9jb3JlL2Rpc3QvY2h1bmsvU0EyN1Y1WUouanN4Iiwibm9kZV9tb2R1bGVzL0Brb2JhbHRlL2NvcmUvZGlzdC9jaHVuay9KTkNDRjZNUC5qc3giLCJub2RlX21vZHVsZXMvQGNvcnZ1L3V0aWxzL2Rpc3QvY2h1bmsvVTQyRUNNTkQuanN4Iiwibm9kZV9tb2R1bGVzL0Bjb3J2dS91dGlscy9kaXN0L2NodW5rL1ZETEVYRjZDLmpzeCIsIm5vZGVfbW9kdWxlcy9AY29ydnUvdXRpbHMvZGlzdC9zY3JvbGwvaW5kZXguanN4Iiwibm9kZV9tb2R1bGVzL3NvbGlkLXByZXZlbnQtc2Nyb2xsL2Rpc3QvaW5kZXguanN4Iiwibm9kZV9tb2R1bGVzL3NvbGlkLXByZXNlbmNlL2Rpc3QvaW5kZXguanN4Iiwibm9kZV9tb2R1bGVzL0Brb2JhbHRlL2NvcmUvZGlzdC9jaHVuay80NlNGNjVBQy5qc3giLCJzcmMvY29tcG9uZW50cy91aS9idXR0b24udHN4Iiwic3JjL2NvbXBvbmVudHMvdWkvZGlhbG9nLnRzeCIsInNyYy9jb21wb25lbnRzL3VpL2V4dGVybmFsLWxpbmsudHN4Iiwibm9kZV9tb2R1bGVzL2x1Y2lkZS1zb2xpZC9kaXN0L3NvdXJjZS9pY29ucy9taW51cy5qc3giLCJub2RlX21vZHVsZXMvbHVjaWRlLXNvbGlkL2Rpc3Qvc291cmNlL2ljb25zL3BhcmVudGhlc2VzLmpzeCIsInNyYy9jb21wb25lbnRzL0lucHV0cy9udW1iZXIudHN4Iiwic3JjL2NvbXBvbmVudHMvVGFibGUvVGFibGVEYXRhL2luZGV4LnRzeCIsInNyYy9jb21wb25lbnRzL1RhYmxlL1RhYmxlQm9keS9pbmRleC50c3giLCJub2RlX21vZHVsZXMvbHVjaWRlLXNvbGlkL2Rpc3Qvc291cmNlL2ljb25zL2dyaXAtaG9yaXpvbnRhbC5qc3giLCJzcmMvY29tcG9uZW50cy9UYWJsZS9UYWJsZUhlYWQvaW5kZXgudHN4Iiwic3JjL2NvbXBvbmVudHMvVGFibGUvaW5kZXgudHN4Iiwic3JjL2NvbXBvbmVudHMvdWkvdG9nZ2xlLnRzeCIsInNyYy9BcHAudHN4Iiwic3JjL21haW4udHN4Il0sInNvdXJjZXNDb250ZW50IjpbImxldCB0YXNrSWRDb3VudGVyID0gMSxcbiAgaXNDYWxsYmFja1NjaGVkdWxlZCA9IGZhbHNlLFxuICBpc1BlcmZvcm1pbmdXb3JrID0gZmFsc2UsXG4gIHRhc2tRdWV1ZSA9IFtdLFxuICBjdXJyZW50VGFzayA9IG51bGwsXG4gIHNob3VsZFlpZWxkVG9Ib3N0ID0gbnVsbCxcbiAgeWllbGRJbnRlcnZhbCA9IDUsXG4gIGRlYWRsaW5lID0gMCxcbiAgbWF4WWllbGRJbnRlcnZhbCA9IDMwMCxcbiAgc2NoZWR1bGVDYWxsYmFjayA9IG51bGwsXG4gIHNjaGVkdWxlZENhbGxiYWNrID0gbnVsbDtcbmNvbnN0IG1heFNpZ25lZDMxQml0SW50ID0gMTA3Mzc0MTgyMztcbmZ1bmN0aW9uIHNldHVwU2NoZWR1bGVyKCkge1xuICBjb25zdCBjaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCksXG4gICAgcG9ydCA9IGNoYW5uZWwucG9ydDI7XG4gIHNjaGVkdWxlQ2FsbGJhY2sgPSAoKSA9PiBwb3J0LnBvc3RNZXNzYWdlKG51bGwpO1xuICBjaGFubmVsLnBvcnQxLm9ubWVzc2FnZSA9ICgpID0+IHtcbiAgICBpZiAoc2NoZWR1bGVkQ2FsbGJhY2sgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgICBkZWFkbGluZSA9IGN1cnJlbnRUaW1lICsgeWllbGRJbnRlcnZhbDtcbiAgICAgIGNvbnN0IGhhc1RpbWVSZW1haW5pbmcgPSB0cnVlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaGFzTW9yZVdvcmsgPSBzY2hlZHVsZWRDYWxsYmFjayhoYXNUaW1lUmVtYWluaW5nLCBjdXJyZW50VGltZSk7XG4gICAgICAgIGlmICghaGFzTW9yZVdvcmspIHtcbiAgICAgICAgICBzY2hlZHVsZWRDYWxsYmFjayA9IG51bGw7XG4gICAgICAgIH0gZWxzZSBwb3J0LnBvc3RNZXNzYWdlKG51bGwpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgcG9ydC5wb3N0TWVzc2FnZShudWxsKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfVxuICB9O1xuICBpZiAobmF2aWdhdG9yICYmIG5hdmlnYXRvci5zY2hlZHVsaW5nICYmIG5hdmlnYXRvci5zY2hlZHVsaW5nLmlzSW5wdXRQZW5kaW5nKSB7XG4gICAgY29uc3Qgc2NoZWR1bGluZyA9IG5hdmlnYXRvci5zY2hlZHVsaW5nO1xuICAgIHNob3VsZFlpZWxkVG9Ib3N0ID0gKCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAgIGlmIChjdXJyZW50VGltZSA+PSBkZWFkbGluZSkge1xuICAgICAgICBpZiAoc2NoZWR1bGluZy5pc0lucHV0UGVuZGluZygpKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGN1cnJlbnRUaW1lID49IG1heFlpZWxkSW50ZXJ2YWw7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICBzaG91bGRZaWVsZFRvSG9zdCA9ICgpID0+IHBlcmZvcm1hbmNlLm5vdygpID49IGRlYWRsaW5lO1xuICB9XG59XG5mdW5jdGlvbiBlbnF1ZXVlKHRhc2tRdWV1ZSwgdGFzaykge1xuICBmdW5jdGlvbiBmaW5kSW5kZXgoKSB7XG4gICAgbGV0IG0gPSAwO1xuICAgIGxldCBuID0gdGFza1F1ZXVlLmxlbmd0aCAtIDE7XG4gICAgd2hpbGUgKG0gPD0gbikge1xuICAgICAgY29uc3QgayA9IChuICsgbSkgPj4gMTtcbiAgICAgIGNvbnN0IGNtcCA9IHRhc2suZXhwaXJhdGlvblRpbWUgLSB0YXNrUXVldWVba10uZXhwaXJhdGlvblRpbWU7XG4gICAgICBpZiAoY21wID4gMCkgbSA9IGsgKyAxO1xuICAgICAgZWxzZSBpZiAoY21wIDwgMCkgbiA9IGsgLSAxO1xuICAgICAgZWxzZSByZXR1cm4gaztcbiAgICB9XG4gICAgcmV0dXJuIG07XG4gIH1cbiAgdGFza1F1ZXVlLnNwbGljZShmaW5kSW5kZXgoKSwgMCwgdGFzayk7XG59XG5mdW5jdGlvbiByZXF1ZXN0Q2FsbGJhY2soZm4sIG9wdGlvbnMpIHtcbiAgaWYgKCFzY2hlZHVsZUNhbGxiYWNrKSBzZXR1cFNjaGVkdWxlcigpO1xuICBsZXQgc3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCksXG4gICAgdGltZW91dCA9IG1heFNpZ25lZDMxQml0SW50O1xuICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnRpbWVvdXQpIHRpbWVvdXQgPSBvcHRpb25zLnRpbWVvdXQ7XG4gIGNvbnN0IG5ld1Rhc2sgPSB7XG4gICAgaWQ6IHRhc2tJZENvdW50ZXIrKyxcbiAgICBmbixcbiAgICBzdGFydFRpbWUsXG4gICAgZXhwaXJhdGlvblRpbWU6IHN0YXJ0VGltZSArIHRpbWVvdXRcbiAgfTtcbiAgZW5xdWV1ZSh0YXNrUXVldWUsIG5ld1Rhc2spO1xuICBpZiAoIWlzQ2FsbGJhY2tTY2hlZHVsZWQgJiYgIWlzUGVyZm9ybWluZ1dvcmspIHtcbiAgICBpc0NhbGxiYWNrU2NoZWR1bGVkID0gdHJ1ZTtcbiAgICBzY2hlZHVsZWRDYWxsYmFjayA9IGZsdXNoV29yaztcbiAgICBzY2hlZHVsZUNhbGxiYWNrKCk7XG4gIH1cbiAgcmV0dXJuIG5ld1Rhc2s7XG59XG5mdW5jdGlvbiBjYW5jZWxDYWxsYmFjayh0YXNrKSB7XG4gIHRhc2suZm4gPSBudWxsO1xufVxuZnVuY3Rpb24gZmx1c2hXb3JrKGhhc1RpbWVSZW1haW5pbmcsIGluaXRpYWxUaW1lKSB7XG4gIGlzQ2FsbGJhY2tTY2hlZHVsZWQgPSBmYWxzZTtcbiAgaXNQZXJmb3JtaW5nV29yayA9IHRydWU7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHdvcmtMb29wKGhhc1RpbWVSZW1haW5pbmcsIGluaXRpYWxUaW1lKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBjdXJyZW50VGFzayA9IG51bGw7XG4gICAgaXNQZXJmb3JtaW5nV29yayA9IGZhbHNlO1xuICB9XG59XG5mdW5jdGlvbiB3b3JrTG9vcChoYXNUaW1lUmVtYWluaW5nLCBpbml0aWFsVGltZSkge1xuICBsZXQgY3VycmVudFRpbWUgPSBpbml0aWFsVGltZTtcbiAgY3VycmVudFRhc2sgPSB0YXNrUXVldWVbMF0gfHwgbnVsbDtcbiAgd2hpbGUgKGN1cnJlbnRUYXNrICE9PSBudWxsKSB7XG4gICAgaWYgKGN1cnJlbnRUYXNrLmV4cGlyYXRpb25UaW1lID4gY3VycmVudFRpbWUgJiYgKCFoYXNUaW1lUmVtYWluaW5nIHx8IHNob3VsZFlpZWxkVG9Ib3N0KCkpKSB7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY29uc3QgY2FsbGJhY2sgPSBjdXJyZW50VGFzay5mbjtcbiAgICBpZiAoY2FsbGJhY2sgIT09IG51bGwpIHtcbiAgICAgIGN1cnJlbnRUYXNrLmZuID0gbnVsbDtcbiAgICAgIGNvbnN0IGRpZFVzZXJDYWxsYmFja1RpbWVvdXQgPSBjdXJyZW50VGFzay5leHBpcmF0aW9uVGltZSA8PSBjdXJyZW50VGltZTtcbiAgICAgIGNhbGxiYWNrKGRpZFVzZXJDYWxsYmFja1RpbWVvdXQpO1xuICAgICAgY3VycmVudFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAgIGlmIChjdXJyZW50VGFzayA9PT0gdGFza1F1ZXVlWzBdKSB7XG4gICAgICAgIHRhc2tRdWV1ZS5zaGlmdCgpO1xuICAgICAgfVxuICAgIH0gZWxzZSB0YXNrUXVldWUuc2hpZnQoKTtcbiAgICBjdXJyZW50VGFzayA9IHRhc2tRdWV1ZVswXSB8fCBudWxsO1xuICB9XG4gIHJldHVybiBjdXJyZW50VGFzayAhPT0gbnVsbDtcbn1cblxuY29uc3Qgc2hhcmVkQ29uZmlnID0ge1xuICBjb250ZXh0OiB1bmRlZmluZWQsXG4gIHJlZ2lzdHJ5OiB1bmRlZmluZWRcbn07XG5mdW5jdGlvbiBzZXRIeWRyYXRlQ29udGV4dChjb250ZXh0KSB7XG4gIHNoYXJlZENvbmZpZy5jb250ZXh0ID0gY29udGV4dDtcbn1cbmZ1bmN0aW9uIG5leHRIeWRyYXRlQ29udGV4dCgpIHtcbiAgcmV0dXJuIHtcbiAgICAuLi5zaGFyZWRDb25maWcuY29udGV4dCxcbiAgICBpZDogYCR7c2hhcmVkQ29uZmlnLmNvbnRleHQuaWR9JHtzaGFyZWRDb25maWcuY29udGV4dC5jb3VudCsrfS1gLFxuICAgIGNvdW50OiAwXG4gIH07XG59XG5cbmNvbnN0IGVxdWFsRm4gPSAoYSwgYikgPT4gYSA9PT0gYjtcbmNvbnN0ICRQUk9YWSA9IFN5bWJvbChcInNvbGlkLXByb3h5XCIpO1xuY29uc3QgJFRSQUNLID0gU3ltYm9sKFwic29saWQtdHJhY2tcIik7XG5jb25zdCAkREVWQ09NUCA9IFN5bWJvbChcInNvbGlkLWRldi1jb21wb25lbnRcIik7XG5jb25zdCBzaWduYWxPcHRpb25zID0ge1xuICBlcXVhbHM6IGVxdWFsRm5cbn07XG5sZXQgRVJST1IgPSBudWxsO1xubGV0IHJ1bkVmZmVjdHMgPSBydW5RdWV1ZTtcbmNvbnN0IFNUQUxFID0gMTtcbmNvbnN0IFBFTkRJTkcgPSAyO1xuY29uc3QgVU5PV05FRCA9IHtcbiAgb3duZWQ6IG51bGwsXG4gIGNsZWFudXBzOiBudWxsLFxuICBjb250ZXh0OiBudWxsLFxuICBvd25lcjogbnVsbFxufTtcbmNvbnN0IE5PX0lOSVQgPSB7fTtcbnZhciBPd25lciA9IG51bGw7XG5sZXQgVHJhbnNpdGlvbiA9IG51bGw7XG5sZXQgU2NoZWR1bGVyID0gbnVsbDtcbmxldCBFeHRlcm5hbFNvdXJjZUNvbmZpZyA9IG51bGw7XG5sZXQgTGlzdGVuZXIgPSBudWxsO1xubGV0IFVwZGF0ZXMgPSBudWxsO1xubGV0IEVmZmVjdHMgPSBudWxsO1xubGV0IEV4ZWNDb3VudCA9IDA7XG5mdW5jdGlvbiBjcmVhdGVSb290KGZuLCBkZXRhY2hlZE93bmVyKSB7XG4gIGNvbnN0IGxpc3RlbmVyID0gTGlzdGVuZXIsXG4gICAgb3duZXIgPSBPd25lcixcbiAgICB1bm93bmVkID0gZm4ubGVuZ3RoID09PSAwLFxuICAgIGN1cnJlbnQgPSBkZXRhY2hlZE93bmVyID09PSB1bmRlZmluZWQgPyBvd25lciA6IGRldGFjaGVkT3duZXIsXG4gICAgcm9vdCA9IHVub3duZWRcbiAgICAgID8gVU5PV05FRFxuICAgICAgOiB7XG4gICAgICAgICAgb3duZWQ6IG51bGwsXG4gICAgICAgICAgY2xlYW51cHM6IG51bGwsXG4gICAgICAgICAgY29udGV4dDogY3VycmVudCA/IGN1cnJlbnQuY29udGV4dCA6IG51bGwsXG4gICAgICAgICAgb3duZXI6IGN1cnJlbnRcbiAgICAgICAgfSxcbiAgICB1cGRhdGVGbiA9IHVub3duZWQgPyBmbiA6ICgpID0+IGZuKCgpID0+IHVudHJhY2soKCkgPT4gY2xlYW5Ob2RlKHJvb3QpKSk7XG4gIE93bmVyID0gcm9vdDtcbiAgTGlzdGVuZXIgPSBudWxsO1xuICB0cnkge1xuICAgIHJldHVybiBydW5VcGRhdGVzKHVwZGF0ZUZuLCB0cnVlKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBMaXN0ZW5lciA9IGxpc3RlbmVyO1xuICAgIE93bmVyID0gb3duZXI7XG4gIH1cbn1cbmZ1bmN0aW9uIGNyZWF0ZVNpZ25hbCh2YWx1ZSwgb3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyA/IE9iamVjdC5hc3NpZ24oe30sIHNpZ25hbE9wdGlvbnMsIG9wdGlvbnMpIDogc2lnbmFsT3B0aW9ucztcbiAgY29uc3QgcyA9IHtcbiAgICB2YWx1ZSxcbiAgICBvYnNlcnZlcnM6IG51bGwsXG4gICAgb2JzZXJ2ZXJTbG90czogbnVsbCxcbiAgICBjb21wYXJhdG9yOiBvcHRpb25zLmVxdWFscyB8fCB1bmRlZmluZWRcbiAgfTtcbiAgY29uc3Qgc2V0dGVyID0gdmFsdWUgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgaWYgKFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nICYmIFRyYW5zaXRpb24uc291cmNlcy5oYXMocykpIHZhbHVlID0gdmFsdWUocy50VmFsdWUpO1xuICAgICAgZWxzZSB2YWx1ZSA9IHZhbHVlKHMudmFsdWUpO1xuICAgIH1cbiAgICByZXR1cm4gd3JpdGVTaWduYWwocywgdmFsdWUpO1xuICB9O1xuICByZXR1cm4gW3JlYWRTaWduYWwuYmluZChzKSwgc2V0dGVyXTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZUNvbXB1dGVkKGZuLCB2YWx1ZSwgb3B0aW9ucykge1xuICBjb25zdCBjID0gY3JlYXRlQ29tcHV0YXRpb24oZm4sIHZhbHVlLCB0cnVlLCBTVEFMRSk7XG4gIGlmIChTY2hlZHVsZXIgJiYgVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcpIFVwZGF0ZXMucHVzaChjKTtcbiAgZWxzZSB1cGRhdGVDb21wdXRhdGlvbihjKTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZVJlbmRlckVmZmVjdChmbiwgdmFsdWUsIG9wdGlvbnMpIHtcbiAgY29uc3QgYyA9IGNyZWF0ZUNvbXB1dGF0aW9uKGZuLCB2YWx1ZSwgZmFsc2UsIFNUQUxFKTtcbiAgaWYgKFNjaGVkdWxlciAmJiBUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZykgVXBkYXRlcy5wdXNoKGMpO1xuICBlbHNlIHVwZGF0ZUNvbXB1dGF0aW9uKGMpO1xufVxuZnVuY3Rpb24gY3JlYXRlRWZmZWN0KGZuLCB2YWx1ZSwgb3B0aW9ucykge1xuICBydW5FZmZlY3RzID0gcnVuVXNlckVmZmVjdHM7XG4gIGNvbnN0IGMgPSBjcmVhdGVDb21wdXRhdGlvbihmbiwgdmFsdWUsIGZhbHNlLCBTVEFMRSksXG4gICAgcyA9IFN1c3BlbnNlQ29udGV4dCAmJiB1c2VDb250ZXh0KFN1c3BlbnNlQ29udGV4dCk7XG4gIGlmIChzKSBjLnN1c3BlbnNlID0gcztcbiAgaWYgKCFvcHRpb25zIHx8ICFvcHRpb25zLnJlbmRlcikgYy51c2VyID0gdHJ1ZTtcbiAgRWZmZWN0cyA/IEVmZmVjdHMucHVzaChjKSA6IHVwZGF0ZUNvbXB1dGF0aW9uKGMpO1xufVxuZnVuY3Rpb24gY3JlYXRlUmVhY3Rpb24ob25JbnZhbGlkYXRlLCBvcHRpb25zKSB7XG4gIGxldCBmbjtcbiAgY29uc3QgYyA9IGNyZWF0ZUNvbXB1dGF0aW9uKFxuICAgICAgKCkgPT4ge1xuICAgICAgICBmbiA/IGZuKCkgOiB1bnRyYWNrKG9uSW52YWxpZGF0ZSk7XG4gICAgICAgIGZuID0gdW5kZWZpbmVkO1xuICAgICAgfSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIGZhbHNlLFxuICAgICAgMFxuICAgICksXG4gICAgcyA9IFN1c3BlbnNlQ29udGV4dCAmJiB1c2VDb250ZXh0KFN1c3BlbnNlQ29udGV4dCk7XG4gIGlmIChzKSBjLnN1c3BlbnNlID0gcztcbiAgYy51c2VyID0gdHJ1ZTtcbiAgcmV0dXJuIHRyYWNraW5nID0+IHtcbiAgICBmbiA9IHRyYWNraW5nO1xuICAgIHVwZGF0ZUNvbXB1dGF0aW9uKGMpO1xuICB9O1xufVxuZnVuY3Rpb24gY3JlYXRlTWVtbyhmbiwgdmFsdWUsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgPyBPYmplY3QuYXNzaWduKHt9LCBzaWduYWxPcHRpb25zLCBvcHRpb25zKSA6IHNpZ25hbE9wdGlvbnM7XG4gIGNvbnN0IGMgPSBjcmVhdGVDb21wdXRhdGlvbihmbiwgdmFsdWUsIHRydWUsIDApO1xuICBjLm9ic2VydmVycyA9IG51bGw7XG4gIGMub2JzZXJ2ZXJTbG90cyA9IG51bGw7XG4gIGMuY29tcGFyYXRvciA9IG9wdGlvbnMuZXF1YWxzIHx8IHVuZGVmaW5lZDtcbiAgaWYgKFNjaGVkdWxlciAmJiBUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZykge1xuICAgIGMudFN0YXRlID0gU1RBTEU7XG4gICAgVXBkYXRlcy5wdXNoKGMpO1xuICB9IGVsc2UgdXBkYXRlQ29tcHV0YXRpb24oYyk7XG4gIHJldHVybiByZWFkU2lnbmFsLmJpbmQoYyk7XG59XG5mdW5jdGlvbiBpc1Byb21pc2Uodikge1xuICByZXR1cm4gdiAmJiB0eXBlb2YgdiA9PT0gXCJvYmplY3RcIiAmJiBcInRoZW5cIiBpbiB2O1xufVxuZnVuY3Rpb24gY3JlYXRlUmVzb3VyY2UocFNvdXJjZSwgcEZldGNoZXIsIHBPcHRpb25zKSB7XG4gIGxldCBzb3VyY2U7XG4gIGxldCBmZXRjaGVyO1xuICBsZXQgb3B0aW9ucztcbiAgaWYgKChhcmd1bWVudHMubGVuZ3RoID09PSAyICYmIHR5cGVvZiBwRmV0Y2hlciA9PT0gXCJvYmplY3RcIikgfHwgYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIHNvdXJjZSA9IHRydWU7XG4gICAgZmV0Y2hlciA9IHBTb3VyY2U7XG4gICAgb3B0aW9ucyA9IHBGZXRjaGVyIHx8IHt9O1xuICB9IGVsc2Uge1xuICAgIHNvdXJjZSA9IHBTb3VyY2U7XG4gICAgZmV0Y2hlciA9IHBGZXRjaGVyO1xuICAgIG9wdGlvbnMgPSBwT3B0aW9ucyB8fCB7fTtcbiAgfVxuICBsZXQgcHIgPSBudWxsLFxuICAgIGluaXRQID0gTk9fSU5JVCxcbiAgICBpZCA9IG51bGwsXG4gICAgbG9hZGVkVW5kZXJUcmFuc2l0aW9uID0gZmFsc2UsXG4gICAgc2NoZWR1bGVkID0gZmFsc2UsXG4gICAgcmVzb2x2ZWQgPSBcImluaXRpYWxWYWx1ZVwiIGluIG9wdGlvbnMsXG4gICAgZHluYW1pYyA9IHR5cGVvZiBzb3VyY2UgPT09IFwiZnVuY3Rpb25cIiAmJiBjcmVhdGVNZW1vKHNvdXJjZSk7XG4gIGNvbnN0IGNvbnRleHRzID0gbmV3IFNldCgpLFxuICAgIFt2YWx1ZSwgc2V0VmFsdWVdID0gKG9wdGlvbnMuc3RvcmFnZSB8fCBjcmVhdGVTaWduYWwpKG9wdGlvbnMuaW5pdGlhbFZhbHVlKSxcbiAgICBbZXJyb3IsIHNldEVycm9yXSA9IGNyZWF0ZVNpZ25hbCh1bmRlZmluZWQpLFxuICAgIFt0cmFjaywgdHJpZ2dlcl0gPSBjcmVhdGVTaWduYWwodW5kZWZpbmVkLCB7XG4gICAgICBlcXVhbHM6IGZhbHNlXG4gICAgfSksXG4gICAgW3N0YXRlLCBzZXRTdGF0ZV0gPSBjcmVhdGVTaWduYWwocmVzb2x2ZWQgPyBcInJlYWR5XCIgOiBcInVucmVzb2x2ZWRcIik7XG4gIGlmIChzaGFyZWRDb25maWcuY29udGV4dCkge1xuICAgIGlkID0gYCR7c2hhcmVkQ29uZmlnLmNvbnRleHQuaWR9JHtzaGFyZWRDb25maWcuY29udGV4dC5jb3VudCsrfWA7XG4gICAgbGV0IHY7XG4gICAgaWYgKG9wdGlvbnMuc3NyTG9hZEZyb20gPT09IFwiaW5pdGlhbFwiKSBpbml0UCA9IG9wdGlvbnMuaW5pdGlhbFZhbHVlO1xuICAgIGVsc2UgaWYgKHNoYXJlZENvbmZpZy5sb2FkICYmICh2ID0gc2hhcmVkQ29uZmlnLmxvYWQoaWQpKSkgaW5pdFAgPSB2O1xuICB9XG4gIGZ1bmN0aW9uIGxvYWRFbmQocCwgdiwgZXJyb3IsIGtleSkge1xuICAgIGlmIChwciA9PT0gcCkge1xuICAgICAgcHIgPSBudWxsO1xuICAgICAga2V5ICE9PSB1bmRlZmluZWQgJiYgKHJlc29sdmVkID0gdHJ1ZSk7XG4gICAgICBpZiAoKHAgPT09IGluaXRQIHx8IHYgPT09IGluaXRQKSAmJiBvcHRpb25zLm9uSHlkcmF0ZWQpXG4gICAgICAgIHF1ZXVlTWljcm90YXNrKCgpID0+XG4gICAgICAgICAgb3B0aW9ucy5vbkh5ZHJhdGVkKGtleSwge1xuICAgICAgICAgICAgdmFsdWU6IHZcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgaW5pdFAgPSBOT19JTklUO1xuICAgICAgaWYgKFRyYW5zaXRpb24gJiYgcCAmJiBsb2FkZWRVbmRlclRyYW5zaXRpb24pIHtcbiAgICAgICAgVHJhbnNpdGlvbi5wcm9taXNlcy5kZWxldGUocCk7XG4gICAgICAgIGxvYWRlZFVuZGVyVHJhbnNpdGlvbiA9IGZhbHNlO1xuICAgICAgICBydW5VcGRhdGVzKCgpID0+IHtcbiAgICAgICAgICBUcmFuc2l0aW9uLnJ1bm5pbmcgPSB0cnVlO1xuICAgICAgICAgIGNvbXBsZXRlTG9hZCh2LCBlcnJvcik7XG4gICAgICAgIH0sIGZhbHNlKTtcbiAgICAgIH0gZWxzZSBjb21wbGV0ZUxvYWQodiwgZXJyb3IpO1xuICAgIH1cbiAgICByZXR1cm4gdjtcbiAgfVxuICBmdW5jdGlvbiBjb21wbGV0ZUxvYWQodiwgZXJyKSB7XG4gICAgcnVuVXBkYXRlcygoKSA9PiB7XG4gICAgICBpZiAoZXJyID09PSB1bmRlZmluZWQpIHNldFZhbHVlKCgpID0+IHYpO1xuICAgICAgc2V0U3RhdGUoZXJyICE9PSB1bmRlZmluZWQgPyBcImVycm9yZWRcIiA6IHJlc29sdmVkID8gXCJyZWFkeVwiIDogXCJ1bnJlc29sdmVkXCIpO1xuICAgICAgc2V0RXJyb3IoZXJyKTtcbiAgICAgIGZvciAoY29uc3QgYyBvZiBjb250ZXh0cy5rZXlzKCkpIGMuZGVjcmVtZW50KCk7XG4gICAgICBjb250ZXh0cy5jbGVhcigpO1xuICAgIH0sIGZhbHNlKTtcbiAgfVxuICBmdW5jdGlvbiByZWFkKCkge1xuICAgIGNvbnN0IGMgPSBTdXNwZW5zZUNvbnRleHQgJiYgdXNlQ29udGV4dChTdXNwZW5zZUNvbnRleHQpLFxuICAgICAgdiA9IHZhbHVlKCksXG4gICAgICBlcnIgPSBlcnJvcigpO1xuICAgIGlmIChlcnIgIT09IHVuZGVmaW5lZCAmJiAhcHIpIHRocm93IGVycjtcbiAgICBpZiAoTGlzdGVuZXIgJiYgIUxpc3RlbmVyLnVzZXIgJiYgYykge1xuICAgICAgY3JlYXRlQ29tcHV0ZWQoKCkgPT4ge1xuICAgICAgICB0cmFjaygpO1xuICAgICAgICBpZiAocHIpIHtcbiAgICAgICAgICBpZiAoYy5yZXNvbHZlZCAmJiBUcmFuc2l0aW9uICYmIGxvYWRlZFVuZGVyVHJhbnNpdGlvbikgVHJhbnNpdGlvbi5wcm9taXNlcy5hZGQocHIpO1xuICAgICAgICAgIGVsc2UgaWYgKCFjb250ZXh0cy5oYXMoYykpIHtcbiAgICAgICAgICAgIGMuaW5jcmVtZW50KCk7XG4gICAgICAgICAgICBjb250ZXh0cy5hZGQoYyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHY7XG4gIH1cbiAgZnVuY3Rpb24gbG9hZChyZWZldGNoaW5nID0gdHJ1ZSkge1xuICAgIGlmIChyZWZldGNoaW5nICE9PSBmYWxzZSAmJiBzY2hlZHVsZWQpIHJldHVybjtcbiAgICBzY2hlZHVsZWQgPSBmYWxzZTtcbiAgICBjb25zdCBsb29rdXAgPSBkeW5hbWljID8gZHluYW1pYygpIDogc291cmNlO1xuICAgIGxvYWRlZFVuZGVyVHJhbnNpdGlvbiA9IFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nO1xuICAgIGlmIChsb29rdXAgPT0gbnVsbCB8fCBsb29rdXAgPT09IGZhbHNlKSB7XG4gICAgICBsb2FkRW5kKHByLCB1bnRyYWNrKHZhbHVlKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChUcmFuc2l0aW9uICYmIHByKSBUcmFuc2l0aW9uLnByb21pc2VzLmRlbGV0ZShwcik7XG4gICAgY29uc3QgcCA9XG4gICAgICBpbml0UCAhPT0gTk9fSU5JVFxuICAgICAgICA/IGluaXRQXG4gICAgICAgIDogdW50cmFjaygoKSA9PlxuICAgICAgICAgICAgZmV0Y2hlcihsb29rdXAsIHtcbiAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlKCksXG4gICAgICAgICAgICAgIHJlZmV0Y2hpbmdcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKTtcbiAgICBpZiAoIWlzUHJvbWlzZShwKSkge1xuICAgICAgbG9hZEVuZChwciwgcCwgdW5kZWZpbmVkLCBsb29rdXApO1xuICAgICAgcmV0dXJuIHA7XG4gICAgfVxuICAgIHByID0gcDtcbiAgICBpZiAoXCJ2YWx1ZVwiIGluIHApIHtcbiAgICAgIGlmIChwLnN0YXR1cyA9PT0gXCJzdWNjZXNzXCIpIGxvYWRFbmQocHIsIHAudmFsdWUsIHVuZGVmaW5lZCwgbG9va3VwKTtcbiAgICAgIGVsc2UgbG9hZEVuZChwciwgdW5kZWZpbmVkLCBjYXN0RXJyb3IocC52YWx1ZSksIGxvb2t1cCk7XG4gICAgICByZXR1cm4gcDtcbiAgICB9XG4gICAgc2NoZWR1bGVkID0gdHJ1ZTtcbiAgICBxdWV1ZU1pY3JvdGFzaygoKSA9PiAoc2NoZWR1bGVkID0gZmFsc2UpKTtcbiAgICBydW5VcGRhdGVzKCgpID0+IHtcbiAgICAgIHNldFN0YXRlKHJlc29sdmVkID8gXCJyZWZyZXNoaW5nXCIgOiBcInBlbmRpbmdcIik7XG4gICAgICB0cmlnZ2VyKCk7XG4gICAgfSwgZmFsc2UpO1xuICAgIHJldHVybiBwLnRoZW4oXG4gICAgICB2ID0+IGxvYWRFbmQocCwgdiwgdW5kZWZpbmVkLCBsb29rdXApLFxuICAgICAgZSA9PiBsb2FkRW5kKHAsIHVuZGVmaW5lZCwgY2FzdEVycm9yKGUpLCBsb29rdXApXG4gICAgKTtcbiAgfVxuICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyhyZWFkLCB7XG4gICAgc3RhdGU6IHtcbiAgICAgIGdldDogKCkgPT4gc3RhdGUoKVxuICAgIH0sXG4gICAgZXJyb3I6IHtcbiAgICAgIGdldDogKCkgPT4gZXJyb3IoKVxuICAgIH0sXG4gICAgbG9hZGluZzoge1xuICAgICAgZ2V0KCkge1xuICAgICAgICBjb25zdCBzID0gc3RhdGUoKTtcbiAgICAgICAgcmV0dXJuIHMgPT09IFwicGVuZGluZ1wiIHx8IHMgPT09IFwicmVmcmVzaGluZ1wiO1xuICAgICAgfVxuICAgIH0sXG4gICAgbGF0ZXN0OiB7XG4gICAgICBnZXQoKSB7XG4gICAgICAgIGlmICghcmVzb2x2ZWQpIHJldHVybiByZWFkKCk7XG4gICAgICAgIGNvbnN0IGVyciA9IGVycm9yKCk7XG4gICAgICAgIGlmIChlcnIgJiYgIXByKSB0aHJvdyBlcnI7XG4gICAgICAgIHJldHVybiB2YWx1ZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIGlmIChkeW5hbWljKSBjcmVhdGVDb21wdXRlZCgoKSA9PiBsb2FkKGZhbHNlKSk7XG4gIGVsc2UgbG9hZChmYWxzZSk7XG4gIHJldHVybiBbXG4gICAgcmVhZCxcbiAgICB7XG4gICAgICByZWZldGNoOiBsb2FkLFxuICAgICAgbXV0YXRlOiBzZXRWYWx1ZVxuICAgIH1cbiAgXTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZURlZmVycmVkKHNvdXJjZSwgb3B0aW9ucykge1xuICBsZXQgdCxcbiAgICB0aW1lb3V0ID0gb3B0aW9ucyA/IG9wdGlvbnMudGltZW91dE1zIDogdW5kZWZpbmVkO1xuICBjb25zdCBub2RlID0gY3JlYXRlQ29tcHV0YXRpb24oXG4gICAgKCkgPT4ge1xuICAgICAgaWYgKCF0IHx8ICF0LmZuKVxuICAgICAgICB0ID0gcmVxdWVzdENhbGxiYWNrKFxuICAgICAgICAgICgpID0+IHNldERlZmVycmVkKCgpID0+IG5vZGUudmFsdWUpLFxuICAgICAgICAgIHRpbWVvdXQgIT09IHVuZGVmaW5lZFxuICAgICAgICAgICAgPyB7XG4gICAgICAgICAgICAgICAgdGltZW91dFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICA6IHVuZGVmaW5lZFxuICAgICAgICApO1xuICAgICAgcmV0dXJuIHNvdXJjZSgpO1xuICAgIH0sXG4gICAgdW5kZWZpbmVkLFxuICAgIHRydWVcbiAgKTtcbiAgY29uc3QgW2RlZmVycmVkLCBzZXREZWZlcnJlZF0gPSBjcmVhdGVTaWduYWwoXG4gICAgVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcgJiYgVHJhbnNpdGlvbi5zb3VyY2VzLmhhcyhub2RlKSA/IG5vZGUudFZhbHVlIDogbm9kZS52YWx1ZSxcbiAgICBvcHRpb25zXG4gICk7XG4gIHVwZGF0ZUNvbXB1dGF0aW9uKG5vZGUpO1xuICBzZXREZWZlcnJlZCgoKSA9PlxuICAgIFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nICYmIFRyYW5zaXRpb24uc291cmNlcy5oYXMobm9kZSkgPyBub2RlLnRWYWx1ZSA6IG5vZGUudmFsdWVcbiAgKTtcbiAgcmV0dXJuIGRlZmVycmVkO1xufVxuZnVuY3Rpb24gY3JlYXRlU2VsZWN0b3Ioc291cmNlLCBmbiA9IGVxdWFsRm4sIG9wdGlvbnMpIHtcbiAgY29uc3Qgc3VicyA9IG5ldyBNYXAoKTtcbiAgY29uc3Qgbm9kZSA9IGNyZWF0ZUNvbXB1dGF0aW9uKFxuICAgIHAgPT4ge1xuICAgICAgY29uc3QgdiA9IHNvdXJjZSgpO1xuICAgICAgZm9yIChjb25zdCBba2V5LCB2YWxdIG9mIHN1YnMuZW50cmllcygpKVxuICAgICAgICBpZiAoZm4oa2V5LCB2KSAhPT0gZm4oa2V5LCBwKSkge1xuICAgICAgICAgIGZvciAoY29uc3QgYyBvZiB2YWwudmFsdWVzKCkpIHtcbiAgICAgICAgICAgIGMuc3RhdGUgPSBTVEFMRTtcbiAgICAgICAgICAgIGlmIChjLnB1cmUpIFVwZGF0ZXMucHVzaChjKTtcbiAgICAgICAgICAgIGVsc2UgRWZmZWN0cy5wdXNoKGMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgcmV0dXJuIHY7XG4gICAgfSxcbiAgICB1bmRlZmluZWQsXG4gICAgdHJ1ZSxcbiAgICBTVEFMRVxuICApO1xuICB1cGRhdGVDb21wdXRhdGlvbihub2RlKTtcbiAgcmV0dXJuIGtleSA9PiB7XG4gICAgY29uc3QgbGlzdGVuZXIgPSBMaXN0ZW5lcjtcbiAgICBpZiAobGlzdGVuZXIpIHtcbiAgICAgIGxldCBsO1xuICAgICAgaWYgKChsID0gc3Vicy5nZXQoa2V5KSkpIGwuYWRkKGxpc3RlbmVyKTtcbiAgICAgIGVsc2Ugc3Vicy5zZXQoa2V5LCAobCA9IG5ldyBTZXQoW2xpc3RlbmVyXSkpKTtcbiAgICAgIG9uQ2xlYW51cCgoKSA9PiB7XG4gICAgICAgIGwuZGVsZXRlKGxpc3RlbmVyKTtcbiAgICAgICAgIWwuc2l6ZSAmJiBzdWJzLmRlbGV0ZShrZXkpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBmbihcbiAgICAgIGtleSxcbiAgICAgIFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nICYmIFRyYW5zaXRpb24uc291cmNlcy5oYXMobm9kZSkgPyBub2RlLnRWYWx1ZSA6IG5vZGUudmFsdWVcbiAgICApO1xuICB9O1xufVxuZnVuY3Rpb24gYmF0Y2goZm4pIHtcbiAgcmV0dXJuIHJ1blVwZGF0ZXMoZm4sIGZhbHNlKTtcbn1cbmZ1bmN0aW9uIHVudHJhY2soZm4pIHtcbiAgaWYgKCFFeHRlcm5hbFNvdXJjZUNvbmZpZyAmJiBMaXN0ZW5lciA9PT0gbnVsbCkgcmV0dXJuIGZuKCk7XG4gIGNvbnN0IGxpc3RlbmVyID0gTGlzdGVuZXI7XG4gIExpc3RlbmVyID0gbnVsbDtcbiAgdHJ5IHtcbiAgICBpZiAoRXh0ZXJuYWxTb3VyY2VDb25maWcpIHJldHVybiBFeHRlcm5hbFNvdXJjZUNvbmZpZy51bnRyYWNrKGZuKTtcbiAgICByZXR1cm4gZm4oKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBMaXN0ZW5lciA9IGxpc3RlbmVyO1xuICB9XG59XG5mdW5jdGlvbiBvbihkZXBzLCBmbiwgb3B0aW9ucykge1xuICBjb25zdCBpc0FycmF5ID0gQXJyYXkuaXNBcnJheShkZXBzKTtcbiAgbGV0IHByZXZJbnB1dDtcbiAgbGV0IGRlZmVyID0gb3B0aW9ucyAmJiBvcHRpb25zLmRlZmVyO1xuICByZXR1cm4gcHJldlZhbHVlID0+IHtcbiAgICBsZXQgaW5wdXQ7XG4gICAgaWYgKGlzQXJyYXkpIHtcbiAgICAgIGlucHV0ID0gQXJyYXkoZGVwcy5sZW5ndGgpO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkZXBzLmxlbmd0aDsgaSsrKSBpbnB1dFtpXSA9IGRlcHNbaV0oKTtcbiAgICB9IGVsc2UgaW5wdXQgPSBkZXBzKCk7XG4gICAgaWYgKGRlZmVyKSB7XG4gICAgICBkZWZlciA9IGZhbHNlO1xuICAgICAgcmV0dXJuIHByZXZWYWx1ZTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gdW50cmFjaygoKSA9PiBmbihpbnB1dCwgcHJldklucHV0LCBwcmV2VmFsdWUpKTtcbiAgICBwcmV2SW5wdXQgPSBpbnB1dDtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xufVxuZnVuY3Rpb24gb25Nb3VudChmbikge1xuICBjcmVhdGVFZmZlY3QoKCkgPT4gdW50cmFjayhmbikpO1xufVxuZnVuY3Rpb24gb25DbGVhbnVwKGZuKSB7XG4gIGlmIChPd25lciA9PT0gbnVsbCk7XG4gIGVsc2UgaWYgKE93bmVyLmNsZWFudXBzID09PSBudWxsKSBPd25lci5jbGVhbnVwcyA9IFtmbl07XG4gIGVsc2UgT3duZXIuY2xlYW51cHMucHVzaChmbik7XG4gIHJldHVybiBmbjtcbn1cbmZ1bmN0aW9uIGNhdGNoRXJyb3IoZm4sIGhhbmRsZXIpIHtcbiAgRVJST1IgfHwgKEVSUk9SID0gU3ltYm9sKFwiZXJyb3JcIikpO1xuICBPd25lciA9IGNyZWF0ZUNvbXB1dGF0aW9uKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcbiAgT3duZXIuY29udGV4dCA9IHtcbiAgICAuLi5Pd25lci5jb250ZXh0LFxuICAgIFtFUlJPUl06IFtoYW5kbGVyXVxuICB9O1xuICBpZiAoVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcpIFRyYW5zaXRpb24uc291cmNlcy5hZGQoT3duZXIpO1xuICB0cnkge1xuICAgIHJldHVybiBmbigpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBoYW5kbGVFcnJvcihlcnIpO1xuICB9IGZpbmFsbHkge1xuICAgIE93bmVyID0gT3duZXIub3duZXI7XG4gIH1cbn1cbmZ1bmN0aW9uIGdldExpc3RlbmVyKCkge1xuICByZXR1cm4gTGlzdGVuZXI7XG59XG5mdW5jdGlvbiBnZXRPd25lcigpIHtcbiAgcmV0dXJuIE93bmVyO1xufVxuZnVuY3Rpb24gcnVuV2l0aE93bmVyKG8sIGZuKSB7XG4gIGNvbnN0IHByZXYgPSBPd25lcjtcbiAgY29uc3QgcHJldkxpc3RlbmVyID0gTGlzdGVuZXI7XG4gIE93bmVyID0gbztcbiAgTGlzdGVuZXIgPSBudWxsO1xuICB0cnkge1xuICAgIHJldHVybiBydW5VcGRhdGVzKGZuLCB0cnVlKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgaGFuZGxlRXJyb3IoZXJyKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBPd25lciA9IHByZXY7XG4gICAgTGlzdGVuZXIgPSBwcmV2TGlzdGVuZXI7XG4gIH1cbn1cbmZ1bmN0aW9uIGVuYWJsZVNjaGVkdWxpbmcoc2NoZWR1bGVyID0gcmVxdWVzdENhbGxiYWNrKSB7XG4gIFNjaGVkdWxlciA9IHNjaGVkdWxlcjtcbn1cbmZ1bmN0aW9uIHN0YXJ0VHJhbnNpdGlvbihmbikge1xuICBpZiAoVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcpIHtcbiAgICBmbigpO1xuICAgIHJldHVybiBUcmFuc2l0aW9uLmRvbmU7XG4gIH1cbiAgY29uc3QgbCA9IExpc3RlbmVyO1xuICBjb25zdCBvID0gT3duZXI7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IHtcbiAgICBMaXN0ZW5lciA9IGw7XG4gICAgT3duZXIgPSBvO1xuICAgIGxldCB0O1xuICAgIGlmIChTY2hlZHVsZXIgfHwgU3VzcGVuc2VDb250ZXh0KSB7XG4gICAgICB0ID1cbiAgICAgICAgVHJhbnNpdGlvbiB8fFxuICAgICAgICAoVHJhbnNpdGlvbiA9IHtcbiAgICAgICAgICBzb3VyY2VzOiBuZXcgU2V0KCksXG4gICAgICAgICAgZWZmZWN0czogW10sXG4gICAgICAgICAgcHJvbWlzZXM6IG5ldyBTZXQoKSxcbiAgICAgICAgICBkaXNwb3NlZDogbmV3IFNldCgpLFxuICAgICAgICAgIHF1ZXVlOiBuZXcgU2V0KCksXG4gICAgICAgICAgcnVubmluZzogdHJ1ZVxuICAgICAgICB9KTtcbiAgICAgIHQuZG9uZSB8fCAodC5kb25lID0gbmV3IFByb21pc2UocmVzID0+ICh0LnJlc29sdmUgPSByZXMpKSk7XG4gICAgICB0LnJ1bm5pbmcgPSB0cnVlO1xuICAgIH1cbiAgICBydW5VcGRhdGVzKGZuLCBmYWxzZSk7XG4gICAgTGlzdGVuZXIgPSBPd25lciA9IG51bGw7XG4gICAgcmV0dXJuIHQgPyB0LmRvbmUgOiB1bmRlZmluZWQ7XG4gIH0pO1xufVxuY29uc3QgW3RyYW5zUGVuZGluZywgc2V0VHJhbnNQZW5kaW5nXSA9IC8qQF9fUFVSRV9fKi8gY3JlYXRlU2lnbmFsKGZhbHNlKTtcbmZ1bmN0aW9uIHVzZVRyYW5zaXRpb24oKSB7XG4gIHJldHVybiBbdHJhbnNQZW5kaW5nLCBzdGFydFRyYW5zaXRpb25dO1xufVxuZnVuY3Rpb24gcmVzdW1lRWZmZWN0cyhlKSB7XG4gIEVmZmVjdHMucHVzaC5hcHBseShFZmZlY3RzLCBlKTtcbiAgZS5sZW5ndGggPSAwO1xufVxuZnVuY3Rpb24gY3JlYXRlQ29udGV4dChkZWZhdWx0VmFsdWUsIG9wdGlvbnMpIHtcbiAgY29uc3QgaWQgPSBTeW1ib2woXCJjb250ZXh0XCIpO1xuICByZXR1cm4ge1xuICAgIGlkLFxuICAgIFByb3ZpZGVyOiBjcmVhdGVQcm92aWRlcihpZCksXG4gICAgZGVmYXVsdFZhbHVlXG4gIH07XG59XG5mdW5jdGlvbiB1c2VDb250ZXh0KGNvbnRleHQpIHtcbiAgcmV0dXJuIE93bmVyICYmIE93bmVyLmNvbnRleHQgJiYgT3duZXIuY29udGV4dFtjb250ZXh0LmlkXSAhPT0gdW5kZWZpbmVkXG4gICAgPyBPd25lci5jb250ZXh0W2NvbnRleHQuaWRdXG4gICAgOiBjb250ZXh0LmRlZmF1bHRWYWx1ZTtcbn1cbmZ1bmN0aW9uIGNoaWxkcmVuKGZuKSB7XG4gIGNvbnN0IGNoaWxkcmVuID0gY3JlYXRlTWVtbyhmbik7XG4gIGNvbnN0IG1lbW8gPSBjcmVhdGVNZW1vKCgpID0+IHJlc29sdmVDaGlsZHJlbihjaGlsZHJlbigpKSk7XG4gIG1lbW8udG9BcnJheSA9ICgpID0+IHtcbiAgICBjb25zdCBjID0gbWVtbygpO1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KGMpID8gYyA6IGMgIT0gbnVsbCA/IFtjXSA6IFtdO1xuICB9O1xuICByZXR1cm4gbWVtbztcbn1cbmxldCBTdXNwZW5zZUNvbnRleHQ7XG5mdW5jdGlvbiBnZXRTdXNwZW5zZUNvbnRleHQoKSB7XG4gIHJldHVybiBTdXNwZW5zZUNvbnRleHQgfHwgKFN1c3BlbnNlQ29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKSk7XG59XG5mdW5jdGlvbiBlbmFibGVFeHRlcm5hbFNvdXJjZShmYWN0b3J5LCB1bnRyYWNrID0gZm4gPT4gZm4oKSkge1xuICBpZiAoRXh0ZXJuYWxTb3VyY2VDb25maWcpIHtcbiAgICBjb25zdCB7IGZhY3Rvcnk6IG9sZEZhY3RvcnksIHVudHJhY2s6IG9sZFVudHJhY2sgfSA9IEV4dGVybmFsU291cmNlQ29uZmlnO1xuICAgIEV4dGVybmFsU291cmNlQ29uZmlnID0ge1xuICAgICAgZmFjdG9yeTogKGZuLCB0cmlnZ2VyKSA9PiB7XG4gICAgICAgIGNvbnN0IG9sZFNvdXJjZSA9IG9sZEZhY3RvcnkoZm4sIHRyaWdnZXIpO1xuICAgICAgICBjb25zdCBzb3VyY2UgPSBmYWN0b3J5KHggPT4gb2xkU291cmNlLnRyYWNrKHgpLCB0cmlnZ2VyKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB0cmFjazogeCA9PiBzb3VyY2UudHJhY2soeCksXG4gICAgICAgICAgZGlzcG9zZSgpIHtcbiAgICAgICAgICAgIHNvdXJjZS5kaXNwb3NlKCk7XG4gICAgICAgICAgICBvbGRTb3VyY2UuZGlzcG9zZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICB1bnRyYWNrOiBmbiA9PiBvbGRVbnRyYWNrKCgpID0+IHVudHJhY2soZm4pKVxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgRXh0ZXJuYWxTb3VyY2VDb25maWcgPSB7XG4gICAgICBmYWN0b3J5LFxuICAgICAgdW50cmFja1xuICAgIH07XG4gIH1cbn1cbmZ1bmN0aW9uIHJlYWRTaWduYWwoKSB7XG4gIGNvbnN0IHJ1bm5pbmdUcmFuc2l0aW9uID0gVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmc7XG4gIGlmICh0aGlzLnNvdXJjZXMgJiYgKHJ1bm5pbmdUcmFuc2l0aW9uID8gdGhpcy50U3RhdGUgOiB0aGlzLnN0YXRlKSkge1xuICAgIGlmICgocnVubmluZ1RyYW5zaXRpb24gPyB0aGlzLnRTdGF0ZSA6IHRoaXMuc3RhdGUpID09PSBTVEFMRSkgdXBkYXRlQ29tcHV0YXRpb24odGhpcyk7XG4gICAgZWxzZSB7XG4gICAgICBjb25zdCB1cGRhdGVzID0gVXBkYXRlcztcbiAgICAgIFVwZGF0ZXMgPSBudWxsO1xuICAgICAgcnVuVXBkYXRlcygoKSA9PiBsb29rVXBzdHJlYW0odGhpcyksIGZhbHNlKTtcbiAgICAgIFVwZGF0ZXMgPSB1cGRhdGVzO1xuICAgIH1cbiAgfVxuICBpZiAoTGlzdGVuZXIpIHtcbiAgICBjb25zdCBzU2xvdCA9IHRoaXMub2JzZXJ2ZXJzID8gdGhpcy5vYnNlcnZlcnMubGVuZ3RoIDogMDtcbiAgICBpZiAoIUxpc3RlbmVyLnNvdXJjZXMpIHtcbiAgICAgIExpc3RlbmVyLnNvdXJjZXMgPSBbdGhpc107XG4gICAgICBMaXN0ZW5lci5zb3VyY2VTbG90cyA9IFtzU2xvdF07XG4gICAgfSBlbHNlIHtcbiAgICAgIExpc3RlbmVyLnNvdXJjZXMucHVzaCh0aGlzKTtcbiAgICAgIExpc3RlbmVyLnNvdXJjZVNsb3RzLnB1c2goc1Nsb3QpO1xuICAgIH1cbiAgICBpZiAoIXRoaXMub2JzZXJ2ZXJzKSB7XG4gICAgICB0aGlzLm9ic2VydmVycyA9IFtMaXN0ZW5lcl07XG4gICAgICB0aGlzLm9ic2VydmVyU2xvdHMgPSBbTGlzdGVuZXIuc291cmNlcy5sZW5ndGggLSAxXTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5vYnNlcnZlcnMucHVzaChMaXN0ZW5lcik7XG4gICAgICB0aGlzLm9ic2VydmVyU2xvdHMucHVzaChMaXN0ZW5lci5zb3VyY2VzLmxlbmd0aCAtIDEpO1xuICAgIH1cbiAgfVxuICBpZiAocnVubmluZ1RyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5zb3VyY2VzLmhhcyh0aGlzKSkgcmV0dXJuIHRoaXMudFZhbHVlO1xuICByZXR1cm4gdGhpcy52YWx1ZTtcbn1cbmZ1bmN0aW9uIHdyaXRlU2lnbmFsKG5vZGUsIHZhbHVlLCBpc0NvbXApIHtcbiAgbGV0IGN1cnJlbnQgPVxuICAgIFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nICYmIFRyYW5zaXRpb24uc291cmNlcy5oYXMobm9kZSkgPyBub2RlLnRWYWx1ZSA6IG5vZGUudmFsdWU7XG4gIGlmICghbm9kZS5jb21wYXJhdG9yIHx8ICFub2RlLmNvbXBhcmF0b3IoY3VycmVudCwgdmFsdWUpKSB7XG4gICAgaWYgKFRyYW5zaXRpb24pIHtcbiAgICAgIGNvbnN0IFRyYW5zaXRpb25SdW5uaW5nID0gVHJhbnNpdGlvbi5ydW5uaW5nO1xuICAgICAgaWYgKFRyYW5zaXRpb25SdW5uaW5nIHx8ICghaXNDb21wICYmIFRyYW5zaXRpb24uc291cmNlcy5oYXMobm9kZSkpKSB7XG4gICAgICAgIFRyYW5zaXRpb24uc291cmNlcy5hZGQobm9kZSk7XG4gICAgICAgIG5vZGUudFZhbHVlID0gdmFsdWU7XG4gICAgICB9XG4gICAgICBpZiAoIVRyYW5zaXRpb25SdW5uaW5nKSBub2RlLnZhbHVlID0gdmFsdWU7XG4gICAgfSBlbHNlIG5vZGUudmFsdWUgPSB2YWx1ZTtcbiAgICBpZiAobm9kZS5vYnNlcnZlcnMgJiYgbm9kZS5vYnNlcnZlcnMubGVuZ3RoKSB7XG4gICAgICBydW5VcGRhdGVzKCgpID0+IHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBub2RlLm9ic2VydmVycy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgIGNvbnN0IG8gPSBub2RlLm9ic2VydmVyc1tpXTtcbiAgICAgICAgICBjb25zdCBUcmFuc2l0aW9uUnVubmluZyA9IFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nO1xuICAgICAgICAgIGlmIChUcmFuc2l0aW9uUnVubmluZyAmJiBUcmFuc2l0aW9uLmRpc3Bvc2VkLmhhcyhvKSkgY29udGludWU7XG4gICAgICAgICAgaWYgKFRyYW5zaXRpb25SdW5uaW5nID8gIW8udFN0YXRlIDogIW8uc3RhdGUpIHtcbiAgICAgICAgICAgIGlmIChvLnB1cmUpIFVwZGF0ZXMucHVzaChvKTtcbiAgICAgICAgICAgIGVsc2UgRWZmZWN0cy5wdXNoKG8pO1xuICAgICAgICAgICAgaWYgKG8ub2JzZXJ2ZXJzKSBtYXJrRG93bnN0cmVhbShvKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFUcmFuc2l0aW9uUnVubmluZykgby5zdGF0ZSA9IFNUQUxFO1xuICAgICAgICAgIGVsc2Ugby50U3RhdGUgPSBTVEFMRTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoVXBkYXRlcy5sZW5ndGggPiAxMGU1KSB7XG4gICAgICAgICAgVXBkYXRlcyA9IFtdO1xuICAgICAgICAgIGlmIChmYWxzZSk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCk7XG4gICAgICAgIH1cbiAgICAgIH0sIGZhbHNlKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufVxuZnVuY3Rpb24gdXBkYXRlQ29tcHV0YXRpb24obm9kZSkge1xuICBpZiAoIW5vZGUuZm4pIHJldHVybjtcbiAgY2xlYW5Ob2RlKG5vZGUpO1xuICBjb25zdCB0aW1lID0gRXhlY0NvdW50O1xuICBydW5Db21wdXRhdGlvbihcbiAgICBub2RlLFxuICAgIFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nICYmIFRyYW5zaXRpb24uc291cmNlcy5oYXMobm9kZSkgPyBub2RlLnRWYWx1ZSA6IG5vZGUudmFsdWUsXG4gICAgdGltZVxuICApO1xuICBpZiAoVHJhbnNpdGlvbiAmJiAhVHJhbnNpdGlvbi5ydW5uaW5nICYmIFRyYW5zaXRpb24uc291cmNlcy5oYXMobm9kZSkpIHtcbiAgICBxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG4gICAgICBydW5VcGRhdGVzKCgpID0+IHtcbiAgICAgICAgVHJhbnNpdGlvbiAmJiAoVHJhbnNpdGlvbi5ydW5uaW5nID0gdHJ1ZSk7XG4gICAgICAgIExpc3RlbmVyID0gT3duZXIgPSBub2RlO1xuICAgICAgICBydW5Db21wdXRhdGlvbihub2RlLCBub2RlLnRWYWx1ZSwgdGltZSk7XG4gICAgICAgIExpc3RlbmVyID0gT3duZXIgPSBudWxsO1xuICAgICAgfSwgZmFsc2UpO1xuICAgIH0pO1xuICB9XG59XG5mdW5jdGlvbiBydW5Db21wdXRhdGlvbihub2RlLCB2YWx1ZSwgdGltZSkge1xuICBsZXQgbmV4dFZhbHVlO1xuICBjb25zdCBvd25lciA9IE93bmVyLFxuICAgIGxpc3RlbmVyID0gTGlzdGVuZXI7XG4gIExpc3RlbmVyID0gT3duZXIgPSBub2RlO1xuICB0cnkge1xuICAgIG5leHRWYWx1ZSA9IG5vZGUuZm4odmFsdWUpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBpZiAobm9kZS5wdXJlKSB7XG4gICAgICBpZiAoVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcpIHtcbiAgICAgICAgbm9kZS50U3RhdGUgPSBTVEFMRTtcbiAgICAgICAgbm9kZS50T3duZWQgJiYgbm9kZS50T3duZWQuZm9yRWFjaChjbGVhbk5vZGUpO1xuICAgICAgICBub2RlLnRPd25lZCA9IHVuZGVmaW5lZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5vZGUuc3RhdGUgPSBTVEFMRTtcbiAgICAgICAgbm9kZS5vd25lZCAmJiBub2RlLm93bmVkLmZvckVhY2goY2xlYW5Ob2RlKTtcbiAgICAgICAgbm9kZS5vd25lZCA9IG51bGw7XG4gICAgICB9XG4gICAgfVxuICAgIG5vZGUudXBkYXRlZEF0ID0gdGltZSArIDE7XG4gICAgcmV0dXJuIGhhbmRsZUVycm9yKGVycik7XG4gIH0gZmluYWxseSB7XG4gICAgTGlzdGVuZXIgPSBsaXN0ZW5lcjtcbiAgICBPd25lciA9IG93bmVyO1xuICB9XG4gIGlmICghbm9kZS51cGRhdGVkQXQgfHwgbm9kZS51cGRhdGVkQXQgPD0gdGltZSkge1xuICAgIGlmIChub2RlLnVwZGF0ZWRBdCAhPSBudWxsICYmIFwib2JzZXJ2ZXJzXCIgaW4gbm9kZSkge1xuICAgICAgd3JpdGVTaWduYWwobm9kZSwgbmV4dFZhbHVlLCB0cnVlKTtcbiAgICB9IGVsc2UgaWYgKFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nICYmIG5vZGUucHVyZSkge1xuICAgICAgVHJhbnNpdGlvbi5zb3VyY2VzLmFkZChub2RlKTtcbiAgICAgIG5vZGUudFZhbHVlID0gbmV4dFZhbHVlO1xuICAgIH0gZWxzZSBub2RlLnZhbHVlID0gbmV4dFZhbHVlO1xuICAgIG5vZGUudXBkYXRlZEF0ID0gdGltZTtcbiAgfVxufVxuZnVuY3Rpb24gY3JlYXRlQ29tcHV0YXRpb24oZm4sIGluaXQsIHB1cmUsIHN0YXRlID0gU1RBTEUsIG9wdGlvbnMpIHtcbiAgY29uc3QgYyA9IHtcbiAgICBmbixcbiAgICBzdGF0ZTogc3RhdGUsXG4gICAgdXBkYXRlZEF0OiBudWxsLFxuICAgIG93bmVkOiBudWxsLFxuICAgIHNvdXJjZXM6IG51bGwsXG4gICAgc291cmNlU2xvdHM6IG51bGwsXG4gICAgY2xlYW51cHM6IG51bGwsXG4gICAgdmFsdWU6IGluaXQsXG4gICAgb3duZXI6IE93bmVyLFxuICAgIGNvbnRleHQ6IE93bmVyID8gT3duZXIuY29udGV4dCA6IG51bGwsXG4gICAgcHVyZVxuICB9O1xuICBpZiAoVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmcpIHtcbiAgICBjLnN0YXRlID0gMDtcbiAgICBjLnRTdGF0ZSA9IHN0YXRlO1xuICB9XG4gIGlmIChPd25lciA9PT0gbnVsbCk7XG4gIGVsc2UgaWYgKE93bmVyICE9PSBVTk9XTkVEKSB7XG4gICAgaWYgKFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nICYmIE93bmVyLnB1cmUpIHtcbiAgICAgIGlmICghT3duZXIudE93bmVkKSBPd25lci50T3duZWQgPSBbY107XG4gICAgICBlbHNlIE93bmVyLnRPd25lZC5wdXNoKGMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIU93bmVyLm93bmVkKSBPd25lci5vd25lZCA9IFtjXTtcbiAgICAgIGVsc2UgT3duZXIub3duZWQucHVzaChjKTtcbiAgICB9XG4gIH1cbiAgaWYgKEV4dGVybmFsU291cmNlQ29uZmlnICYmIGMuZm4pIHtcbiAgICBjb25zdCBbdHJhY2ssIHRyaWdnZXJdID0gY3JlYXRlU2lnbmFsKHVuZGVmaW5lZCwge1xuICAgICAgZXF1YWxzOiBmYWxzZVxuICAgIH0pO1xuICAgIGNvbnN0IG9yZGluYXJ5ID0gRXh0ZXJuYWxTb3VyY2VDb25maWcuZmFjdG9yeShjLmZuLCB0cmlnZ2VyKTtcbiAgICBvbkNsZWFudXAoKCkgPT4gb3JkaW5hcnkuZGlzcG9zZSgpKTtcbiAgICBjb25zdCB0cmlnZ2VySW5UcmFuc2l0aW9uID0gKCkgPT4gc3RhcnRUcmFuc2l0aW9uKHRyaWdnZXIpLnRoZW4oKCkgPT4gaW5UcmFuc2l0aW9uLmRpc3Bvc2UoKSk7XG4gICAgY29uc3QgaW5UcmFuc2l0aW9uID0gRXh0ZXJuYWxTb3VyY2VDb25maWcuZmFjdG9yeShjLmZuLCB0cmlnZ2VySW5UcmFuc2l0aW9uKTtcbiAgICBjLmZuID0geCA9PiB7XG4gICAgICB0cmFjaygpO1xuICAgICAgcmV0dXJuIFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nID8gaW5UcmFuc2l0aW9uLnRyYWNrKHgpIDogb3JkaW5hcnkudHJhY2soeCk7XG4gICAgfTtcbiAgfVxuICByZXR1cm4gYztcbn1cbmZ1bmN0aW9uIHJ1blRvcChub2RlKSB7XG4gIGNvbnN0IHJ1bm5pbmdUcmFuc2l0aW9uID0gVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmc7XG4gIGlmICgocnVubmluZ1RyYW5zaXRpb24gPyBub2RlLnRTdGF0ZSA6IG5vZGUuc3RhdGUpID09PSAwKSByZXR1cm47XG4gIGlmICgocnVubmluZ1RyYW5zaXRpb24gPyBub2RlLnRTdGF0ZSA6IG5vZGUuc3RhdGUpID09PSBQRU5ESU5HKSByZXR1cm4gbG9va1Vwc3RyZWFtKG5vZGUpO1xuICBpZiAobm9kZS5zdXNwZW5zZSAmJiB1bnRyYWNrKG5vZGUuc3VzcGVuc2UuaW5GYWxsYmFjaykpIHJldHVybiBub2RlLnN1c3BlbnNlLmVmZmVjdHMucHVzaChub2RlKTtcbiAgY29uc3QgYW5jZXN0b3JzID0gW25vZGVdO1xuICB3aGlsZSAoKG5vZGUgPSBub2RlLm93bmVyKSAmJiAoIW5vZGUudXBkYXRlZEF0IHx8IG5vZGUudXBkYXRlZEF0IDwgRXhlY0NvdW50KSkge1xuICAgIGlmIChydW5uaW5nVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLmRpc3Bvc2VkLmhhcyhub2RlKSkgcmV0dXJuO1xuICAgIGlmIChydW5uaW5nVHJhbnNpdGlvbiA/IG5vZGUudFN0YXRlIDogbm9kZS5zdGF0ZSkgYW5jZXN0b3JzLnB1c2gobm9kZSk7XG4gIH1cbiAgZm9yIChsZXQgaSA9IGFuY2VzdG9ycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIG5vZGUgPSBhbmNlc3RvcnNbaV07XG4gICAgaWYgKHJ1bm5pbmdUcmFuc2l0aW9uKSB7XG4gICAgICBsZXQgdG9wID0gbm9kZSxcbiAgICAgICAgcHJldiA9IGFuY2VzdG9yc1tpICsgMV07XG4gICAgICB3aGlsZSAoKHRvcCA9IHRvcC5vd25lcikgJiYgdG9wICE9PSBwcmV2KSB7XG4gICAgICAgIGlmIChUcmFuc2l0aW9uLmRpc3Bvc2VkLmhhcyh0b3ApKSByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICAgIGlmICgocnVubmluZ1RyYW5zaXRpb24gPyBub2RlLnRTdGF0ZSA6IG5vZGUuc3RhdGUpID09PSBTVEFMRSkge1xuICAgICAgdXBkYXRlQ29tcHV0YXRpb24obm9kZSk7XG4gICAgfSBlbHNlIGlmICgocnVubmluZ1RyYW5zaXRpb24gPyBub2RlLnRTdGF0ZSA6IG5vZGUuc3RhdGUpID09PSBQRU5ESU5HKSB7XG4gICAgICBjb25zdCB1cGRhdGVzID0gVXBkYXRlcztcbiAgICAgIFVwZGF0ZXMgPSBudWxsO1xuICAgICAgcnVuVXBkYXRlcygoKSA9PiBsb29rVXBzdHJlYW0obm9kZSwgYW5jZXN0b3JzWzBdKSwgZmFsc2UpO1xuICAgICAgVXBkYXRlcyA9IHVwZGF0ZXM7XG4gICAgfVxuICB9XG59XG5mdW5jdGlvbiBydW5VcGRhdGVzKGZuLCBpbml0KSB7XG4gIGlmIChVcGRhdGVzKSByZXR1cm4gZm4oKTtcbiAgbGV0IHdhaXQgPSBmYWxzZTtcbiAgaWYgKCFpbml0KSBVcGRhdGVzID0gW107XG4gIGlmIChFZmZlY3RzKSB3YWl0ID0gdHJ1ZTtcbiAgZWxzZSBFZmZlY3RzID0gW107XG4gIEV4ZWNDb3VudCsrO1xuICB0cnkge1xuICAgIGNvbnN0IHJlcyA9IGZuKCk7XG4gICAgY29tcGxldGVVcGRhdGVzKHdhaXQpO1xuICAgIHJldHVybiByZXM7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmICghd2FpdCkgRWZmZWN0cyA9IG51bGw7XG4gICAgVXBkYXRlcyA9IG51bGw7XG4gICAgaGFuZGxlRXJyb3IoZXJyKTtcbiAgfVxufVxuZnVuY3Rpb24gY29tcGxldGVVcGRhdGVzKHdhaXQpIHtcbiAgaWYgKFVwZGF0ZXMpIHtcbiAgICBpZiAoU2NoZWR1bGVyICYmIFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nKSBzY2hlZHVsZVF1ZXVlKFVwZGF0ZXMpO1xuICAgIGVsc2UgcnVuUXVldWUoVXBkYXRlcyk7XG4gICAgVXBkYXRlcyA9IG51bGw7XG4gIH1cbiAgaWYgKHdhaXQpIHJldHVybjtcbiAgbGV0IHJlcztcbiAgaWYgKFRyYW5zaXRpb24pIHtcbiAgICBpZiAoIVRyYW5zaXRpb24ucHJvbWlzZXMuc2l6ZSAmJiAhVHJhbnNpdGlvbi5xdWV1ZS5zaXplKSB7XG4gICAgICBjb25zdCBzb3VyY2VzID0gVHJhbnNpdGlvbi5zb3VyY2VzO1xuICAgICAgY29uc3QgZGlzcG9zZWQgPSBUcmFuc2l0aW9uLmRpc3Bvc2VkO1xuICAgICAgRWZmZWN0cy5wdXNoLmFwcGx5KEVmZmVjdHMsIFRyYW5zaXRpb24uZWZmZWN0cyk7XG4gICAgICByZXMgPSBUcmFuc2l0aW9uLnJlc29sdmU7XG4gICAgICBmb3IgKGNvbnN0IGUgb2YgRWZmZWN0cykge1xuICAgICAgICBcInRTdGF0ZVwiIGluIGUgJiYgKGUuc3RhdGUgPSBlLnRTdGF0ZSk7XG4gICAgICAgIGRlbGV0ZSBlLnRTdGF0ZTtcbiAgICAgIH1cbiAgICAgIFRyYW5zaXRpb24gPSBudWxsO1xuICAgICAgcnVuVXBkYXRlcygoKSA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgZCBvZiBkaXNwb3NlZCkgY2xlYW5Ob2RlKGQpO1xuICAgICAgICBmb3IgKGNvbnN0IHYgb2Ygc291cmNlcykge1xuICAgICAgICAgIHYudmFsdWUgPSB2LnRWYWx1ZTtcbiAgICAgICAgICBpZiAodi5vd25lZCkge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IHYub3duZWQubGVuZ3RoOyBpIDwgbGVuOyBpKyspIGNsZWFuTm9kZSh2Lm93bmVkW2ldKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHYudE93bmVkKSB2Lm93bmVkID0gdi50T3duZWQ7XG4gICAgICAgICAgZGVsZXRlIHYudFZhbHVlO1xuICAgICAgICAgIGRlbGV0ZSB2LnRPd25lZDtcbiAgICAgICAgICB2LnRTdGF0ZSA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgc2V0VHJhbnNQZW5kaW5nKGZhbHNlKTtcbiAgICAgIH0sIGZhbHNlKTtcbiAgICB9IGVsc2UgaWYgKFRyYW5zaXRpb24ucnVubmluZykge1xuICAgICAgVHJhbnNpdGlvbi5ydW5uaW5nID0gZmFsc2U7XG4gICAgICBUcmFuc2l0aW9uLmVmZmVjdHMucHVzaC5hcHBseShUcmFuc2l0aW9uLmVmZmVjdHMsIEVmZmVjdHMpO1xuICAgICAgRWZmZWN0cyA9IG51bGw7XG4gICAgICBzZXRUcmFuc1BlbmRpbmcodHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG4gIGNvbnN0IGUgPSBFZmZlY3RzO1xuICBFZmZlY3RzID0gbnVsbDtcbiAgaWYgKGUubGVuZ3RoKSBydW5VcGRhdGVzKCgpID0+IHJ1bkVmZmVjdHMoZSksIGZhbHNlKTtcbiAgaWYgKHJlcykgcmVzKCk7XG59XG5mdW5jdGlvbiBydW5RdWV1ZShxdWV1ZSkge1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXVlLmxlbmd0aDsgaSsrKSBydW5Ub3AocXVldWVbaV0pO1xufVxuZnVuY3Rpb24gc2NoZWR1bGVRdWV1ZShxdWV1ZSkge1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXVlLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgaXRlbSA9IHF1ZXVlW2ldO1xuICAgIGNvbnN0IHRhc2tzID0gVHJhbnNpdGlvbi5xdWV1ZTtcbiAgICBpZiAoIXRhc2tzLmhhcyhpdGVtKSkge1xuICAgICAgdGFza3MuYWRkKGl0ZW0pO1xuICAgICAgU2NoZWR1bGVyKCgpID0+IHtcbiAgICAgICAgdGFza3MuZGVsZXRlKGl0ZW0pO1xuICAgICAgICBydW5VcGRhdGVzKCgpID0+IHtcbiAgICAgICAgICBUcmFuc2l0aW9uLnJ1bm5pbmcgPSB0cnVlO1xuICAgICAgICAgIHJ1blRvcChpdGVtKTtcbiAgICAgICAgfSwgZmFsc2UpO1xuICAgICAgICBUcmFuc2l0aW9uICYmIChUcmFuc2l0aW9uLnJ1bm5pbmcgPSBmYWxzZSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbn1cbmZ1bmN0aW9uIHJ1blVzZXJFZmZlY3RzKHF1ZXVlKSB7XG4gIGxldCBpLFxuICAgIHVzZXJMZW5ndGggPSAwO1xuICBmb3IgKGkgPSAwOyBpIDwgcXVldWUubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBlID0gcXVldWVbaV07XG4gICAgaWYgKCFlLnVzZXIpIHJ1blRvcChlKTtcbiAgICBlbHNlIHF1ZXVlW3VzZXJMZW5ndGgrK10gPSBlO1xuICB9XG4gIGlmIChzaGFyZWRDb25maWcuY29udGV4dCkge1xuICAgIGlmIChzaGFyZWRDb25maWcuY291bnQpIHtcbiAgICAgIHNoYXJlZENvbmZpZy5lZmZlY3RzIHx8IChzaGFyZWRDb25maWcuZWZmZWN0cyA9IFtdKTtcbiAgICAgIHNoYXJlZENvbmZpZy5lZmZlY3RzLnB1c2goLi4ucXVldWUuc2xpY2UoMCwgdXNlckxlbmd0aCkpO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZiAoc2hhcmVkQ29uZmlnLmVmZmVjdHMpIHtcbiAgICAgIHF1ZXVlID0gWy4uLnNoYXJlZENvbmZpZy5lZmZlY3RzLCAuLi5xdWV1ZV07XG4gICAgICB1c2VyTGVuZ3RoICs9IHNoYXJlZENvbmZpZy5lZmZlY3RzLmxlbmd0aDtcbiAgICAgIGRlbGV0ZSBzaGFyZWRDb25maWcuZWZmZWN0cztcbiAgICB9XG4gICAgc2V0SHlkcmF0ZUNvbnRleHQoKTtcbiAgfVxuICBmb3IgKGkgPSAwOyBpIDwgdXNlckxlbmd0aDsgaSsrKSBydW5Ub3AocXVldWVbaV0pO1xufVxuZnVuY3Rpb24gbG9va1Vwc3RyZWFtKG5vZGUsIGlnbm9yZSkge1xuICBjb25zdCBydW5uaW5nVHJhbnNpdGlvbiA9IFRyYW5zaXRpb24gJiYgVHJhbnNpdGlvbi5ydW5uaW5nO1xuICBpZiAocnVubmluZ1RyYW5zaXRpb24pIG5vZGUudFN0YXRlID0gMDtcbiAgZWxzZSBub2RlLnN0YXRlID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBub2RlLnNvdXJjZXMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICBjb25zdCBzb3VyY2UgPSBub2RlLnNvdXJjZXNbaV07XG4gICAgaWYgKHNvdXJjZS5zb3VyY2VzKSB7XG4gICAgICBjb25zdCBzdGF0ZSA9IHJ1bm5pbmdUcmFuc2l0aW9uID8gc291cmNlLnRTdGF0ZSA6IHNvdXJjZS5zdGF0ZTtcbiAgICAgIGlmIChzdGF0ZSA9PT0gU1RBTEUpIHtcbiAgICAgICAgaWYgKHNvdXJjZSAhPT0gaWdub3JlICYmICghc291cmNlLnVwZGF0ZWRBdCB8fCBzb3VyY2UudXBkYXRlZEF0IDwgRXhlY0NvdW50KSlcbiAgICAgICAgICBydW5Ub3Aoc291cmNlKTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IFBFTkRJTkcpIGxvb2tVcHN0cmVhbShzb3VyY2UsIGlnbm9yZSk7XG4gICAgfVxuICB9XG59XG5mdW5jdGlvbiBtYXJrRG93bnN0cmVhbShub2RlKSB7XG4gIGNvbnN0IHJ1bm5pbmdUcmFuc2l0aW9uID0gVHJhbnNpdGlvbiAmJiBUcmFuc2l0aW9uLnJ1bm5pbmc7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZS5vYnNlcnZlcnMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICBjb25zdCBvID0gbm9kZS5vYnNlcnZlcnNbaV07XG4gICAgaWYgKHJ1bm5pbmdUcmFuc2l0aW9uID8gIW8udFN0YXRlIDogIW8uc3RhdGUpIHtcbiAgICAgIGlmIChydW5uaW5nVHJhbnNpdGlvbikgby50U3RhdGUgPSBQRU5ESU5HO1xuICAgICAgZWxzZSBvLnN0YXRlID0gUEVORElORztcbiAgICAgIGlmIChvLnB1cmUpIFVwZGF0ZXMucHVzaChvKTtcbiAgICAgIGVsc2UgRWZmZWN0cy5wdXNoKG8pO1xuICAgICAgby5vYnNlcnZlcnMgJiYgbWFya0Rvd25zdHJlYW0obyk7XG4gICAgfVxuICB9XG59XG5mdW5jdGlvbiBjbGVhbk5vZGUobm9kZSkge1xuICBsZXQgaTtcbiAgaWYgKG5vZGUuc291cmNlcykge1xuICAgIHdoaWxlIChub2RlLnNvdXJjZXMubGVuZ3RoKSB7XG4gICAgICBjb25zdCBzb3VyY2UgPSBub2RlLnNvdXJjZXMucG9wKCksXG4gICAgICAgIGluZGV4ID0gbm9kZS5zb3VyY2VTbG90cy5wb3AoKSxcbiAgICAgICAgb2JzID0gc291cmNlLm9ic2VydmVycztcbiAgICAgIGlmIChvYnMgJiYgb2JzLmxlbmd0aCkge1xuICAgICAgICBjb25zdCBuID0gb2JzLnBvcCgpLFxuICAgICAgICAgIHMgPSBzb3VyY2Uub2JzZXJ2ZXJTbG90cy5wb3AoKTtcbiAgICAgICAgaWYgKGluZGV4IDwgb2JzLmxlbmd0aCkge1xuICAgICAgICAgIG4uc291cmNlU2xvdHNbc10gPSBpbmRleDtcbiAgICAgICAgICBvYnNbaW5kZXhdID0gbjtcbiAgICAgICAgICBzb3VyY2Uub2JzZXJ2ZXJTbG90c1tpbmRleF0gPSBzO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZyAmJiBub2RlLnB1cmUpIHtcbiAgICBpZiAobm9kZS50T3duZWQpIHtcbiAgICAgIGZvciAoaSA9IG5vZGUudE93bmVkLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSBjbGVhbk5vZGUobm9kZS50T3duZWRbaV0pO1xuICAgICAgZGVsZXRlIG5vZGUudE93bmVkO1xuICAgIH1cbiAgICByZXNldChub2RlLCB0cnVlKTtcbiAgfSBlbHNlIGlmIChub2RlLm93bmVkKSB7XG4gICAgZm9yIChpID0gbm9kZS5vd25lZC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkgY2xlYW5Ob2RlKG5vZGUub3duZWRbaV0pO1xuICAgIG5vZGUub3duZWQgPSBudWxsO1xuICB9XG4gIGlmIChub2RlLmNsZWFudXBzKSB7XG4gICAgZm9yIChpID0gbm9kZS5jbGVhbnVwcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkgbm9kZS5jbGVhbnVwc1tpXSgpO1xuICAgIG5vZGUuY2xlYW51cHMgPSBudWxsO1xuICB9XG4gIGlmIChUcmFuc2l0aW9uICYmIFRyYW5zaXRpb24ucnVubmluZykgbm9kZS50U3RhdGUgPSAwO1xuICBlbHNlIG5vZGUuc3RhdGUgPSAwO1xufVxuZnVuY3Rpb24gcmVzZXQobm9kZSwgdG9wKSB7XG4gIGlmICghdG9wKSB7XG4gICAgbm9kZS50U3RhdGUgPSAwO1xuICAgIFRyYW5zaXRpb24uZGlzcG9zZWQuYWRkKG5vZGUpO1xuICB9XG4gIGlmIChub2RlLm93bmVkKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBub2RlLm93bmVkLmxlbmd0aDsgaSsrKSByZXNldChub2RlLm93bmVkW2ldKTtcbiAgfVxufVxuZnVuY3Rpb24gY2FzdEVycm9yKGVycikge1xuICBpZiAoZXJyIGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiBlcnI7XG4gIHJldHVybiBuZXcgRXJyb3IodHlwZW9mIGVyciA9PT0gXCJzdHJpbmdcIiA/IGVyciA6IFwiVW5rbm93biBlcnJvclwiLCB7XG4gICAgY2F1c2U6IGVyclxuICB9KTtcbn1cbmZ1bmN0aW9uIHJ1bkVycm9ycyhlcnIsIGZucywgb3duZXIpIHtcbiAgdHJ5IHtcbiAgICBmb3IgKGNvbnN0IGYgb2YgZm5zKSBmKGVycik7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBoYW5kbGVFcnJvcihlLCAob3duZXIgJiYgb3duZXIub3duZXIpIHx8IG51bGwpO1xuICB9XG59XG5mdW5jdGlvbiBoYW5kbGVFcnJvcihlcnIsIG93bmVyID0gT3duZXIpIHtcbiAgY29uc3QgZm5zID0gRVJST1IgJiYgb3duZXIgJiYgb3duZXIuY29udGV4dCAmJiBvd25lci5jb250ZXh0W0VSUk9SXTtcbiAgY29uc3QgZXJyb3IgPSBjYXN0RXJyb3IoZXJyKTtcbiAgaWYgKCFmbnMpIHRocm93IGVycm9yO1xuICBpZiAoRWZmZWN0cylcbiAgICBFZmZlY3RzLnB1c2goe1xuICAgICAgZm4oKSB7XG4gICAgICAgIHJ1bkVycm9ycyhlcnJvciwgZm5zLCBvd25lcik7XG4gICAgICB9LFxuICAgICAgc3RhdGU6IFNUQUxFXG4gICAgfSk7XG4gIGVsc2UgcnVuRXJyb3JzKGVycm9yLCBmbnMsIG93bmVyKTtcbn1cbmZ1bmN0aW9uIHJlc29sdmVDaGlsZHJlbihjaGlsZHJlbikge1xuICBpZiAodHlwZW9mIGNoaWxkcmVuID09PSBcImZ1bmN0aW9uXCIgJiYgIWNoaWxkcmVuLmxlbmd0aCkgcmV0dXJuIHJlc29sdmVDaGlsZHJlbihjaGlsZHJlbigpKTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoY2hpbGRyZW4pKSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHJlc29sdmVDaGlsZHJlbihjaGlsZHJlbltpXSk7XG4gICAgICBBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHRzLnB1c2guYXBwbHkocmVzdWx0cywgcmVzdWx0KSA6IHJlc3VsdHMucHVzaChyZXN1bHQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuICByZXR1cm4gY2hpbGRyZW47XG59XG5mdW5jdGlvbiBjcmVhdGVQcm92aWRlcihpZCwgb3B0aW9ucykge1xuICByZXR1cm4gZnVuY3Rpb24gcHJvdmlkZXIocHJvcHMpIHtcbiAgICBsZXQgcmVzO1xuICAgIGNyZWF0ZVJlbmRlckVmZmVjdChcbiAgICAgICgpID0+XG4gICAgICAgIChyZXMgPSB1bnRyYWNrKCgpID0+IHtcbiAgICAgICAgICBPd25lci5jb250ZXh0ID0ge1xuICAgICAgICAgICAgLi4uT3duZXIuY29udGV4dCxcbiAgICAgICAgICAgIFtpZF06IHByb3BzLnZhbHVlXG4gICAgICAgICAgfTtcbiAgICAgICAgICByZXR1cm4gY2hpbGRyZW4oKCkgPT4gcHJvcHMuY2hpbGRyZW4pO1xuICAgICAgICB9KSksXG4gICAgICB1bmRlZmluZWRcbiAgICApO1xuICAgIHJldHVybiByZXM7XG4gIH07XG59XG5mdW5jdGlvbiBvbkVycm9yKGZuKSB7XG4gIEVSUk9SIHx8IChFUlJPUiA9IFN5bWJvbChcImVycm9yXCIpKTtcbiAgaWYgKE93bmVyID09PSBudWxsKTtcbiAgZWxzZSBpZiAoT3duZXIuY29udGV4dCA9PT0gbnVsbCB8fCAhT3duZXIuY29udGV4dFtFUlJPUl0pIHtcbiAgICBPd25lci5jb250ZXh0ID0ge1xuICAgICAgLi4uT3duZXIuY29udGV4dCxcbiAgICAgIFtFUlJPUl06IFtmbl1cbiAgICB9O1xuICAgIG11dGF0ZUNvbnRleHQoT3duZXIsIEVSUk9SLCBbZm5dKTtcbiAgfSBlbHNlIE93bmVyLmNvbnRleHRbRVJST1JdLnB1c2goZm4pO1xufVxuZnVuY3Rpb24gbXV0YXRlQ29udGV4dChvLCBrZXksIHZhbHVlKSB7XG4gIGlmIChvLm93bmVkKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBvLm93bmVkLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoby5vd25lZFtpXS5jb250ZXh0ID09PSBvLmNvbnRleHQpIG11dGF0ZUNvbnRleHQoby5vd25lZFtpXSwga2V5LCB2YWx1ZSk7XG4gICAgICBpZiAoIW8ub3duZWRbaV0uY29udGV4dCkge1xuICAgICAgICBvLm93bmVkW2ldLmNvbnRleHQgPSBvLmNvbnRleHQ7XG4gICAgICAgIG11dGF0ZUNvbnRleHQoby5vd25lZFtpXSwga2V5LCB2YWx1ZSk7XG4gICAgICB9IGVsc2UgaWYgKCFvLm93bmVkW2ldLmNvbnRleHRba2V5XSkge1xuICAgICAgICBvLm93bmVkW2ldLmNvbnRleHRba2V5XSA9IHZhbHVlO1xuICAgICAgICBtdXRhdGVDb250ZXh0KG8ub3duZWRbaV0sIGtleSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBvYnNlcnZhYmxlKGlucHV0KSB7XG4gIHJldHVybiB7XG4gICAgc3Vic2NyaWJlKG9ic2VydmVyKSB7XG4gICAgICBpZiAoIShvYnNlcnZlciBpbnN0YW5jZW9mIE9iamVjdCkgfHwgb2JzZXJ2ZXIgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRXhwZWN0ZWQgdGhlIG9ic2VydmVyIHRvIGJlIGFuIG9iamVjdC5cIik7XG4gICAgICB9XG4gICAgICBjb25zdCBoYW5kbGVyID1cbiAgICAgICAgdHlwZW9mIG9ic2VydmVyID09PSBcImZ1bmN0aW9uXCIgPyBvYnNlcnZlciA6IG9ic2VydmVyLm5leHQgJiYgb2JzZXJ2ZXIubmV4dC5iaW5kKG9ic2VydmVyKTtcbiAgICAgIGlmICghaGFuZGxlcikge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHVuc3Vic2NyaWJlKCkge31cbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGRpc3Bvc2UgPSBjcmVhdGVSb290KGRpc3Bvc2VyID0+IHtcbiAgICAgICAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICAgICAgICBjb25zdCB2ID0gaW5wdXQoKTtcbiAgICAgICAgICB1bnRyYWNrKCgpID0+IGhhbmRsZXIodikpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRpc3Bvc2VyO1xuICAgICAgfSk7XG4gICAgICBpZiAoZ2V0T3duZXIoKSkgb25DbGVhbnVwKGRpc3Bvc2UpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdW5zdWJzY3JpYmUoKSB7XG4gICAgICAgICAgZGlzcG9zZSgpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH0sXG4gICAgW1N5bWJvbC5vYnNlcnZhYmxlIHx8IFwiQEBvYnNlcnZhYmxlXCJdKCkge1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICB9O1xufVxuZnVuY3Rpb24gZnJvbShwcm9kdWNlcikge1xuICBjb25zdCBbcywgc2V0XSA9IGNyZWF0ZVNpZ25hbCh1bmRlZmluZWQsIHtcbiAgICBlcXVhbHM6IGZhbHNlXG4gIH0pO1xuICBpZiAoXCJzdWJzY3JpYmVcIiBpbiBwcm9kdWNlcikge1xuICAgIGNvbnN0IHVuc3ViID0gcHJvZHVjZXIuc3Vic2NyaWJlKHYgPT4gc2V0KCgpID0+IHYpKTtcbiAgICBvbkNsZWFudXAoKCkgPT4gKFwidW5zdWJzY3JpYmVcIiBpbiB1bnN1YiA/IHVuc3ViLnVuc3Vic2NyaWJlKCkgOiB1bnN1YigpKSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgY2xlYW4gPSBwcm9kdWNlcihzZXQpO1xuICAgIG9uQ2xlYW51cChjbGVhbik7XG4gIH1cbiAgcmV0dXJuIHM7XG59XG5cbmNvbnN0IEZBTExCQUNLID0gU3ltYm9sKFwiZmFsbGJhY2tcIik7XG5mdW5jdGlvbiBkaXNwb3NlKGQpIHtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkLmxlbmd0aDsgaSsrKSBkW2ldKCk7XG59XG5mdW5jdGlvbiBtYXBBcnJheShsaXN0LCBtYXBGbiwgb3B0aW9ucyA9IHt9KSB7XG4gIGxldCBpdGVtcyA9IFtdLFxuICAgIG1hcHBlZCA9IFtdLFxuICAgIGRpc3Bvc2VycyA9IFtdLFxuICAgIGxlbiA9IDAsXG4gICAgaW5kZXhlcyA9IG1hcEZuLmxlbmd0aCA+IDEgPyBbXSA6IG51bGw7XG4gIG9uQ2xlYW51cCgoKSA9PiBkaXNwb3NlKGRpc3Bvc2VycykpO1xuICByZXR1cm4gKCkgPT4ge1xuICAgIGxldCBuZXdJdGVtcyA9IGxpc3QoKSB8fCBbXSxcbiAgICAgIGksXG4gICAgICBqO1xuICAgIG5ld0l0ZW1zWyRUUkFDS107XG4gICAgcmV0dXJuIHVudHJhY2soKCkgPT4ge1xuICAgICAgbGV0IG5ld0xlbiA9IG5ld0l0ZW1zLmxlbmd0aCxcbiAgICAgICAgbmV3SW5kaWNlcyxcbiAgICAgICAgbmV3SW5kaWNlc05leHQsXG4gICAgICAgIHRlbXAsXG4gICAgICAgIHRlbXBkaXNwb3NlcnMsXG4gICAgICAgIHRlbXBJbmRleGVzLFxuICAgICAgICBzdGFydCxcbiAgICAgICAgZW5kLFxuICAgICAgICBuZXdFbmQsXG4gICAgICAgIGl0ZW07XG4gICAgICBpZiAobmV3TGVuID09PSAwKSB7XG4gICAgICAgIGlmIChsZW4gIT09IDApIHtcbiAgICAgICAgICBkaXNwb3NlKGRpc3Bvc2Vycyk7XG4gICAgICAgICAgZGlzcG9zZXJzID0gW107XG4gICAgICAgICAgaXRlbXMgPSBbXTtcbiAgICAgICAgICBtYXBwZWQgPSBbXTtcbiAgICAgICAgICBsZW4gPSAwO1xuICAgICAgICAgIGluZGV4ZXMgJiYgKGluZGV4ZXMgPSBbXSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdGlvbnMuZmFsbGJhY2spIHtcbiAgICAgICAgICBpdGVtcyA9IFtGQUxMQkFDS107XG4gICAgICAgICAgbWFwcGVkWzBdID0gY3JlYXRlUm9vdChkaXNwb3NlciA9PiB7XG4gICAgICAgICAgICBkaXNwb3NlcnNbMF0gPSBkaXNwb3NlcjtcbiAgICAgICAgICAgIHJldHVybiBvcHRpb25zLmZhbGxiYWNrKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgbGVuID0gMTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChsZW4gPT09IDApIHtcbiAgICAgICAgbWFwcGVkID0gbmV3IEFycmF5KG5ld0xlbik7XG4gICAgICAgIGZvciAoaiA9IDA7IGogPCBuZXdMZW47IGorKykge1xuICAgICAgICAgIGl0ZW1zW2pdID0gbmV3SXRlbXNbal07XG4gICAgICAgICAgbWFwcGVkW2pdID0gY3JlYXRlUm9vdChtYXBwZXIpO1xuICAgICAgICB9XG4gICAgICAgIGxlbiA9IG5ld0xlbjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRlbXAgPSBuZXcgQXJyYXkobmV3TGVuKTtcbiAgICAgICAgdGVtcGRpc3Bvc2VycyA9IG5ldyBBcnJheShuZXdMZW4pO1xuICAgICAgICBpbmRleGVzICYmICh0ZW1wSW5kZXhlcyA9IG5ldyBBcnJheShuZXdMZW4pKTtcbiAgICAgICAgZm9yIChcbiAgICAgICAgICBzdGFydCA9IDAsIGVuZCA9IE1hdGgubWluKGxlbiwgbmV3TGVuKTtcbiAgICAgICAgICBzdGFydCA8IGVuZCAmJiBpdGVtc1tzdGFydF0gPT09IG5ld0l0ZW1zW3N0YXJ0XTtcbiAgICAgICAgICBzdGFydCsrXG4gICAgICAgICk7XG4gICAgICAgIGZvciAoXG4gICAgICAgICAgZW5kID0gbGVuIC0gMSwgbmV3RW5kID0gbmV3TGVuIC0gMTtcbiAgICAgICAgICBlbmQgPj0gc3RhcnQgJiYgbmV3RW5kID49IHN0YXJ0ICYmIGl0ZW1zW2VuZF0gPT09IG5ld0l0ZW1zW25ld0VuZF07XG4gICAgICAgICAgZW5kLS0sIG5ld0VuZC0tXG4gICAgICAgICkge1xuICAgICAgICAgIHRlbXBbbmV3RW5kXSA9IG1hcHBlZFtlbmRdO1xuICAgICAgICAgIHRlbXBkaXNwb3NlcnNbbmV3RW5kXSA9IGRpc3Bvc2Vyc1tlbmRdO1xuICAgICAgICAgIGluZGV4ZXMgJiYgKHRlbXBJbmRleGVzW25ld0VuZF0gPSBpbmRleGVzW2VuZF0pO1xuICAgICAgICB9XG4gICAgICAgIG5ld0luZGljZXMgPSBuZXcgTWFwKCk7XG4gICAgICAgIG5ld0luZGljZXNOZXh0ID0gbmV3IEFycmF5KG5ld0VuZCArIDEpO1xuICAgICAgICBmb3IgKGogPSBuZXdFbmQ7IGogPj0gc3RhcnQ7IGotLSkge1xuICAgICAgICAgIGl0ZW0gPSBuZXdJdGVtc1tqXTtcbiAgICAgICAgICBpID0gbmV3SW5kaWNlcy5nZXQoaXRlbSk7XG4gICAgICAgICAgbmV3SW5kaWNlc05leHRbal0gPSBpID09PSB1bmRlZmluZWQgPyAtMSA6IGk7XG4gICAgICAgICAgbmV3SW5kaWNlcy5zZXQoaXRlbSwgaik7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChpID0gc3RhcnQ7IGkgPD0gZW5kOyBpKyspIHtcbiAgICAgICAgICBpdGVtID0gaXRlbXNbaV07XG4gICAgICAgICAgaiA9IG5ld0luZGljZXMuZ2V0KGl0ZW0pO1xuICAgICAgICAgIGlmIChqICE9PSB1bmRlZmluZWQgJiYgaiAhPT0gLTEpIHtcbiAgICAgICAgICAgIHRlbXBbal0gPSBtYXBwZWRbaV07XG4gICAgICAgICAgICB0ZW1wZGlzcG9zZXJzW2pdID0gZGlzcG9zZXJzW2ldO1xuICAgICAgICAgICAgaW5kZXhlcyAmJiAodGVtcEluZGV4ZXNbal0gPSBpbmRleGVzW2ldKTtcbiAgICAgICAgICAgIGogPSBuZXdJbmRpY2VzTmV4dFtqXTtcbiAgICAgICAgICAgIG5ld0luZGljZXMuc2V0KGl0ZW0sIGopO1xuICAgICAgICAgIH0gZWxzZSBkaXNwb3NlcnNbaV0oKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGogPSBzdGFydDsgaiA8IG5ld0xlbjsgaisrKSB7XG4gICAgICAgICAgaWYgKGogaW4gdGVtcCkge1xuICAgICAgICAgICAgbWFwcGVkW2pdID0gdGVtcFtqXTtcbiAgICAgICAgICAgIGRpc3Bvc2Vyc1tqXSA9IHRlbXBkaXNwb3NlcnNbal07XG4gICAgICAgICAgICBpZiAoaW5kZXhlcykge1xuICAgICAgICAgICAgICBpbmRleGVzW2pdID0gdGVtcEluZGV4ZXNbal07XG4gICAgICAgICAgICAgIGluZGV4ZXNbal0oaik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIG1hcHBlZFtqXSA9IGNyZWF0ZVJvb3QobWFwcGVyKTtcbiAgICAgICAgfVxuICAgICAgICBtYXBwZWQgPSBtYXBwZWQuc2xpY2UoMCwgKGxlbiA9IG5ld0xlbikpO1xuICAgICAgICBpdGVtcyA9IG5ld0l0ZW1zLnNsaWNlKDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG1hcHBlZDtcbiAgICB9KTtcbiAgICBmdW5jdGlvbiBtYXBwZXIoZGlzcG9zZXIpIHtcbiAgICAgIGRpc3Bvc2Vyc1tqXSA9IGRpc3Bvc2VyO1xuICAgICAgaWYgKGluZGV4ZXMpIHtcbiAgICAgICAgY29uc3QgW3MsIHNldF0gPSBjcmVhdGVTaWduYWwoaik7XG4gICAgICAgIGluZGV4ZXNbal0gPSBzZXQ7XG4gICAgICAgIHJldHVybiBtYXBGbihuZXdJdGVtc1tqXSwgcyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbWFwRm4obmV3SXRlbXNbal0pO1xuICAgIH1cbiAgfTtcbn1cbmZ1bmN0aW9uIGluZGV4QXJyYXkobGlzdCwgbWFwRm4sIG9wdGlvbnMgPSB7fSkge1xuICBsZXQgaXRlbXMgPSBbXSxcbiAgICBtYXBwZWQgPSBbXSxcbiAgICBkaXNwb3NlcnMgPSBbXSxcbiAgICBzaWduYWxzID0gW10sXG4gICAgbGVuID0gMCxcbiAgICBpO1xuICBvbkNsZWFudXAoKCkgPT4gZGlzcG9zZShkaXNwb3NlcnMpKTtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBjb25zdCBuZXdJdGVtcyA9IGxpc3QoKSB8fCBbXTtcbiAgICBuZXdJdGVtc1skVFJBQ0tdO1xuICAgIHJldHVybiB1bnRyYWNrKCgpID0+IHtcbiAgICAgIGlmIChuZXdJdGVtcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgaWYgKGxlbiAhPT0gMCkge1xuICAgICAgICAgIGRpc3Bvc2UoZGlzcG9zZXJzKTtcbiAgICAgICAgICBkaXNwb3NlcnMgPSBbXTtcbiAgICAgICAgICBpdGVtcyA9IFtdO1xuICAgICAgICAgIG1hcHBlZCA9IFtdO1xuICAgICAgICAgIGxlbiA9IDA7XG4gICAgICAgICAgc2lnbmFscyA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRpb25zLmZhbGxiYWNrKSB7XG4gICAgICAgICAgaXRlbXMgPSBbRkFMTEJBQ0tdO1xuICAgICAgICAgIG1hcHBlZFswXSA9IGNyZWF0ZVJvb3QoZGlzcG9zZXIgPT4ge1xuICAgICAgICAgICAgZGlzcG9zZXJzWzBdID0gZGlzcG9zZXI7XG4gICAgICAgICAgICByZXR1cm4gb3B0aW9ucy5mYWxsYmFjaygpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxlbiA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hcHBlZDtcbiAgICAgIH1cbiAgICAgIGlmIChpdGVtc1swXSA9PT0gRkFMTEJBQ0spIHtcbiAgICAgICAgZGlzcG9zZXJzWzBdKCk7XG4gICAgICAgIGRpc3Bvc2VycyA9IFtdO1xuICAgICAgICBpdGVtcyA9IFtdO1xuICAgICAgICBtYXBwZWQgPSBbXTtcbiAgICAgICAgbGVuID0gMDtcbiAgICAgIH1cbiAgICAgIGZvciAoaSA9IDA7IGkgPCBuZXdJdGVtcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoaSA8IGl0ZW1zLmxlbmd0aCAmJiBpdGVtc1tpXSAhPT0gbmV3SXRlbXNbaV0pIHtcbiAgICAgICAgICBzaWduYWxzW2ldKCgpID0+IG5ld0l0ZW1zW2ldKTtcbiAgICAgICAgfSBlbHNlIGlmIChpID49IGl0ZW1zLmxlbmd0aCkge1xuICAgICAgICAgIG1hcHBlZFtpXSA9IGNyZWF0ZVJvb3QobWFwcGVyKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZm9yICg7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBkaXNwb3NlcnNbaV0oKTtcbiAgICAgIH1cbiAgICAgIGxlbiA9IHNpZ25hbHMubGVuZ3RoID0gZGlzcG9zZXJzLmxlbmd0aCA9IG5ld0l0ZW1zLmxlbmd0aDtcbiAgICAgIGl0ZW1zID0gbmV3SXRlbXMuc2xpY2UoMCk7XG4gICAgICByZXR1cm4gKG1hcHBlZCA9IG1hcHBlZC5zbGljZSgwLCBsZW4pKTtcbiAgICB9KTtcbiAgICBmdW5jdGlvbiBtYXBwZXIoZGlzcG9zZXIpIHtcbiAgICAgIGRpc3Bvc2Vyc1tpXSA9IGRpc3Bvc2VyO1xuICAgICAgY29uc3QgW3MsIHNldF0gPSBjcmVhdGVTaWduYWwobmV3SXRlbXNbaV0pO1xuICAgICAgc2lnbmFsc1tpXSA9IHNldDtcbiAgICAgIHJldHVybiBtYXBGbihzLCBpKTtcbiAgICB9XG4gIH07XG59XG5cbmxldCBoeWRyYXRpb25FbmFibGVkID0gZmFsc2U7XG5mdW5jdGlvbiBlbmFibGVIeWRyYXRpb24oKSB7XG4gIGh5ZHJhdGlvbkVuYWJsZWQgPSB0cnVlO1xufVxuZnVuY3Rpb24gY3JlYXRlQ29tcG9uZW50KENvbXAsIHByb3BzKSB7XG4gIGlmIChoeWRyYXRpb25FbmFibGVkKSB7XG4gICAgaWYgKHNoYXJlZENvbmZpZy5jb250ZXh0KSB7XG4gICAgICBjb25zdCBjID0gc2hhcmVkQ29uZmlnLmNvbnRleHQ7XG4gICAgICBzZXRIeWRyYXRlQ29udGV4dChuZXh0SHlkcmF0ZUNvbnRleHQoKSk7XG4gICAgICBjb25zdCByID0gdW50cmFjaygoKSA9PiBDb21wKHByb3BzIHx8IHt9KSk7XG4gICAgICBzZXRIeWRyYXRlQ29udGV4dChjKTtcbiAgICAgIHJldHVybiByO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdW50cmFjaygoKSA9PiBDb21wKHByb3BzIHx8IHt9KSk7XG59XG5mdW5jdGlvbiB0cnVlRm4oKSB7XG4gIHJldHVybiB0cnVlO1xufVxuY29uc3QgcHJvcFRyYXBzID0ge1xuICBnZXQoXywgcHJvcGVydHksIHJlY2VpdmVyKSB7XG4gICAgaWYgKHByb3BlcnR5ID09PSAkUFJPWFkpIHJldHVybiByZWNlaXZlcjtcbiAgICByZXR1cm4gXy5nZXQocHJvcGVydHkpO1xuICB9LFxuICBoYXMoXywgcHJvcGVydHkpIHtcbiAgICBpZiAocHJvcGVydHkgPT09ICRQUk9YWSkgcmV0dXJuIHRydWU7XG4gICAgcmV0dXJuIF8uaGFzKHByb3BlcnR5KTtcbiAgfSxcbiAgc2V0OiB0cnVlRm4sXG4gIGRlbGV0ZVByb3BlcnR5OiB0cnVlRm4sXG4gIGdldE93blByb3BlcnR5RGVzY3JpcHRvcihfLCBwcm9wZXJ0eSkge1xuICAgIHJldHVybiB7XG4gICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgZ2V0KCkge1xuICAgICAgICByZXR1cm4gXy5nZXQocHJvcGVydHkpO1xuICAgICAgfSxcbiAgICAgIHNldDogdHJ1ZUZuLFxuICAgICAgZGVsZXRlUHJvcGVydHk6IHRydWVGblxuICAgIH07XG4gIH0sXG4gIG93bktleXMoXykge1xuICAgIHJldHVybiBfLmtleXMoKTtcbiAgfVxufTtcbmZ1bmN0aW9uIHJlc29sdmVTb3VyY2Uocykge1xuICByZXR1cm4gIShzID0gdHlwZW9mIHMgPT09IFwiZnVuY3Rpb25cIiA/IHMoKSA6IHMpID8ge30gOiBzO1xufVxuZnVuY3Rpb24gcmVzb2x2ZVNvdXJjZXMoKSB7XG4gIGZvciAobGV0IGkgPSAwLCBsZW5ndGggPSB0aGlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgKytpKSB7XG4gICAgY29uc3QgdiA9IHRoaXNbaV0oKTtcbiAgICBpZiAodiAhPT0gdW5kZWZpbmVkKSByZXR1cm4gdjtcbiAgfVxufVxuZnVuY3Rpb24gbWVyZ2VQcm9wcyguLi5zb3VyY2VzKSB7XG4gIGxldCBwcm94eSA9IGZhbHNlO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHNvdXJjZXMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzID0gc291cmNlc1tpXTtcbiAgICBwcm94eSA9IHByb3h5IHx8ICghIXMgJiYgJFBST1hZIGluIHMpO1xuICAgIHNvdXJjZXNbaV0gPSB0eXBlb2YgcyA9PT0gXCJmdW5jdGlvblwiID8gKChwcm94eSA9IHRydWUpLCBjcmVhdGVNZW1vKHMpKSA6IHM7XG4gIH1cbiAgaWYgKHByb3h5KSB7XG4gICAgcmV0dXJuIG5ldyBQcm94eShcbiAgICAgIHtcbiAgICAgICAgZ2V0KHByb3BlcnR5KSB7XG4gICAgICAgICAgZm9yIChsZXQgaSA9IHNvdXJjZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIGNvbnN0IHYgPSByZXNvbHZlU291cmNlKHNvdXJjZXNbaV0pW3Byb3BlcnR5XTtcbiAgICAgICAgICAgIGlmICh2ICE9PSB1bmRlZmluZWQpIHJldHVybiB2O1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgaGFzKHByb3BlcnR5KSB7XG4gICAgICAgICAgZm9yIChsZXQgaSA9IHNvdXJjZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eSBpbiByZXNvbHZlU291cmNlKHNvdXJjZXNbaV0pKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9LFxuICAgICAgICBrZXlzKCkge1xuICAgICAgICAgIGNvbnN0IGtleXMgPSBbXTtcbiAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNvdXJjZXMubGVuZ3RoOyBpKyspXG4gICAgICAgICAgICBrZXlzLnB1c2goLi4uT2JqZWN0LmtleXMocmVzb2x2ZVNvdXJjZShzb3VyY2VzW2ldKSkpO1xuICAgICAgICAgIHJldHVybiBbLi4ubmV3IFNldChrZXlzKV07XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBwcm9wVHJhcHNcbiAgICApO1xuICB9XG4gIGNvbnN0IHNvdXJjZXNNYXAgPSB7fTtcbiAgY29uc3QgZGVmaW5lZCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gIGZvciAobGV0IGkgPSBzb3VyY2VzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgY29uc3Qgc291cmNlID0gc291cmNlc1tpXTtcbiAgICBpZiAoIXNvdXJjZSkgY29udGludWU7XG4gICAgY29uc3Qgc291cmNlS2V5cyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHNvdXJjZSk7XG4gICAgZm9yIChsZXQgaSA9IHNvdXJjZUtleXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIGNvbnN0IGtleSA9IHNvdXJjZUtleXNbaV07XG4gICAgICBpZiAoa2V5ID09PSBcIl9fcHJvdG9fX1wiIHx8IGtleSA9PT0gXCJjb25zdHJ1Y3RvclwiKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHNvdXJjZSwga2V5KTtcbiAgICAgIGlmICghZGVmaW5lZFtrZXldKSB7XG4gICAgICAgIGRlZmluZWRba2V5XSA9IGRlc2MuZ2V0XG4gICAgICAgICAgPyB7XG4gICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgZ2V0OiByZXNvbHZlU291cmNlcy5iaW5kKChzb3VyY2VzTWFwW2tleV0gPSBbZGVzYy5nZXQuYmluZChzb3VyY2UpXSkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgOiBkZXNjLnZhbHVlICE9PSB1bmRlZmluZWRcbiAgICAgICAgICA/IGRlc2NcbiAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHNvdXJjZXMgPSBzb3VyY2VzTWFwW2tleV07XG4gICAgICAgIGlmIChzb3VyY2VzKSB7XG4gICAgICAgICAgaWYgKGRlc2MuZ2V0KSBzb3VyY2VzLnB1c2goZGVzYy5nZXQuYmluZChzb3VyY2UpKTtcbiAgICAgICAgICBlbHNlIGlmIChkZXNjLnZhbHVlICE9PSB1bmRlZmluZWQpIHNvdXJjZXMucHVzaCgoKSA9PiBkZXNjLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCB0YXJnZXQgPSB7fTtcbiAgY29uc3QgZGVmaW5lZEtleXMgPSBPYmplY3Qua2V5cyhkZWZpbmVkKTtcbiAgZm9yIChsZXQgaSA9IGRlZmluZWRLZXlzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgY29uc3Qga2V5ID0gZGVmaW5lZEtleXNbaV0sXG4gICAgICBkZXNjID0gZGVmaW5lZFtrZXldO1xuICAgIGlmIChkZXNjICYmIGRlc2MuZ2V0KSBPYmplY3QuZGVmaW5lUHJvcGVydHkodGFyZ2V0LCBrZXksIGRlc2MpO1xuICAgIGVsc2UgdGFyZ2V0W2tleV0gPSBkZXNjID8gZGVzYy52YWx1ZSA6IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gdGFyZ2V0O1xufVxuZnVuY3Rpb24gc3BsaXRQcm9wcyhwcm9wcywgLi4ua2V5cykge1xuICBpZiAoJFBST1hZIGluIHByb3BzKSB7XG4gICAgY29uc3QgYmxvY2tlZCA9IG5ldyBTZXQoa2V5cy5sZW5ndGggPiAxID8ga2V5cy5mbGF0KCkgOiBrZXlzWzBdKTtcbiAgICBjb25zdCByZXMgPSBrZXlzLm1hcChrID0+IHtcbiAgICAgIHJldHVybiBuZXcgUHJveHkoXG4gICAgICAgIHtcbiAgICAgICAgICBnZXQocHJvcGVydHkpIHtcbiAgICAgICAgICAgIHJldHVybiBrLmluY2x1ZGVzKHByb3BlcnR5KSA/IHByb3BzW3Byb3BlcnR5XSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGhhcyhwcm9wZXJ0eSkge1xuICAgICAgICAgICAgcmV0dXJuIGsuaW5jbHVkZXMocHJvcGVydHkpICYmIHByb3BlcnR5IGluIHByb3BzO1xuICAgICAgICAgIH0sXG4gICAgICAgICAga2V5cygpIHtcbiAgICAgICAgICAgIHJldHVybiBrLmZpbHRlcihwcm9wZXJ0eSA9PiBwcm9wZXJ0eSBpbiBwcm9wcyk7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBwcm9wVHJhcHNcbiAgICAgICk7XG4gICAgfSk7XG4gICAgcmVzLnB1c2goXG4gICAgICBuZXcgUHJveHkoXG4gICAgICAgIHtcbiAgICAgICAgICBnZXQocHJvcGVydHkpIHtcbiAgICAgICAgICAgIHJldHVybiBibG9ja2VkLmhhcyhwcm9wZXJ0eSkgPyB1bmRlZmluZWQgOiBwcm9wc1twcm9wZXJ0eV07XG4gICAgICAgICAgfSxcbiAgICAgICAgICBoYXMocHJvcGVydHkpIHtcbiAgICAgICAgICAgIHJldHVybiBibG9ja2VkLmhhcyhwcm9wZXJ0eSkgPyBmYWxzZSA6IHByb3BlcnR5IGluIHByb3BzO1xuICAgICAgICAgIH0sXG4gICAgICAgICAga2V5cygpIHtcbiAgICAgICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhwcm9wcykuZmlsdGVyKGsgPT4gIWJsb2NrZWQuaGFzKGspKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHByb3BUcmFwc1xuICAgICAgKVxuICAgICk7XG4gICAgcmV0dXJuIHJlcztcbiAgfVxuICBjb25zdCBvdGhlck9iamVjdCA9IHt9O1xuICBjb25zdCBvYmplY3RzID0ga2V5cy5tYXAoKCkgPT4gKHt9KSk7XG4gIGZvciAoY29uc3QgcHJvcE5hbWUgb2YgT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMocHJvcHMpKSB7XG4gICAgY29uc3QgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IocHJvcHMsIHByb3BOYW1lKTtcbiAgICBjb25zdCBpc0RlZmF1bHREZXNjID1cbiAgICAgICFkZXNjLmdldCAmJiAhZGVzYy5zZXQgJiYgZGVzYy5lbnVtZXJhYmxlICYmIGRlc2Mud3JpdGFibGUgJiYgZGVzYy5jb25maWd1cmFibGU7XG4gICAgbGV0IGJsb2NrZWQgPSBmYWxzZTtcbiAgICBsZXQgb2JqZWN0SW5kZXggPSAwO1xuICAgIGZvciAoY29uc3QgayBvZiBrZXlzKSB7XG4gICAgICBpZiAoay5pbmNsdWRlcyhwcm9wTmFtZSkpIHtcbiAgICAgICAgYmxvY2tlZCA9IHRydWU7XG4gICAgICAgIGlzRGVmYXVsdERlc2NcbiAgICAgICAgICA/IChvYmplY3RzW29iamVjdEluZGV4XVtwcm9wTmFtZV0gPSBkZXNjLnZhbHVlKVxuICAgICAgICAgIDogT2JqZWN0LmRlZmluZVByb3BlcnR5KG9iamVjdHNbb2JqZWN0SW5kZXhdLCBwcm9wTmFtZSwgZGVzYyk7XG4gICAgICB9XG4gICAgICArK29iamVjdEluZGV4O1xuICAgIH1cbiAgICBpZiAoIWJsb2NrZWQpIHtcbiAgICAgIGlzRGVmYXVsdERlc2NcbiAgICAgICAgPyAob3RoZXJPYmplY3RbcHJvcE5hbWVdID0gZGVzYy52YWx1ZSlcbiAgICAgICAgOiBPYmplY3QuZGVmaW5lUHJvcGVydHkob3RoZXJPYmplY3QsIHByb3BOYW1lLCBkZXNjKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFsuLi5vYmplY3RzLCBvdGhlck9iamVjdF07XG59XG5mdW5jdGlvbiBsYXp5KGZuKSB7XG4gIGxldCBjb21wO1xuICBsZXQgcDtcbiAgY29uc3Qgd3JhcCA9IHByb3BzID0+IHtcbiAgICBjb25zdCBjdHggPSBzaGFyZWRDb25maWcuY29udGV4dDtcbiAgICBpZiAoY3R4KSB7XG4gICAgICBjb25zdCBbcywgc2V0XSA9IGNyZWF0ZVNpZ25hbCgpO1xuICAgICAgc2hhcmVkQ29uZmlnLmNvdW50IHx8IChzaGFyZWRDb25maWcuY291bnQgPSAwKTtcbiAgICAgIHNoYXJlZENvbmZpZy5jb3VudCsrO1xuICAgICAgKHAgfHwgKHAgPSBmbigpKSkudGhlbihtb2QgPT4ge1xuICAgICAgICBzZXRIeWRyYXRlQ29udGV4dChjdHgpO1xuICAgICAgICBzaGFyZWRDb25maWcuY291bnQtLTtcbiAgICAgICAgc2V0KCgpID0+IG1vZC5kZWZhdWx0KTtcbiAgICAgICAgc2V0SHlkcmF0ZUNvbnRleHQoKTtcbiAgICAgIH0pO1xuICAgICAgY29tcCA9IHM7XG4gICAgfSBlbHNlIGlmICghY29tcCkge1xuICAgICAgY29uc3QgW3NdID0gY3JlYXRlUmVzb3VyY2UoKCkgPT4gKHAgfHwgKHAgPSBmbigpKSkudGhlbihtb2QgPT4gbW9kLmRlZmF1bHQpKTtcbiAgICAgIGNvbXAgPSBzO1xuICAgIH1cbiAgICBsZXQgQ29tcDtcbiAgICByZXR1cm4gY3JlYXRlTWVtbyhcbiAgICAgICgpID0+XG4gICAgICAgIChDb21wID0gY29tcCgpKSAmJlxuICAgICAgICB1bnRyYWNrKCgpID0+IHtcbiAgICAgICAgICBpZiAoZmFsc2UpO1xuICAgICAgICAgIGlmICghY3R4KSByZXR1cm4gQ29tcChwcm9wcyk7XG4gICAgICAgICAgY29uc3QgYyA9IHNoYXJlZENvbmZpZy5jb250ZXh0O1xuICAgICAgICAgIHNldEh5ZHJhdGVDb250ZXh0KGN0eCk7XG4gICAgICAgICAgY29uc3QgciA9IENvbXAocHJvcHMpO1xuICAgICAgICAgIHNldEh5ZHJhdGVDb250ZXh0KGMpO1xuICAgICAgICAgIHJldHVybiByO1xuICAgICAgICB9KVxuICAgICk7XG4gIH07XG4gIHdyYXAucHJlbG9hZCA9ICgpID0+IHAgfHwgKChwID0gZm4oKSkudGhlbihtb2QgPT4gKGNvbXAgPSAoKSA9PiBtb2QuZGVmYXVsdCkpLCBwKTtcbiAgcmV0dXJuIHdyYXA7XG59XG5sZXQgY291bnRlciA9IDA7XG5mdW5jdGlvbiBjcmVhdGVVbmlxdWVJZCgpIHtcbiAgY29uc3QgY3R4ID0gc2hhcmVkQ29uZmlnLmNvbnRleHQ7XG4gIHJldHVybiBjdHggPyBgJHtjdHguaWR9JHtjdHguY291bnQrK31gIDogYGNsLSR7Y291bnRlcisrfWA7XG59XG5cbmNvbnN0IG5hcnJvd2VkRXJyb3IgPSBuYW1lID0+IGBTdGFsZSByZWFkIGZyb20gPCR7bmFtZX0+LmA7XG5mdW5jdGlvbiBGb3IocHJvcHMpIHtcbiAgY29uc3QgZmFsbGJhY2sgPSBcImZhbGxiYWNrXCIgaW4gcHJvcHMgJiYge1xuICAgIGZhbGxiYWNrOiAoKSA9PiBwcm9wcy5mYWxsYmFja1xuICB9O1xuICByZXR1cm4gY3JlYXRlTWVtbyhtYXBBcnJheSgoKSA9PiBwcm9wcy5lYWNoLCBwcm9wcy5jaGlsZHJlbiwgZmFsbGJhY2sgfHwgdW5kZWZpbmVkKSk7XG59XG5mdW5jdGlvbiBJbmRleChwcm9wcykge1xuICBjb25zdCBmYWxsYmFjayA9IFwiZmFsbGJhY2tcIiBpbiBwcm9wcyAmJiB7XG4gICAgZmFsbGJhY2s6ICgpID0+IHByb3BzLmZhbGxiYWNrXG4gIH07XG4gIHJldHVybiBjcmVhdGVNZW1vKGluZGV4QXJyYXkoKCkgPT4gcHJvcHMuZWFjaCwgcHJvcHMuY2hpbGRyZW4sIGZhbGxiYWNrIHx8IHVuZGVmaW5lZCkpO1xufVxuZnVuY3Rpb24gU2hvdyhwcm9wcykge1xuICBjb25zdCBrZXllZCA9IHByb3BzLmtleWVkO1xuICBjb25zdCBjb25kaXRpb24gPSBjcmVhdGVNZW1vKCgpID0+IHByb3BzLndoZW4sIHVuZGVmaW5lZCwge1xuICAgIGVxdWFsczogKGEsIGIpID0+IChrZXllZCA/IGEgPT09IGIgOiAhYSA9PT0gIWIpXG4gIH0pO1xuICByZXR1cm4gY3JlYXRlTWVtbyhcbiAgICAoKSA9PiB7XG4gICAgICBjb25zdCBjID0gY29uZGl0aW9uKCk7XG4gICAgICBpZiAoYykge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHByb3BzLmNoaWxkcmVuO1xuICAgICAgICBjb25zdCBmbiA9IHR5cGVvZiBjaGlsZCA9PT0gXCJmdW5jdGlvblwiICYmIGNoaWxkLmxlbmd0aCA+IDA7XG4gICAgICAgIHJldHVybiBmblxuICAgICAgICAgID8gdW50cmFjaygoKSA9PlxuICAgICAgICAgICAgICBjaGlsZChcbiAgICAgICAgICAgICAgICBrZXllZFxuICAgICAgICAgICAgICAgICAgPyBjXG4gICAgICAgICAgICAgICAgICA6ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBpZiAoIXVudHJhY2soY29uZGl0aW9uKSkgdGhyb3cgbmFycm93ZWRFcnJvcihcIlNob3dcIik7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHByb3BzLndoZW47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKVxuICAgICAgICAgIDogY2hpbGQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gcHJvcHMuZmFsbGJhY2s7XG4gICAgfSxcbiAgICB1bmRlZmluZWQsXG4gICAgdW5kZWZpbmVkXG4gICk7XG59XG5mdW5jdGlvbiBTd2l0Y2gocHJvcHMpIHtcbiAgbGV0IGtleWVkID0gZmFsc2U7XG4gIGNvbnN0IGVxdWFscyA9IChhLCBiKSA9PiAoa2V5ZWQgPyBhWzFdID09PSBiWzFdIDogIWFbMV0gPT09ICFiWzFdKSAmJiBhWzJdID09PSBiWzJdO1xuICBjb25zdCBjb25kaXRpb25zID0gY2hpbGRyZW4oKCkgPT4gcHJvcHMuY2hpbGRyZW4pLFxuICAgIGV2YWxDb25kaXRpb25zID0gY3JlYXRlTWVtbyhcbiAgICAgICgpID0+IHtcbiAgICAgICAgbGV0IGNvbmRzID0gY29uZGl0aW9ucygpO1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29uZHMpKSBjb25kcyA9IFtjb25kc107XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29uZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBjb25zdCBjID0gY29uZHNbaV0ud2hlbjtcbiAgICAgICAgICBpZiAoYykge1xuICAgICAgICAgICAga2V5ZWQgPSAhIWNvbmRzW2ldLmtleWVkO1xuICAgICAgICAgICAgcmV0dXJuIFtpLCBjLCBjb25kc1tpXV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbLTFdO1xuICAgICAgfSxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIHtcbiAgICAgICAgZXF1YWxzXG4gICAgICB9XG4gICAgKTtcbiAgcmV0dXJuIGNyZWF0ZU1lbW8oXG4gICAgKCkgPT4ge1xuICAgICAgY29uc3QgW2luZGV4LCB3aGVuLCBjb25kXSA9IGV2YWxDb25kaXRpb25zKCk7XG4gICAgICBpZiAoaW5kZXggPCAwKSByZXR1cm4gcHJvcHMuZmFsbGJhY2s7XG4gICAgICBjb25zdCBjID0gY29uZC5jaGlsZHJlbjtcbiAgICAgIGNvbnN0IGZuID0gdHlwZW9mIGMgPT09IFwiZnVuY3Rpb25cIiAmJiBjLmxlbmd0aCA+IDA7XG4gICAgICByZXR1cm4gZm5cbiAgICAgICAgPyB1bnRyYWNrKCgpID0+XG4gICAgICAgICAgICBjKFxuICAgICAgICAgICAgICBrZXllZFxuICAgICAgICAgICAgICAgID8gd2hlblxuICAgICAgICAgICAgICAgIDogKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAodW50cmFjayhldmFsQ29uZGl0aW9ucylbMF0gIT09IGluZGV4KSB0aHJvdyBuYXJyb3dlZEVycm9yKFwiTWF0Y2hcIik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjb25kLndoZW47XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgICA6IGM7XG4gICAgfSxcbiAgICB1bmRlZmluZWQsXG4gICAgdW5kZWZpbmVkXG4gICk7XG59XG5mdW5jdGlvbiBNYXRjaChwcm9wcykge1xuICByZXR1cm4gcHJvcHM7XG59XG5sZXQgRXJyb3JzO1xuZnVuY3Rpb24gcmVzZXRFcnJvckJvdW5kYXJpZXMoKSB7XG4gIEVycm9ycyAmJiBbLi4uRXJyb3JzXS5mb3JFYWNoKGZuID0+IGZuKCkpO1xufVxuZnVuY3Rpb24gRXJyb3JCb3VuZGFyeShwcm9wcykge1xuICBsZXQgZXJyO1xuICBpZiAoc2hhcmVkQ29uZmlnLmNvbnRleHQgJiYgc2hhcmVkQ29uZmlnLmxvYWQpXG4gICAgZXJyID0gc2hhcmVkQ29uZmlnLmxvYWQoc2hhcmVkQ29uZmlnLmNvbnRleHQuaWQgKyBzaGFyZWRDb25maWcuY29udGV4dC5jb3VudCk7XG4gIGNvbnN0IFtlcnJvcmVkLCBzZXRFcnJvcmVkXSA9IGNyZWF0ZVNpZ25hbChlcnIsIHVuZGVmaW5lZCk7XG4gIEVycm9ycyB8fCAoRXJyb3JzID0gbmV3IFNldCgpKTtcbiAgRXJyb3JzLmFkZChzZXRFcnJvcmVkKTtcbiAgb25DbGVhbnVwKCgpID0+IEVycm9ycy5kZWxldGUoc2V0RXJyb3JlZCkpO1xuICByZXR1cm4gY3JlYXRlTWVtbyhcbiAgICAoKSA9PiB7XG4gICAgICBsZXQgZTtcbiAgICAgIGlmICgoZSA9IGVycm9yZWQoKSkpIHtcbiAgICAgICAgY29uc3QgZiA9IHByb3BzLmZhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdHlwZW9mIGYgPT09IFwiZnVuY3Rpb25cIiAmJiBmLmxlbmd0aCA/IHVudHJhY2soKCkgPT4gZihlLCAoKSA9PiBzZXRFcnJvcmVkKCkpKSA6IGY7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2F0Y2hFcnJvcigoKSA9PiBwcm9wcy5jaGlsZHJlbiwgc2V0RXJyb3JlZCk7XG4gICAgfSxcbiAgICB1bmRlZmluZWQsXG4gICAgdW5kZWZpbmVkXG4gICk7XG59XG5cbmNvbnN0IHN1c3BlbnNlTGlzdEVxdWFscyA9IChhLCBiKSA9PlxuICBhLnNob3dDb250ZW50ID09PSBiLnNob3dDb250ZW50ICYmIGEuc2hvd0ZhbGxiYWNrID09PSBiLnNob3dGYWxsYmFjaztcbmNvbnN0IFN1c3BlbnNlTGlzdENvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5mdW5jdGlvbiBTdXNwZW5zZUxpc3QocHJvcHMpIHtcbiAgbGV0IFt3cmFwcGVyLCBzZXRXcmFwcGVyXSA9IGNyZWF0ZVNpZ25hbCgoKSA9PiAoe1xuICAgICAgaW5GYWxsYmFjazogZmFsc2VcbiAgICB9KSksXG4gICAgc2hvdztcbiAgY29uc3QgbGlzdENvbnRleHQgPSB1c2VDb250ZXh0KFN1c3BlbnNlTGlzdENvbnRleHQpO1xuICBjb25zdCBbcmVnaXN0cnksIHNldFJlZ2lzdHJ5XSA9IGNyZWF0ZVNpZ25hbChbXSk7XG4gIGlmIChsaXN0Q29udGV4dCkge1xuICAgIHNob3cgPSBsaXN0Q29udGV4dC5yZWdpc3RlcihjcmVhdGVNZW1vKCgpID0+IHdyYXBwZXIoKSgpLmluRmFsbGJhY2spKTtcbiAgfVxuICBjb25zdCByZXNvbHZlZCA9IGNyZWF0ZU1lbW8oXG4gICAgcHJldiA9PiB7XG4gICAgICBjb25zdCByZXZlYWwgPSBwcm9wcy5yZXZlYWxPcmRlcixcbiAgICAgICAgdGFpbCA9IHByb3BzLnRhaWwsXG4gICAgICAgIHsgc2hvd0NvbnRlbnQgPSB0cnVlLCBzaG93RmFsbGJhY2sgPSB0cnVlIH0gPSBzaG93ID8gc2hvdygpIDoge30sXG4gICAgICAgIHJlZyA9IHJlZ2lzdHJ5KCksXG4gICAgICAgIHJldmVyc2UgPSByZXZlYWwgPT09IFwiYmFja3dhcmRzXCI7XG4gICAgICBpZiAocmV2ZWFsID09PSBcInRvZ2V0aGVyXCIpIHtcbiAgICAgICAgY29uc3QgYWxsID0gcmVnLmV2ZXJ5KGluRmFsbGJhY2sgPT4gIWluRmFsbGJhY2soKSk7XG4gICAgICAgIGNvbnN0IHJlcyA9IHJlZy5tYXAoKCkgPT4gKHtcbiAgICAgICAgICBzaG93Q29udGVudDogYWxsICYmIHNob3dDb250ZW50LFxuICAgICAgICAgIHNob3dGYWxsYmFja1xuICAgICAgICB9KSk7XG4gICAgICAgIHJlcy5pbkZhbGxiYWNrID0gIWFsbDtcbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICAgIH1cbiAgICAgIGxldCBzdG9wID0gZmFsc2U7XG4gICAgICBsZXQgaW5GYWxsYmFjayA9IHByZXYuaW5GYWxsYmFjaztcbiAgICAgIGNvbnN0IHJlcyA9IFtdO1xuICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IHJlZy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICBjb25zdCBuID0gcmV2ZXJzZSA/IGxlbiAtIGkgLSAxIDogaSxcbiAgICAgICAgICBzID0gcmVnW25dKCk7XG4gICAgICAgIGlmICghc3RvcCAmJiAhcykge1xuICAgICAgICAgIHJlc1tuXSA9IHtcbiAgICAgICAgICAgIHNob3dDb250ZW50LFxuICAgICAgICAgICAgc2hvd0ZhbGxiYWNrXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBuZXh0ID0gIXN0b3A7XG4gICAgICAgICAgaWYgKG5leHQpIGluRmFsbGJhY2sgPSB0cnVlO1xuICAgICAgICAgIHJlc1tuXSA9IHtcbiAgICAgICAgICAgIHNob3dDb250ZW50OiBuZXh0LFxuICAgICAgICAgICAgc2hvd0ZhbGxiYWNrOiAhdGFpbCB8fCAobmV4dCAmJiB0YWlsID09PSBcImNvbGxhcHNlZFwiKSA/IHNob3dGYWxsYmFjayA6IGZhbHNlXG4gICAgICAgICAgfTtcbiAgICAgICAgICBzdG9wID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKCFzdG9wKSBpbkZhbGxiYWNrID0gZmFsc2U7XG4gICAgICByZXMuaW5GYWxsYmFjayA9IGluRmFsbGJhY2s7XG4gICAgICByZXR1cm4gcmVzO1xuICAgIH0sXG4gICAge1xuICAgICAgaW5GYWxsYmFjazogZmFsc2VcbiAgICB9XG4gICk7XG4gIHNldFdyYXBwZXIoKCkgPT4gcmVzb2x2ZWQpO1xuICByZXR1cm4gY3JlYXRlQ29tcG9uZW50KFN1c3BlbnNlTGlzdENvbnRleHQuUHJvdmlkZXIsIHtcbiAgICB2YWx1ZToge1xuICAgICAgcmVnaXN0ZXI6IGluRmFsbGJhY2sgPT4ge1xuICAgICAgICBsZXQgaW5kZXg7XG4gICAgICAgIHNldFJlZ2lzdHJ5KHJlZ2lzdHJ5ID0+IHtcbiAgICAgICAgICBpbmRleCA9IHJlZ2lzdHJ5Lmxlbmd0aDtcbiAgICAgICAgICByZXR1cm4gWy4uLnJlZ2lzdHJ5LCBpbkZhbGxiYWNrXTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBjcmVhdGVNZW1vKCgpID0+IHJlc29sdmVkKClbaW5kZXhdLCB1bmRlZmluZWQsIHtcbiAgICAgICAgICBlcXVhbHM6IHN1c3BlbnNlTGlzdEVxdWFsc1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGdldCBjaGlsZHJlbigpIHtcbiAgICAgIHJldHVybiBwcm9wcy5jaGlsZHJlbjtcbiAgICB9XG4gIH0pO1xufVxuZnVuY3Rpb24gU3VzcGVuc2UocHJvcHMpIHtcbiAgbGV0IGNvdW50ZXIgPSAwLFxuICAgIHNob3csXG4gICAgY3R4LFxuICAgIHAsXG4gICAgZmxpY2tlcixcbiAgICBlcnJvcjtcbiAgY29uc3QgW2luRmFsbGJhY2ssIHNldEZhbGxiYWNrXSA9IGNyZWF0ZVNpZ25hbChmYWxzZSksXG4gICAgU3VzcGVuc2VDb250ZXh0ID0gZ2V0U3VzcGVuc2VDb250ZXh0KCksXG4gICAgc3RvcmUgPSB7XG4gICAgICBpbmNyZW1lbnQ6ICgpID0+IHtcbiAgICAgICAgaWYgKCsrY291bnRlciA9PT0gMSkgc2V0RmFsbGJhY2sodHJ1ZSk7XG4gICAgICB9LFxuICAgICAgZGVjcmVtZW50OiAoKSA9PiB7XG4gICAgICAgIGlmICgtLWNvdW50ZXIgPT09IDApIHNldEZhbGxiYWNrKGZhbHNlKTtcbiAgICAgIH0sXG4gICAgICBpbkZhbGxiYWNrLFxuICAgICAgZWZmZWN0czogW10sXG4gICAgICByZXNvbHZlZDogZmFsc2VcbiAgICB9LFxuICAgIG93bmVyID0gZ2V0T3duZXIoKTtcbiAgaWYgKHNoYXJlZENvbmZpZy5jb250ZXh0ICYmIHNoYXJlZENvbmZpZy5sb2FkKSB7XG4gICAgY29uc3Qga2V5ID0gc2hhcmVkQ29uZmlnLmNvbnRleHQuaWQgKyBzaGFyZWRDb25maWcuY29udGV4dC5jb3VudDtcbiAgICBsZXQgcmVmID0gc2hhcmVkQ29uZmlnLmxvYWQoa2V5KTtcbiAgICBpZiAocmVmKSB7XG4gICAgICBpZiAodHlwZW9mIHJlZiAhPT0gXCJvYmplY3RcIiB8fCByZWYuc3RhdHVzICE9PSBcInN1Y2Nlc3NcIikgcCA9IHJlZjtcbiAgICAgIGVsc2Ugc2hhcmVkQ29uZmlnLmdhdGhlcihrZXkpO1xuICAgIH1cbiAgICBpZiAocCAmJiBwICE9PSBcIiQkZlwiKSB7XG4gICAgICBjb25zdCBbcywgc2V0XSA9IGNyZWF0ZVNpZ25hbCh1bmRlZmluZWQsIHtcbiAgICAgICAgZXF1YWxzOiBmYWxzZVxuICAgICAgfSk7XG4gICAgICBmbGlja2VyID0gcztcbiAgICAgIHAudGhlbihcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIGlmIChzaGFyZWRDb25maWcuZG9uZSkgcmV0dXJuIHNldCgpO1xuICAgICAgICAgIHNoYXJlZENvbmZpZy5nYXRoZXIoa2V5KTtcbiAgICAgICAgICBzZXRIeWRyYXRlQ29udGV4dChjdHgpO1xuICAgICAgICAgIHNldCgpO1xuICAgICAgICAgIHNldEh5ZHJhdGVDb250ZXh0KCk7XG4gICAgICAgIH0sXG4gICAgICAgIGVyciA9PiB7XG4gICAgICAgICAgZXJyb3IgPSBlcnI7XG4gICAgICAgICAgc2V0KCk7XG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGxpc3RDb250ZXh0ID0gdXNlQ29udGV4dChTdXNwZW5zZUxpc3RDb250ZXh0KTtcbiAgaWYgKGxpc3RDb250ZXh0KSBzaG93ID0gbGlzdENvbnRleHQucmVnaXN0ZXIoc3RvcmUuaW5GYWxsYmFjayk7XG4gIGxldCBkaXNwb3NlO1xuICBvbkNsZWFudXAoKCkgPT4gZGlzcG9zZSAmJiBkaXNwb3NlKCkpO1xuICByZXR1cm4gY3JlYXRlQ29tcG9uZW50KFN1c3BlbnNlQ29udGV4dC5Qcm92aWRlciwge1xuICAgIHZhbHVlOiBzdG9yZSxcbiAgICBnZXQgY2hpbGRyZW4oKSB7XG4gICAgICByZXR1cm4gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgICAgIGlmIChlcnJvcikgdGhyb3cgZXJyb3I7XG4gICAgICAgIGN0eCA9IHNoYXJlZENvbmZpZy5jb250ZXh0O1xuICAgICAgICBpZiAoZmxpY2tlcikge1xuICAgICAgICAgIGZsaWNrZXIoKTtcbiAgICAgICAgICByZXR1cm4gKGZsaWNrZXIgPSB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjdHggJiYgcCA9PT0gXCIkJGZcIikgc2V0SHlkcmF0ZUNvbnRleHQoKTtcbiAgICAgICAgY29uc3QgcmVuZGVyZWQgPSBjcmVhdGVNZW1vKCgpID0+IHByb3BzLmNoaWxkcmVuKTtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZU1lbW8ocHJldiA9PiB7XG4gICAgICAgICAgY29uc3QgaW5GYWxsYmFjayA9IHN0b3JlLmluRmFsbGJhY2soKSxcbiAgICAgICAgICAgIHsgc2hvd0NvbnRlbnQgPSB0cnVlLCBzaG93RmFsbGJhY2sgPSB0cnVlIH0gPSBzaG93ID8gc2hvdygpIDoge307XG4gICAgICAgICAgaWYgKCghaW5GYWxsYmFjayB8fCAocCAmJiBwICE9PSBcIiQkZlwiKSkgJiYgc2hvd0NvbnRlbnQpIHtcbiAgICAgICAgICAgIHN0b3JlLnJlc29sdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGRpc3Bvc2UgJiYgZGlzcG9zZSgpO1xuICAgICAgICAgICAgZGlzcG9zZSA9IGN0eCA9IHAgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICByZXN1bWVFZmZlY3RzKHN0b3JlLmVmZmVjdHMpO1xuICAgICAgICAgICAgcmV0dXJuIHJlbmRlcmVkKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghc2hvd0ZhbGxiYWNrKSByZXR1cm47XG4gICAgICAgICAgaWYgKGRpc3Bvc2UpIHJldHVybiBwcmV2O1xuICAgICAgICAgIHJldHVybiBjcmVhdGVSb290KGRpc3Bvc2VyID0+IHtcbiAgICAgICAgICAgIGRpc3Bvc2UgPSBkaXNwb3NlcjtcbiAgICAgICAgICAgIGlmIChjdHgpIHtcbiAgICAgICAgICAgICAgc2V0SHlkcmF0ZUNvbnRleHQoe1xuICAgICAgICAgICAgICAgIGlkOiBjdHguaWQgKyBcImZcIixcbiAgICAgICAgICAgICAgICBjb3VudDogMFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgY3R4ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHByb3BzLmZhbGxiYWNrO1xuICAgICAgICAgIH0sIG93bmVyKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xufVxuXG5jb25zdCBERVYgPSB1bmRlZmluZWQ7XG5cbmV4cG9ydCB7XG4gICRERVZDT01QLFxuICAkUFJPWFksXG4gICRUUkFDSyxcbiAgREVWLFxuICBFcnJvckJvdW5kYXJ5LFxuICBGb3IsXG4gIEluZGV4LFxuICBNYXRjaCxcbiAgU2hvdyxcbiAgU3VzcGVuc2UsXG4gIFN1c3BlbnNlTGlzdCxcbiAgU3dpdGNoLFxuICBiYXRjaCxcbiAgY2FuY2VsQ2FsbGJhY2ssXG4gIGNhdGNoRXJyb3IsXG4gIGNoaWxkcmVuLFxuICBjcmVhdGVDb21wb25lbnQsXG4gIGNyZWF0ZUNvbXB1dGVkLFxuICBjcmVhdGVDb250ZXh0LFxuICBjcmVhdGVEZWZlcnJlZCxcbiAgY3JlYXRlRWZmZWN0LFxuICBjcmVhdGVNZW1vLFxuICBjcmVhdGVSZWFjdGlvbixcbiAgY3JlYXRlUmVuZGVyRWZmZWN0LFxuICBjcmVhdGVSZXNvdXJjZSxcbiAgY3JlYXRlUm9vdCxcbiAgY3JlYXRlU2VsZWN0b3IsXG4gIGNyZWF0ZVNpZ25hbCxcbiAgY3JlYXRlVW5pcXVlSWQsXG4gIGVuYWJsZUV4dGVybmFsU291cmNlLFxuICBlbmFibGVIeWRyYXRpb24sXG4gIGVuYWJsZVNjaGVkdWxpbmcsXG4gIGVxdWFsRm4sXG4gIGZyb20sXG4gIGdldExpc3RlbmVyLFxuICBnZXRPd25lcixcbiAgaW5kZXhBcnJheSxcbiAgbGF6eSxcbiAgbWFwQXJyYXksXG4gIG1lcmdlUHJvcHMsXG4gIG9ic2VydmFibGUsXG4gIG9uLFxuICBvbkNsZWFudXAsXG4gIG9uRXJyb3IsXG4gIG9uTW91bnQsXG4gIHJlcXVlc3RDYWxsYmFjayxcbiAgcmVzZXRFcnJvckJvdW5kYXJpZXMsXG4gIHJ1bldpdGhPd25lcixcbiAgc2hhcmVkQ29uZmlnLFxuICBzcGxpdFByb3BzLFxuICBzdGFydFRyYW5zaXRpb24sXG4gIHVudHJhY2ssXG4gIHVzZUNvbnRleHQsXG4gIHVzZVRyYW5zaXRpb25cbn07XG4iLCJpbXBvcnQge1xuICBjcmVhdGVSb290LFxuICBzaGFyZWRDb25maWcsXG4gIGNyZWF0ZVJlbmRlckVmZmVjdCxcbiAgdW50cmFjayxcbiAgZW5hYmxlSHlkcmF0aW9uLFxuICBnZXRPd25lcixcbiAgY3JlYXRlRWZmZWN0LFxuICBydW5XaXRoT3duZXIsXG4gIGNyZWF0ZU1lbW8sXG4gIGNyZWF0ZVNpZ25hbCxcbiAgb25DbGVhbnVwLFxuICBzcGxpdFByb3BzXG59IGZyb20gXCJzb2xpZC1qc1wiO1xuZXhwb3J0IHtcbiAgRXJyb3JCb3VuZGFyeSxcbiAgRm9yLFxuICBJbmRleCxcbiAgTWF0Y2gsXG4gIFNob3csXG4gIFN1c3BlbnNlLFxuICBTdXNwZW5zZUxpc3QsXG4gIFN3aXRjaCxcbiAgY3JlYXRlQ29tcG9uZW50LFxuICBjcmVhdGVSZW5kZXJFZmZlY3QgYXMgZWZmZWN0LFxuICBnZXRPd25lcixcbiAgY3JlYXRlTWVtbyBhcyBtZW1vLFxuICBtZXJnZVByb3BzLFxuICB1bnRyYWNrXG59IGZyb20gXCJzb2xpZC1qc1wiO1xuXG5jb25zdCBib29sZWFucyA9IFtcbiAgXCJhbGxvd2Z1bGxzY3JlZW5cIixcbiAgXCJhc3luY1wiLFxuICBcImF1dG9mb2N1c1wiLFxuICBcImF1dG9wbGF5XCIsXG4gIFwiY2hlY2tlZFwiLFxuICBcImNvbnRyb2xzXCIsXG4gIFwiZGVmYXVsdFwiLFxuICBcImRpc2FibGVkXCIsXG4gIFwiZm9ybW5vdmFsaWRhdGVcIixcbiAgXCJoaWRkZW5cIixcbiAgXCJpbmRldGVybWluYXRlXCIsXG4gIFwiaW5lcnRcIixcbiAgXCJpc21hcFwiLFxuICBcImxvb3BcIixcbiAgXCJtdWx0aXBsZVwiLFxuICBcIm11dGVkXCIsXG4gIFwibm9tb2R1bGVcIixcbiAgXCJub3ZhbGlkYXRlXCIsXG4gIFwib3BlblwiLFxuICBcInBsYXlzaW5saW5lXCIsXG4gIFwicmVhZG9ubHlcIixcbiAgXCJyZXF1aXJlZFwiLFxuICBcInJldmVyc2VkXCIsXG4gIFwic2VhbWxlc3NcIixcbiAgXCJzZWxlY3RlZFwiXG5dO1xuY29uc3QgUHJvcGVydGllcyA9IC8qI19fUFVSRV9fKi8gbmV3IFNldChbXG4gIFwiY2xhc3NOYW1lXCIsXG4gIFwidmFsdWVcIixcbiAgXCJyZWFkT25seVwiLFxuICBcImZvcm1Ob1ZhbGlkYXRlXCIsXG4gIFwiaXNNYXBcIixcbiAgXCJub01vZHVsZVwiLFxuICBcInBsYXlzSW5saW5lXCIsXG4gIC4uLmJvb2xlYW5zXG5dKTtcbmNvbnN0IENoaWxkUHJvcGVydGllcyA9IC8qI19fUFVSRV9fKi8gbmV3IFNldChbXG4gIFwiaW5uZXJIVE1MXCIsXG4gIFwidGV4dENvbnRlbnRcIixcbiAgXCJpbm5lclRleHRcIixcbiAgXCJjaGlsZHJlblwiXG5dKTtcbmNvbnN0IEFsaWFzZXMgPSAvKiNfX1BVUkVfXyovIE9iamVjdC5hc3NpZ24oT2JqZWN0LmNyZWF0ZShudWxsKSwge1xuICBjbGFzc05hbWU6IFwiY2xhc3NcIixcbiAgaHRtbEZvcjogXCJmb3JcIlxufSk7XG5jb25zdCBQcm9wQWxpYXNlcyA9IC8qI19fUFVSRV9fKi8gT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKG51bGwpLCB7XG4gIGNsYXNzOiBcImNsYXNzTmFtZVwiLFxuICBmb3Jtbm92YWxpZGF0ZToge1xuICAgICQ6IFwiZm9ybU5vVmFsaWRhdGVcIixcbiAgICBCVVRUT046IDEsXG4gICAgSU5QVVQ6IDFcbiAgfSxcbiAgaXNtYXA6IHtcbiAgICAkOiBcImlzTWFwXCIsXG4gICAgSU1HOiAxXG4gIH0sXG4gIG5vbW9kdWxlOiB7XG4gICAgJDogXCJub01vZHVsZVwiLFxuICAgIFNDUklQVDogMVxuICB9LFxuICBwbGF5c2lubGluZToge1xuICAgICQ6IFwicGxheXNJbmxpbmVcIixcbiAgICBWSURFTzogMVxuICB9LFxuICByZWFkb25seToge1xuICAgICQ6IFwicmVhZE9ubHlcIixcbiAgICBJTlBVVDogMSxcbiAgICBURVhUQVJFQTogMVxuICB9XG59KTtcbmZ1bmN0aW9uIGdldFByb3BBbGlhcyhwcm9wLCB0YWdOYW1lKSB7XG4gIGNvbnN0IGEgPSBQcm9wQWxpYXNlc1twcm9wXTtcbiAgcmV0dXJuIHR5cGVvZiBhID09PSBcIm9iamVjdFwiID8gKGFbdGFnTmFtZV0gPyBhW1wiJFwiXSA6IHVuZGVmaW5lZCkgOiBhO1xufVxuY29uc3QgRGVsZWdhdGVkRXZlbnRzID0gLyojX19QVVJFX18qLyBuZXcgU2V0KFtcbiAgXCJiZWZvcmVpbnB1dFwiLFxuICBcImNsaWNrXCIsXG4gIFwiZGJsY2xpY2tcIixcbiAgXCJjb250ZXh0bWVudVwiLFxuICBcImZvY3VzaW5cIixcbiAgXCJmb2N1c291dFwiLFxuICBcImlucHV0XCIsXG4gIFwia2V5ZG93blwiLFxuICBcImtleXVwXCIsXG4gIFwibW91c2Vkb3duXCIsXG4gIFwibW91c2Vtb3ZlXCIsXG4gIFwibW91c2VvdXRcIixcbiAgXCJtb3VzZW92ZXJcIixcbiAgXCJtb3VzZXVwXCIsXG4gIFwicG9pbnRlcmRvd25cIixcbiAgXCJwb2ludGVybW92ZVwiLFxuICBcInBvaW50ZXJvdXRcIixcbiAgXCJwb2ludGVyb3ZlclwiLFxuICBcInBvaW50ZXJ1cFwiLFxuICBcInRvdWNoZW5kXCIsXG4gIFwidG91Y2htb3ZlXCIsXG4gIFwidG91Y2hzdGFydFwiXG5dKTtcbmNvbnN0IFNWR0VsZW1lbnRzID0gLyojX19QVVJFX18qLyBuZXcgU2V0KFtcbiAgXCJhbHRHbHlwaFwiLFxuICBcImFsdEdseXBoRGVmXCIsXG4gIFwiYWx0R2x5cGhJdGVtXCIsXG4gIFwiYW5pbWF0ZVwiLFxuICBcImFuaW1hdGVDb2xvclwiLFxuICBcImFuaW1hdGVNb3Rpb25cIixcbiAgXCJhbmltYXRlVHJhbnNmb3JtXCIsXG4gIFwiY2lyY2xlXCIsXG4gIFwiY2xpcFBhdGhcIixcbiAgXCJjb2xvci1wcm9maWxlXCIsXG4gIFwiY3Vyc29yXCIsXG4gIFwiZGVmc1wiLFxuICBcImRlc2NcIixcbiAgXCJlbGxpcHNlXCIsXG4gIFwiZmVCbGVuZFwiLFxuICBcImZlQ29sb3JNYXRyaXhcIixcbiAgXCJmZUNvbXBvbmVudFRyYW5zZmVyXCIsXG4gIFwiZmVDb21wb3NpdGVcIixcbiAgXCJmZUNvbnZvbHZlTWF0cml4XCIsXG4gIFwiZmVEaWZmdXNlTGlnaHRpbmdcIixcbiAgXCJmZURpc3BsYWNlbWVudE1hcFwiLFxuICBcImZlRGlzdGFudExpZ2h0XCIsXG4gIFwiZmVEcm9wU2hhZG93XCIsXG4gIFwiZmVGbG9vZFwiLFxuICBcImZlRnVuY0FcIixcbiAgXCJmZUZ1bmNCXCIsXG4gIFwiZmVGdW5jR1wiLFxuICBcImZlRnVuY1JcIixcbiAgXCJmZUdhdXNzaWFuQmx1clwiLFxuICBcImZlSW1hZ2VcIixcbiAgXCJmZU1lcmdlXCIsXG4gIFwiZmVNZXJnZU5vZGVcIixcbiAgXCJmZU1vcnBob2xvZ3lcIixcbiAgXCJmZU9mZnNldFwiLFxuICBcImZlUG9pbnRMaWdodFwiLFxuICBcImZlU3BlY3VsYXJMaWdodGluZ1wiLFxuICBcImZlU3BvdExpZ2h0XCIsXG4gIFwiZmVUaWxlXCIsXG4gIFwiZmVUdXJidWxlbmNlXCIsXG4gIFwiZmlsdGVyXCIsXG4gIFwiZm9udFwiLFxuICBcImZvbnQtZmFjZVwiLFxuICBcImZvbnQtZmFjZS1mb3JtYXRcIixcbiAgXCJmb250LWZhY2UtbmFtZVwiLFxuICBcImZvbnQtZmFjZS1zcmNcIixcbiAgXCJmb250LWZhY2UtdXJpXCIsXG4gIFwiZm9yZWlnbk9iamVjdFwiLFxuICBcImdcIixcbiAgXCJnbHlwaFwiLFxuICBcImdseXBoUmVmXCIsXG4gIFwiaGtlcm5cIixcbiAgXCJpbWFnZVwiLFxuICBcImxpbmVcIixcbiAgXCJsaW5lYXJHcmFkaWVudFwiLFxuICBcIm1hcmtlclwiLFxuICBcIm1hc2tcIixcbiAgXCJtZXRhZGF0YVwiLFxuICBcIm1pc3NpbmctZ2x5cGhcIixcbiAgXCJtcGF0aFwiLFxuICBcInBhdGhcIixcbiAgXCJwYXR0ZXJuXCIsXG4gIFwicG9seWdvblwiLFxuICBcInBvbHlsaW5lXCIsXG4gIFwicmFkaWFsR3JhZGllbnRcIixcbiAgXCJyZWN0XCIsXG4gIFwic2V0XCIsXG4gIFwic3RvcFwiLFxuICBcInN2Z1wiLFxuICBcInN3aXRjaFwiLFxuICBcInN5bWJvbFwiLFxuICBcInRleHRcIixcbiAgXCJ0ZXh0UGF0aFwiLFxuICBcInRyZWZcIixcbiAgXCJ0c3BhblwiLFxuICBcInVzZVwiLFxuICBcInZpZXdcIixcbiAgXCJ2a2VyblwiXG5dKTtcbmNvbnN0IFNWR05hbWVzcGFjZSA9IHtcbiAgeGxpbms6IFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGlua1wiLFxuICB4bWw6IFwiaHR0cDovL3d3dy53My5vcmcvWE1MLzE5OTgvbmFtZXNwYWNlXCJcbn07XG5jb25zdCBET01FbGVtZW50cyA9IC8qI19fUFVSRV9fKi8gbmV3IFNldChbXG4gIFwiaHRtbFwiLFxuICBcImJhc2VcIixcbiAgXCJoZWFkXCIsXG4gIFwibGlua1wiLFxuICBcIm1ldGFcIixcbiAgXCJzdHlsZVwiLFxuICBcInRpdGxlXCIsXG4gIFwiYm9keVwiLFxuICBcImFkZHJlc3NcIixcbiAgXCJhcnRpY2xlXCIsXG4gIFwiYXNpZGVcIixcbiAgXCJmb290ZXJcIixcbiAgXCJoZWFkZXJcIixcbiAgXCJtYWluXCIsXG4gIFwibmF2XCIsXG4gIFwic2VjdGlvblwiLFxuICBcImJvZHlcIixcbiAgXCJibG9ja3F1b3RlXCIsXG4gIFwiZGRcIixcbiAgXCJkaXZcIixcbiAgXCJkbFwiLFxuICBcImR0XCIsXG4gIFwiZmlnY2FwdGlvblwiLFxuICBcImZpZ3VyZVwiLFxuICBcImhyXCIsXG4gIFwibGlcIixcbiAgXCJvbFwiLFxuICBcInBcIixcbiAgXCJwcmVcIixcbiAgXCJ1bFwiLFxuICBcImFcIixcbiAgXCJhYmJyXCIsXG4gIFwiYlwiLFxuICBcImJkaVwiLFxuICBcImJkb1wiLFxuICBcImJyXCIsXG4gIFwiY2l0ZVwiLFxuICBcImNvZGVcIixcbiAgXCJkYXRhXCIsXG4gIFwiZGZuXCIsXG4gIFwiZW1cIixcbiAgXCJpXCIsXG4gIFwia2JkXCIsXG4gIFwibWFya1wiLFxuICBcInFcIixcbiAgXCJycFwiLFxuICBcInJ0XCIsXG4gIFwicnVieVwiLFxuICBcInNcIixcbiAgXCJzYW1wXCIsXG4gIFwic21hbGxcIixcbiAgXCJzcGFuXCIsXG4gIFwic3Ryb25nXCIsXG4gIFwic3ViXCIsXG4gIFwic3VwXCIsXG4gIFwidGltZVwiLFxuICBcInVcIixcbiAgXCJ2YXJcIixcbiAgXCJ3YnJcIixcbiAgXCJhcmVhXCIsXG4gIFwiYXVkaW9cIixcbiAgXCJpbWdcIixcbiAgXCJtYXBcIixcbiAgXCJ0cmFja1wiLFxuICBcInZpZGVvXCIsXG4gIFwiZW1iZWRcIixcbiAgXCJpZnJhbWVcIixcbiAgXCJvYmplY3RcIixcbiAgXCJwYXJhbVwiLFxuICBcInBpY3R1cmVcIixcbiAgXCJwb3J0YWxcIixcbiAgXCJzb3VyY2VcIixcbiAgXCJzdmdcIixcbiAgXCJtYXRoXCIsXG4gIFwiY2FudmFzXCIsXG4gIFwibm9zY3JpcHRcIixcbiAgXCJzY3JpcHRcIixcbiAgXCJkZWxcIixcbiAgXCJpbnNcIixcbiAgXCJjYXB0aW9uXCIsXG4gIFwiY29sXCIsXG4gIFwiY29sZ3JvdXBcIixcbiAgXCJ0YWJsZVwiLFxuICBcInRib2R5XCIsXG4gIFwidGRcIixcbiAgXCJ0Zm9vdFwiLFxuICBcInRoXCIsXG4gIFwidGhlYWRcIixcbiAgXCJ0clwiLFxuICBcImJ1dHRvblwiLFxuICBcImRhdGFsaXN0XCIsXG4gIFwiZmllbGRzZXRcIixcbiAgXCJmb3JtXCIsXG4gIFwiaW5wdXRcIixcbiAgXCJsYWJlbFwiLFxuICBcImxlZ2VuZFwiLFxuICBcIm1ldGVyXCIsXG4gIFwib3B0Z3JvdXBcIixcbiAgXCJvcHRpb25cIixcbiAgXCJvdXRwdXRcIixcbiAgXCJwcm9ncmVzc1wiLFxuICBcInNlbGVjdFwiLFxuICBcInRleHRhcmVhXCIsXG4gIFwiZGV0YWlsc1wiLFxuICBcImRpYWxvZ1wiLFxuICBcIm1lbnVcIixcbiAgXCJzdW1tYXJ5XCIsXG4gIFwiZGV0YWlsc1wiLFxuICBcInNsb3RcIixcbiAgXCJ0ZW1wbGF0ZVwiLFxuICBcImFjcm9ueW1cIixcbiAgXCJhcHBsZXRcIixcbiAgXCJiYXNlZm9udFwiLFxuICBcImJnc291bmRcIixcbiAgXCJiaWdcIixcbiAgXCJibGlua1wiLFxuICBcImNlbnRlclwiLFxuICBcImNvbnRlbnRcIixcbiAgXCJkaXJcIixcbiAgXCJmb250XCIsXG4gIFwiZnJhbWVcIixcbiAgXCJmcmFtZXNldFwiLFxuICBcImhncm91cFwiLFxuICBcImltYWdlXCIsXG4gIFwia2V5Z2VuXCIsXG4gIFwibWFycXVlZVwiLFxuICBcIm1lbnVpdGVtXCIsXG4gIFwibm9iclwiLFxuICBcIm5vZW1iZWRcIixcbiAgXCJub2ZyYW1lc1wiLFxuICBcInBsYWludGV4dFwiLFxuICBcInJiXCIsXG4gIFwicnRjXCIsXG4gIFwic2hhZG93XCIsXG4gIFwic3BhY2VyXCIsXG4gIFwic3RyaWtlXCIsXG4gIFwidHRcIixcbiAgXCJ4bXBcIixcbiAgXCJhXCIsXG4gIFwiYWJiclwiLFxuICBcImFjcm9ueW1cIixcbiAgXCJhZGRyZXNzXCIsXG4gIFwiYXBwbGV0XCIsXG4gIFwiYXJlYVwiLFxuICBcImFydGljbGVcIixcbiAgXCJhc2lkZVwiLFxuICBcImF1ZGlvXCIsXG4gIFwiYlwiLFxuICBcImJhc2VcIixcbiAgXCJiYXNlZm9udFwiLFxuICBcImJkaVwiLFxuICBcImJkb1wiLFxuICBcImJnc291bmRcIixcbiAgXCJiaWdcIixcbiAgXCJibGlua1wiLFxuICBcImJsb2NrcXVvdGVcIixcbiAgXCJib2R5XCIsXG4gIFwiYnJcIixcbiAgXCJidXR0b25cIixcbiAgXCJjYW52YXNcIixcbiAgXCJjYXB0aW9uXCIsXG4gIFwiY2VudGVyXCIsXG4gIFwiY2l0ZVwiLFxuICBcImNvZGVcIixcbiAgXCJjb2xcIixcbiAgXCJjb2xncm91cFwiLFxuICBcImNvbnRlbnRcIixcbiAgXCJkYXRhXCIsXG4gIFwiZGF0YWxpc3RcIixcbiAgXCJkZFwiLFxuICBcImRlbFwiLFxuICBcImRldGFpbHNcIixcbiAgXCJkZm5cIixcbiAgXCJkaWFsb2dcIixcbiAgXCJkaXJcIixcbiAgXCJkaXZcIixcbiAgXCJkbFwiLFxuICBcImR0XCIsXG4gIFwiZW1cIixcbiAgXCJlbWJlZFwiLFxuICBcImZpZWxkc2V0XCIsXG4gIFwiZmlnY2FwdGlvblwiLFxuICBcImZpZ3VyZVwiLFxuICBcImZvbnRcIixcbiAgXCJmb290ZXJcIixcbiAgXCJmb3JtXCIsXG4gIFwiZnJhbWVcIixcbiAgXCJmcmFtZXNldFwiLFxuICBcImhlYWRcIixcbiAgXCJoZWFkZXJcIixcbiAgXCJoZ3JvdXBcIixcbiAgXCJoclwiLFxuICBcImh0bWxcIixcbiAgXCJpXCIsXG4gIFwiaWZyYW1lXCIsXG4gIFwiaW1hZ2VcIixcbiAgXCJpbWdcIixcbiAgXCJpbnB1dFwiLFxuICBcImluc1wiLFxuICBcImtiZFwiLFxuICBcImtleWdlblwiLFxuICBcImxhYmVsXCIsXG4gIFwibGVnZW5kXCIsXG4gIFwibGlcIixcbiAgXCJsaW5rXCIsXG4gIFwibWFpblwiLFxuICBcIm1hcFwiLFxuICBcIm1hcmtcIixcbiAgXCJtYXJxdWVlXCIsXG4gIFwibWVudVwiLFxuICBcIm1lbnVpdGVtXCIsXG4gIFwibWV0YVwiLFxuICBcIm1ldGVyXCIsXG4gIFwibmF2XCIsXG4gIFwibm9iclwiLFxuICBcIm5vZW1iZWRcIixcbiAgXCJub2ZyYW1lc1wiLFxuICBcIm5vc2NyaXB0XCIsXG4gIFwib2JqZWN0XCIsXG4gIFwib2xcIixcbiAgXCJvcHRncm91cFwiLFxuICBcIm9wdGlvblwiLFxuICBcIm91dHB1dFwiLFxuICBcInBcIixcbiAgXCJwYXJhbVwiLFxuICBcInBpY3R1cmVcIixcbiAgXCJwbGFpbnRleHRcIixcbiAgXCJwb3J0YWxcIixcbiAgXCJwcmVcIixcbiAgXCJwcm9ncmVzc1wiLFxuICBcInFcIixcbiAgXCJyYlwiLFxuICBcInJwXCIsXG4gIFwicnRcIixcbiAgXCJydGNcIixcbiAgXCJydWJ5XCIsXG4gIFwic1wiLFxuICBcInNhbXBcIixcbiAgXCJzY3JpcHRcIixcbiAgXCJzZWN0aW9uXCIsXG4gIFwic2VsZWN0XCIsXG4gIFwic2hhZG93XCIsXG4gIFwic2xvdFwiLFxuICBcInNtYWxsXCIsXG4gIFwic291cmNlXCIsXG4gIFwic3BhY2VyXCIsXG4gIFwic3BhblwiLFxuICBcInN0cmlrZVwiLFxuICBcInN0cm9uZ1wiLFxuICBcInN0eWxlXCIsXG4gIFwic3ViXCIsXG4gIFwic3VtbWFyeVwiLFxuICBcInN1cFwiLFxuICBcInRhYmxlXCIsXG4gIFwidGJvZHlcIixcbiAgXCJ0ZFwiLFxuICBcInRlbXBsYXRlXCIsXG4gIFwidGV4dGFyZWFcIixcbiAgXCJ0Zm9vdFwiLFxuICBcInRoXCIsXG4gIFwidGhlYWRcIixcbiAgXCJ0aW1lXCIsXG4gIFwidGl0bGVcIixcbiAgXCJ0clwiLFxuICBcInRyYWNrXCIsXG4gIFwidHRcIixcbiAgXCJ1XCIsXG4gIFwidWxcIixcbiAgXCJ2YXJcIixcbiAgXCJ2aWRlb1wiLFxuICBcIndiclwiLFxuICBcInhtcFwiLFxuICBcImlucHV0XCIsXG4gIFwiaDFcIixcbiAgXCJoMlwiLFxuICBcImgzXCIsXG4gIFwiaDRcIixcbiAgXCJoNVwiLFxuICBcImg2XCJcbl0pO1xuXG5mdW5jdGlvbiByZWNvbmNpbGVBcnJheXMocGFyZW50Tm9kZSwgYSwgYikge1xuICBsZXQgYkxlbmd0aCA9IGIubGVuZ3RoLFxuICAgIGFFbmQgPSBhLmxlbmd0aCxcbiAgICBiRW5kID0gYkxlbmd0aCxcbiAgICBhU3RhcnQgPSAwLFxuICAgIGJTdGFydCA9IDAsXG4gICAgYWZ0ZXIgPSBhW2FFbmQgLSAxXS5uZXh0U2libGluZyxcbiAgICBtYXAgPSBudWxsO1xuICB3aGlsZSAoYVN0YXJ0IDwgYUVuZCB8fCBiU3RhcnQgPCBiRW5kKSB7XG4gICAgaWYgKGFbYVN0YXJ0XSA9PT0gYltiU3RhcnRdKSB7XG4gICAgICBhU3RhcnQrKztcbiAgICAgIGJTdGFydCsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHdoaWxlIChhW2FFbmQgLSAxXSA9PT0gYltiRW5kIC0gMV0pIHtcbiAgICAgIGFFbmQtLTtcbiAgICAgIGJFbmQtLTtcbiAgICB9XG4gICAgaWYgKGFFbmQgPT09IGFTdGFydCkge1xuICAgICAgY29uc3Qgbm9kZSA9IGJFbmQgPCBiTGVuZ3RoID8gKGJTdGFydCA/IGJbYlN0YXJ0IC0gMV0ubmV4dFNpYmxpbmcgOiBiW2JFbmQgLSBiU3RhcnRdKSA6IGFmdGVyO1xuICAgICAgd2hpbGUgKGJTdGFydCA8IGJFbmQpIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGJbYlN0YXJ0KytdLCBub2RlKTtcbiAgICB9IGVsc2UgaWYgKGJFbmQgPT09IGJTdGFydCkge1xuICAgICAgd2hpbGUgKGFTdGFydCA8IGFFbmQpIHtcbiAgICAgICAgaWYgKCFtYXAgfHwgIW1hcC5oYXMoYVthU3RhcnRdKSkgYVthU3RhcnRdLnJlbW92ZSgpO1xuICAgICAgICBhU3RhcnQrKztcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGFbYVN0YXJ0XSA9PT0gYltiRW5kIC0gMV0gJiYgYltiU3RhcnRdID09PSBhW2FFbmQgLSAxXSkge1xuICAgICAgY29uc3Qgbm9kZSA9IGFbLS1hRW5kXS5uZXh0U2libGluZztcbiAgICAgIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGJbYlN0YXJ0KytdLCBhW2FTdGFydCsrXS5uZXh0U2libGluZyk7XG4gICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZShiWy0tYkVuZF0sIG5vZGUpO1xuICAgICAgYVthRW5kXSA9IGJbYkVuZF07XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghbWFwKSB7XG4gICAgICAgIG1hcCA9IG5ldyBNYXAoKTtcbiAgICAgICAgbGV0IGkgPSBiU3RhcnQ7XG4gICAgICAgIHdoaWxlIChpIDwgYkVuZCkgbWFwLnNldChiW2ldLCBpKyspO1xuICAgICAgfVxuICAgICAgY29uc3QgaW5kZXggPSBtYXAuZ2V0KGFbYVN0YXJ0XSk7XG4gICAgICBpZiAoaW5kZXggIT0gbnVsbCkge1xuICAgICAgICBpZiAoYlN0YXJ0IDwgaW5kZXggJiYgaW5kZXggPCBiRW5kKSB7XG4gICAgICAgICAgbGV0IGkgPSBhU3RhcnQsXG4gICAgICAgICAgICBzZXF1ZW5jZSA9IDEsXG4gICAgICAgICAgICB0O1xuICAgICAgICAgIHdoaWxlICgrK2kgPCBhRW5kICYmIGkgPCBiRW5kKSB7XG4gICAgICAgICAgICBpZiAoKHQgPSBtYXAuZ2V0KGFbaV0pKSA9PSBudWxsIHx8IHQgIT09IGluZGV4ICsgc2VxdWVuY2UpIGJyZWFrO1xuICAgICAgICAgICAgc2VxdWVuY2UrKztcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNlcXVlbmNlID4gaW5kZXggLSBiU3RhcnQpIHtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBhW2FTdGFydF07XG4gICAgICAgICAgICB3aGlsZSAoYlN0YXJ0IDwgaW5kZXgpIHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGJbYlN0YXJ0KytdLCBub2RlKTtcbiAgICAgICAgICB9IGVsc2UgcGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoYltiU3RhcnQrK10sIGFbYVN0YXJ0KytdKTtcbiAgICAgICAgfSBlbHNlIGFTdGFydCsrO1xuICAgICAgfSBlbHNlIGFbYVN0YXJ0KytdLnJlbW92ZSgpO1xuICAgIH1cbiAgfVxufVxuXG5jb25zdCAkJEVWRU5UUyA9IFwiXyREWF9ERUxFR0FURVwiO1xuZnVuY3Rpb24gcmVuZGVyKGNvZGUsIGVsZW1lbnQsIGluaXQsIG9wdGlvbnMgPSB7fSkge1xuICBsZXQgZGlzcG9zZXI7XG4gIGNyZWF0ZVJvb3QoZGlzcG9zZSA9PiB7XG4gICAgZGlzcG9zZXIgPSBkaXNwb3NlO1xuICAgIGVsZW1lbnQgPT09IGRvY3VtZW50XG4gICAgICA/IGNvZGUoKVxuICAgICAgOiBpbnNlcnQoZWxlbWVudCwgY29kZSgpLCBlbGVtZW50LmZpcnN0Q2hpbGQgPyBudWxsIDogdW5kZWZpbmVkLCBpbml0KTtcbiAgfSwgb3B0aW9ucy5vd25lcik7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgZGlzcG9zZXIoKTtcbiAgICBlbGVtZW50LnRleHRDb250ZW50ID0gXCJcIjtcbiAgfTtcbn1cbmZ1bmN0aW9uIHRlbXBsYXRlKGh0bWwsIGlzQ0UsIGlzU1ZHKSB7XG4gIGxldCBub2RlO1xuICBjb25zdCBjcmVhdGUgPSAoKSA9PiB7XG4gICAgY29uc3QgdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0ZW1wbGF0ZVwiKTtcbiAgICB0LmlubmVySFRNTCA9IGh0bWw7XG4gICAgcmV0dXJuIGlzU1ZHID8gdC5jb250ZW50LmZpcnN0Q2hpbGQuZmlyc3RDaGlsZCA6IHQuY29udGVudC5maXJzdENoaWxkO1xuICB9O1xuICBjb25zdCBmbiA9IGlzQ0VcbiAgICA/ICgpID0+IHVudHJhY2soKCkgPT4gZG9jdW1lbnQuaW1wb3J0Tm9kZShub2RlIHx8IChub2RlID0gY3JlYXRlKCkpLCB0cnVlKSlcbiAgICA6ICgpID0+IChub2RlIHx8IChub2RlID0gY3JlYXRlKCkpKS5jbG9uZU5vZGUodHJ1ZSk7XG4gIGZuLmNsb25lTm9kZSA9IGZuO1xuICByZXR1cm4gZm47XG59XG5mdW5jdGlvbiBkZWxlZ2F0ZUV2ZW50cyhldmVudE5hbWVzLCBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudCkge1xuICBjb25zdCBlID0gZG9jdW1lbnRbJCRFVkVOVFNdIHx8IChkb2N1bWVudFskJEVWRU5UU10gPSBuZXcgU2V0KCkpO1xuICBmb3IgKGxldCBpID0gMCwgbCA9IGV2ZW50TmFtZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgY29uc3QgbmFtZSA9IGV2ZW50TmFtZXNbaV07XG4gICAgaWYgKCFlLmhhcyhuYW1lKSkge1xuICAgICAgZS5hZGQobmFtZSk7XG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKG5hbWUsIGV2ZW50SGFuZGxlcik7XG4gICAgfVxuICB9XG59XG5mdW5jdGlvbiBjbGVhckRlbGVnYXRlZEV2ZW50cyhkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudCkge1xuICBpZiAoZG9jdW1lbnRbJCRFVkVOVFNdKSB7XG4gICAgZm9yIChsZXQgbmFtZSBvZiBkb2N1bWVudFskJEVWRU5UU10ua2V5cygpKSBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKG5hbWUsIGV2ZW50SGFuZGxlcik7XG4gICAgZGVsZXRlIGRvY3VtZW50WyQkRVZFTlRTXTtcbiAgfVxufVxuZnVuY3Rpb24gc2V0UHJvcGVydHkobm9kZSwgbmFtZSwgdmFsdWUpIHtcbiAgaWYgKCEhc2hhcmVkQ29uZmlnLmNvbnRleHQgJiYgbm9kZS5pc0Nvbm5lY3RlZCkgcmV0dXJuO1xuICBub2RlW25hbWVdID0gdmFsdWU7XG59XG5mdW5jdGlvbiBzZXRBdHRyaWJ1dGUobm9kZSwgbmFtZSwgdmFsdWUpIHtcbiAgaWYgKCEhc2hhcmVkQ29uZmlnLmNvbnRleHQgJiYgbm9kZS5pc0Nvbm5lY3RlZCkgcmV0dXJuO1xuICBpZiAodmFsdWUgPT0gbnVsbCkgbm9kZS5yZW1vdmVBdHRyaWJ1dGUobmFtZSk7XG4gIGVsc2Ugbm9kZS5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpO1xufVxuZnVuY3Rpb24gc2V0QXR0cmlidXRlTlMobm9kZSwgbmFtZXNwYWNlLCBuYW1lLCB2YWx1ZSkge1xuICBpZiAoISFzaGFyZWRDb25maWcuY29udGV4dCAmJiBub2RlLmlzQ29ubmVjdGVkKSByZXR1cm47XG4gIGlmICh2YWx1ZSA9PSBudWxsKSBub2RlLnJlbW92ZUF0dHJpYnV0ZU5TKG5hbWVzcGFjZSwgbmFtZSk7XG4gIGVsc2Ugbm9kZS5zZXRBdHRyaWJ1dGVOUyhuYW1lc3BhY2UsIG5hbWUsIHZhbHVlKTtcbn1cbmZ1bmN0aW9uIGNsYXNzTmFtZShub2RlLCB2YWx1ZSkge1xuICBpZiAoISFzaGFyZWRDb25maWcuY29udGV4dCAmJiBub2RlLmlzQ29ubmVjdGVkKSByZXR1cm47XG4gIGlmICh2YWx1ZSA9PSBudWxsKSBub2RlLnJlbW92ZUF0dHJpYnV0ZShcImNsYXNzXCIpO1xuICBlbHNlIG5vZGUuY2xhc3NOYW1lID0gdmFsdWU7XG59XG5mdW5jdGlvbiBhZGRFdmVudExpc3RlbmVyKG5vZGUsIG5hbWUsIGhhbmRsZXIsIGRlbGVnYXRlKSB7XG4gIGlmIChkZWxlZ2F0ZSkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGhhbmRsZXIpKSB7XG4gICAgICBub2RlW2AkJCR7bmFtZX1gXSA9IGhhbmRsZXJbMF07XG4gICAgICBub2RlW2AkJCR7bmFtZX1EYXRhYF0gPSBoYW5kbGVyWzFdO1xuICAgIH0gZWxzZSBub2RlW2AkJCR7bmFtZX1gXSA9IGhhbmRsZXI7XG4gIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShoYW5kbGVyKSkge1xuICAgIGNvbnN0IGhhbmRsZXJGbiA9IGhhbmRsZXJbMF07XG4gICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKG5hbWUsIChoYW5kbGVyWzBdID0gZSA9PiBoYW5kbGVyRm4uY2FsbChub2RlLCBoYW5kbGVyWzFdLCBlKSkpO1xuICB9IGVsc2Ugbm9kZS5hZGRFdmVudExpc3RlbmVyKG5hbWUsIGhhbmRsZXIpO1xufVxuZnVuY3Rpb24gY2xhc3NMaXN0KG5vZGUsIHZhbHVlLCBwcmV2ID0ge30pIHtcbiAgY29uc3QgY2xhc3NLZXlzID0gT2JqZWN0LmtleXModmFsdWUgfHwge30pLFxuICAgIHByZXZLZXlzID0gT2JqZWN0LmtleXMocHJldik7XG4gIGxldCBpLCBsZW47XG4gIGZvciAoaSA9IDAsIGxlbiA9IHByZXZLZXlzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgY29uc3Qga2V5ID0gcHJldktleXNbaV07XG4gICAgaWYgKCFrZXkgfHwga2V5ID09PSBcInVuZGVmaW5lZFwiIHx8IHZhbHVlW2tleV0pIGNvbnRpbnVlO1xuICAgIHRvZ2dsZUNsYXNzS2V5KG5vZGUsIGtleSwgZmFsc2UpO1xuICAgIGRlbGV0ZSBwcmV2W2tleV07XG4gIH1cbiAgZm9yIChpID0gMCwgbGVuID0gY2xhc3NLZXlzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgY29uc3Qga2V5ID0gY2xhc3NLZXlzW2ldLFxuICAgICAgY2xhc3NWYWx1ZSA9ICEhdmFsdWVba2V5XTtcbiAgICBpZiAoIWtleSB8fCBrZXkgPT09IFwidW5kZWZpbmVkXCIgfHwgcHJldltrZXldID09PSBjbGFzc1ZhbHVlIHx8ICFjbGFzc1ZhbHVlKSBjb250aW51ZTtcbiAgICB0b2dnbGVDbGFzc0tleShub2RlLCBrZXksIHRydWUpO1xuICAgIHByZXZba2V5XSA9IGNsYXNzVmFsdWU7XG4gIH1cbiAgcmV0dXJuIHByZXY7XG59XG5mdW5jdGlvbiBzdHlsZShub2RlLCB2YWx1ZSwgcHJldikge1xuICBpZiAoIXZhbHVlKSByZXR1cm4gcHJldiA/IHNldEF0dHJpYnV0ZShub2RlLCBcInN0eWxlXCIpIDogdmFsdWU7XG4gIGNvbnN0IG5vZGVTdHlsZSA9IG5vZGUuc3R5bGU7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpIHJldHVybiAobm9kZVN0eWxlLmNzc1RleHQgPSB2YWx1ZSk7XG4gIHR5cGVvZiBwcmV2ID09PSBcInN0cmluZ1wiICYmIChub2RlU3R5bGUuY3NzVGV4dCA9IHByZXYgPSB1bmRlZmluZWQpO1xuICBwcmV2IHx8IChwcmV2ID0ge30pO1xuICB2YWx1ZSB8fCAodmFsdWUgPSB7fSk7XG4gIGxldCB2LCBzO1xuICBmb3IgKHMgaW4gcHJldikge1xuICAgIHZhbHVlW3NdID09IG51bGwgJiYgbm9kZVN0eWxlLnJlbW92ZVByb3BlcnR5KHMpO1xuICAgIGRlbGV0ZSBwcmV2W3NdO1xuICB9XG4gIGZvciAocyBpbiB2YWx1ZSkge1xuICAgIHYgPSB2YWx1ZVtzXTtcbiAgICBpZiAodiAhPT0gcHJldltzXSkge1xuICAgICAgbm9kZVN0eWxlLnNldFByb3BlcnR5KHMsIHYpO1xuICAgICAgcHJldltzXSA9IHY7XG4gICAgfVxuICB9XG4gIHJldHVybiBwcmV2O1xufVxuZnVuY3Rpb24gc3ByZWFkKG5vZGUsIHByb3BzID0ge30sIGlzU1ZHLCBza2lwQ2hpbGRyZW4pIHtcbiAgY29uc3QgcHJldlByb3BzID0ge307XG4gIGlmICghc2tpcENoaWxkcmVuKSB7XG4gICAgY3JlYXRlUmVuZGVyRWZmZWN0KFxuICAgICAgKCkgPT4gKHByZXZQcm9wcy5jaGlsZHJlbiA9IGluc2VydEV4cHJlc3Npb24obm9kZSwgcHJvcHMuY2hpbGRyZW4sIHByZXZQcm9wcy5jaGlsZHJlbikpXG4gICAgKTtcbiAgfVxuICBjcmVhdGVSZW5kZXJFZmZlY3QoKCkgPT5cbiAgICB0eXBlb2YgcHJvcHMucmVmID09PSBcImZ1bmN0aW9uXCIgPyB1c2UocHJvcHMucmVmLCBub2RlKSA6IChwcm9wcy5yZWYgPSBub2RlKVxuICApO1xuICBjcmVhdGVSZW5kZXJFZmZlY3QoKCkgPT4gYXNzaWduKG5vZGUsIHByb3BzLCBpc1NWRywgdHJ1ZSwgcHJldlByb3BzLCB0cnVlKSk7XG4gIHJldHVybiBwcmV2UHJvcHM7XG59XG5mdW5jdGlvbiBkeW5hbWljUHJvcGVydHkocHJvcHMsIGtleSkge1xuICBjb25zdCBzcmMgPSBwcm9wc1trZXldO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkocHJvcHMsIGtleSwge1xuICAgIGdldCgpIHtcbiAgICAgIHJldHVybiBzcmMoKTtcbiAgICB9LFxuICAgIGVudW1lcmFibGU6IHRydWVcbiAgfSk7XG4gIHJldHVybiBwcm9wcztcbn1cbmZ1bmN0aW9uIHVzZShmbiwgZWxlbWVudCwgYXJnKSB7XG4gIHJldHVybiB1bnRyYWNrKCgpID0+IGZuKGVsZW1lbnQsIGFyZykpO1xufVxuZnVuY3Rpb24gaW5zZXJ0KHBhcmVudCwgYWNjZXNzb3IsIG1hcmtlciwgaW5pdGlhbCkge1xuICBpZiAobWFya2VyICE9PSB1bmRlZmluZWQgJiYgIWluaXRpYWwpIGluaXRpYWwgPSBbXTtcbiAgaWYgKHR5cGVvZiBhY2Nlc3NvciAhPT0gXCJmdW5jdGlvblwiKSByZXR1cm4gaW5zZXJ0RXhwcmVzc2lvbihwYXJlbnQsIGFjY2Vzc29yLCBpbml0aWFsLCBtYXJrZXIpO1xuICBjcmVhdGVSZW5kZXJFZmZlY3QoY3VycmVudCA9PiBpbnNlcnRFeHByZXNzaW9uKHBhcmVudCwgYWNjZXNzb3IoKSwgY3VycmVudCwgbWFya2VyKSwgaW5pdGlhbCk7XG59XG5mdW5jdGlvbiBhc3NpZ24obm9kZSwgcHJvcHMsIGlzU1ZHLCBza2lwQ2hpbGRyZW4sIHByZXZQcm9wcyA9IHt9LCBza2lwUmVmID0gZmFsc2UpIHtcbiAgcHJvcHMgfHwgKHByb3BzID0ge30pO1xuICBmb3IgKGNvbnN0IHByb3AgaW4gcHJldlByb3BzKSB7XG4gICAgaWYgKCEocHJvcCBpbiBwcm9wcykpIHtcbiAgICAgIGlmIChwcm9wID09PSBcImNoaWxkcmVuXCIpIGNvbnRpbnVlO1xuICAgICAgcHJldlByb3BzW3Byb3BdID0gYXNzaWduUHJvcChub2RlLCBwcm9wLCBudWxsLCBwcmV2UHJvcHNbcHJvcF0sIGlzU1ZHLCBza2lwUmVmKTtcbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBwcm9wIGluIHByb3BzKSB7XG4gICAgaWYgKHByb3AgPT09IFwiY2hpbGRyZW5cIikge1xuICAgICAgaWYgKCFza2lwQ2hpbGRyZW4pIGluc2VydEV4cHJlc3Npb24obm9kZSwgcHJvcHMuY2hpbGRyZW4pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlID0gcHJvcHNbcHJvcF07XG4gICAgcHJldlByb3BzW3Byb3BdID0gYXNzaWduUHJvcChub2RlLCBwcm9wLCB2YWx1ZSwgcHJldlByb3BzW3Byb3BdLCBpc1NWRywgc2tpcFJlZik7XG4gIH1cbn1cbmZ1bmN0aW9uIGh5ZHJhdGUkMShjb2RlLCBlbGVtZW50LCBvcHRpb25zID0ge30pIHtcbiAgc2hhcmVkQ29uZmlnLmNvbXBsZXRlZCA9IGdsb2JhbFRoaXMuXyRIWS5jb21wbGV0ZWQ7XG4gIHNoYXJlZENvbmZpZy5ldmVudHMgPSBnbG9iYWxUaGlzLl8kSFkuZXZlbnRzO1xuICBzaGFyZWRDb25maWcubG9hZCA9IGlkID0+IGdsb2JhbFRoaXMuXyRIWS5yW2lkXTtcbiAgc2hhcmVkQ29uZmlnLmhhcyA9IGlkID0+IGlkIGluIGdsb2JhbFRoaXMuXyRIWS5yO1xuICBzaGFyZWRDb25maWcuZ2F0aGVyID0gcm9vdCA9PiBnYXRoZXJIeWRyYXRhYmxlKGVsZW1lbnQsIHJvb3QpO1xuICBzaGFyZWRDb25maWcucmVnaXN0cnkgPSBuZXcgTWFwKCk7XG4gIHNoYXJlZENvbmZpZy5jb250ZXh0ID0ge1xuICAgIGlkOiBvcHRpb25zLnJlbmRlcklkIHx8IFwiXCIsXG4gICAgY291bnQ6IDBcbiAgfTtcbiAgZ2F0aGVySHlkcmF0YWJsZShlbGVtZW50LCBvcHRpb25zLnJlbmRlcklkKTtcbiAgY29uc3QgZGlzcG9zZSA9IHJlbmRlcihjb2RlLCBlbGVtZW50LCBbLi4uZWxlbWVudC5jaGlsZE5vZGVzXSwgb3B0aW9ucyk7XG4gIHNoYXJlZENvbmZpZy5jb250ZXh0ID0gbnVsbDtcbiAgcmV0dXJuIGRpc3Bvc2U7XG59XG5mdW5jdGlvbiBnZXROZXh0RWxlbWVudCh0ZW1wbGF0ZSkge1xuICBsZXQgbm9kZSwga2V5O1xuICBpZiAoIXNoYXJlZENvbmZpZy5jb250ZXh0IHx8ICEobm9kZSA9IHNoYXJlZENvbmZpZy5yZWdpc3RyeS5nZXQoKGtleSA9IGdldEh5ZHJhdGlvbktleSgpKSkpKSB7XG4gICAgcmV0dXJuIHRlbXBsYXRlKCk7XG4gIH1cbiAgaWYgKHNoYXJlZENvbmZpZy5jb21wbGV0ZWQpIHNoYXJlZENvbmZpZy5jb21wbGV0ZWQuYWRkKG5vZGUpO1xuICBzaGFyZWRDb25maWcucmVnaXN0cnkuZGVsZXRlKGtleSk7XG4gIHJldHVybiBub2RlO1xufVxuZnVuY3Rpb24gZ2V0TmV4dE1hdGNoKGVsLCBub2RlTmFtZSkge1xuICB3aGlsZSAoZWwgJiYgZWwubG9jYWxOYW1lICE9PSBub2RlTmFtZSkgZWwgPSBlbC5uZXh0U2libGluZztcbiAgcmV0dXJuIGVsO1xufVxuZnVuY3Rpb24gZ2V0TmV4dE1hcmtlcihzdGFydCkge1xuICBsZXQgZW5kID0gc3RhcnQsXG4gICAgY291bnQgPSAwLFxuICAgIGN1cnJlbnQgPSBbXTtcbiAgaWYgKHNoYXJlZENvbmZpZy5jb250ZXh0KSB7XG4gICAgd2hpbGUgKGVuZCkge1xuICAgICAgaWYgKGVuZC5ub2RlVHlwZSA9PT0gOCkge1xuICAgICAgICBjb25zdCB2ID0gZW5kLm5vZGVWYWx1ZTtcbiAgICAgICAgaWYgKHYgPT09IFwiJFwiKSBjb3VudCsrO1xuICAgICAgICBlbHNlIGlmICh2ID09PSBcIi9cIikge1xuICAgICAgICAgIGlmIChjb3VudCA9PT0gMCkgcmV0dXJuIFtlbmQsIGN1cnJlbnRdO1xuICAgICAgICAgIGNvdW50LS07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGN1cnJlbnQucHVzaChlbmQpO1xuICAgICAgZW5kID0gZW5kLm5leHRTaWJsaW5nO1xuICAgIH1cbiAgfVxuICByZXR1cm4gW2VuZCwgY3VycmVudF07XG59XG5mdW5jdGlvbiBydW5IeWRyYXRpb25FdmVudHMoKSB7XG4gIGlmIChzaGFyZWRDb25maWcuZXZlbnRzICYmICFzaGFyZWRDb25maWcuZXZlbnRzLnF1ZXVlZCkge1xuICAgIHF1ZXVlTWljcm90YXNrKCgpID0+IHtcbiAgICAgIGNvbnN0IHsgY29tcGxldGVkLCBldmVudHMgfSA9IHNoYXJlZENvbmZpZztcbiAgICAgIGV2ZW50cy5xdWV1ZWQgPSBmYWxzZTtcbiAgICAgIHdoaWxlIChldmVudHMubGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IFtlbCwgZV0gPSBldmVudHNbMF07XG4gICAgICAgIGlmICghY29tcGxldGVkLmhhcyhlbCkpIHJldHVybjtcbiAgICAgICAgZXZlbnRIYW5kbGVyKGUpO1xuICAgICAgICBldmVudHMuc2hpZnQoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBzaGFyZWRDb25maWcuZXZlbnRzLnF1ZXVlZCA9IHRydWU7XG4gIH1cbn1cbmZ1bmN0aW9uIHRvUHJvcGVydHlOYW1lKG5hbWUpIHtcbiAgcmV0dXJuIG5hbWUudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC8tKFthLXpdKS9nLCAoXywgdykgPT4gdy50b1VwcGVyQ2FzZSgpKTtcbn1cbmZ1bmN0aW9uIHRvZ2dsZUNsYXNzS2V5KG5vZGUsIGtleSwgdmFsdWUpIHtcbiAgY29uc3QgY2xhc3NOYW1lcyA9IGtleS50cmltKCkuc3BsaXQoL1xccysvKTtcbiAgZm9yIChsZXQgaSA9IDAsIG5hbWVMZW4gPSBjbGFzc05hbWVzLmxlbmd0aDsgaSA8IG5hbWVMZW47IGkrKylcbiAgICBub2RlLmNsYXNzTGlzdC50b2dnbGUoY2xhc3NOYW1lc1tpXSwgdmFsdWUpO1xufVxuZnVuY3Rpb24gYXNzaWduUHJvcChub2RlLCBwcm9wLCB2YWx1ZSwgcHJldiwgaXNTVkcsIHNraXBSZWYpIHtcbiAgbGV0IGlzQ0UsIGlzUHJvcCwgaXNDaGlsZFByb3AsIHByb3BBbGlhcywgZm9yY2VQcm9wO1xuICBpZiAocHJvcCA9PT0gXCJzdHlsZVwiKSByZXR1cm4gc3R5bGUobm9kZSwgdmFsdWUsIHByZXYpO1xuICBpZiAocHJvcCA9PT0gXCJjbGFzc0xpc3RcIikgcmV0dXJuIGNsYXNzTGlzdChub2RlLCB2YWx1ZSwgcHJldik7XG4gIGlmICh2YWx1ZSA9PT0gcHJldikgcmV0dXJuIHByZXY7XG4gIGlmIChwcm9wID09PSBcInJlZlwiKSB7XG4gICAgaWYgKCFza2lwUmVmKSB2YWx1ZShub2RlKTtcbiAgfSBlbHNlIGlmIChwcm9wLnNsaWNlKDAsIDMpID09PSBcIm9uOlwiKSB7XG4gICAgY29uc3QgZSA9IHByb3Auc2xpY2UoMyk7XG4gICAgcHJldiAmJiBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoZSwgcHJldik7XG4gICAgdmFsdWUgJiYgbm9kZS5hZGRFdmVudExpc3RlbmVyKGUsIHZhbHVlKTtcbiAgfSBlbHNlIGlmIChwcm9wLnNsaWNlKDAsIDEwKSA9PT0gXCJvbmNhcHR1cmU6XCIpIHtcbiAgICBjb25zdCBlID0gcHJvcC5zbGljZSgxMCk7XG4gICAgcHJldiAmJiBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoZSwgcHJldiwgdHJ1ZSk7XG4gICAgdmFsdWUgJiYgbm9kZS5hZGRFdmVudExpc3RlbmVyKGUsIHZhbHVlLCB0cnVlKTtcbiAgfSBlbHNlIGlmIChwcm9wLnNsaWNlKDAsIDIpID09PSBcIm9uXCIpIHtcbiAgICBjb25zdCBuYW1lID0gcHJvcC5zbGljZSgyKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IGRlbGVnYXRlID0gRGVsZWdhdGVkRXZlbnRzLmhhcyhuYW1lKTtcbiAgICBpZiAoIWRlbGVnYXRlICYmIHByZXYpIHtcbiAgICAgIGNvbnN0IGggPSBBcnJheS5pc0FycmF5KHByZXYpID8gcHJldlswXSA6IHByZXY7XG4gICAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIobmFtZSwgaCk7XG4gICAgfVxuICAgIGlmIChkZWxlZ2F0ZSB8fCB2YWx1ZSkge1xuICAgICAgYWRkRXZlbnRMaXN0ZW5lcihub2RlLCBuYW1lLCB2YWx1ZSwgZGVsZWdhdGUpO1xuICAgICAgZGVsZWdhdGUgJiYgZGVsZWdhdGVFdmVudHMoW25hbWVdKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAocHJvcC5zbGljZSgwLCA1KSA9PT0gXCJhdHRyOlwiKSB7XG4gICAgc2V0QXR0cmlidXRlKG5vZGUsIHByb3Auc2xpY2UoNSksIHZhbHVlKTtcbiAgfSBlbHNlIGlmIChcbiAgICAoZm9yY2VQcm9wID0gcHJvcC5zbGljZSgwLCA1KSA9PT0gXCJwcm9wOlwiKSB8fFxuICAgIChpc0NoaWxkUHJvcCA9IENoaWxkUHJvcGVydGllcy5oYXMocHJvcCkpIHx8XG4gICAgKCFpc1NWRyAmJlxuICAgICAgKChwcm9wQWxpYXMgPSBnZXRQcm9wQWxpYXMocHJvcCwgbm9kZS50YWdOYW1lKSkgfHwgKGlzUHJvcCA9IFByb3BlcnRpZXMuaGFzKHByb3ApKSkpIHx8XG4gICAgKGlzQ0UgPSBub2RlLm5vZGVOYW1lLmluY2x1ZGVzKFwiLVwiKSlcbiAgKSB7XG4gICAgaWYgKGZvcmNlUHJvcCkge1xuICAgICAgcHJvcCA9IHByb3Auc2xpY2UoNSk7XG4gICAgICBpc1Byb3AgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoISFzaGFyZWRDb25maWcuY29udGV4dCAmJiBub2RlLmlzQ29ubmVjdGVkKSByZXR1cm4gdmFsdWU7XG4gICAgaWYgKHByb3AgPT09IFwiY2xhc3NcIiB8fCBwcm9wID09PSBcImNsYXNzTmFtZVwiKSBjbGFzc05hbWUobm9kZSwgdmFsdWUpO1xuICAgIGVsc2UgaWYgKGlzQ0UgJiYgIWlzUHJvcCAmJiAhaXNDaGlsZFByb3ApIG5vZGVbdG9Qcm9wZXJ0eU5hbWUocHJvcCldID0gdmFsdWU7XG4gICAgZWxzZSBub2RlW3Byb3BBbGlhcyB8fCBwcm9wXSA9IHZhbHVlO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IG5zID0gaXNTVkcgJiYgcHJvcC5pbmRleE9mKFwiOlwiKSA+IC0xICYmIFNWR05hbWVzcGFjZVtwcm9wLnNwbGl0KFwiOlwiKVswXV07XG4gICAgaWYgKG5zKSBzZXRBdHRyaWJ1dGVOUyhub2RlLCBucywgcHJvcCwgdmFsdWUpO1xuICAgIGVsc2Ugc2V0QXR0cmlidXRlKG5vZGUsIEFsaWFzZXNbcHJvcF0gfHwgcHJvcCwgdmFsdWUpO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cbmZ1bmN0aW9uIGV2ZW50SGFuZGxlcihlKSB7XG4gIGNvbnN0IGtleSA9IGAkJCR7ZS50eXBlfWA7XG4gIGxldCBub2RlID0gKGUuY29tcG9zZWRQYXRoICYmIGUuY29tcG9zZWRQYXRoKClbMF0pIHx8IGUudGFyZ2V0O1xuICBpZiAoZS50YXJnZXQgIT09IG5vZGUpIHtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoZSwgXCJ0YXJnZXRcIiwge1xuICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgdmFsdWU6IG5vZGVcbiAgICB9KTtcbiAgfVxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoZSwgXCJjdXJyZW50VGFyZ2V0XCIsIHtcbiAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgZ2V0KCkge1xuICAgICAgcmV0dXJuIG5vZGUgfHwgZG9jdW1lbnQ7XG4gICAgfVxuICB9KTtcbiAgaWYgKHNoYXJlZENvbmZpZy5yZWdpc3RyeSAmJiAhc2hhcmVkQ29uZmlnLmRvbmUpIHNoYXJlZENvbmZpZy5kb25lID0gXyRIWS5kb25lID0gdHJ1ZTtcbiAgd2hpbGUgKG5vZGUpIHtcbiAgICBjb25zdCBoYW5kbGVyID0gbm9kZVtrZXldO1xuICAgIGlmIChoYW5kbGVyICYmICFub2RlLmRpc2FibGVkKSB7XG4gICAgICBjb25zdCBkYXRhID0gbm9kZVtgJHtrZXl9RGF0YWBdO1xuICAgICAgZGF0YSAhPT0gdW5kZWZpbmVkID8gaGFuZGxlci5jYWxsKG5vZGUsIGRhdGEsIGUpIDogaGFuZGxlci5jYWxsKG5vZGUsIGUpO1xuICAgICAgaWYgKGUuY2FuY2VsQnViYmxlKSByZXR1cm47XG4gICAgfVxuICAgIG5vZGUgPSBub2RlLl8kaG9zdCB8fCBub2RlLnBhcmVudE5vZGUgfHwgbm9kZS5ob3N0O1xuICB9XG59XG5mdW5jdGlvbiBpbnNlcnRFeHByZXNzaW9uKHBhcmVudCwgdmFsdWUsIGN1cnJlbnQsIG1hcmtlciwgdW53cmFwQXJyYXkpIHtcbiAgY29uc3QgaHlkcmF0aW5nID0gISFzaGFyZWRDb25maWcuY29udGV4dCAmJiBwYXJlbnQuaXNDb25uZWN0ZWQ7XG4gIGlmIChoeWRyYXRpbmcpIHtcbiAgICAhY3VycmVudCAmJiAoY3VycmVudCA9IFsuLi5wYXJlbnQuY2hpbGROb2Rlc10pO1xuICAgIGxldCBjbGVhbmVkID0gW107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjdXJyZW50Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBub2RlID0gY3VycmVudFtpXTtcbiAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSA4ICYmIG5vZGUuZGF0YS5zbGljZSgwLCAyKSA9PT0gXCIhJFwiKSBub2RlLnJlbW92ZSgpO1xuICAgICAgZWxzZSBjbGVhbmVkLnB1c2gobm9kZSk7XG4gICAgfVxuICAgIGN1cnJlbnQgPSBjbGVhbmVkO1xuICB9XG4gIHdoaWxlICh0eXBlb2YgY3VycmVudCA9PT0gXCJmdW5jdGlvblwiKSBjdXJyZW50ID0gY3VycmVudCgpO1xuICBpZiAodmFsdWUgPT09IGN1cnJlbnQpIHJldHVybiBjdXJyZW50O1xuICBjb25zdCB0ID0gdHlwZW9mIHZhbHVlLFxuICAgIG11bHRpID0gbWFya2VyICE9PSB1bmRlZmluZWQ7XG4gIHBhcmVudCA9IChtdWx0aSAmJiBjdXJyZW50WzBdICYmIGN1cnJlbnRbMF0ucGFyZW50Tm9kZSkgfHwgcGFyZW50O1xuICBpZiAodCA9PT0gXCJzdHJpbmdcIiB8fCB0ID09PSBcIm51bWJlclwiKSB7XG4gICAgaWYgKGh5ZHJhdGluZykgcmV0dXJuIGN1cnJlbnQ7XG4gICAgaWYgKHQgPT09IFwibnVtYmVyXCIpIHtcbiAgICAgIHZhbHVlID0gdmFsdWUudG9TdHJpbmcoKTtcbiAgICAgIGlmICh2YWx1ZSA9PT0gY3VycmVudCkgcmV0dXJuIGN1cnJlbnQ7XG4gICAgfVxuICAgIGlmIChtdWx0aSkge1xuICAgICAgbGV0IG5vZGUgPSBjdXJyZW50WzBdO1xuICAgICAgaWYgKG5vZGUgJiYgbm9kZS5ub2RlVHlwZSA9PT0gMykge1xuICAgICAgICBub2RlLmRhdGEgIT09IHZhbHVlICYmIChub2RlLmRhdGEgPSB2YWx1ZSk7XG4gICAgICB9IGVsc2Ugbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHZhbHVlKTtcbiAgICAgIGN1cnJlbnQgPSBjbGVhbkNoaWxkcmVuKHBhcmVudCwgY3VycmVudCwgbWFya2VyLCBub2RlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGN1cnJlbnQgIT09IFwiXCIgJiYgdHlwZW9mIGN1cnJlbnQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgY3VycmVudCA9IHBhcmVudC5maXJzdENoaWxkLmRhdGEgPSB2YWx1ZTtcbiAgICAgIH0gZWxzZSBjdXJyZW50ID0gcGFyZW50LnRleHRDb250ZW50ID0gdmFsdWU7XG4gICAgfVxuICB9IGVsc2UgaWYgKHZhbHVlID09IG51bGwgfHwgdCA9PT0gXCJib29sZWFuXCIpIHtcbiAgICBpZiAoaHlkcmF0aW5nKSByZXR1cm4gY3VycmVudDtcbiAgICBjdXJyZW50ID0gY2xlYW5DaGlsZHJlbihwYXJlbnQsIGN1cnJlbnQsIG1hcmtlcik7XG4gIH0gZWxzZSBpZiAodCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgY3JlYXRlUmVuZGVyRWZmZWN0KCgpID0+IHtcbiAgICAgIGxldCB2ID0gdmFsdWUoKTtcbiAgICAgIHdoaWxlICh0eXBlb2YgdiA9PT0gXCJmdW5jdGlvblwiKSB2ID0gdigpO1xuICAgICAgY3VycmVudCA9IGluc2VydEV4cHJlc3Npb24ocGFyZW50LCB2LCBjdXJyZW50LCBtYXJrZXIpO1xuICAgIH0pO1xuICAgIHJldHVybiAoKSA9PiBjdXJyZW50O1xuICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgY29uc3QgYXJyYXkgPSBbXTtcbiAgICBjb25zdCBjdXJyZW50QXJyYXkgPSBjdXJyZW50ICYmIEFycmF5LmlzQXJyYXkoY3VycmVudCk7XG4gICAgaWYgKG5vcm1hbGl6ZUluY29taW5nQXJyYXkoYXJyYXksIHZhbHVlLCBjdXJyZW50LCB1bndyYXBBcnJheSkpIHtcbiAgICAgIGNyZWF0ZVJlbmRlckVmZmVjdCgoKSA9PiAoY3VycmVudCA9IGluc2VydEV4cHJlc3Npb24ocGFyZW50LCBhcnJheSwgY3VycmVudCwgbWFya2VyLCB0cnVlKSkpO1xuICAgICAgcmV0dXJuICgpID0+IGN1cnJlbnQ7XG4gICAgfVxuICAgIGlmIChoeWRyYXRpbmcpIHtcbiAgICAgIGlmICghYXJyYXkubGVuZ3RoKSByZXR1cm4gY3VycmVudDtcbiAgICAgIGlmIChtYXJrZXIgPT09IHVuZGVmaW5lZCkgcmV0dXJuIFsuLi5wYXJlbnQuY2hpbGROb2Rlc107XG4gICAgICBsZXQgbm9kZSA9IGFycmF5WzBdO1xuICAgICAgbGV0IG5vZGVzID0gW25vZGVdO1xuICAgICAgd2hpbGUgKChub2RlID0gbm9kZS5uZXh0U2libGluZykgIT09IG1hcmtlcikgbm9kZXMucHVzaChub2RlKTtcbiAgICAgIHJldHVybiAoY3VycmVudCA9IG5vZGVzKTtcbiAgICB9XG4gICAgaWYgKGFycmF5Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgY3VycmVudCA9IGNsZWFuQ2hpbGRyZW4ocGFyZW50LCBjdXJyZW50LCBtYXJrZXIpO1xuICAgICAgaWYgKG11bHRpKSByZXR1cm4gY3VycmVudDtcbiAgICB9IGVsc2UgaWYgKGN1cnJlbnRBcnJheSkge1xuICAgICAgaWYgKGN1cnJlbnQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGFwcGVuZE5vZGVzKHBhcmVudCwgYXJyYXksIG1hcmtlcik7XG4gICAgICB9IGVsc2UgcmVjb25jaWxlQXJyYXlzKHBhcmVudCwgY3VycmVudCwgYXJyYXkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjdXJyZW50ICYmIGNsZWFuQ2hpbGRyZW4ocGFyZW50KTtcbiAgICAgIGFwcGVuZE5vZGVzKHBhcmVudCwgYXJyYXkpO1xuICAgIH1cbiAgICBjdXJyZW50ID0gYXJyYXk7XG4gIH0gZWxzZSBpZiAodmFsdWUubm9kZVR5cGUpIHtcbiAgICBpZiAoaHlkcmF0aW5nICYmIHZhbHVlLnBhcmVudE5vZGUpIHJldHVybiAoY3VycmVudCA9IG11bHRpID8gW3ZhbHVlXSA6IHZhbHVlKTtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShjdXJyZW50KSkge1xuICAgICAgaWYgKG11bHRpKSByZXR1cm4gKGN1cnJlbnQgPSBjbGVhbkNoaWxkcmVuKHBhcmVudCwgY3VycmVudCwgbWFya2VyLCB2YWx1ZSkpO1xuICAgICAgY2xlYW5DaGlsZHJlbihwYXJlbnQsIGN1cnJlbnQsIG51bGwsIHZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKGN1cnJlbnQgPT0gbnVsbCB8fCBjdXJyZW50ID09PSBcIlwiIHx8ICFwYXJlbnQuZmlyc3RDaGlsZCkge1xuICAgICAgcGFyZW50LmFwcGVuZENoaWxkKHZhbHVlKTtcbiAgICB9IGVsc2UgcGFyZW50LnJlcGxhY2VDaGlsZCh2YWx1ZSwgcGFyZW50LmZpcnN0Q2hpbGQpO1xuICAgIGN1cnJlbnQgPSB2YWx1ZTtcbiAgfSBlbHNlO1xuICByZXR1cm4gY3VycmVudDtcbn1cbmZ1bmN0aW9uIG5vcm1hbGl6ZUluY29taW5nQXJyYXkobm9ybWFsaXplZCwgYXJyYXksIGN1cnJlbnQsIHVud3JhcCkge1xuICBsZXQgZHluYW1pYyA9IGZhbHNlO1xuICBmb3IgKGxldCBpID0gMCwgbGVuID0gYXJyYXkubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBsZXQgaXRlbSA9IGFycmF5W2ldLFxuICAgICAgcHJldiA9IGN1cnJlbnQgJiYgY3VycmVudFtub3JtYWxpemVkLmxlbmd0aF0sXG4gICAgICB0O1xuICAgIGlmIChpdGVtID09IG51bGwgfHwgaXRlbSA9PT0gdHJ1ZSB8fCBpdGVtID09PSBmYWxzZSk7XG4gICAgZWxzZSBpZiAoKHQgPSB0eXBlb2YgaXRlbSkgPT09IFwib2JqZWN0XCIgJiYgaXRlbS5ub2RlVHlwZSkge1xuICAgICAgbm9ybWFsaXplZC5wdXNoKGl0ZW0pO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShpdGVtKSkge1xuICAgICAgZHluYW1pYyA9IG5vcm1hbGl6ZUluY29taW5nQXJyYXkobm9ybWFsaXplZCwgaXRlbSwgcHJldikgfHwgZHluYW1pYztcbiAgICB9IGVsc2UgaWYgKHQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgaWYgKHVud3JhcCkge1xuICAgICAgICB3aGlsZSAodHlwZW9mIGl0ZW0gPT09IFwiZnVuY3Rpb25cIikgaXRlbSA9IGl0ZW0oKTtcbiAgICAgICAgZHluYW1pYyA9XG4gICAgICAgICAgbm9ybWFsaXplSW5jb21pbmdBcnJheShcbiAgICAgICAgICAgIG5vcm1hbGl6ZWQsXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KGl0ZW0pID8gaXRlbSA6IFtpdGVtXSxcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkocHJldikgPyBwcmV2IDogW3ByZXZdXG4gICAgICAgICAgKSB8fCBkeW5hbWljO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbm9ybWFsaXplZC5wdXNoKGl0ZW0pO1xuICAgICAgICBkeW5hbWljID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgdmFsdWUgPSBTdHJpbmcoaXRlbSk7XG4gICAgICBpZiAocHJldiAmJiBwcmV2Lm5vZGVUeXBlID09PSAzICYmIHByZXYuZGF0YSA9PT0gdmFsdWUpIG5vcm1hbGl6ZWQucHVzaChwcmV2KTtcbiAgICAgIGVsc2Ugbm9ybWFsaXplZC5wdXNoKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHZhbHVlKSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBkeW5hbWljO1xufVxuZnVuY3Rpb24gYXBwZW5kTm9kZXMocGFyZW50LCBhcnJheSwgbWFya2VyID0gbnVsbCkge1xuICBmb3IgKGxldCBpID0gMCwgbGVuID0gYXJyYXkubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHBhcmVudC5pbnNlcnRCZWZvcmUoYXJyYXlbaV0sIG1hcmtlcik7XG59XG5mdW5jdGlvbiBjbGVhbkNoaWxkcmVuKHBhcmVudCwgY3VycmVudCwgbWFya2VyLCByZXBsYWNlbWVudCkge1xuICBpZiAobWFya2VyID09PSB1bmRlZmluZWQpIHJldHVybiAocGFyZW50LnRleHRDb250ZW50ID0gXCJcIik7XG4gIGNvbnN0IG5vZGUgPSByZXBsYWNlbWVudCB8fCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcbiAgaWYgKGN1cnJlbnQubGVuZ3RoKSB7XG4gICAgbGV0IGluc2VydGVkID0gZmFsc2U7XG4gICAgZm9yIChsZXQgaSA9IGN1cnJlbnQubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIGNvbnN0IGVsID0gY3VycmVudFtpXTtcbiAgICAgIGlmIChub2RlICE9PSBlbCkge1xuICAgICAgICBjb25zdCBpc1BhcmVudCA9IGVsLnBhcmVudE5vZGUgPT09IHBhcmVudDtcbiAgICAgICAgaWYgKCFpbnNlcnRlZCAmJiAhaSlcbiAgICAgICAgICBpc1BhcmVudCA/IHBhcmVudC5yZXBsYWNlQ2hpbGQobm9kZSwgZWwpIDogcGFyZW50Lmluc2VydEJlZm9yZShub2RlLCBtYXJrZXIpO1xuICAgICAgICBlbHNlIGlzUGFyZW50ICYmIGVsLnJlbW92ZSgpO1xuICAgICAgfSBlbHNlIGluc2VydGVkID0gdHJ1ZTtcbiAgICB9XG4gIH0gZWxzZSBwYXJlbnQuaW5zZXJ0QmVmb3JlKG5vZGUsIG1hcmtlcik7XG4gIHJldHVybiBbbm9kZV07XG59XG5mdW5jdGlvbiBnYXRoZXJIeWRyYXRhYmxlKGVsZW1lbnQsIHJvb3QpIHtcbiAgY29uc3QgdGVtcGxhdGVzID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKGAqW2RhdGEtaGtdYCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGVtcGxhdGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgbm9kZSA9IHRlbXBsYXRlc1tpXTtcbiAgICBjb25zdCBrZXkgPSBub2RlLmdldEF0dHJpYnV0ZShcImRhdGEtaGtcIik7XG4gICAgaWYgKCghcm9vdCB8fCBrZXkuc3RhcnRzV2l0aChyb290KSkgJiYgIXNoYXJlZENvbmZpZy5yZWdpc3RyeS5oYXMoa2V5KSlcbiAgICAgIHNoYXJlZENvbmZpZy5yZWdpc3RyeS5zZXQoa2V5LCBub2RlKTtcbiAgfVxufVxuZnVuY3Rpb24gZ2V0SHlkcmF0aW9uS2V5KCkge1xuICBjb25zdCBoeWRyYXRlID0gc2hhcmVkQ29uZmlnLmNvbnRleHQ7XG4gIHJldHVybiBgJHtoeWRyYXRlLmlkfSR7aHlkcmF0ZS5jb3VudCsrfWA7XG59XG5mdW5jdGlvbiBOb0h5ZHJhdGlvbihwcm9wcykge1xuICByZXR1cm4gc2hhcmVkQ29uZmlnLmNvbnRleHQgPyB1bmRlZmluZWQgOiBwcm9wcy5jaGlsZHJlbjtcbn1cbmZ1bmN0aW9uIEh5ZHJhdGlvbihwcm9wcykge1xuICByZXR1cm4gcHJvcHMuY2hpbGRyZW47XG59XG5jb25zdCB2b2lkRm4gPSAoKSA9PiB1bmRlZmluZWQ7XG5jb25zdCBSZXF1ZXN0Q29udGV4dCA9IFN5bWJvbCgpO1xuZnVuY3Rpb24gaW5uZXJIVE1MKHBhcmVudCwgY29udGVudCkge1xuICAhc2hhcmVkQ29uZmlnLmNvbnRleHQgJiYgKHBhcmVudC5pbm5lckhUTUwgPSBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gdGhyb3dJbkJyb3dzZXIoZnVuYykge1xuICBjb25zdCBlcnIgPSBuZXcgRXJyb3IoYCR7ZnVuYy5uYW1lfSBpcyBub3Qgc3VwcG9ydGVkIGluIHRoZSBicm93c2VyLCByZXR1cm5pbmcgdW5kZWZpbmVkYCk7XG4gIGNvbnNvbGUuZXJyb3IoZXJyKTtcbn1cbmZ1bmN0aW9uIHJlbmRlclRvU3RyaW5nKGZuLCBvcHRpb25zKSB7XG4gIHRocm93SW5Ccm93c2VyKHJlbmRlclRvU3RyaW5nKTtcbn1cbmZ1bmN0aW9uIHJlbmRlclRvU3RyaW5nQXN5bmMoZm4sIG9wdGlvbnMpIHtcbiAgdGhyb3dJbkJyb3dzZXIocmVuZGVyVG9TdHJpbmdBc3luYyk7XG59XG5mdW5jdGlvbiByZW5kZXJUb1N0cmVhbShmbiwgb3B0aW9ucykge1xuICB0aHJvd0luQnJvd3NlcihyZW5kZXJUb1N0cmVhbSk7XG59XG5mdW5jdGlvbiBzc3IodGVtcGxhdGUsIC4uLm5vZGVzKSB7fVxuZnVuY3Rpb24gc3NyRWxlbWVudChuYW1lLCBwcm9wcywgY2hpbGRyZW4sIG5lZWRzSWQpIHt9XG5mdW5jdGlvbiBzc3JDbGFzc0xpc3QodmFsdWUpIHt9XG5mdW5jdGlvbiBzc3JTdHlsZSh2YWx1ZSkge31cbmZ1bmN0aW9uIHNzckF0dHJpYnV0ZShrZXksIHZhbHVlKSB7fVxuZnVuY3Rpb24gc3NySHlkcmF0aW9uS2V5KCkge31cbmZ1bmN0aW9uIHJlc29sdmVTU1JOb2RlKG5vZGUpIHt9XG5mdW5jdGlvbiBlc2NhcGUoaHRtbCkge31cbmZ1bmN0aW9uIHNzclNwcmVhZChwcm9wcywgaXNTVkcsIHNraXBDaGlsZHJlbikge31cblxuY29uc3QgaXNTZXJ2ZXIgPSBmYWxzZTtcbmNvbnN0IGlzRGV2ID0gZmFsc2U7XG5jb25zdCBTVkdfTkFNRVNQQUNFID0gXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiO1xuZnVuY3Rpb24gY3JlYXRlRWxlbWVudCh0YWdOYW1lLCBpc1NWRyA9IGZhbHNlKSB7XG4gIHJldHVybiBpc1NWRyA/IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkdfTkFNRVNQQUNFLCB0YWdOYW1lKSA6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7XG59XG5jb25zdCBoeWRyYXRlID0gKC4uLmFyZ3MpID0+IHtcbiAgZW5hYmxlSHlkcmF0aW9uKCk7XG4gIHJldHVybiBoeWRyYXRlJDEoLi4uYXJncyk7XG59O1xuZnVuY3Rpb24gUG9ydGFsKHByb3BzKSB7XG4gIGNvbnN0IHsgdXNlU2hhZG93IH0gPSBwcm9wcyxcbiAgICBtYXJrZXIgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKSxcbiAgICBtb3VudCA9ICgpID0+IHByb3BzLm1vdW50IHx8IGRvY3VtZW50LmJvZHksXG4gICAgb3duZXIgPSBnZXRPd25lcigpO1xuICBsZXQgY29udGVudDtcbiAgbGV0IGh5ZHJhdGluZyA9ICEhc2hhcmVkQ29uZmlnLmNvbnRleHQ7XG4gIGNyZWF0ZUVmZmVjdChcbiAgICAoKSA9PiB7XG4gICAgICBpZiAoaHlkcmF0aW5nKSBnZXRPd25lcigpLnVzZXIgPSBoeWRyYXRpbmcgPSBmYWxzZTtcbiAgICAgIGNvbnRlbnQgfHwgKGNvbnRlbnQgPSBydW5XaXRoT3duZXIob3duZXIsICgpID0+IGNyZWF0ZU1lbW8oKCkgPT4gcHJvcHMuY2hpbGRyZW4pKSk7XG4gICAgICBjb25zdCBlbCA9IG1vdW50KCk7XG4gICAgICBpZiAoZWwgaW5zdGFuY2VvZiBIVE1MSGVhZEVsZW1lbnQpIHtcbiAgICAgICAgY29uc3QgW2NsZWFuLCBzZXRDbGVhbl0gPSBjcmVhdGVTaWduYWwoZmFsc2UpO1xuICAgICAgICBjb25zdCBjbGVhbnVwID0gKCkgPT4gc2V0Q2xlYW4odHJ1ZSk7XG4gICAgICAgIGNyZWF0ZVJvb3QoZGlzcG9zZSA9PiBpbnNlcnQoZWwsICgpID0+ICghY2xlYW4oKSA/IGNvbnRlbnQoKSA6IGRpc3Bvc2UoKSksIG51bGwpKTtcbiAgICAgICAgb25DbGVhbnVwKGNsZWFudXApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gY3JlYXRlRWxlbWVudChwcm9wcy5pc1NWRyA/IFwiZ1wiIDogXCJkaXZcIiwgcHJvcHMuaXNTVkcpLFxuICAgICAgICAgIHJlbmRlclJvb3QgPVxuICAgICAgICAgICAgdXNlU2hhZG93ICYmIGNvbnRhaW5lci5hdHRhY2hTaGFkb3dcbiAgICAgICAgICAgICAgPyBjb250YWluZXIuYXR0YWNoU2hhZG93KHtcbiAgICAgICAgICAgICAgICAgIG1vZGU6IFwib3BlblwiXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgOiBjb250YWluZXI7XG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjb250YWluZXIsIFwiXyRob3N0XCIsIHtcbiAgICAgICAgICBnZXQoKSB7XG4gICAgICAgICAgICByZXR1cm4gbWFya2VyLnBhcmVudE5vZGU7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgICAgfSk7XG4gICAgICAgIGluc2VydChyZW5kZXJSb290LCBjb250ZW50KTtcbiAgICAgICAgZWwuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcbiAgICAgICAgcHJvcHMucmVmICYmIHByb3BzLnJlZihjb250YWluZXIpO1xuICAgICAgICBvbkNsZWFudXAoKCkgPT4gZWwucmVtb3ZlQ2hpbGQoY29udGFpbmVyKSk7XG4gICAgICB9XG4gICAgfSxcbiAgICB1bmRlZmluZWQsXG4gICAge1xuICAgICAgcmVuZGVyOiAhaHlkcmF0aW5nXG4gICAgfVxuICApO1xuICByZXR1cm4gbWFya2VyO1xufVxuZnVuY3Rpb24gRHluYW1pYyhwcm9wcykge1xuICBjb25zdCBbcCwgb3RoZXJzXSA9IHNwbGl0UHJvcHMocHJvcHMsIFtcImNvbXBvbmVudFwiXSk7XG4gIGNvbnN0IGNhY2hlZCA9IGNyZWF0ZU1lbW8oKCkgPT4gcC5jb21wb25lbnQpO1xuICByZXR1cm4gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgY29uc3QgY29tcG9uZW50ID0gY2FjaGVkKCk7XG4gICAgc3dpdGNoICh0eXBlb2YgY29tcG9uZW50KSB7XG4gICAgICBjYXNlIFwiZnVuY3Rpb25cIjpcbiAgICAgICAgcmV0dXJuIHVudHJhY2soKCkgPT4gY29tcG9uZW50KG90aGVycykpO1xuICAgICAgY2FzZSBcInN0cmluZ1wiOlxuICAgICAgICBjb25zdCBpc1N2ZyA9IFNWR0VsZW1lbnRzLmhhcyhjb21wb25lbnQpO1xuICAgICAgICBjb25zdCBlbCA9IHNoYXJlZENvbmZpZy5jb250ZXh0ID8gZ2V0TmV4dEVsZW1lbnQoKSA6IGNyZWF0ZUVsZW1lbnQoY29tcG9uZW50LCBpc1N2Zyk7XG4gICAgICAgIHNwcmVhZChlbCwgb3RoZXJzLCBpc1N2Zyk7XG4gICAgICAgIHJldHVybiBlbDtcbiAgICB9XG4gIH0pO1xufVxuXG5leHBvcnQge1xuICBBbGlhc2VzLFxuICB2b2lkRm4gYXMgQXNzZXRzLFxuICBDaGlsZFByb3BlcnRpZXMsXG4gIERPTUVsZW1lbnRzLFxuICBEZWxlZ2F0ZWRFdmVudHMsXG4gIER5bmFtaWMsXG4gIEh5ZHJhdGlvbixcbiAgdm9pZEZuIGFzIEh5ZHJhdGlvblNjcmlwdCxcbiAgTm9IeWRyYXRpb24sXG4gIFBvcnRhbCxcbiAgUHJvcGVydGllcyxcbiAgUmVxdWVzdENvbnRleHQsXG4gIFNWR0VsZW1lbnRzLFxuICBTVkdOYW1lc3BhY2UsXG4gIGFkZEV2ZW50TGlzdGVuZXIsXG4gIGFzc2lnbixcbiAgY2xhc3NMaXN0LFxuICBjbGFzc05hbWUsXG4gIGNsZWFyRGVsZWdhdGVkRXZlbnRzLFxuICBkZWxlZ2F0ZUV2ZW50cyxcbiAgZHluYW1pY1Byb3BlcnR5LFxuICBlc2NhcGUsXG4gIHZvaWRGbiBhcyBnZW5lcmF0ZUh5ZHJhdGlvblNjcmlwdCxcbiAgdm9pZEZuIGFzIGdldEFzc2V0cyxcbiAgZ2V0SHlkcmF0aW9uS2V5LFxuICBnZXROZXh0RWxlbWVudCxcbiAgZ2V0TmV4dE1hcmtlcixcbiAgZ2V0TmV4dE1hdGNoLFxuICBnZXRQcm9wQWxpYXMsXG4gIHZvaWRGbiBhcyBnZXRSZXF1ZXN0RXZlbnQsXG4gIGh5ZHJhdGUsXG4gIGlubmVySFRNTCxcbiAgaW5zZXJ0LFxuICBpc0RldixcbiAgaXNTZXJ2ZXIsXG4gIHJlbmRlcixcbiAgcmVuZGVyVG9TdHJlYW0sXG4gIHJlbmRlclRvU3RyaW5nLFxuICByZW5kZXJUb1N0cmluZ0FzeW5jLFxuICByZXNvbHZlU1NSTm9kZSxcbiAgcnVuSHlkcmF0aW9uRXZlbnRzLFxuICBzZXRBdHRyaWJ1dGUsXG4gIHNldEF0dHJpYnV0ZU5TLFxuICBzZXRQcm9wZXJ0eSxcbiAgc3ByZWFkLFxuICBzc3IsXG4gIHNzckF0dHJpYnV0ZSxcbiAgc3NyQ2xhc3NMaXN0LFxuICBzc3JFbGVtZW50LFxuICBzc3JIeWRyYXRpb25LZXksXG4gIHNzclNwcmVhZCxcbiAgc3NyU3R5bGUsXG4gIHN0eWxlLFxuICB0ZW1wbGF0ZSxcbiAgdXNlLFxuICB2b2lkRm4gYXMgdXNlQXNzZXRzXG59O1xuIiwiaW1wb3J0IHsgJFBST1hZLCAkVFJBQ0ssIGdldExpc3RlbmVyLCBiYXRjaCwgY3JlYXRlU2lnbmFsIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5cbmNvbnN0ICRSQVcgPSBTeW1ib2woXCJzdG9yZS1yYXdcIiksXG4gICROT0RFID0gU3ltYm9sKFwic3RvcmUtbm9kZVwiKSxcbiAgJEhBUyA9IFN5bWJvbChcInN0b3JlLWhhc1wiKSxcbiAgJFNFTEYgPSBTeW1ib2woXCJzdG9yZS1zZWxmXCIpO1xuZnVuY3Rpb24gd3JhcCQxKHZhbHVlKSB7XG4gIGxldCBwID0gdmFsdWVbJFBST1hZXTtcbiAgaWYgKCFwKSB7XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHZhbHVlLCAkUFJPWFksIHtcbiAgICAgIHZhbHVlOiAocCA9IG5ldyBQcm94eSh2YWx1ZSwgcHJveHlUcmFwcyQxKSlcbiAgICB9KTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpLFxuICAgICAgICBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcnModmFsdWUpO1xuICAgICAgZm9yIChsZXQgaSA9IDAsIGwgPSBrZXlzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBjb25zdCBwcm9wID0ga2V5c1tpXTtcbiAgICAgICAgaWYgKGRlc2NbcHJvcF0uZ2V0KSB7XG4gICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHZhbHVlLCBwcm9wLCB7XG4gICAgICAgICAgICBlbnVtZXJhYmxlOiBkZXNjW3Byb3BdLmVudW1lcmFibGUsXG4gICAgICAgICAgICBnZXQ6IGRlc2NbcHJvcF0uZ2V0LmJpbmQocClcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gcDtcbn1cbmZ1bmN0aW9uIGlzV3JhcHBhYmxlKG9iaikge1xuICBsZXQgcHJvdG87XG4gIHJldHVybiAoXG4gICAgb2JqICE9IG51bGwgJiZcbiAgICB0eXBlb2Ygb2JqID09PSBcIm9iamVjdFwiICYmXG4gICAgKG9ialskUFJPWFldIHx8XG4gICAgICAhKHByb3RvID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKG9iaikpIHx8XG4gICAgICBwcm90byA9PT0gT2JqZWN0LnByb3RvdHlwZSB8fFxuICAgICAgQXJyYXkuaXNBcnJheShvYmopKVxuICApO1xufVxuZnVuY3Rpb24gdW53cmFwKGl0ZW0sIHNldCA9IG5ldyBTZXQoKSkge1xuICBsZXQgcmVzdWx0LCB1bndyYXBwZWQsIHYsIHByb3A7XG4gIGlmICgocmVzdWx0ID0gaXRlbSAhPSBudWxsICYmIGl0ZW1bJFJBV10pKSByZXR1cm4gcmVzdWx0O1xuICBpZiAoIWlzV3JhcHBhYmxlKGl0ZW0pIHx8IHNldC5oYXMoaXRlbSkpIHJldHVybiBpdGVtO1xuICBpZiAoQXJyYXkuaXNBcnJheShpdGVtKSkge1xuICAgIGlmIChPYmplY3QuaXNGcm96ZW4oaXRlbSkpIGl0ZW0gPSBpdGVtLnNsaWNlKDApO1xuICAgIGVsc2Ugc2V0LmFkZChpdGVtKTtcbiAgICBmb3IgKGxldCBpID0gMCwgbCA9IGl0ZW0ubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICB2ID0gaXRlbVtpXTtcbiAgICAgIGlmICgodW53cmFwcGVkID0gdW53cmFwKHYsIHNldCkpICE9PSB2KSBpdGVtW2ldID0gdW53cmFwcGVkO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoT2JqZWN0LmlzRnJvemVuKGl0ZW0pKSBpdGVtID0gT2JqZWN0LmFzc2lnbih7fSwgaXRlbSk7XG4gICAgZWxzZSBzZXQuYWRkKGl0ZW0pO1xuICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhpdGVtKSxcbiAgICAgIGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyhpdGVtKTtcbiAgICBmb3IgKGxldCBpID0gMCwgbCA9IGtleXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICBwcm9wID0ga2V5c1tpXTtcbiAgICAgIGlmIChkZXNjW3Byb3BdLmdldCkgY29udGludWU7XG4gICAgICB2ID0gaXRlbVtwcm9wXTtcbiAgICAgIGlmICgodW53cmFwcGVkID0gdW53cmFwKHYsIHNldCkpICE9PSB2KSBpdGVtW3Byb3BdID0gdW53cmFwcGVkO1xuICAgIH1cbiAgfVxuICByZXR1cm4gaXRlbTtcbn1cbmZ1bmN0aW9uIGdldE5vZGVzKHRhcmdldCwgc3ltYm9sKSB7XG4gIGxldCBub2RlcyA9IHRhcmdldFtzeW1ib2xdO1xuICBpZiAoIW5vZGVzKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIHN5bWJvbCwge1xuICAgICAgdmFsdWU6IChub2RlcyA9IE9iamVjdC5jcmVhdGUobnVsbCkpXG4gICAgfSk7XG4gIHJldHVybiBub2Rlcztcbn1cbmZ1bmN0aW9uIGdldE5vZGUobm9kZXMsIHByb3BlcnR5LCB2YWx1ZSkge1xuICBpZiAobm9kZXNbcHJvcGVydHldKSByZXR1cm4gbm9kZXNbcHJvcGVydHldO1xuICBjb25zdCBbcywgc2V0XSA9IGNyZWF0ZVNpZ25hbCh2YWx1ZSwge1xuICAgIGVxdWFsczogZmFsc2UsXG4gICAgaW50ZXJuYWw6IHRydWVcbiAgfSk7XG4gIHMuJCA9IHNldDtcbiAgcmV0dXJuIChub2Rlc1twcm9wZXJ0eV0gPSBzKTtcbn1cbmZ1bmN0aW9uIHByb3h5RGVzY3JpcHRvciQxKHRhcmdldCwgcHJvcGVydHkpIHtcbiAgY29uc3QgZGVzYyA9IFJlZmxlY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHRhcmdldCwgcHJvcGVydHkpO1xuICBpZiAoIWRlc2MgfHwgZGVzYy5nZXQgfHwgIWRlc2MuY29uZmlndXJhYmxlIHx8IHByb3BlcnR5ID09PSAkUFJPWFkgfHwgcHJvcGVydHkgPT09ICROT0RFKVxuICAgIHJldHVybiBkZXNjO1xuICBkZWxldGUgZGVzYy52YWx1ZTtcbiAgZGVsZXRlIGRlc2Mud3JpdGFibGU7XG4gIGRlc2MuZ2V0ID0gKCkgPT4gdGFyZ2V0WyRQUk9YWV1bcHJvcGVydHldO1xuICByZXR1cm4gZGVzYztcbn1cbmZ1bmN0aW9uIHRyYWNrU2VsZih0YXJnZXQpIHtcbiAgZ2V0TGlzdGVuZXIoKSAmJiBnZXROb2RlKGdldE5vZGVzKHRhcmdldCwgJE5PREUpLCAkU0VMRikoKTtcbn1cbmZ1bmN0aW9uIG93bktleXModGFyZ2V0KSB7XG4gIHRyYWNrU2VsZih0YXJnZXQpO1xuICByZXR1cm4gUmVmbGVjdC5vd25LZXlzKHRhcmdldCk7XG59XG5jb25zdCBwcm94eVRyYXBzJDEgPSB7XG4gIGdldCh0YXJnZXQsIHByb3BlcnR5LCByZWNlaXZlcikge1xuICAgIGlmIChwcm9wZXJ0eSA9PT0gJFJBVykgcmV0dXJuIHRhcmdldDtcbiAgICBpZiAocHJvcGVydHkgPT09ICRQUk9YWSkgcmV0dXJuIHJlY2VpdmVyO1xuICAgIGlmIChwcm9wZXJ0eSA9PT0gJFRSQUNLKSB7XG4gICAgICB0cmFja1NlbGYodGFyZ2V0KTtcbiAgICAgIHJldHVybiByZWNlaXZlcjtcbiAgICB9XG4gICAgY29uc3Qgbm9kZXMgPSBnZXROb2Rlcyh0YXJnZXQsICROT0RFKTtcbiAgICBjb25zdCB0cmFja2VkID0gbm9kZXNbcHJvcGVydHldO1xuICAgIGxldCB2YWx1ZSA9IHRyYWNrZWQgPyB0cmFja2VkKCkgOiB0YXJnZXRbcHJvcGVydHldO1xuICAgIGlmIChwcm9wZXJ0eSA9PT0gJE5PREUgfHwgcHJvcGVydHkgPT09ICRIQVMgfHwgcHJvcGVydHkgPT09IFwiX19wcm90b19fXCIpIHJldHVybiB2YWx1ZTtcbiAgICBpZiAoIXRyYWNrZWQpIHtcbiAgICAgIGNvbnN0IGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHRhcmdldCwgcHJvcGVydHkpO1xuICAgICAgaWYgKFxuICAgICAgICBnZXRMaXN0ZW5lcigpICYmXG4gICAgICAgICh0eXBlb2YgdmFsdWUgIT09IFwiZnVuY3Rpb25cIiB8fCB0YXJnZXQuaGFzT3duUHJvcGVydHkocHJvcGVydHkpKSAmJlxuICAgICAgICAhKGRlc2MgJiYgZGVzYy5nZXQpXG4gICAgICApXG4gICAgICAgIHZhbHVlID0gZ2V0Tm9kZShub2RlcywgcHJvcGVydHksIHZhbHVlKSgpO1xuICAgIH1cbiAgICByZXR1cm4gaXNXcmFwcGFibGUodmFsdWUpID8gd3JhcCQxKHZhbHVlKSA6IHZhbHVlO1xuICB9LFxuICBoYXModGFyZ2V0LCBwcm9wZXJ0eSkge1xuICAgIGlmIChcbiAgICAgIHByb3BlcnR5ID09PSAkUkFXIHx8XG4gICAgICBwcm9wZXJ0eSA9PT0gJFBST1hZIHx8XG4gICAgICBwcm9wZXJ0eSA9PT0gJFRSQUNLIHx8XG4gICAgICBwcm9wZXJ0eSA9PT0gJE5PREUgfHxcbiAgICAgIHByb3BlcnR5ID09PSAkSEFTIHx8XG4gICAgICBwcm9wZXJ0eSA9PT0gXCJfX3Byb3RvX19cIlxuICAgIClcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIGdldExpc3RlbmVyKCkgJiYgZ2V0Tm9kZShnZXROb2Rlcyh0YXJnZXQsICRIQVMpLCBwcm9wZXJ0eSkoKTtcbiAgICByZXR1cm4gcHJvcGVydHkgaW4gdGFyZ2V0O1xuICB9LFxuICBzZXQoKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG4gIGRlbGV0ZVByb3BlcnR5KCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9LFxuICBvd25LZXlzOiBvd25LZXlzLFxuICBnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3I6IHByb3h5RGVzY3JpcHRvciQxXG59O1xuZnVuY3Rpb24gc2V0UHJvcGVydHkoc3RhdGUsIHByb3BlcnR5LCB2YWx1ZSwgZGVsZXRpbmcgPSBmYWxzZSkge1xuICBpZiAoIWRlbGV0aW5nICYmIHN0YXRlW3Byb3BlcnR5XSA9PT0gdmFsdWUpIHJldHVybjtcbiAgY29uc3QgcHJldiA9IHN0YXRlW3Byb3BlcnR5XSxcbiAgICBsZW4gPSBzdGF0ZS5sZW5ndGg7XG4gIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgZGVsZXRlIHN0YXRlW3Byb3BlcnR5XTtcbiAgICBpZiAoc3RhdGVbJEhBU10gJiYgc3RhdGVbJEhBU11bcHJvcGVydHldICYmIHByZXYgIT09IHVuZGVmaW5lZCkgc3RhdGVbJEhBU11bcHJvcGVydHldLiQoKTtcbiAgfSBlbHNlIHtcbiAgICBzdGF0ZVtwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgICBpZiAoc3RhdGVbJEhBU10gJiYgc3RhdGVbJEhBU11bcHJvcGVydHldICYmIHByZXYgPT09IHVuZGVmaW5lZCkgc3RhdGVbJEhBU11bcHJvcGVydHldLiQoKTtcbiAgfVxuICBsZXQgbm9kZXMgPSBnZXROb2RlcyhzdGF0ZSwgJE5PREUpLFxuICAgIG5vZGU7XG4gIGlmICgobm9kZSA9IGdldE5vZGUobm9kZXMsIHByb3BlcnR5LCBwcmV2KSkpIG5vZGUuJCgoKSA9PiB2YWx1ZSk7XG4gIGlmIChBcnJheS5pc0FycmF5KHN0YXRlKSAmJiBzdGF0ZS5sZW5ndGggIT09IGxlbikge1xuICAgIGZvciAobGV0IGkgPSBzdGF0ZS5sZW5ndGg7IGkgPCBsZW47IGkrKykgKG5vZGUgPSBub2Rlc1tpXSkgJiYgbm9kZS4kKCk7XG4gICAgKG5vZGUgPSBnZXROb2RlKG5vZGVzLCBcImxlbmd0aFwiLCBsZW4pKSAmJiBub2RlLiQoc3RhdGUubGVuZ3RoKTtcbiAgfVxuICAobm9kZSA9IG5vZGVzWyRTRUxGXSkgJiYgbm9kZS4kKCk7XG59XG5mdW5jdGlvbiBtZXJnZVN0b3JlTm9kZShzdGF0ZSwgdmFsdWUpIHtcbiAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHZhbHVlKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgY29uc3Qga2V5ID0ga2V5c1tpXTtcbiAgICBzZXRQcm9wZXJ0eShzdGF0ZSwga2V5LCB2YWx1ZVtrZXldKTtcbiAgfVxufVxuZnVuY3Rpb24gdXBkYXRlQXJyYXkoY3VycmVudCwgbmV4dCkge1xuICBpZiAodHlwZW9mIG5leHQgPT09IFwiZnVuY3Rpb25cIikgbmV4dCA9IG5leHQoY3VycmVudCk7XG4gIG5leHQgPSB1bndyYXAobmV4dCk7XG4gIGlmIChBcnJheS5pc0FycmF5KG5leHQpKSB7XG4gICAgaWYgKGN1cnJlbnQgPT09IG5leHQpIHJldHVybjtcbiAgICBsZXQgaSA9IDAsXG4gICAgICBsZW4gPSBuZXh0Lmxlbmd0aDtcbiAgICBmb3IgKDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IG5leHRbaV07XG4gICAgICBpZiAoY3VycmVudFtpXSAhPT0gdmFsdWUpIHNldFByb3BlcnR5KGN1cnJlbnQsIGksIHZhbHVlKTtcbiAgICB9XG4gICAgc2V0UHJvcGVydHkoY3VycmVudCwgXCJsZW5ndGhcIiwgbGVuKTtcbiAgfSBlbHNlIG1lcmdlU3RvcmVOb2RlKGN1cnJlbnQsIG5leHQpO1xufVxuZnVuY3Rpb24gdXBkYXRlUGF0aChjdXJyZW50LCBwYXRoLCB0cmF2ZXJzZWQgPSBbXSkge1xuICBsZXQgcGFydCxcbiAgICBwcmV2ID0gY3VycmVudDtcbiAgaWYgKHBhdGgubGVuZ3RoID4gMSkge1xuICAgIHBhcnQgPSBwYXRoLnNoaWZ0KCk7XG4gICAgY29uc3QgcGFydFR5cGUgPSB0eXBlb2YgcGFydCxcbiAgICAgIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5KGN1cnJlbnQpO1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBhcnQpKSB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdXBkYXRlUGF0aChjdXJyZW50LCBbcGFydFtpXV0uY29uY2F0KHBhdGgpLCB0cmF2ZXJzZWQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheSAmJiBwYXJ0VHlwZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN1cnJlbnQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHBhcnQoY3VycmVudFtpXSwgaSkpIHVwZGF0ZVBhdGgoY3VycmVudCwgW2ldLmNvbmNhdChwYXRoKSwgdHJhdmVyc2VkKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXkgJiYgcGFydFR5cGUgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgIGNvbnN0IHsgZnJvbSA9IDAsIHRvID0gY3VycmVudC5sZW5ndGggLSAxLCBieSA9IDEgfSA9IHBhcnQ7XG4gICAgICBmb3IgKGxldCBpID0gZnJvbTsgaSA8PSB0bzsgaSArPSBieSkge1xuICAgICAgICB1cGRhdGVQYXRoKGN1cnJlbnQsIFtpXS5jb25jYXQocGF0aCksIHRyYXZlcnNlZCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIGlmIChwYXRoLmxlbmd0aCA+IDEpIHtcbiAgICAgIHVwZGF0ZVBhdGgoY3VycmVudFtwYXJ0XSwgcGF0aCwgW3BhcnRdLmNvbmNhdCh0cmF2ZXJzZWQpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcHJldiA9IGN1cnJlbnRbcGFydF07XG4gICAgdHJhdmVyc2VkID0gW3BhcnRdLmNvbmNhdCh0cmF2ZXJzZWQpO1xuICB9XG4gIGxldCB2YWx1ZSA9IHBhdGhbMF07XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHZhbHVlID0gdmFsdWUocHJldiwgdHJhdmVyc2VkKTtcbiAgICBpZiAodmFsdWUgPT09IHByZXYpIHJldHVybjtcbiAgfVxuICBpZiAocGFydCA9PT0gdW5kZWZpbmVkICYmIHZhbHVlID09IHVuZGVmaW5lZCkgcmV0dXJuO1xuICB2YWx1ZSA9IHVud3JhcCh2YWx1ZSk7XG4gIGlmIChwYXJ0ID09PSB1bmRlZmluZWQgfHwgKGlzV3JhcHBhYmxlKHByZXYpICYmIGlzV3JhcHBhYmxlKHZhbHVlKSAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSkpKSB7XG4gICAgbWVyZ2VTdG9yZU5vZGUocHJldiwgdmFsdWUpO1xuICB9IGVsc2Ugc2V0UHJvcGVydHkoY3VycmVudCwgcGFydCwgdmFsdWUpO1xufVxuZnVuY3Rpb24gY3JlYXRlU3RvcmUoLi4uW3N0b3JlLCBvcHRpb25zXSkge1xuICBjb25zdCB1bndyYXBwZWRTdG9yZSA9IHVud3JhcChzdG9yZSB8fCB7fSk7XG4gIGNvbnN0IGlzQXJyYXkgPSBBcnJheS5pc0FycmF5KHVud3JhcHBlZFN0b3JlKTtcbiAgY29uc3Qgd3JhcHBlZFN0b3JlID0gd3JhcCQxKHVud3JhcHBlZFN0b3JlKTtcbiAgZnVuY3Rpb24gc2V0U3RvcmUoLi4uYXJncykge1xuICAgIGJhdGNoKCgpID0+IHtcbiAgICAgIGlzQXJyYXkgJiYgYXJncy5sZW5ndGggPT09IDFcbiAgICAgICAgPyB1cGRhdGVBcnJheSh1bndyYXBwZWRTdG9yZSwgYXJnc1swXSlcbiAgICAgICAgOiB1cGRhdGVQYXRoKHVud3JhcHBlZFN0b3JlLCBhcmdzKTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gW3dyYXBwZWRTdG9yZSwgc2V0U3RvcmVdO1xufVxuXG5mdW5jdGlvbiBwcm94eURlc2NyaXB0b3IodGFyZ2V0LCBwcm9wZXJ0eSkge1xuICBjb25zdCBkZXNjID0gUmVmbGVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodGFyZ2V0LCBwcm9wZXJ0eSk7XG4gIGlmIChcbiAgICAhZGVzYyB8fFxuICAgIGRlc2MuZ2V0IHx8XG4gICAgZGVzYy5zZXQgfHxcbiAgICAhZGVzYy5jb25maWd1cmFibGUgfHxcbiAgICBwcm9wZXJ0eSA9PT0gJFBST1hZIHx8XG4gICAgcHJvcGVydHkgPT09ICROT0RFXG4gIClcbiAgICByZXR1cm4gZGVzYztcbiAgZGVsZXRlIGRlc2MudmFsdWU7XG4gIGRlbGV0ZSBkZXNjLndyaXRhYmxlO1xuICBkZXNjLmdldCA9ICgpID0+IHRhcmdldFskUFJPWFldW3Byb3BlcnR5XTtcbiAgZGVzYy5zZXQgPSB2ID0+ICh0YXJnZXRbJFBST1hZXVtwcm9wZXJ0eV0gPSB2KTtcbiAgcmV0dXJuIGRlc2M7XG59XG5jb25zdCBwcm94eVRyYXBzID0ge1xuICBnZXQodGFyZ2V0LCBwcm9wZXJ0eSwgcmVjZWl2ZXIpIHtcbiAgICBpZiAocHJvcGVydHkgPT09ICRSQVcpIHJldHVybiB0YXJnZXQ7XG4gICAgaWYgKHByb3BlcnR5ID09PSAkUFJPWFkpIHJldHVybiByZWNlaXZlcjtcbiAgICBpZiAocHJvcGVydHkgPT09ICRUUkFDSykge1xuICAgICAgdHJhY2tTZWxmKHRhcmdldCk7XG4gICAgICByZXR1cm4gcmVjZWl2ZXI7XG4gICAgfVxuICAgIGNvbnN0IG5vZGVzID0gZ2V0Tm9kZXModGFyZ2V0LCAkTk9ERSk7XG4gICAgY29uc3QgdHJhY2tlZCA9IG5vZGVzW3Byb3BlcnR5XTtcbiAgICBsZXQgdmFsdWUgPSB0cmFja2VkID8gdHJhY2tlZCgpIDogdGFyZ2V0W3Byb3BlcnR5XTtcbiAgICBpZiAocHJvcGVydHkgPT09ICROT0RFIHx8IHByb3BlcnR5ID09PSAkSEFTIHx8IHByb3BlcnR5ID09PSBcIl9fcHJvdG9fX1wiKSByZXR1cm4gdmFsdWU7XG4gICAgaWYgKCF0cmFja2VkKSB7XG4gICAgICBjb25zdCBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih0YXJnZXQsIHByb3BlcnR5KTtcbiAgICAgIGNvbnN0IGlzRnVuY3Rpb24gPSB0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIjtcbiAgICAgIGlmIChnZXRMaXN0ZW5lcigpICYmICghaXNGdW5jdGlvbiB8fCB0YXJnZXQuaGFzT3duUHJvcGVydHkocHJvcGVydHkpKSAmJiAhKGRlc2MgJiYgZGVzYy5nZXQpKVxuICAgICAgICB2YWx1ZSA9IGdldE5vZGUobm9kZXMsIHByb3BlcnR5LCB2YWx1ZSkoKTtcbiAgICAgIGVsc2UgaWYgKHZhbHVlICE9IG51bGwgJiYgaXNGdW5jdGlvbiAmJiB2YWx1ZSA9PT0gQXJyYXkucHJvdG90eXBlW3Byb3BlcnR5XSkge1xuICAgICAgICByZXR1cm4gKC4uLmFyZ3MpID0+IGJhdGNoKCgpID0+IEFycmF5LnByb3RvdHlwZVtwcm9wZXJ0eV0uYXBwbHkocmVjZWl2ZXIsIGFyZ3MpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGlzV3JhcHBhYmxlKHZhbHVlKSA/IHdyYXAodmFsdWUpIDogdmFsdWU7XG4gIH0sXG4gIGhhcyh0YXJnZXQsIHByb3BlcnR5KSB7XG4gICAgaWYgKFxuICAgICAgcHJvcGVydHkgPT09ICRSQVcgfHxcbiAgICAgIHByb3BlcnR5ID09PSAkUFJPWFkgfHxcbiAgICAgIHByb3BlcnR5ID09PSAkVFJBQ0sgfHxcbiAgICAgIHByb3BlcnR5ID09PSAkTk9ERSB8fFxuICAgICAgcHJvcGVydHkgPT09ICRIQVMgfHxcbiAgICAgIHByb3BlcnR5ID09PSBcIl9fcHJvdG9fX1wiXG4gICAgKVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgZ2V0TGlzdGVuZXIoKSAmJiBnZXROb2RlKGdldE5vZGVzKHRhcmdldCwgJEhBUyksIHByb3BlcnR5KSgpO1xuICAgIHJldHVybiBwcm9wZXJ0eSBpbiB0YXJnZXQ7XG4gIH0sXG4gIHNldCh0YXJnZXQsIHByb3BlcnR5LCB2YWx1ZSkge1xuICAgIGJhdGNoKCgpID0+IHNldFByb3BlcnR5KHRhcmdldCwgcHJvcGVydHksIHVud3JhcCh2YWx1ZSkpKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSxcbiAgZGVsZXRlUHJvcGVydHkodGFyZ2V0LCBwcm9wZXJ0eSkge1xuICAgIGJhdGNoKCgpID0+IHNldFByb3BlcnR5KHRhcmdldCwgcHJvcGVydHksIHVuZGVmaW5lZCwgdHJ1ZSkpO1xuICAgIHJldHVybiB0cnVlO1xuICB9LFxuICBvd25LZXlzOiBvd25LZXlzLFxuICBnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3I6IHByb3h5RGVzY3JpcHRvclxufTtcbmZ1bmN0aW9uIHdyYXAodmFsdWUpIHtcbiAgbGV0IHAgPSB2YWx1ZVskUFJPWFldO1xuICBpZiAoIXApIHtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodmFsdWUsICRQUk9YWSwge1xuICAgICAgdmFsdWU6IChwID0gbmV3IFByb3h5KHZhbHVlLCBwcm94eVRyYXBzKSlcbiAgICB9KTtcbiAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpLFxuICAgICAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzKHZhbHVlKTtcbiAgICBjb25zdCBwcm90byA9IE9iamVjdC5nZXRQcm90b3R5cGVPZih2YWx1ZSk7XG4gICAgY29uc3QgaXNDbGFzcyA9XG4gICAgICB2YWx1ZSAhPT0gbnVsbCAmJlxuICAgICAgdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmXG4gICAgICAhQXJyYXkuaXNBcnJheSh2YWx1ZSkgJiZcbiAgICAgIHByb3RvICE9PSBPYmplY3QucHJvdG90eXBlO1xuICAgIGlmIChpc0NsYXNzKSB7XG4gICAgICBjb25zdCBkZXNjcmlwdG9ycyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzKHByb3RvKTtcbiAgICAgIGtleXMucHVzaCguLi5PYmplY3Qua2V5cyhkZXNjcmlwdG9ycykpO1xuICAgICAgT2JqZWN0LmFzc2lnbihkZXNjLCBkZXNjcmlwdG9ycyk7XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwLCBsID0ga2V5cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIGNvbnN0IHByb3AgPSBrZXlzW2ldO1xuICAgICAgaWYgKGlzQ2xhc3MgJiYgcHJvcCA9PT0gXCJjb25zdHJ1Y3RvclwiKSBjb250aW51ZTtcbiAgICAgIGlmIChkZXNjW3Byb3BdLmdldCkge1xuICAgICAgICBjb25zdCBnZXQgPSBkZXNjW3Byb3BdLmdldC5iaW5kKHApO1xuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodmFsdWUsIHByb3AsIHtcbiAgICAgICAgICBnZXQsXG4gICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgaWYgKGRlc2NbcHJvcF0uc2V0KSB7XG4gICAgICAgIGNvbnN0IG9nID0gZGVzY1twcm9wXS5zZXQsXG4gICAgICAgICAgc2V0ID0gdiA9PiBiYXRjaCgoKSA9PiBvZy5jYWxsKHAsIHYpKTtcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHZhbHVlLCBwcm9wLCB7XG4gICAgICAgICAgc2V0LFxuICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHA7XG59XG5mdW5jdGlvbiBjcmVhdGVNdXRhYmxlKHN0YXRlLCBvcHRpb25zKSB7XG4gIGNvbnN0IHVud3JhcHBlZFN0b3JlID0gdW53cmFwKHN0YXRlIHx8IHt9KTtcbiAgY29uc3Qgd3JhcHBlZFN0b3JlID0gd3JhcCh1bndyYXBwZWRTdG9yZSk7XG4gIHJldHVybiB3cmFwcGVkU3RvcmU7XG59XG5mdW5jdGlvbiBtb2RpZnlNdXRhYmxlKHN0YXRlLCBtb2RpZmllcikge1xuICBiYXRjaCgoKSA9PiBtb2RpZmllcih1bndyYXAoc3RhdGUpKSk7XG59XG5cbmNvbnN0ICRST09UID0gU3ltYm9sKFwic3RvcmUtcm9vdFwiKTtcbmZ1bmN0aW9uIGFwcGx5U3RhdGUodGFyZ2V0LCBwYXJlbnQsIHByb3BlcnR5LCBtZXJnZSwga2V5KSB7XG4gIGNvbnN0IHByZXZpb3VzID0gcGFyZW50W3Byb3BlcnR5XTtcbiAgaWYgKHRhcmdldCA9PT0gcHJldmlvdXMpIHJldHVybjtcbiAgY29uc3QgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkodGFyZ2V0KTtcbiAgaWYgKFxuICAgIHByb3BlcnR5ICE9PSAkUk9PVCAmJlxuICAgICghaXNXcmFwcGFibGUodGFyZ2V0KSB8fFxuICAgICAgIWlzV3JhcHBhYmxlKHByZXZpb3VzKSB8fFxuICAgICAgaXNBcnJheSAhPT0gQXJyYXkuaXNBcnJheShwcmV2aW91cykgfHxcbiAgICAgIChrZXkgJiYgdGFyZ2V0W2tleV0gIT09IHByZXZpb3VzW2tleV0pKVxuICApIHtcbiAgICBzZXRQcm9wZXJ0eShwYXJlbnQsIHByb3BlcnR5LCB0YXJnZXQpO1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoaXNBcnJheSkge1xuICAgIGlmIChcbiAgICAgIHRhcmdldC5sZW5ndGggJiZcbiAgICAgIHByZXZpb3VzLmxlbmd0aCAmJlxuICAgICAgKCFtZXJnZSB8fCAoa2V5ICYmIHRhcmdldFswXSAmJiB0YXJnZXRbMF1ba2V5XSAhPSBudWxsKSlcbiAgICApIHtcbiAgICAgIGxldCBpLCBqLCBzdGFydCwgZW5kLCBuZXdFbmQsIGl0ZW0sIG5ld0luZGljZXNOZXh0LCBrZXlWYWw7XG4gICAgICBmb3IgKFxuICAgICAgICBzdGFydCA9IDAsIGVuZCA9IE1hdGgubWluKHByZXZpb3VzLmxlbmd0aCwgdGFyZ2V0Lmxlbmd0aCk7XG4gICAgICAgIHN0YXJ0IDwgZW5kICYmXG4gICAgICAgIChwcmV2aW91c1tzdGFydF0gPT09IHRhcmdldFtzdGFydF0gfHxcbiAgICAgICAgICAoa2V5ICYmIHByZXZpb3VzW3N0YXJ0XSAmJiB0YXJnZXRbc3RhcnRdICYmIHByZXZpb3VzW3N0YXJ0XVtrZXldID09PSB0YXJnZXRbc3RhcnRdW2tleV0pKTtcbiAgICAgICAgc3RhcnQrK1xuICAgICAgKSB7XG4gICAgICAgIGFwcGx5U3RhdGUodGFyZ2V0W3N0YXJ0XSwgcHJldmlvdXMsIHN0YXJ0LCBtZXJnZSwga2V5KTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHRlbXAgPSBuZXcgQXJyYXkodGFyZ2V0Lmxlbmd0aCksXG4gICAgICAgIG5ld0luZGljZXMgPSBuZXcgTWFwKCk7XG4gICAgICBmb3IgKFxuICAgICAgICBlbmQgPSBwcmV2aW91cy5sZW5ndGggLSAxLCBuZXdFbmQgPSB0YXJnZXQubGVuZ3RoIC0gMTtcbiAgICAgICAgZW5kID49IHN0YXJ0ICYmXG4gICAgICAgIG5ld0VuZCA+PSBzdGFydCAmJlxuICAgICAgICAocHJldmlvdXNbZW5kXSA9PT0gdGFyZ2V0W25ld0VuZF0gfHxcbiAgICAgICAgICAoa2V5ICYmIHByZXZpb3VzW3N0YXJ0XSAmJiB0YXJnZXRbc3RhcnRdICYmIHByZXZpb3VzW2VuZF1ba2V5XSA9PT0gdGFyZ2V0W25ld0VuZF1ba2V5XSkpO1xuICAgICAgICBlbmQtLSwgbmV3RW5kLS1cbiAgICAgICkge1xuICAgICAgICB0ZW1wW25ld0VuZF0gPSBwcmV2aW91c1tlbmRdO1xuICAgICAgfVxuICAgICAgaWYgKHN0YXJ0ID4gbmV3RW5kIHx8IHN0YXJ0ID4gZW5kKSB7XG4gICAgICAgIGZvciAoaiA9IHN0YXJ0OyBqIDw9IG5ld0VuZDsgaisrKSBzZXRQcm9wZXJ0eShwcmV2aW91cywgaiwgdGFyZ2V0W2pdKTtcbiAgICAgICAgZm9yICg7IGogPCB0YXJnZXQubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBzZXRQcm9wZXJ0eShwcmV2aW91cywgaiwgdGVtcFtqXSk7XG4gICAgICAgICAgYXBwbHlTdGF0ZSh0YXJnZXRbal0sIHByZXZpb3VzLCBqLCBtZXJnZSwga2V5KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocHJldmlvdXMubGVuZ3RoID4gdGFyZ2V0Lmxlbmd0aCkgc2V0UHJvcGVydHkocHJldmlvdXMsIFwibGVuZ3RoXCIsIHRhcmdldC5sZW5ndGgpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBuZXdJbmRpY2VzTmV4dCA9IG5ldyBBcnJheShuZXdFbmQgKyAxKTtcbiAgICAgIGZvciAoaiA9IG5ld0VuZDsgaiA+PSBzdGFydDsgai0tKSB7XG4gICAgICAgIGl0ZW0gPSB0YXJnZXRbal07XG4gICAgICAgIGtleVZhbCA9IGtleSAmJiBpdGVtID8gaXRlbVtrZXldIDogaXRlbTtcbiAgICAgICAgaSA9IG5ld0luZGljZXMuZ2V0KGtleVZhbCk7XG4gICAgICAgIG5ld0luZGljZXNOZXh0W2pdID0gaSA9PT0gdW5kZWZpbmVkID8gLTEgOiBpO1xuICAgICAgICBuZXdJbmRpY2VzLnNldChrZXlWYWwsIGopO1xuICAgICAgfVxuICAgICAgZm9yIChpID0gc3RhcnQ7IGkgPD0gZW5kOyBpKyspIHtcbiAgICAgICAgaXRlbSA9IHByZXZpb3VzW2ldO1xuICAgICAgICBrZXlWYWwgPSBrZXkgJiYgaXRlbSA/IGl0ZW1ba2V5XSA6IGl0ZW07XG4gICAgICAgIGogPSBuZXdJbmRpY2VzLmdldChrZXlWYWwpO1xuICAgICAgICBpZiAoaiAhPT0gdW5kZWZpbmVkICYmIGogIT09IC0xKSB7XG4gICAgICAgICAgdGVtcFtqXSA9IHByZXZpb3VzW2ldO1xuICAgICAgICAgIGogPSBuZXdJbmRpY2VzTmV4dFtqXTtcbiAgICAgICAgICBuZXdJbmRpY2VzLnNldChrZXlWYWwsIGopO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBmb3IgKGogPSBzdGFydDsgaiA8IHRhcmdldC5sZW5ndGg7IGorKykge1xuICAgICAgICBpZiAoaiBpbiB0ZW1wKSB7XG4gICAgICAgICAgc2V0UHJvcGVydHkocHJldmlvdXMsIGosIHRlbXBbal0pO1xuICAgICAgICAgIGFwcGx5U3RhdGUodGFyZ2V0W2pdLCBwcmV2aW91cywgaiwgbWVyZ2UsIGtleSk7XG4gICAgICAgIH0gZWxzZSBzZXRQcm9wZXJ0eShwcmV2aW91cywgaiwgdGFyZ2V0W2pdKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IHRhcmdldC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICBhcHBseVN0YXRlKHRhcmdldFtpXSwgcHJldmlvdXMsIGksIG1lcmdlLCBrZXkpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAocHJldmlvdXMubGVuZ3RoID4gdGFyZ2V0Lmxlbmd0aCkgc2V0UHJvcGVydHkocHJldmlvdXMsIFwibGVuZ3RoXCIsIHRhcmdldC5sZW5ndGgpO1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCB0YXJnZXRLZXlzID0gT2JqZWN0LmtleXModGFyZ2V0KTtcbiAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IHRhcmdldEtleXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBhcHBseVN0YXRlKHRhcmdldFt0YXJnZXRLZXlzW2ldXSwgcHJldmlvdXMsIHRhcmdldEtleXNbaV0sIG1lcmdlLCBrZXkpO1xuICB9XG4gIGNvbnN0IHByZXZpb3VzS2V5cyA9IE9iamVjdC5rZXlzKHByZXZpb3VzKTtcbiAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IHByZXZpb3VzS2V5cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgIGlmICh0YXJnZXRbcHJldmlvdXNLZXlzW2ldXSA9PT0gdW5kZWZpbmVkKSBzZXRQcm9wZXJ0eShwcmV2aW91cywgcHJldmlvdXNLZXlzW2ldLCB1bmRlZmluZWQpO1xuICB9XG59XG5mdW5jdGlvbiByZWNvbmNpbGUodmFsdWUsIG9wdGlvbnMgPSB7fSkge1xuICBjb25zdCB7IG1lcmdlLCBrZXkgPSBcImlkXCIgfSA9IG9wdGlvbnMsXG4gICAgdiA9IHVud3JhcCh2YWx1ZSk7XG4gIHJldHVybiBzdGF0ZSA9PiB7XG4gICAgaWYgKCFpc1dyYXBwYWJsZShzdGF0ZSkgfHwgIWlzV3JhcHBhYmxlKHYpKSByZXR1cm4gdjtcbiAgICBjb25zdCByZXMgPSBhcHBseVN0YXRlKFxuICAgICAgdixcbiAgICAgIHtcbiAgICAgICAgWyRST09UXTogc3RhdGVcbiAgICAgIH0sXG4gICAgICAkUk9PVCxcbiAgICAgIG1lcmdlLFxuICAgICAga2V5XG4gICAgKTtcbiAgICByZXR1cm4gcmVzID09PSB1bmRlZmluZWQgPyBzdGF0ZSA6IHJlcztcbiAgfTtcbn1cbmNvbnN0IHByb2R1Y2VycyA9IG5ldyBXZWFrTWFwKCk7XG5jb25zdCBzZXR0ZXJUcmFwcyA9IHtcbiAgZ2V0KHRhcmdldCwgcHJvcGVydHkpIHtcbiAgICBpZiAocHJvcGVydHkgPT09ICRSQVcpIHJldHVybiB0YXJnZXQ7XG4gICAgY29uc3QgdmFsdWUgPSB0YXJnZXRbcHJvcGVydHldO1xuICAgIGxldCBwcm94eTtcbiAgICByZXR1cm4gaXNXcmFwcGFibGUodmFsdWUpXG4gICAgICA/IHByb2R1Y2Vycy5nZXQodmFsdWUpIHx8XG4gICAgICAgICAgKHByb2R1Y2Vycy5zZXQodmFsdWUsIChwcm94eSA9IG5ldyBQcm94eSh2YWx1ZSwgc2V0dGVyVHJhcHMpKSksIHByb3h5KVxuICAgICAgOiB2YWx1ZTtcbiAgfSxcbiAgc2V0KHRhcmdldCwgcHJvcGVydHksIHZhbHVlKSB7XG4gICAgc2V0UHJvcGVydHkodGFyZ2V0LCBwcm9wZXJ0eSwgdW53cmFwKHZhbHVlKSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG4gIGRlbGV0ZVByb3BlcnR5KHRhcmdldCwgcHJvcGVydHkpIHtcbiAgICBzZXRQcm9wZXJ0eSh0YXJnZXQsIHByb3BlcnR5LCB1bmRlZmluZWQsIHRydWUpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG59O1xuZnVuY3Rpb24gcHJvZHVjZShmbikge1xuICByZXR1cm4gc3RhdGUgPT4ge1xuICAgIGlmIChpc1dyYXBwYWJsZShzdGF0ZSkpIHtcbiAgICAgIGxldCBwcm94eTtcbiAgICAgIGlmICghKHByb3h5ID0gcHJvZHVjZXJzLmdldChzdGF0ZSkpKSB7XG4gICAgICAgIHByb2R1Y2Vycy5zZXQoc3RhdGUsIChwcm94eSA9IG5ldyBQcm94eShzdGF0ZSwgc2V0dGVyVHJhcHMpKSk7XG4gICAgICB9XG4gICAgICBmbihwcm94eSk7XG4gICAgfVxuICAgIHJldHVybiBzdGF0ZTtcbiAgfTtcbn1cblxuY29uc3QgREVWID0gdW5kZWZpbmVkO1xuXG5leHBvcnQgeyAkUkFXLCBERVYsIGNyZWF0ZU11dGFibGUsIGNyZWF0ZVN0b3JlLCBtb2RpZnlNdXRhYmxlLCBwcm9kdWNlLCByZWNvbmNpbGUsIHVud3JhcCB9O1xuIiwiaW1wb3J0IHsgTW9kaWZpZWREYXRhdmlld1F1ZXJ5UmVzdWx0IH0gZnJvbSBcIkAvbGliL3R5cGVzXCI7XHJcblxyXG4vKipcclxuICogUGxhY2Vob2xkZXIgZm9yIGNvbXBsZXggcHJvcGVydGllcyBmcm9tIGEgRGF0YXZpZXcgcXVlcnlcclxuICogYGBgXHJcbiAqIFRBQkxFIERhdGUoY29tcGxleDEpLCBzdW0oY29tcGxleDIpIC0gM1xyXG4gKiBGUk9NICNzb21lVGFnXHJcbiAqIFdIRVJFIHRydWVcclxuICogYGBgXHJcbiAqIC0tLVxyXG4gKiBgXCJmaWxlLmNvbXBsZXgtcHJvcGVydHlcImBcclxuICpcclxuICogdGhpcyB3b3VsZCBiZSBpbnZhbGlkIHRvIHVzZSBhcyBhIHByb3BlcnR5IG5hbWUgaW5cclxuICogRGF0YXZpZXcsIHNvIHRoaXMgaXMgc2FmZSB0byB1c2UgYXMgYW4gaWRlbnRpZmllclxyXG4gKiBiZXR3ZWVuIGZ1bmN0aW9uc1xyXG4gKi9cclxuZXhwb3J0IGNvbnN0IENPTVBMRVhfUFJPUEVSVFlfUExBQ0VIT0xERVIgPSBcImZpbGUuY29tcGxleC1wcm9wZXJ0eVwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IGRlZmF1bHRRdWVyeVJlc3VsdDogTW9kaWZpZWREYXRhdmlld1F1ZXJ5UmVzdWx0ID0ge1xyXG4gIHN1Y2Nlc3NmdWw6IHRydWUsXHJcbiAgdmFsdWU6IHtcclxuICAgIGhlYWRlcnM6IFtcIlwiXSxcclxuICAgIHZhbHVlczogW1tudWxsXV0sXHJcbiAgICB0eXBlOiBcInRhYmxlXCIsXHJcbiAgfSxcclxuICB0cnVlUHJvcGVydHlOYW1lczogW10sXHJcbn07XHJcbiIsImltcG9ydCB7XHJcbiAgQXBwLFxyXG4gIE5vdGljZSxcclxuICBwYXJzZVlhbWwsXHJcbiAgUGx1Z2luLFxyXG4gIHN0cmluZ2lmeVlhbWwsXHJcbiAgVEZpbGUsXHJcbiAgVmF1bHQsXHJcbn0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7XHJcbiAgRGF0YUFycmF5LFxyXG4gIERhdGF2aWV3QVBJLFxyXG4gIERhdGF2aWV3TGluayxcclxuICBEYXRhdmlld1Byb3BlcnR5VmFsdWVOb3RMaW5rLFxyXG4gIFByb3BlcnR5SW5mbyxcclxuICBQcm9wZXJ0eVZhbHVlVHlwZSxcclxufSBmcm9tIFwiLi90eXBlc1wiO1xyXG5pbXBvcnQgeyBEYXRlVGltZSB9IGZyb20gXCJsdXhvblwiO1xyXG5pbXBvcnQgeyBDT01QTEVYX1BST1BFUlRZX1BMQUNFSE9MREVSIH0gZnJvbSBcIi4vY29uc3RhbnRzXCI7XHJcbmltcG9ydCB7IENvZGVCbG9ja0luZm8gfSBmcm9tIFwiQC9ob29rcy91c2VEYXRhRWRpdFwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IGNsYW1wTnVtYmVyID0gKG46IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKSA9PiB7XHJcbiAgaWYgKG4gPCBtaW4pIHJldHVybiBtaW47XHJcbiAgaWYgKG4gPiBtYXgpIHJldHVybiBtYXg7XHJcbiAgcmV0dXJuIG47XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgdG9OdW1iZXIgPSAoXHJcbiAgdjogdW5rbm93bixcclxuICBkZWZhdWx0TnVtYmVyPzogbnVtYmVyLFxyXG4gIG1pbj86IG51bWJlcixcclxuICBtYXg/OiBudW1iZXIsXHJcbiAgdmFsaWRhdG9yPzogKHZhbDogdW5rbm93biwgbnVtOiBudW1iZXIpID0+IGJvb2xlYW4sXHJcbikgPT4ge1xyXG4gIGNvbnN0IG51bSA9IE51bWJlcih2KTtcclxuICBpZiAoTnVtYmVyLmlzTmFOKG51bSkpIHJldHVybiBkZWZhdWx0TnVtYmVyID8/IDA7XHJcbiAgaWYgKHZhbGlkYXRvcikge1xyXG4gICAgaWYgKCF2YWxpZGF0b3IodiwgbnVtKSkgcmV0dXJuIGRlZmF1bHROdW1iZXIgPz8gMDtcclxuICB9XHJcbiAgaWYgKG1pbiAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICBpZiAobnVtIDwgbWluKSByZXR1cm4gbWluO1xyXG4gIH1cclxuICBpZiAobWF4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgIGlmIChudW0gPiBtYXgpIHJldHVybiBtYXg7XHJcbiAgfVxyXG4gIHJldHVybiBudW07XHJcbn07XHJcblxyXG4vKipcclxuICogQ2hlY2tzIGlmIGEgbHV4b24gRGF0ZVRpbWUgaGFzIGEgbm9uLXplcm8gdGltZSB2YWx1ZVxyXG4gKiBAcGFyYW0gZHQgbHV4b24gRGF0ZVRpbWVcclxuICogQHJldHVybnMgYHRydWVgIGlmIHRpbWUgaXMgbm90IGFsbCB6ZXJvZXMsIGZhbHNlIG90aGVyd2lzZVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGNoZWNrSWZEYXRlSGFzVGltZSA9IChkdDogRGF0ZVRpbWUpID0+IHtcclxuICBjb25zdCBpc1RpbWUgPSBkdC5ob3VyICE9PSAwIHx8IGR0Lm1pbnV0ZSAhPT0gMCB8fCBkdC5zZWNvbmQgIT09IDA7XHJcbiAgcmV0dXJuIGlzVGltZTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBnZXRWYWx1ZVR5cGU6IChcclxuICB2YWx1ZTogdW5rbm93bixcclxuICBwcm9wZXJ0eTogc3RyaW5nLFxyXG4gIGx1eG9uOiBEYXRhdmlld0FQSVtcImx1eG9uXCJdLFxyXG4pID0+IFByb3BlcnR5VmFsdWVUeXBlID0gKHZhbHVlLCBwcm9wZXJ0eSwgbHV4b24pID0+IHtcclxuICBjb25zdCB0ID0gdHlwZW9mIHZhbHVlO1xyXG4gIGlmICh0ID09PSBcInN0cmluZ1wiKSByZXR1cm4gXCJ0ZXh0XCI7XHJcbiAgaWYgKHQgPT09IFwibnVtYmVyXCIpIHJldHVybiBcIm51bWJlclwiO1xyXG4gIGlmICh0ID09PSBcImJvb2xlYW5cIikgcmV0dXJuIFwiY2hlY2tib3hcIjtcclxuICBpZiAodCA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgLy8gY29uc29sZS5sb2coXCJvYmplY3QgdmFsdWU6IFwiLCB2YWx1ZSk7XHJcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcclxuICAgICAgcmV0dXJuIHByb3BlcnR5ID09PSBcInRhZ3NcIiA/IFwidGFnc1wiIDogXCJsaXN0XCI7XHJcbiAgICB9XHJcbiAgICBpZiAobHV4b24uRGF0ZVRpbWUuaXNEYXRlVGltZSh2YWx1ZSkpIHtcclxuICAgICAgY29uc3QgZHQgPSB2YWx1ZSBhcyB1bmtub3duIGFzIERhdGVUaW1lO1xyXG4gICAgICBjb25zdCBpc1RpbWUgPSBjaGVja0lmRGF0ZUhhc1RpbWUoZHQpO1xyXG4gICAgICByZXR1cm4gaXNUaW1lID8gXCJkYXRldGltZVwiIDogXCJkYXRlXCI7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gXCJ0ZXh0XCI7XHJcbiAgfVxyXG4gIHRocm93IG5ldyBFcnJvcihcIkZhaWxlZCB0byBnZXQgcHJvcGVydHkgdmFsdWUgdHlwZVwiKTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCByZWdpc3RlckRhdGF2aWV3RXZlbnRzID0gKFxyXG4gIHBsdWdpbjogUGx1Z2luLFxyXG4gIGNhbGxiYWNrOiAoKSA9PiB1bmtub3duLFxyXG4pID0+IHtcclxuICBwbHVnaW4uYXBwLm1ldGFkYXRhQ2FjaGUub24oXCJkYXRhdmlldzppbmRleC1yZWFkeVwiIGFzIFwiY2hhbmdlZFwiLCBjYWxsYmFjayk7XHJcblxyXG4gIHBsdWdpbi5hcHAubWV0YWRhdGFDYWNoZS5vbihcclxuICAgIFwiZGF0YXZpZXc6bWV0YWRhdGEtY2hhbmdlXCIgYXMgXCJjaGFuZ2VkXCIsXHJcbiAgICBjYWxsYmFjayxcclxuICApO1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IHVucmVnaXN0ZXJEYXRhdmlld0V2ZW50cyA9IChcclxuICBwbHVnaW46IFBsdWdpbixcclxuICBjYWxsYmFjazogKCkgPT4gdW5rbm93bixcclxuKSA9PiB7XHJcbiAgcGx1Z2luLmFwcC5tZXRhZGF0YUNhY2hlLm9mZihcImRhdGF2aWV3OmluZGV4LXJlYWR5XCIgYXMgXCJjaGFuZ2VkXCIsIGNhbGxiYWNrKTtcclxuXHJcbiAgcGx1Z2luLmFwcC5tZXRhZGF0YUNhY2hlLm9mZihcclxuICAgIFwiZGF0YXZpZXc6bWV0YWRhdGEtY2hhbmdlXCIgYXMgXCJjaGFuZ2VkXCIsXHJcbiAgICBjYWxsYmFjayxcclxuICApO1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IGdldElkQ29sdW1uSW5kZXggPSAoXHJcbiAgaGVhZGVyczogc3RyaW5nW10sXHJcbiAgdGFibGVJZENvbHVtbk5hbWU6IHN0cmluZyxcclxuKSA9PiB7XHJcbiAgY29uc3QgaSA9IGhlYWRlcnMuZmluZEluZGV4KFxyXG4gICAgKGgpID0+XHJcbiAgICAgIGgudG9Mb3dlckNhc2UoKSA9PT0gdGFibGVJZENvbHVtbk5hbWUudG9Mb3dlckNhc2UoKSB8fCBoID09PSBcImZpbGUubGlua1wiLFxyXG4gICk7XHJcbiAgaWYgKGkgPT09IC0xKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBmaW5lIElEIGNvbHVtbiBpbmRleFwiKTtcclxuICB9XHJcbiAgcmV0dXJuIGk7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgY2hlY2tJZkRhdGF2aWV3TGluayA9ICh2YWw6IHVua25vd24pID0+IHtcclxuICBpZiAoIXZhbCkgcmV0dXJuIGZhbHNlO1xyXG4gIGlmICh0eXBlb2YgdmFsICE9PSBcIm9iamVjdFwiKSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKCF2YWwuaGFzT3duUHJvcGVydHkoXCJ0eXBlXCIpKSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKCh2YWwgYXMgeyB0eXBlOiB1bmtub3duIH0pLnR5cGUgIT09IFwiZmlsZVwiKSByZXR1cm4gZmFsc2U7XHJcbiAgcmV0dXJuIHRydWU7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgdHJ5RGF0YXZpZXdMaW5rVG9NYXJrZG93biA9ICh2YWw6IHVua25vd24pID0+IHtcclxuICBpZiAoIWNoZWNrSWZEYXRhdmlld0xpbmsodmFsKSkgcmV0dXJuIHZhbCBhcyBEYXRhdmlld1Byb3BlcnR5VmFsdWVOb3RMaW5rO1xyXG4gIHJldHVybiAodmFsIGFzIERhdGF2aWV3TGluaykubWFya2Rvd24oKTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCB0cnlEYXRhdmlld0FycmF5VG9BcnJheSA9IDxUPih2YWw6IFQpID0+IHtcclxuICBpZiAodHlwZW9mIHZhbCAhPT0gXCJvYmplY3RcIikgcmV0dXJuIHZhbDtcclxuICBpZiAoIXZhbD8uaGFzT3duUHJvcGVydHkoXCJhcnJheVwiKSkgcmV0dXJuIHZhbDtcclxuICByZXR1cm4gKHsgLi4udmFsIH0gYXMgdW5rbm93biBhcyBEYXRhQXJyYXk8VD4pLmFycmF5KCkgYXMgVDtcclxufTtcclxuXHJcbi8qXHJcbiAgVEFCTEUgY29sMSBhcyBBbGlhczEsIGZ1bmMoY29sMikgICxjb2wzLnN1YiwgY29sNCBhcyBcIkFsaWFzIDJcIlxyXG4gIEZST00gXCIvXCJcclxuICBXSEVSRSB0cnVlIFxyXG4qL1xyXG5cclxuZXhwb3J0IGNvbnN0IGdldENvbHVtblByb3BlcnR5TmFtZXMgPSAoc291cmNlOiBzdHJpbmcpID0+IHtcclxuICBjb25zdCBsaW5lID0gc291cmNlLnNwbGl0KFwiXFxuXCIpWzBdO1xyXG4gIGNvbnN0IGlzV2l0aG91dElkID0gbGluZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKFwid2l0aG91dCBpZFwiKTtcclxuICBjb25zdCBjb2xzID0gc291cmNlXHJcbiAgICAuc3BsaXQoXCJcXG5cIilbMF1cclxuICAgIC5zdWJzdHJpbmcoaXNXaXRob3V0SWQgPyAxNyA6IDYpXHJcbiAgICAuc3BsaXQoXCIsXCIpXHJcbiAgICAubWFwKChjKSA9PiB7XHJcbiAgICAgIGNvbnN0IHN0ciA9IGMudHJpbSgpO1xyXG4gICAgICBjb25zdCBwb3RlbnRpYWwgPSBzdHIuc3BsaXQoL1xcc0FTXFxzL2dpbSlbMF0udHJpbSgpO1xyXG4gICAgICBjb25zdCBpbnZhbGlkQ2hhcnMgPSBbXHJcbiAgICAgICAgXCIoXCIsXHJcbiAgICAgICAgXCIpXCIsXHJcbiAgICAgICAgXCJbXCIsXHJcbiAgICAgICAgXCJdXCIsXHJcbiAgICAgICAgXCJ7XCIsXHJcbiAgICAgICAgXCJ9XCIsXHJcbiAgICAgICAgXCIrXCIsXHJcbiAgICAgICAgLy8gXCItXCIsIGRhc2hlcyBhcmUgcHJldHR5IGNvbW1vbiBpbiBwcm9wZXJ0eSBuYW1lc1xyXG4gICAgICAgIFwiKlwiLFxyXG4gICAgICAgIFwiL1wiLFxyXG4gICAgICAgIFwiJVwiLFxyXG4gICAgICAgIFwiPFwiLFxyXG4gICAgICAgIFwiPlwiLFxyXG4gICAgICAgIFwiIVwiLFxyXG4gICAgICAgIFwiPVwiLFxyXG4gICAgICAgICdcIicsXHJcbiAgICAgIF07XHJcbiAgICAgIGNvbnN0IGlzQ29tcGxleCA9XHJcbiAgICAgICAgIU51bWJlci5pc05hTihOdW1iZXIocG90ZW50aWFsKSkgfHxcclxuICAgICAgICAvL3ByZXR0aWVyLWlnbm9yZVxyXG4gICAgICAgIHBvdGVudGlhbFxyXG4gICAgICAgICAgLnNwbGl0KFwiXCIpXHJcbiAgICAgICAgICAuc29tZSgoY2hhcikgPT4gaW52YWxpZENoYXJzLmluY2x1ZGVzKGNoYXIpKTtcclxuICAgICAgaWYgKGlzQ29tcGxleCkge1xyXG4gICAgICAgIC8vIHByb3BlcnR5IGlzIG1hbmlwdWxhdGVkIGluIHRoZSBxdWVyeVxyXG4gICAgICAgIC8vIHNvIGl0IGNhbid0IGJlIGVkaXRlZCBzaW5jZSBpdCdzIGEgY2FsY3VsYXRlZCB2YWx1ZVxyXG4gICAgICAgIHJldHVybiBDT01QTEVYX1BST1BFUlRZX1BMQUNFSE9MREVSO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBwb3RlbnRpYWw7XHJcbiAgICB9KTtcclxuICBpZiAoaXNXaXRob3V0SWQpIHJldHVybiBjb2xzO1xyXG4gIC8vIHNvIGl0IG1hdGNoZXMgd2l0aCB3aGF0IGlzIHJldHVybmVkIGZyb20gZGF0YXZpZXdcclxuICByZXR1cm4gW1wiRmlsZVwiLCAuLi5jb2xzXTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCB1cGRhdGVNZXRhZGF0YVByb3BlcnR5ID0gYXN5bmMgKFxyXG4gIHByb3BlcnR5OiBzdHJpbmcsXHJcbiAgdmFsdWU6IHVua25vd24sXHJcbiAgZmlsZVBhdGg6IHN0cmluZyxcclxuICBwbHVnaW46IFBsdWdpbixcclxuICBwcmV2aW91c1ZhbHVlOiB1bmtub3duLFxyXG4gIGl0ZW1JbmRleD86IG51bWJlcixcclxuKSA9PiB7XHJcbiAgY29uc3Qge1xyXG4gICAgYXBwOiB7IGZpbGVNYW5hZ2VyLCB2YXVsdCB9LFxyXG4gIH0gPSBwbHVnaW47XHJcbiAgY29uc3QgZmlsZSA9IHZhdWx0LmdldEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xyXG4gIGlmICghZmlsZSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICBcIlRyaWVkIHVwZGF0aW5nIGZyb250bWF0dGVyIHByb3BlcnR5IGJ1dCBjb3VsZG4ndCBmaW5kIGZpbGVcIixcclxuICAgICk7XHJcbiAgfVxyXG4gIGxldCBmbVVwZGF0ZWQgPSBmYWxzZTtcclxuICBhd2FpdCBmaWxlTWFuYWdlci5wcm9jZXNzRnJvbnRNYXR0ZXIoZmlsZSwgKGZtOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KSA9PiB7XHJcbiAgICBpZiAoIWZtLmhhc093blByb3BlcnR5KHByb3BlcnR5KSkge1xyXG4gICAgICAvLyBuZXN0ZWQgKG9iamVjdClcclxuICAgICAgaWYgKHByb3BlcnR5LmluY2x1ZGVzKFwiLlwiKSkge1xyXG4gICAgICAgIGFzc2lnbkRvdFByb3BlcnR5VmFsdWUoZm0sIHByb3BlcnR5LCB2YWx1ZSk7XHJcbiAgICAgICAgcmV0dXJuIChmbVVwZGF0ZWQgPSB0cnVlKTtcclxuICAgICAgfVxyXG4gICAgICAvLyBtaWdodCBiZSBpbmxpbmVcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgZm1bcHJvcGVydHldID0gdmFsdWU7XHJcbiAgICByZXR1cm4gKGZtVXBkYXRlZCA9IHRydWUpO1xyXG4gIH0pO1xyXG5cclxuICBpZiAoZm1VcGRhdGVkKSByZXR1cm47XHJcblxyXG4gIGNvbnN0IGlubGluZVVwZGF0ZWQgPSBhd2FpdCB0cnlVcGRhdGVJbmxpbmVQcm9wZXJ0eShcclxuICAgIHByb3BlcnR5LFxyXG4gICAgdmFsdWUsXHJcbiAgICBwcmV2aW91c1ZhbHVlLFxyXG4gICAgZmlsZSxcclxuICAgIHZhdWx0LFxyXG4gICAgaXRlbUluZGV4LFxyXG4gICk7XHJcbiAgaWYgKGlubGluZVVwZGF0ZWQpIHJldHVybjtcclxuXHJcbiAgLy8gcHJvcGVydHkgaXMgbm90IGluIGZyb250bWF0dGVyIG5vciBpbmxpbmVcclxuICBhd2FpdCBmaWxlTWFuYWdlci5wcm9jZXNzRnJvbnRNYXR0ZXIoZmlsZSwgKGZtKSA9PiB7XHJcbiAgICBmbVtwcm9wZXJ0eV0gPSB2YWx1ZTtcclxuICB9KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBNdXRhdGVzIGFuIG9iamVjdCBieSBhc3NpZ25pbmcgYSB2YWx1ZSB0byBhIHByb3BlcnR5IGdpdmVuIGluIGRvdCBub3RhdGlvblxyXG4gKiBAcGFyYW0gb2JqIFRoZSBvYmplY3QgdG8gbXV0YXRlXHJcbiAqIEBwYXJhbSBwcm9wZXJ0eSBQcm9wZXJ0eSBuYW1lIGluIGRvdCBub3RhdGlvblxyXG4gKiBAcGFyYW0gdmFsdWUgVGhlIHZhbHVlIHRvIGFzc2lnblxyXG4gKiAtLS1cclxuICogYGBgdHNcclxuICpcclxuICogY29uc3Qgb2JqID0geydmaXp6JzogJ2J1enonfTtcclxuICogYXNzaWduRG90UHJvcGVydHlWYWx1ZShvYmosICduZXN0ZWQucHJvcC5mb28nLCAnYmFyJyk7XHJcbiAqIGNvbnNvbGUubG9nKG9iaik7XHJcbiAqIC8vIHsnZml6eic6ICdidXp6JywgbmVzdGVkOiB7cHJvcDoge2ZvbzogJ2Jhcid9fX1cclxuICogYGBgXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgYXNzaWduRG90UHJvcGVydHlWYWx1ZSA9IChcclxuICBvYmo6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxyXG4gIHByb3BlcnR5OiBzdHJpbmcsXHJcbiAgdmFsdWU6IHVua25vd24sXHJcbikgPT4ge1xyXG4gIGNvbnN0IGtleXMgPSBwcm9wZXJ0eS5zcGxpdChcIi5cIik7XHJcbiAgbGV0IGN1cnJlbnQgPSBvYmo7XHJcblxyXG4gIGtleXMuZm9yRWFjaCgoa2V5LCBpbmRleCkgPT4ge1xyXG4gICAgaWYgKGluZGV4ID09PSBrZXlzLmxlbmd0aCAtIDEpIHtcclxuICAgICAgY3VycmVudFtrZXldID0gdmFsdWU7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpZiAoIWN1cnJlbnRba2V5XSB8fCB0eXBlb2YgY3VycmVudFtrZXldICE9PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgY3VycmVudFtrZXldID0ge307XHJcbiAgICAgIH1cclxuICAgICAgY3VycmVudCA9IGN1cnJlbnRba2V5XSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcclxuICAgIH1cclxuICB9KTtcclxufTtcclxuXHJcbnR5cGUgSW5saW5lUHJvcGVydHlWYWx1ZSA9XHJcbiAgfCBzdHJpbmdcclxuICB8IG51bWJlclxyXG4gIHwgYm9vbGVhblxyXG4gIHwgbnVsbFxyXG4gIHwgKHN0cmluZyB8IG51bWJlcilbXVxyXG4gIHwgdW5kZWZpbmVkO1xyXG5cclxuY29uc3QgcGFyc2VMaW5lc0ZvcklubGluZUZpZWxkcyA9IChsaW5lczogKHN0cmluZyB8IG51bGwpW10pID0+IHtcclxuICBjb25zdCByZWcgPSBuZXcgUmVnRXhwKC9bXFxbXFwoXT8oW15cXG5cXHJcXChcXFtdKik6OlsgXSooW15cXClcXF1cXG5cXHJdKilbXFxdXFwpXT8vZ20pO1xyXG4gIHJldHVybiBsaW5lcy5yZWR1Y2U8XHJcbiAgICB7XHJcbiAgICAgIGtleTogc3RyaW5nO1xyXG4gICAgICB2YWx1ZTogSW5saW5lUHJvcGVydHlWYWx1ZTtcclxuICAgICAgbGluZTogbnVtYmVyO1xyXG4gICAgICBtYXRjaDogc3RyaW5nO1xyXG4gICAgfVtdXHJcbiAgPigocHJldiwgY3VyciwgaW5kZXgpID0+IHtcclxuICAgIGxldCBtYXRjaGVzID0gcmVnLmV4ZWMoY3VyciA/PyBcIlwiKTtcclxuICAgIGlmICghbWF0Y2hlcykge1xyXG4gICAgICByZXR1cm4gcHJldjtcclxuICAgIH1cclxuICAgIGNvbnN0IGtleSA9IG1hdGNoZXNbMV0udHJpbSgpO1xyXG4gICAgY29uc3Qgb2xkVmFsID0gbWF0Y2hlc1syXS50cmltKCk7XHJcbiAgICByZXR1cm4gW1xyXG4gICAgICAuLi5wcmV2LFxyXG4gICAgICB7XHJcbiAgICAgICAga2V5OiBrZXksXHJcbiAgICAgICAgdmFsdWU6IG9sZFZhbCxcclxuICAgICAgICBsaW5lOiBpbmRleCxcclxuICAgICAgICBtYXRjaDogbWF0Y2hlc1swXSxcclxuICAgICAgfSxcclxuICAgIF07XHJcbiAgfSwgW10pO1xyXG59O1xyXG5cclxuY29uc3QgdHJ5VXBkYXRlSW5saW5lUHJvcGVydHkgPSBhc3luYyAoXHJcbiAgcHJvcGVydHk6IHN0cmluZyxcclxuICB2YWx1ZTogdW5rbm93bixcclxuICBwcmV2aW91c1ZhbHVlOiB1bmtub3duLFxyXG4gIGZpbGU6IFRGaWxlLFxyXG4gIHZhdWx0OiBWYXVsdCxcclxuICBpdGVtSW5kZXg/OiBudW1iZXIsXHJcbikgPT4ge1xyXG4gIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB2YXVsdC5yZWFkKGZpbGUpO1xyXG4gIGNvbnN0IGxpbmVzOiAoc3RyaW5nIHwgbnVsbClbXSA9IGNvbnRlbnQuc3BsaXQoXCJcXG5cIik7XHJcbiAgY29uc3QgeWFtbCA9IFtdO1xyXG4gIGlmIChsaW5lc1swXSA9PT0gXCItLS1cIikge1xyXG4gICAgY29uc3QgbGFzdFlhbWxEYXNoZXNJbmRleCA9IGxpbmVzLmZpbmRJbmRleChcclxuICAgICAgKGwsIGkpID0+IGwgPT09IFwiLS0tXCIgJiYgaSAhPT0gMCxcclxuICAgICk7XHJcbiAgICBpZiAoXHJcbiAgICAgIGxhc3RZYW1sRGFzaGVzSW5kZXggIT09IC0xICYmXHJcbiAgICAgIGxpbmVzW2xhc3RZYW1sRGFzaGVzSW5kZXggKyAxXSAhPT0gdW5kZWZpbmVkXHJcbiAgICApIHtcclxuICAgICAgLy8gdGhpcyBlbmRzIHVwIGJlaW5nIGNoZWFwZXIgdGhhbiBhcnJheS5zbGljZSgpIHdoZW5cclxuICAgICAgLy8gbGluZXMgY2FuIGJlIGEgdmVyeSBsYXJnZSBhcnJheSBvZiB2ZXJ5IGxhcmdlIHN0cmluZ3NcclxuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBsYXN0WWFtbERhc2hlc0luZGV4ICsgMTsgaisrKSB7XHJcbiAgICAgICAgeWFtbC5wdXNoKGxpbmVzW2pdKTtcclxuICAgICAgICBsaW5lc1tqXSA9IG51bGw7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbiAgY29uc3QgcGFyc2VkRmllbGRzID0gcGFyc2VMaW5lc0ZvcklubGluZUZpZWxkcyhsaW5lcyk7XHJcbiAgY29uc3QgZm91bmRJbmxpbmUgPSBwYXJzZWRGaWVsZHMuZmluZChcclxuICAgIChmKSA9PiBmLnZhbHVlID09PSBwcmV2aW91c1ZhbHVlPy50b1N0cmluZygpLFxyXG4gICk7XHJcbiAgaWYgKCFmb3VuZElubGluZSkge1xyXG4gICAgY29uc3QgaXNOYW1lTWF0Y2hlZElubGluZSA9IHBhcnNlZEZpZWxkcy5zb21lKChmKSA9PiBmLmtleSA9PT0gcHJvcGVydHkpO1xyXG4gICAgaWYgKGlzTmFtZU1hdGNoZWRJbmxpbmUpIHtcclxuICAgICAgLy8gcGx1cyBidXR0b24gd2FzIGNsaWNrZWQgZm9yIGxpc3QgdmFsdWVcclxuICAgICAgLy8geW91IGNhbid0IHJlYWxseSBhZGQgYSBpbmxpbmUgcHJvZ3JhbW1hdGljYWxseVxyXG4gICAgICAvLyBiZWNhdXNlIHRoZXkgYXJlIGRlZmluZWQgYXJiaXRyYXJpbHkgaW4gdGhlIG5vdGVcclxuICAgICAgbmV3IE5vdGljZShcclxuICAgICAgICBcIklubGluZSBmaWVsZHMgZm91bmQgZm9yIHByb3BlcnR5LCBzbyB5b3UgY2FuJ3QgdXNlIHRoZSBwbHVzIGJ1dHRvblwiLFxyXG4gICAgICApO1xyXG4gICAgICAvLyBzbyBmcm9udG1hdHRlciBpc24ndCB1cGRhdGVkXHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuICBjb25zdCBuZXdWYWx1ZSA9IEFycmF5LmlzQXJyYXkodmFsdWUpID8gdmFsdWVbaXRlbUluZGV4ID8/IDBdIDogdmFsdWU7XHJcbiAgbGluZXNbZm91bmRJbmxpbmUubGluZV0gPVxyXG4gICAgbGluZXNbZm91bmRJbmxpbmUubGluZV0/LnJlcGxhY2UoXHJcbiAgICAgIC8vIFRPRE8gSSBkb24ndCB0aGluayBzcGFjZSBhZnRlciBjb2xvbnMgaXMgcmVxdWlyZWRcclxuICAgICAgKHByb3BlcnR5ICsgXCI6OiBcIiArIGZvdW5kSW5saW5lLnZhbHVlKSBhcyBzdHJpbmcsXHJcbiAgICAgIHByb3BlcnR5ICsgXCI6OiBcIiArIChuZXdWYWx1ZSA/PyBcIlwiKS50b1N0cmluZygpLFxyXG4gICAgKSA/PyBudWxsO1xyXG4gIGxldCBmaW5hbENvbnRlbnQgPSBcIlwiO1xyXG4gIGZvciAobGV0IG0gPSAwOyBtIDwgbGluZXMubGVuZ3RoOyBtKyspIHtcclxuICAgIGNvbnN0IHYgPSBsaW5lc1ttXTtcclxuICAgIGlmICh2ID09PSBudWxsKSBjb250aW51ZTtcclxuICAgIGZpbmFsQ29udGVudCArPSBcIlxcblwiICsgdjtcclxuICB9XHJcbiAgYXdhaXQgdmF1bHQubW9kaWZ5KGZpbGUsIHlhbWwuam9pbihcIlxcblwiKSArIGZpbmFsQ29udGVudCk7XHJcbiAgcmV0dXJuIHRydWU7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgZ2V0RXhpc3RpbmdQcm9wZXJ0aWVzID0gKGFwcDogQXBwKSA9PiB7XHJcbiAgY29uc3QgeyBtZXRhZGF0YUNhY2hlIH0gPSBhcHA7XHJcbiAgLy8gQHRzLWV4cGVjdC1lcnJvclxyXG4gIHJldHVybiBtZXRhZGF0YUNhY2hlLmdldEFsbFByb3BlcnR5SW5mb3MoKSBhcyBSZWNvcmQ8c3RyaW5nLCBQcm9wZXJ0eUluZm8+O1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IGdldFRhYmxlTGluZSA9IChjb2RlQmxvY2tUZXh0OiBzdHJpbmcpID0+IHtcclxuICBjb25zdCBsaW5lcyA9IGNvZGVCbG9ja1RleHQuc3BsaXQoXCJcXG5cIik7XHJcbiAgbGV0IGluZGV4ID0gMDtcclxuICBmb3IgKGluZGV4OyBpbmRleCA8IGxpbmVzLmxlbmd0aDsgaW5kZXgrKykge1xyXG4gICAgY29uc3QgbGluZSA9IGxpbmVzW2luZGV4XTtcclxuICAgIGlmICghbGluZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoXCJ0YWJsZVwiKSkgY29udGludWU7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBsaW5lLFxyXG4gICAgICBpbmRleCxcclxuICAgIH07XHJcbiAgfVxyXG4gIHRocm93IG5ldyBFcnJvcihcclxuICAgIFwiVW5hYmxlIHRvIGZpbmQgdGFibGUgbGluZSBmcm9tIGNvZGVCbG9ja1RleHQuIFRoaXMgc2hvdWxkIGJlIGltcG9zc2libGUuXCIsXHJcbiAgKTtcclxufTtcclxuXHJcbmV4cG9ydCB0eXBlIERhdGFFZGl0QmxvY2tDb25maWcgPSB7XHJcbiAgbG9ja0VkaXRpbmc6IGJvb2xlYW47XHJcbn07XHJcblxyXG5leHBvcnQgdHlwZSBEYXRhRWRpdEJsb2NrQ29uZmlnS2V5ID0ga2V5b2YgRGF0YUVkaXRCbG9ja0NvbmZpZztcclxuXHJcbmV4cG9ydCBjb25zdCBkZWZhdWx0RGF0YUVkaXRCbG9ja0NvbmZpZzogRGF0YUVkaXRCbG9ja0NvbmZpZyA9IHtcclxuICBsb2NrRWRpdGluZzogZmFsc2UsXHJcbn07XHJcblxyXG4vLyBUT0RPIGFkZHMgb25lIGV4dHJhIGxpbmUgb2Ygc3BhY2UgKG5vdCBpbmNyZW1lbnRhbGx5KSB3aGljaCBkb2Vzbid0IGJyZWFrIGFueXRoaW5nIGJ1dCBsb29rcyB3ZWlyZFxyXG5leHBvcnQgY29uc3Qgc3BsaXRRdWVyeU9uQ29uZmlnID0gKGNvZGVCbG9ja1RleHQ6IHN0cmluZykgPT4ge1xyXG4gIGNvbnN0IFtxdWVyeSwgY29uZmlnU3RyXSA9IGNvZGVCbG9ja1RleHQuc3BsaXQoL1xcbl4tLS0kXFxuL2dpbSk7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGNvbmZpZyA9IHBhcnNlWWFtbChjb25maWdTdHIpO1xyXG4gICAgaWYgKHR5cGVvZiBjb25maWcgIT09IFwib2JqZWN0XCIpIHRocm93IG5ldyBFcnJvcigpO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcXVlcnksXHJcbiAgICAgIGNvbmZpZzoge1xyXG4gICAgICAgIC4uLmRlZmF1bHREYXRhRWRpdEJsb2NrQ29uZmlnLFxyXG4gICAgICAgIC4uLihjb25maWcgYXMgRGF0YUVkaXRCbG9ja0NvbmZpZyksXHJcbiAgICAgIH0sXHJcbiAgICB9O1xyXG4gIH0gY2F0Y2ggKGUpIHtcclxuICAgIC8vIGNvbnN0IG1zZyA9IFwiaW52YWxpZCBZQU1MIGRldGVjdGVkIGluIGNvbmZpZ1wiO1xyXG4gICAgLy8gY29uc29sZS5lcnJvcihtc2cpO1xyXG4gICAgcmV0dXJuIHsgcXVlcnksIGNvbmZpZzogZGVmYXVsdERhdGFFZGl0QmxvY2tDb25maWcgfTtcclxuICB9XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgdXBkYXRlQmxvY2tDb25maWcgPSBhc3luYyAoXHJcbiAga2V5OiBEYXRhRWRpdEJsb2NrQ29uZmlnS2V5LFxyXG4gIHZhbHVlOiBEYXRhRWRpdEJsb2NrQ29uZmlnW3R5cGVvZiBrZXldLFxyXG4gIGNvZGVCbG9ja0luZm86IENvZGVCbG9ja0luZm8sXHJcbikgPT4ge1xyXG4gIGNvbnN0IHtcclxuICAgIGNvbmZpZyxcclxuICAgIGN0eCxcclxuICAgIGVsLFxyXG4gICAgcGx1Z2luOiB7XHJcbiAgICAgIGFwcDogeyB2YXVsdCwgd29ya3NwYWNlIH0sXHJcbiAgICB9LFxyXG4gICAgcXVlcnksXHJcbiAgfSA9IGNvZGVCbG9ja0luZm87XHJcbiAgLy8gYnJlYWsgZG93biB0aGUgcXVlcnkgdGV4dCBpbnRvIGxpbmVzXHJcbiAgY29uc3QgcXVlcnlMaW5lcyA9IHF1ZXJ5LnNwbGl0KFwiXFxuXCIpO1xyXG4gIC8vIHVwZGF0ZSB0aGUgb2xkIGNvbmZpZ1xyXG4gIGNvbnN0IG5ld0NvbmZpZyA9IHsgLi4uY29uZmlnLCBba2V5XTogdmFsdWUgfTtcclxuICAvLyB0dXJuIGludG8geWFtbCB0ZXh0XHJcbiAgY29uc3QgbmV3Q29uZmlnU3RyID0gc3RyaW5naWZ5WWFtbChuZXdDb25maWcpO1xyXG4gIGNvbnN0IG5ld0NvbmZpZ0xpbmVzID0gbmV3Q29uZmlnU3RyLnNwbGl0KFwiXFxuXCIpO1xyXG4gIC8vIHN0cmluZ2lmeVlhbWwoKSBhbHdheXMgYWRkcyBhIG5ldyBsaW5lIGNoYXJhY3RlciBhdCB0aGUgZW5kLCByZXN1bHRpbmcgaW4gYW4gZXh0cmEgaXRlbSBpbiB0aGUgbGluZXMgYXJyYXlcclxuICBuZXdDb25maWdMaW5lcy5wb3AoKTtcclxuICAvLyB0ZXh0IGlzIHRoZSBlbnRpcmUgbm90ZXMgdGV4dCBhbmQgaXMgZXNzZW50aWFsbHkgYSBzeW5jaHJvbm91cyByZWFkXHJcbiAgY29uc3QgeyBsaW5lU3RhcnQsIGxpbmVFbmQsIHRleHQgfSA9IGN0eC5nZXRTZWN0aW9uSW5mbyhlbCkhO1xyXG4gIGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdChcIlxcblwiKTtcclxuICBjb25zdCBuZXdMaW5lcyA9IGxpbmVzLnRvU3BsaWNlZChcclxuICAgIC8vIHN0YXJ0IGF0IHdoZXJlIHRoZSBjb2RlIGJsb2NrIHRleHQgc3RhcnRzXHJcbiAgICBsaW5lU3RhcnQgKyAxLFxyXG4gICAgLy8gZGVsZXRlIGV4aXN0aW5nIGxpbmVzIHVwIHRvIGVuZCBvZiBjb2RlIGJsb2NrIHRleHRcclxuICAgIGxpbmVFbmQgLSBsaW5lU3RhcnQgLSAxLFxyXG4gICAgLy8gcmVjb25zdHJ1Y3QgdGhlIGNvZGUgYmxvY2sgdGV4dCB3aXRoIG5ldyBjb25maWdcclxuICAgIC4uLnF1ZXJ5TGluZXMsXHJcbiAgICBcIi0tLVwiLFxyXG4gICAgLi4ubmV3Q29uZmlnTGluZXMsXHJcbiAgKTtcclxuICBjb25zdCBmaWxlID0gdmF1bHQuZ2V0RmlsZUJ5UGF0aChjdHguc291cmNlUGF0aCk7XHJcbiAgaWYgKCFmaWxlKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGlzIHNob3VsZCBiZSBpbXBvc3NpYmxlXCIpO1xyXG4gIH1cclxuICAvLyB1cGRhdGUgZmlsZSB3aXRoIHRoZSBuZXcgY29uZmlnXHJcbiAgY29uc3QgYmVmb3JlID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgYXdhaXQgdmF1bHQubW9kaWZ5KGZpbGUsIG5ld0xpbmVzLmpvaW4oXCJcXG5cIikpO1xyXG4gIGNvbnNvbGUubG9nKFwidGltZSB0byBtb2RpZnk6IFwiLCBwZXJmb3JtYW5jZS5ub3coKSAtIGJlZm9yZSk7XHJcbiAgLy8gd29ya3NwYWNlLmFjdGl2ZUVkaXRvci5lZGl0b3I/LlxyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IHVwZGF0ZUJsb2NrQ29uZmlnMiA9IGFzeW5jIChcclxuICBrZXk6IERhdGFFZGl0QmxvY2tDb25maWdLZXksXHJcbiAgdmFsdWU6IERhdGFFZGl0QmxvY2tDb25maWdbdHlwZW9mIGtleV0sXHJcbiAgY29kZUJsb2NrSW5mbzogQ29kZUJsb2NrSW5mbyxcclxuKSA9PiB7XHJcbiAgY29uc3Qge1xyXG4gICAgY29uZmlnLFxyXG4gICAgY3R4LFxyXG4gICAgZWwsXHJcbiAgICBzb3VyY2UsXHJcbiAgICBwbHVnaW46IHtcclxuICAgICAgYXBwOiB7IHZhdWx0LCB3b3Jrc3BhY2UgfSxcclxuICAgIH0sXHJcbiAgICBxdWVyeSxcclxuICB9ID0gY29kZUJsb2NrSW5mbztcclxuICAvLyBicmVhayBkb3duIHRoZSBxdWVyeSB0ZXh0IGludG8gbGluZXNcclxuICBjb25zdCBxdWVyeUxpbmVzID0gcXVlcnkuc3BsaXQoXCJcXG5cIik7XHJcbiAgLy8gdXBkYXRlIHRoZSBvbGQgY29uZmlnXHJcbiAgY29uc3QgbmV3Q29uZmlnID0geyAuLi5jb25maWcsIFtrZXldOiB2YWx1ZSB9O1xyXG4gIC8vIHR1cm4gaW50byB5YW1sIHRleHRcclxuICBjb25zdCBuZXdDb25maWdTdHIgPSBzdHJpbmdpZnlZYW1sKG5ld0NvbmZpZyk7XHJcbiAgY29uc3QgbmV3Q29uZmlnTGluZXMgPSBuZXdDb25maWdTdHIuc3BsaXQoXCJcXG5cIik7XHJcbiAgLy8gc3RyaW5naWZ5WWFtbCgpIGFsd2F5cyBhZGRzIGEgbmV3IGxpbmUgY2hhcmFjdGVyIGF0IHRoZSBlbmQsIHJlc3VsdGluZyBpbiBhbiBleHRyYSBpdGVtIGluIHRoZSBsaW5lcyBhcnJheVxyXG4gIG5ld0NvbmZpZ0xpbmVzLnBvcCgpO1xyXG4gIC8vIHRleHQgaXMgdGhlIGVudGlyZSBub3RlcyB0ZXh0IGFuZCBpcyBlc3NlbnRpYWxseSBhIHN5bmNocm9ub3VzIHJlYWRcclxuICBjb25zdCB7IGxpbmVTdGFydCwgbGluZUVuZCwgdGV4dCB9ID0gY3R4LmdldFNlY3Rpb25JbmZvKGVsKSE7XHJcbiAgLy8gY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KFwiXFxuXCIpO1xyXG4gIGNvbnN0IGxpbmVzID0gc291cmNlLnNwbGl0KFwiXFxuXCIpO1xyXG4gIGNvbnN0IG5ld0NvZGVCbG9ja1RleHQgPVxyXG4gICAgc291cmNlLnNwbGl0KC9cXG5eLS0tJFxcbi9pbSlbMF0gKyBcIlxcbi0tLVxcblwiICsgbmV3Q29uZmlnTGluZXMuam9pbihcIlxcblwiKTtcclxuXHJcbiAgY29uc3QgbmV3TGluZXMgPSBsaW5lcy50b1NwbGljZWQoXHJcbiAgICAvLyBzdGFydCBhdCB3aGVyZSB0aGUgY29kZSBibG9jayB0ZXh0IHN0YXJ0c1xyXG4gICAgbGluZVN0YXJ0ICsgMSxcclxuICAgIC8vIGRlbGV0ZSBleGlzdGluZyBsaW5lcyB1cCB0byBlbmQgb2YgY29kZSBibG9jayB0ZXh0XHJcbiAgICBsaW5lRW5kIC0gbGluZVN0YXJ0IC0gMSxcclxuICAgIC8vIHJlY29uc3RydWN0IHRoZSBjb2RlIGJsb2NrIHRleHQgd2l0aCBuZXcgY29uZmlnXHJcbiAgICAuLi5xdWVyeUxpbmVzLFxyXG4gICAgXCItLS1cIixcclxuICAgIC4uLm5ld0NvbmZpZ0xpbmVzLFxyXG4gICk7XHJcbiAgY29uc3QgZmlsZSA9IHZhdWx0LmdldEZpbGVCeVBhdGgoY3R4LnNvdXJjZVBhdGgpO1xyXG4gIGlmICghZmlsZSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiVGhpcyBzaG91bGQgYmUgaW1wb3NzaWJsZVwiKTtcclxuICB9XHJcbiAgLy8gdXBkYXRlIGZpbGUgd2l0aCB0aGUgbmV3IGNvbmZpZ1xyXG4gIGNvbnN0IGJlZm9yZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gIGF3YWl0IHZhdWx0Lm1vZGlmeShmaWxlLCBuZXdMaW5lcy5qb2luKFwiXFxuXCIpKTtcclxuICBjb25zb2xlLmxvZyhcInRpbWUgdG8gbW9kaWZ5OiBcIiwgcGVyZm9ybWFuY2Uubm93KCkgLSBiZWZvcmUpO1xyXG4gIC8vIHdvcmtzcGFjZS5hY3RpdmVFZGl0b3IuZWRpdG9yPy5cclxufTtcclxuXHJcbi8vIFRPRE8gY291bGQgcHJvYmFibHkgY29tYmluZSB0aGlzIHdpdGggdGhlIHVwZGF0ZXIgZnVuYyBzaW5jZSBpdCdzIGxpdGVyYWxseSBqdXN0IG9uZSBsaW5lIGRpZmZlcmVuY2VcclxuLy8gYnV0IHR5cGluZyB0aGUgb3ZlcmxvYWRzIGlzIHNlZW1pbmcgbW9yZSBkaWZmaWN1bHQgdGhhbiBJIHRob3VnaHRcclxuZXhwb3J0IGNvbnN0IHNldEJsb2NrQ29uZmlnID0gYXN5bmMgKFxyXG4gIGNvbmZpZzogRGF0YUVkaXRCbG9ja0NvbmZpZyxcclxuICBkYXRhRWRpdEluZm9zOiBDb2RlQmxvY2tJbmZvLFxyXG4pID0+IHtcclxuICBjb25zdCB7XHJcbiAgICBjdHgsXHJcbiAgICBlbCxcclxuICAgIHBsdWdpbjoge1xyXG4gICAgICBhcHA6IHsgdmF1bHQgfSxcclxuICAgIH0sXHJcbiAgICBxdWVyeSxcclxuICB9ID0gZGF0YUVkaXRJbmZvcztcclxuICAvLyBicmVhayBkb3duIHRoZSBxdWVyeSB0ZXh0IGludG8gbGluZXNcclxuICBjb25zdCBxdWVyeUxpbmVzID0gcXVlcnkuc3BsaXQoXCJcXG5cIik7XHJcbiAgLy8gdHVybiBpbnRvIHlhbWwgdGV4dFxyXG4gIGNvbnN0IG5ld0NvbmZpZ1N0ciA9IHN0cmluZ2lmeVlhbWwoY29uZmlnKTtcclxuICBjb25zdCBuZXdDb25maWdMaW5lcyA9IG5ld0NvbmZpZ1N0ci5zcGxpdChcIlxcblwiKTtcclxuICAvLyBzdHJpbmdpZnlZYW1sKCkgYWx3YXlzIGFkZHMgYSBuZXcgbGluZSBjaGFyYWN0ZXIgYXQgdGhlIGVuZCwgcmVzdWx0aW5nIGluIGFuIGV4dHJhIGl0ZW0gaW4gdGhlIGxpbmVzIGFycmF5XHJcbiAgbmV3Q29uZmlnTGluZXMucG9wKCk7XHJcbiAgLy8gdGV4dCBpcyB0aGUgZW50aXJlIG5vdGVzIHRleHQgYW5kIGlzIGVzc2VudGlhbGx5IGEgc3luY2hyb25vdXMgcmVhZFxyXG4gIGNvbnN0IHsgbGluZVN0YXJ0LCBsaW5lRW5kLCB0ZXh0IH0gPSBjdHguZ2V0U2VjdGlvbkluZm8oZWwpITtcclxuICBjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoXCJcXG5cIik7XHJcbiAgY29uc3QgbmV3TGluZXMgPSBsaW5lcy50b1NwbGljZWQoXHJcbiAgICAvLyBzdGFydCBhdCB3aGVyZSB0aGUgY29kZSBibG9jayB0ZXh0IHN0YXJ0c1xyXG4gICAgbGluZVN0YXJ0ICsgMSxcclxuICAgIC8vIGRlbGV0ZSBleGlzdGluZyBsaW5lcyB1cCB0byBlbmQgb2YgY29kZSBibG9jayB0ZXh0XHJcbiAgICBsaW5lRW5kIC0gbGluZVN0YXJ0IC0gMSxcclxuICAgIC8vIHJlY29uc3RydWN0IHRoZSBjb2RlIGJsb2NrIHRleHQgd2l0aCBuZXcgY29uZmlnXHJcbiAgICAuLi5xdWVyeUxpbmVzLFxyXG4gICAgXCItLS1cIixcclxuICAgIC4uLm5ld0NvbmZpZ0xpbmVzLFxyXG4gICk7XHJcbiAgY29uc3QgZmlsZSA9IHZhdWx0LmdldEZpbGVCeVBhdGgoY3R4LnNvdXJjZVBhdGgpO1xyXG4gIGlmICghZmlsZSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiVGhpcyBzaG91bGQgYmUgaW1wb3NzaWJsZVwiKTtcclxuICB9XHJcbiAgLy8gdXBkYXRlIGZpbGUgd2l0aCB0aGUgbmV3IGNvbmZpZ1xyXG4gIGF3YWl0IHZhdWx0Lm1vZGlmeShmaWxlLCBuZXdMaW5lcy5qb2luKFwiXFxuXCIpKTtcclxufTtcclxuIiwiLyoqXG4qIEBsaWNlbnNlIGx1Y2lkZS1zb2xpZCB2MC40MTIuMCAtIElTQ1xuKlxuKiBUaGlzIHNvdXJjZSBjb2RlIGlzIGxpY2Vuc2VkIHVuZGVyIHRoZSBJU0MgbGljZW5zZS5cbiogU2VlIHRoZSBMSUNFTlNFIGZpbGUgaW4gdGhlIHJvb3QgZGlyZWN0b3J5IG9mIHRoaXMgc291cmNlIHRyZWUuXG4qL1xuXG4vLyBzcmMvZGVmYXVsdEF0dHJpYnV0ZXMudHNcbnZhciBkZWZhdWx0QXR0cmlidXRlcyA9IHtcbiAgeG1sbnM6IFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIixcbiAgd2lkdGg6IDI0LFxuICBoZWlnaHQ6IDI0LFxuICB2aWV3Qm94OiBcIjAgMCAyNCAyNFwiLFxuICBmaWxsOiBcIm5vbmVcIixcbiAgc3Ryb2tlOiBcImN1cnJlbnRDb2xvclwiLFxuICBcInN0cm9rZS13aWR0aFwiOiAyLFxuICBcInN0cm9rZS1saW5lY2FwXCI6IFwicm91bmRcIixcbiAgXCJzdHJva2UtbGluZWpvaW5cIjogXCJyb3VuZFwiXG59O1xudmFyIGRlZmF1bHRBdHRyaWJ1dGVzX2RlZmF1bHQgPSBkZWZhdWx0QXR0cmlidXRlcztcbmV4cG9ydCB7XG4gIGRlZmF1bHRBdHRyaWJ1dGVzX2RlZmF1bHQgYXMgZGVmYXVsdFxufTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWRlZmF1bHRBdHRyaWJ1dGVzLmpzeC5tYXBcbiIsIi8qKlxuKiBAbGljZW5zZSBsdWNpZGUtc29saWQgdjAuNDEyLjAgLSBJU0NcbipcbiogVGhpcyBzb3VyY2UgY29kZSBpcyBsaWNlbnNlZCB1bmRlciB0aGUgSVNDIGxpY2Vuc2UuXG4qIFNlZSB0aGUgTElDRU5TRSBmaWxlIGluIHRoZSByb290IGRpcmVjdG9yeSBvZiB0aGlzIHNvdXJjZSB0cmVlLlxuKi9cblxuLy8gc3JjL0ljb24udHN4XG5pbXBvcnQgeyBGb3IsIHNwbGl0UHJvcHMgfSBmcm9tIFwic29saWQtanNcIjtcbmltcG9ydCB7IER5bmFtaWMgfSBmcm9tIFwic29saWQtanMvd2ViXCI7XG5pbXBvcnQgZGVmYXVsdEF0dHJpYnV0ZXMgZnJvbSBcIi4vZGVmYXVsdEF0dHJpYnV0ZXNcIjtcblxuLy8gLi4vc2hhcmVkL3NyYy91dGlscy50c1xudmFyIHRvS2ViYWJDYXNlID0gKHN0cmluZykgPT4gc3RyaW5nLnJlcGxhY2UoLyhbYS16MC05XSkoW0EtWl0pL2csIFwiJDEtJDJcIikudG9Mb3dlckNhc2UoKTtcbnZhciBtZXJnZUNsYXNzZXMgPSAoLi4uY2xhc3NlcykgPT4gY2xhc3Nlcy5maWx0ZXIoKGNsYXNzTmFtZSwgaW5kZXgsIGFycmF5KSA9PiB7XG4gIHJldHVybiBCb29sZWFuKGNsYXNzTmFtZSkgJiYgYXJyYXkuaW5kZXhPZihjbGFzc05hbWUpID09PSBpbmRleDtcbn0pLmpvaW4oXCIgXCIpO1xuXG4vLyBzcmMvSWNvbi50c3hcbnZhciBJY29uID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IFtsb2NhbFByb3BzLCByZXN0XSA9IHNwbGl0UHJvcHMocHJvcHMsIFtcbiAgICBcImNvbG9yXCIsXG4gICAgXCJzaXplXCIsXG4gICAgXCJzdHJva2VXaWR0aFwiLFxuICAgIFwiY2hpbGRyZW5cIixcbiAgICBcImNsYXNzXCIsXG4gICAgXCJuYW1lXCIsXG4gICAgXCJpY29uTm9kZVwiLFxuICAgIFwiYWJzb2x1dGVTdHJva2VXaWR0aFwiXG4gIF0pO1xuICByZXR1cm4gPHN2Z1xuICAgIHsuLi5kZWZhdWx0QXR0cmlidXRlc31cbiAgICB3aWR0aD17bG9jYWxQcm9wcy5zaXplID8/IGRlZmF1bHRBdHRyaWJ1dGVzLndpZHRofVxuICAgIGhlaWdodD17bG9jYWxQcm9wcy5zaXplID8/IGRlZmF1bHRBdHRyaWJ1dGVzLmhlaWdodH1cbiAgICBzdHJva2U9e2xvY2FsUHJvcHMuY29sb3IgPz8gZGVmYXVsdEF0dHJpYnV0ZXMuc3Ryb2tlfVxuICAgIHN0cm9rZS13aWR0aD17bG9jYWxQcm9wcy5hYnNvbHV0ZVN0cm9rZVdpZHRoID8gTnVtYmVyKGxvY2FsUHJvcHMuc3Ryb2tlV2lkdGggPz8gZGVmYXVsdEF0dHJpYnV0ZXNbXCJzdHJva2Utd2lkdGhcIl0pICogMjQgLyBOdW1iZXIobG9jYWxQcm9wcy5zaXplKSA6IE51bWJlcihsb2NhbFByb3BzLnN0cm9rZVdpZHRoID8/IGRlZmF1bHRBdHRyaWJ1dGVzW1wic3Ryb2tlLXdpZHRoXCJdKX1cbiAgICBjbGFzcz17bWVyZ2VDbGFzc2VzKFxuICAgICAgXCJsdWNpZGVcIixcbiAgICAgIFwibHVjaWRlLWljb25cIixcbiAgICAgIGxvY2FsUHJvcHMubmFtZSAhPSBudWxsID8gYGx1Y2lkZS0ke3RvS2ViYWJDYXNlKGxvY2FsUHJvcHM/Lm5hbWUpfWAgOiB2b2lkIDAsXG4gICAgICBsb2NhbFByb3BzLmNsYXNzICE9IG51bGwgPyBsb2NhbFByb3BzLmNsYXNzIDogXCJcIlxuICAgICl9XG4gICAgey4uLnJlc3R9XG4gID48Rm9yIGVhY2g9e2xvY2FsUHJvcHMuaWNvbk5vZGV9PnsoW2VsZW1lbnROYW1lLCBhdHRyc10pID0+IHtcbiAgICByZXR1cm4gPER5bmFtaWNcbiAgICAgIGNvbXBvbmVudD17ZWxlbWVudE5hbWV9XG4gICAgICB7Li4uYXR0cnN9XG4gICAgLz47XG4gIH19PC9Gb3I+PC9zdmc+O1xufTtcbnZhciBJY29uX2RlZmF1bHQgPSBJY29uO1xuZXhwb3J0IHtcbiAgSWNvbl9kZWZhdWx0IGFzIGRlZmF1bHRcbn07XG4vLyMgc291cmNlTWFwcGluZ1VSTD1JY29uLmpzeC5tYXBcbiIsIi8qKlxuKiBAbGljZW5zZSBsdWNpZGUtc29saWQgdjAuNDEyLjAgLSBJU0NcbipcbiogVGhpcyBzb3VyY2UgY29kZSBpcyBsaWNlbnNlZCB1bmRlciB0aGUgSVNDIGxpY2Vuc2UuXG4qIFNlZSB0aGUgTElDRU5TRSBmaWxlIGluIHRoZSByb290IGRpcmVjdG9yeSBvZiB0aGlzIHNvdXJjZSB0cmVlLlxuKi9cblxuLy8gc3JjL2ljb25zL2xvY2sudHN4XG5pbXBvcnQgSWNvbiBmcm9tIFwiLi4vSWNvblwiO1xudmFyIGljb25Ob2RlID0gW1xuICBbXCJyZWN0XCIsIHsgd2lkdGg6IFwiMThcIiwgaGVpZ2h0OiBcIjExXCIsIHg6IFwiM1wiLCB5OiBcIjExXCIsIHJ4OiBcIjJcIiwgcnk6IFwiMlwiLCBrZXk6IFwiMXc0ZXcxXCIgfV0sXG4gIFtcInBhdGhcIiwgeyBkOiBcIk03IDExVjdhNSA1IDAgMCAxIDEwIDB2NFwiLCBrZXk6IFwiZnd2bXptXCIgfV1cbl07XG52YXIgTG9jayA9IChwcm9wcykgPT4gPEljb24gey4uLnByb3BzfSBuYW1lPVwiTG9ja1wiIGljb25Ob2RlPXtpY29uTm9kZX0gLz47XG52YXIgbG9ja19kZWZhdWx0ID0gTG9jaztcbmV4cG9ydCB7XG4gIGxvY2tfZGVmYXVsdCBhcyBkZWZhdWx0XG59O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9bG9jay5qc3gubWFwXG4iLCIvKipcbiogQGxpY2Vuc2UgbHVjaWRlLXNvbGlkIHYwLjQxMi4wIC0gSVNDXG4qXG4qIFRoaXMgc291cmNlIGNvZGUgaXMgbGljZW5zZWQgdW5kZXIgdGhlIElTQyBsaWNlbnNlLlxuKiBTZWUgdGhlIExJQ0VOU0UgZmlsZSBpbiB0aGUgcm9vdCBkaXJlY3Rvcnkgb2YgdGhpcyBzb3VyY2UgdHJlZS5cbiovXG5cbi8vIHNyYy9pY29ucy9sb2NrLW9wZW4udHN4XG5pbXBvcnQgSWNvbiBmcm9tIFwiLi4vSWNvblwiO1xudmFyIGljb25Ob2RlID0gW1xuICBbXCJyZWN0XCIsIHsgd2lkdGg6IFwiMThcIiwgaGVpZ2h0OiBcIjExXCIsIHg6IFwiM1wiLCB5OiBcIjExXCIsIHJ4OiBcIjJcIiwgcnk6IFwiMlwiLCBrZXk6IFwiMXc0ZXcxXCIgfV0sXG4gIFtcInBhdGhcIiwgeyBkOiBcIk03IDExVjdhNSA1IDAgMCAxIDkuOS0xXCIsIGtleTogXCIxbW04dzhcIiB9XVxuXTtcbnZhciBMb2NrT3BlbiA9IChwcm9wcykgPT4gPEljb24gey4uLnByb3BzfSBuYW1lPVwiTG9ja09wZW5cIiBpY29uTm9kZT17aWNvbk5vZGV9IC8+O1xudmFyIGxvY2tfb3Blbl9kZWZhdWx0ID0gTG9ja09wZW47XG5leHBvcnQge1xuICBsb2NrX29wZW5fZGVmYXVsdCBhcyBkZWZhdWx0XG59O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9bG9jay1vcGVuLmpzeC5tYXBcbiIsIi8qKlxuKiBAbGljZW5zZSBsdWNpZGUtc29saWQgdjAuNDEyLjAgLSBJU0NcbipcbiogVGhpcyBzb3VyY2UgY29kZSBpcyBsaWNlbnNlZCB1bmRlciB0aGUgSVNDIGxpY2Vuc2UuXG4qIFNlZSB0aGUgTElDRU5TRSBmaWxlIGluIHRoZSByb290IGRpcmVjdG9yeSBvZiB0aGlzIHNvdXJjZSB0cmVlLlxuKi9cblxuLy8gc3JjL2ljb25zL3NldHRpbmdzLnRzeFxuaW1wb3J0IEljb24gZnJvbSBcIi4uL0ljb25cIjtcbnZhciBpY29uTm9kZSA9IFtcbiAgW1xuICAgIFwicGF0aFwiLFxuICAgIHtcbiAgICAgIGQ6IFwiTTEyLjIyIDJoLS40NGEyIDIgMCAwIDAtMiAydi4xOGEyIDIgMCAwIDEtMSAxLjczbC0uNDMuMjVhMiAyIDAgMCAxLTIgMGwtLjE1LS4wOGEyIDIgMCAwIDAtMi43My43M2wtLjIyLjM4YTIgMiAwIDAgMCAuNzMgMi43M2wuMTUuMWEyIDIgMCAwIDEgMSAxLjcydi41MWEyIDIgMCAwIDEtMSAxLjc0bC0uMTUuMDlhMiAyIDAgMCAwLS43MyAyLjczbC4yMi4zOGEyIDIgMCAwIDAgMi43My43M2wuMTUtLjA4YTIgMiAwIDAgMSAyIDBsLjQzLjI1YTIgMiAwIDAgMSAxIDEuNzNWMjBhMiAyIDAgMCAwIDIgMmguNDRhMiAyIDAgMCAwIDItMnYtLjE4YTIgMiAwIDAgMSAxLTEuNzNsLjQzLS4yNWEyIDIgMCAwIDEgMiAwbC4xNS4wOGEyIDIgMCAwIDAgMi43My0uNzNsLjIyLS4zOWEyIDIgMCAwIDAtLjczLTIuNzNsLS4xNS0uMDhhMiAyIDAgMCAxLTEtMS43NHYtLjVhMiAyIDAgMCAxIDEtMS43NGwuMTUtLjA5YTIgMiAwIDAgMCAuNzMtMi43M2wtLjIyLS4zOGEyIDIgMCAwIDAtMi43My0uNzNsLS4xNS4wOGEyIDIgMCAwIDEtMiAwbC0uNDMtLjI1YTIgMiAwIDAgMS0xLTEuNzNWNGEyIDIgMCAwIDAtMi0yelwiLFxuICAgICAga2V5OiBcIjFxbWUyZlwiXG4gICAgfVxuICBdLFxuICBbXCJjaXJjbGVcIiwgeyBjeDogXCIxMlwiLCBjeTogXCIxMlwiLCByOiBcIjNcIiwga2V5OiBcIjF2N3pyZFwiIH1dXG5dO1xudmFyIFNldHRpbmdzID0gKHByb3BzKSA9PiA8SWNvbiB7Li4ucHJvcHN9IG5hbWU9XCJTZXR0aW5nc1wiIGljb25Ob2RlPXtpY29uTm9kZX0gLz47XG52YXIgc2V0dGluZ3NfZGVmYXVsdCA9IFNldHRpbmdzO1xuZXhwb3J0IHtcbiAgc2V0dGluZ3NfZGVmYXVsdCBhcyBkZWZhdWx0XG59O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9c2V0dGluZ3MuanN4Lm1hcFxuIiwiaW1wb3J0IHsgQXBwLCBDb21wb25lbnQsIE1hcmtkb3duUmVuZGVyZXIgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IHtcclxuICBDb21wb25lbnRQcm9wcyxcclxuICBjcmVhdGVFZmZlY3QsXHJcbiAgY3JlYXRlTWVtbyxcclxuICBvbk1vdW50LFxyXG4gIHNwbGl0UHJvcHMsXHJcbn0gZnJvbSBcInNvbGlkLWpzXCI7XHJcbmltcG9ydCB7IERhdGF2aWV3UHJvcGVydHlWYWx1ZU5vdExpbmsgfSBmcm9tIFwiLi4vLi4vbGliL3R5cGVzXCI7XHJcblxyXG50eXBlIE1hcmtkb3duUHJvcHMgPSBDb21wb25lbnRQcm9wczxcImRpdlwiPiAmIHtcclxuICAvLyBjb250YWluZXJFbDogSFRNTEVsZW1lbnQ7XHJcbiAgYXBwOiBBcHA7XHJcbiAgbWFya2Rvd246IERhdGF2aWV3UHJvcGVydHlWYWx1ZU5vdExpbms7XHJcbiAgc291cmNlUGF0aDogc3RyaW5nO1xyXG4gIGNsYXNzPzogc3RyaW5nO1xyXG59O1xyXG5leHBvcnQgY29uc3QgTWFya2Rvd24gPSAocHJvcHM6IE1hcmtkb3duUHJvcHMpID0+IHtcclxuICBsZXQgcmVmOiBIVE1MRGl2RWxlbWVudDtcclxuXHJcbiAgY29uc3QgW2xvY2FsUHJvcHMsIGRpdlByb3BzXSA9IHNwbGl0UHJvcHMocHJvcHMsIFtcclxuICAgIFwiYXBwXCIsXHJcbiAgICBcIm1hcmtkb3duXCIsXHJcbiAgICBcInNvdXJjZVBhdGhcIixcclxuICBdKTtcclxuXHJcbiAgY29uc3QgbWQgPSBjcmVhdGVNZW1vKCgpID0+IHtcclxuICAgIGNvbnN0IHN0ciA9IGxvY2FsUHJvcHMubWFya2Rvd24gPz8gXCImbmJzcDtcIjtcclxuICAgIGlmIChBcnJheS5pc0FycmF5KHN0cikpIHJldHVybiBzdHIuam9pbihcIiwgXCIpO1xyXG4gICAgaWYgKHN0ciA9PT0gXCJcIiB8fCB0eXBlb2Ygc3RyID09PSBcIm9iamVjdFwiKSByZXR1cm4gXCImbmJzcDtcIjtcclxuICAgIHJldHVybiBzdHIudG9TdHJpbmcoKTtcclxuICB9KTtcclxuXHJcbiAgY29uc3QgY29tcG9uZW50ID0gbmV3IENvbXBvbmVudCgpO1xyXG5cclxuICBjcmVhdGVFZmZlY3QoKCkgPT4ge1xyXG4gICAgcmVmLmVtcHR5KCk7XHJcbiAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlcihcclxuICAgICAgbG9jYWxQcm9wcy5hcHAsXHJcbiAgICAgIG1kKCksXHJcbiAgICAgIHJlZixcclxuICAgICAgbG9jYWxQcm9wcy5zb3VyY2VQYXRoLFxyXG4gICAgICBjb21wb25lbnQsXHJcbiAgICApO1xyXG4gIH0pO1xyXG5cclxuICByZXR1cm4gPGRpdiB7Li4uZGl2UHJvcHN9IHJlZj17KHIpID0+IChyZWYgPSByKX0+PC9kaXY+O1xyXG59O1xyXG4iLCJpbXBvcnQgeyBEYXRhdmlld0FQSSB9IGZyb20gXCJAL2xpYi90eXBlc1wiO1xyXG5pbXBvcnQgeyBEYXRhRWRpdEJsb2NrQ29uZmlnIH0gZnJvbSBcIkAvbGliL3V0aWxcIjtcclxuaW1wb3J0IERhdGFFZGl0IGZyb20gXCJAL21haW5cIjtcclxuaW1wb3J0IHsgTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5pbXBvcnQgeyBjcmVhdGVDb250ZXh0LCB1c2VDb250ZXh0IH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcblxyXG5leHBvcnQgdHlwZSBDb2RlQmxvY2tJbmZvID0ge1xyXG4gIHBsdWdpbjogRGF0YUVkaXQ7XHJcbiAgZWw6IEhUTUxFbGVtZW50O1xyXG4gIHNvdXJjZTogc3RyaW5nO1xyXG4gIHF1ZXJ5OiBzdHJpbmc7XHJcbiAgY29uZmlnOiBEYXRhRWRpdEJsb2NrQ29uZmlnO1xyXG4gIGN0eDogTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dDtcclxuICBkYXRhdmlld0FQSTogRGF0YXZpZXdBUEk7XHJcbn07XHJcblxyXG4vLyBUT0RPIHRoaXMgZmVlbHMgbGlrZSBiYWQgcHJhY3RpY2VcclxuLy8gYnV0IEknbSBwcmV0dHkgc3VyZSBpdCB3aWxsIG5ldmVyIGFjdHVhbGx5IGJlIHVuZGVmaW5lZFxyXG4vLyBzbyBwcm92aWRpbmcgYSBkdW1teSBkZWZhdWx0IHZhbHVlIHNob3VsZCBiZSBmaW5lP1xyXG5leHBvcnQgY29uc3QgQ29kZUJsb2NrQ29udGV4dCA9IGNyZWF0ZUNvbnRleHQ8Q29kZUJsb2NrSW5mbz4oe1xyXG4gIHBsdWdpbjoge30gYXMgRGF0YUVkaXQsXHJcbiAgZWw6IHt9IGFzIEhUTUxFbGVtZW50LFxyXG4gIHNvdXJjZTogXCJcIixcclxuICBxdWVyeTogXCJcIixcclxuICBjb25maWc6IHt9IGFzIERhdGFFZGl0QmxvY2tDb25maWcsXHJcbiAgY3R4OiB7fSBhcyBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0LFxyXG4gIGRhdGF2aWV3QVBJOiB7fSBhcyBEYXRhdmlld0FQSSxcclxufSk7XHJcblxyXG4vKipcclxuICogVGhpcyBjb250ZXh0IHdpbGwgYWx3YXlzIGJlIHVwIHRvIGRhdGUgc2luY2UgdGhlIGNvZGUgYmxvY2sgd2lsbCBiZSByZXJlbmRlcmVkIGJ5IE9ic2lkaWFuIHdoZW5ldmVyIGFueSBvZiB0aGlzIGluZm8gY2hhbmdlcy5cclxuICpcclxuICogVGhlcmVmb3JlLCB0aGlzIGlzbid0IHRlY2huaWNhbGx5ICpyZWFjdGl2ZSogaW4gU29saWQncyBwZXJzcGVjdGl2ZSwgc28gaXQncyBva2F5IHRvIGRlc3RydWN0dXJlIHRoaXMgYXQgdG9wIGxldmVsIG9mIGNvbXBvbmVudHMuXHJcbiAqIEByZXR1cm5zIEluZm8gc3BlY2lmaWMgdG8gdGhlIGNvZGUgYmxvY2sgaW5zdGFuY2VcclxuICovXHJcbmV4cG9ydCBjb25zdCB1ZXNDb2RlQmxvY2sgPSAoKSA9PiB1c2VDb250ZXh0KENvZGVCbG9ja0NvbnRleHQpO1xyXG4iLCJpbXBvcnQgeyBQcm9wZXJ0eVZhbHVlVHlwZSB9IGZyb20gXCJAL2xpYi90eXBlc1wiO1xyXG5pbXBvcnQgeyB1cGRhdGVNZXRhZGF0YVByb3BlcnR5IH0gZnJvbSBcIkAvbGliL3V0aWxcIjtcclxuaW1wb3J0IHsgVGFibGVEYXRhUHJvcHMgfSBmcm9tIFwiLi4vVGFibGUvVGFibGVEYXRhXCI7XHJcbmltcG9ydCB7IHVlc0NvZGVCbG9jayB9IGZyb20gXCJAL2hvb2tzL3VzZURhdGFFZGl0XCI7XHJcblxyXG50eXBlIENoZWNrYm94SW5wdXRQcm9wcyA9IFRhYmxlRGF0YVByb3BzICYge1xyXG4gIHZhbHVlVHlwZTogUHJvcGVydHlWYWx1ZVR5cGU7XHJcbn07XHJcbmV4cG9ydCBjb25zdCBDaGVja2JveElucHV0ID0gKHByb3BzOiBDaGVja2JveElucHV0UHJvcHMpID0+IHtcclxuICBjb25zdCB7IHBsdWdpbiwgY29uZmlnIH0gPSB1ZXNDb2RlQmxvY2soKTtcclxuICByZXR1cm4gKFxyXG4gICAgPGlucHV0XHJcbiAgICAgIGNsYXNzPVwiXCJcclxuICAgICAgZGlzYWJsZWQ9e2NvbmZpZy5sb2NrRWRpdGluZ31cclxuICAgICAgdHlwZT1cImNoZWNrYm94XCJcclxuICAgICAgY2hlY2tlZD17ISFwcm9wcy52YWx1ZX1cclxuICAgICAgb25DbGljaz17YXN5bmMgKGUpID0+IHtcclxuICAgICAgICBhd2FpdCB1cGRhdGVNZXRhZGF0YVByb3BlcnR5KFxyXG4gICAgICAgICAgcHJvcHMucHJvcGVydHksXHJcbiAgICAgICAgICBlLmN1cnJlbnRUYXJnZXQuY2hlY2tlZCxcclxuICAgICAgICAgIHByb3BzLmZpbGVQYXRoLFxyXG4gICAgICAgICAgcGx1Z2luLFxyXG4gICAgICAgICAgcHJvcHMudmFsdWUsXHJcbiAgICAgICAgKTtcclxuICAgICAgfX1cclxuICAgIC8+XHJcbiAgKTtcclxufTtcclxuIiwiaW1wb3J0IHsgb25Nb3VudCwgY3JlYXRlRWZmZWN0IH0gZnJvbSAnc29saWQtanMnO1xuXG4vLyBzcmMvaW5kZXgudHNcbnZhciBhdXRvZm9jdXMgPSAoZWxlbWVudCwgYXV0b2ZvY3VzMikgPT4ge1xuICBpZiAoYXV0b2ZvY3VzMj8uKCkgPT09IGZhbHNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIG9uTW91bnQoKCkgPT4ge1xuICAgIGlmIChlbGVtZW50Lmhhc0F0dHJpYnV0ZShcImF1dG9mb2N1c1wiKSlcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gZWxlbWVudC5mb2N1cygpKTtcbiAgfSk7XG59O1xudmFyIGNyZWF0ZUF1dG9mb2N1cyA9IChyZWYpID0+IHtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBjb25zdCBlbCA9IHJlZigpO1xuICAgIGVsICYmIHNldFRpbWVvdXQoKCkgPT4gZWwuZm9jdXMoKSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IHsgYXV0b2ZvY3VzLCBjcmVhdGVBdXRvZm9jdXMgfTtcbiIsImltcG9ydCB7IFByb3BlcnR5VmFsdWVUeXBlIH0gZnJvbSBcIkAvbGliL3R5cGVzXCI7XHJcbmltcG9ydCB7IGNoZWNrSWZEYXRlSGFzVGltZSwgdXBkYXRlTWV0YWRhdGFQcm9wZXJ0eSB9IGZyb20gXCJAL2xpYi91dGlsXCI7XHJcbmltcG9ydCB7IERhdGVUaW1lIH0gZnJvbSBcImx1eG9uXCI7XHJcbmltcG9ydCB7IFNldHRlciwgY3JlYXRlTWVtbyB9IGZyb20gXCJzb2xpZC1qc1wiO1xyXG5pbXBvcnQgeyBUYWJsZURhdGFQcm9wcyB9IGZyb20gXCIuLi9UYWJsZS9UYWJsZURhdGFcIjtcclxuaW1wb3J0IHsgYXV0b2ZvY3VzIH0gZnJvbSBcIkBzb2xpZC1wcmltaXRpdmVzL2F1dG9mb2N1c1wiO1xyXG5pbXBvcnQgeyB1ZXNDb2RlQmxvY2sgfSBmcm9tIFwiQC9ob29rcy91c2VEYXRhRWRpdFwiO1xyXG4vLyBUbyBwcmV2ZW50IHRyZWVzaGFraW5nXHJcbmF1dG9mb2N1cztcclxuXHJcbnR5cGUgRGF0ZURhdGV0aW1lSW5wdXRQcm9wcyA9IFRhYmxlRGF0YVByb3BzPERhdGVUaW1lPiAmIHtcclxuICBzZXRFZGl0aW5nOiBTZXR0ZXI8Ym9vbGVhbj47XHJcbiAgdmFsdWVUeXBlOiBQcm9wZXJ0eVZhbHVlVHlwZTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBEYXRlRGF0ZXRpbWVJbnB1dCA9IChwcm9wczogRGF0ZURhdGV0aW1lSW5wdXRQcm9wcykgPT4ge1xyXG4gIGNvbnN0IHtcclxuICAgIHBsdWdpbixcclxuICAgIGRhdGF2aWV3QVBJOiB7XHJcbiAgICAgIGx1eG9uOiB7IERhdGVUaW1lIH0sXHJcbiAgICB9LFxyXG4gIH0gPSB1ZXNDb2RlQmxvY2soKTtcclxuICBjb25zdCBpc1RpbWUgPSBjcmVhdGVNZW1vKCgpID0+IHtcclxuICAgIHJldHVybiBjaGVja0lmRGF0ZUhhc1RpbWUocHJvcHMudmFsdWUpO1xyXG4gIH0pO1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPGlucHV0XHJcbiAgICAgIHVzZTphdXRvZm9jdXNcclxuICAgICAgYXV0b2ZvY3VzXHJcbiAgICAgIGNsYXNzPVwiXCJcclxuICAgICAgdHlwZT17aXNUaW1lKCkgPyBcImRhdGV0aW1lLWxvY2FsXCIgOiBcImRhdGVcIn1cclxuICAgICAgLy8gMjAxOC0wNi0xMlQxOTozMFxyXG4gICAgICB2YWx1ZT17XHJcbiAgICAgICAgaXNUaW1lKClcclxuICAgICAgICAgID8gcHJvcHMudmFsdWUudG9Gb3JtYXQoXCJ5eXl5LU1NLWRkJ1QnaGg6bW1cIilcclxuICAgICAgICAgIDogcHJvcHMudmFsdWUudG9Gb3JtYXQoXCJ5eXl5LU1NLWRkXCIpXHJcbiAgICAgIH1cclxuICAgICAgb25CbHVyPXthc3luYyAoZSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGlzVmFsaWQgPSBlLnRhcmdldC52YWxpZGl0eTtcclxuICAgICAgICBpZiAoIWlzVmFsaWQpIHJldHVybiBwcm9wcy5zZXRFZGl0aW5nKGZhbHNlKTtcclxuICAgICAgICBjb25zdCBmb3JtYXQgPSBpc1RpbWUoKSA/IFwieXl5eS1NTS1kZCdUJ2hoOm1tXCIgOiBcInl5eXktTU0tZGRcIjtcclxuICAgICAgICBjb25zdCBkdCA9IERhdGVUaW1lLmZyb21Gb3JtYXQoZS50YXJnZXQudmFsdWUsIGZvcm1hdCk7XHJcbiAgICAgICAgY29uc3QgbmV3VmFsdWUgPSBkdC50b0Zvcm1hdChmb3JtYXQpO1xyXG4gICAgICAgIGNvbnN0IGZvcm1hdHRlZE9sZCA9IHByb3BzLnZhbHVlLnRvRm9ybWF0KGZvcm1hdCk7XHJcbiAgICAgICAgYXdhaXQgdXBkYXRlTWV0YWRhdGFQcm9wZXJ0eShcclxuICAgICAgICAgIHByb3BzLnByb3BlcnR5LFxyXG4gICAgICAgICAgbmV3VmFsdWUsXHJcbiAgICAgICAgICBwcm9wcy5maWxlUGF0aCxcclxuICAgICAgICAgIHBsdWdpbixcclxuICAgICAgICAgIGZvcm1hdHRlZE9sZCxcclxuICAgICAgICApO1xyXG4gICAgICAgIHByb3BzLnNldEVkaXRpbmcoZmFsc2UpO1xyXG4gICAgICB9fVxyXG4gICAgLz5cclxuICApO1xyXG59O1xyXG4iLCIvKipcbiogQGxpY2Vuc2UgbHVjaWRlLXNvbGlkIHYwLjQxMi4wIC0gSVNDXG4qXG4qIFRoaXMgc291cmNlIGNvZGUgaXMgbGljZW5zZWQgdW5kZXIgdGhlIElTQyBsaWNlbnNlLlxuKiBTZWUgdGhlIExJQ0VOU0UgZmlsZSBpbiB0aGUgcm9vdCBkaXJlY3Rvcnkgb2YgdGhpcyBzb3VyY2UgdHJlZS5cbiovXG5cbi8vIHNyYy9pY29ucy9wbHVzLnRzeFxuaW1wb3J0IEljb24gZnJvbSBcIi4uL0ljb25cIjtcbnZhciBpY29uTm9kZSA9IFtcbiAgW1wicGF0aFwiLCB7IGQ6IFwiTTUgMTJoMTRcIiwga2V5OiBcIjFheXMwaFwiIH1dLFxuICBbXCJwYXRoXCIsIHsgZDogXCJNMTIgNXYxNFwiLCBrZXk6IFwiczY5OWxlXCIgfV1cbl07XG52YXIgUGx1cyA9IChwcm9wcykgPT4gPEljb24gey4uLnByb3BzfSBuYW1lPVwiUGx1c1wiIGljb25Ob2RlPXtpY29uTm9kZX0gLz47XG52YXIgcGx1c19kZWZhdWx0ID0gUGx1cztcbmV4cG9ydCB7XG4gIHBsdXNfZGVmYXVsdCBhcyBkZWZhdWx0XG59O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9cGx1cy5qc3gubWFwXG4iLCJpbXBvcnQgeyB1cGRhdGVNZXRhZGF0YVByb3BlcnR5IH0gZnJvbSBcIkAvbGliL3V0aWxcIjtcclxuaW1wb3J0IHsgY3JlYXRlU2lnbmFsIH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcbmltcG9ydCB7IFRhYmxlRGF0YUVkaXRQcm9wcyB9IGZyb20gXCIuLi9UYWJsZS9UYWJsZURhdGFcIjtcclxuaW1wb3J0IHsgYXV0b2ZvY3VzIH0gZnJvbSBcIkBzb2xpZC1wcmltaXRpdmVzL2F1dG9mb2N1c1wiO1xyXG5pbXBvcnQgeyB1ZXNDb2RlQmxvY2sgfSBmcm9tIFwiQC9ob29rcy91c2VEYXRhRWRpdFwiO1xyXG4vLyBUbyBwcmV2ZW50IHRyZWVzaGFraW5nXHJcbmF1dG9mb2N1cztcclxuXHJcbmV4cG9ydCBjb25zdCBUZXh0SW5wdXQgPSAoXHJcbiAgcHJvcHM6IFRhYmxlRGF0YUVkaXRQcm9wcyAmIHtcclxuICAgIHVwZGF0ZVByb3BlcnR5PzogKHZhbDogdW5rbm93bikgPT4gUHJvbWlzZTx2b2lkPjtcclxuICB9LFxyXG4pID0+IHtcclxuICBjb25zdCBbc2l6ZSwgc2V0U2l6ZV0gPSBjcmVhdGVTaWduYWwocHJvcHMudmFsdWU/LnRvU3RyaW5nKCkubGVuZ3RoID8/IDUpO1xyXG4gIGNvbnN0IHsgcGx1Z2luIH0gPSB1ZXNDb2RlQmxvY2soKTtcclxuICByZXR1cm4gKFxyXG4gICAgPGlucHV0XHJcbiAgICAgIHVzZTphdXRvZm9jdXNcclxuICAgICAgYXV0b2ZvY3VzXHJcbiAgICAgIGNsYXNzPVwiaC1hdXRvIHJvdW5kZWQtbm9uZSBib3JkZXItbm9uZSBiZy10cmFuc3BhcmVudCBwLTAgIXNoYWRvdy1ub25lXCJcclxuICAgICAgLy8gc3R5bGU9e3sgXCJib3gtc2hhZG93XCI6IFwibm9uZVwiIH19XHJcbiAgICAgIHNpemU9e3NpemUoKX1cclxuICAgICAgdHlwZT1cInRleHRcIlxyXG4gICAgICB2YWx1ZT17cHJvcHMudmFsdWU/LnRvU3RyaW5nKCkgPz8gXCJcIn1cclxuICAgICAgb25CbHVyPXthc3luYyAoZSkgPT4ge1xyXG4gICAgICAgIGlmIChwcm9wcy51cGRhdGVQcm9wZXJ0eSkge1xyXG4gICAgICAgICAgYXdhaXQgcHJvcHMudXBkYXRlUHJvcGVydHkoZS50YXJnZXQudmFsdWUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBhd2FpdCB1cGRhdGVNZXRhZGF0YVByb3BlcnR5KFxyXG4gICAgICAgICAgICBwcm9wcy5wcm9wZXJ0eSxcclxuICAgICAgICAgICAgZS50YXJnZXQudmFsdWUsXHJcbiAgICAgICAgICAgIHByb3BzLmZpbGVQYXRoLFxyXG4gICAgICAgICAgICBwbHVnaW4sXHJcbiAgICAgICAgICAgIHByb3BzLnZhbHVlLFxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcHJvcHMuc2V0RWRpdGluZyhmYWxzZSk7XHJcbiAgICAgIH19XHJcbiAgICAgIG9uSW5wdXQ9eyhlKSA9PiB7XHJcbiAgICAgICAgc2V0U2l6ZShlLnRhcmdldC52YWx1ZS5sZW5ndGgpO1xyXG4gICAgICB9fVxyXG4gICAgLz5cclxuICApO1xyXG59O1xyXG4iLCJpbXBvcnQgeyBEYXRhdmlld1Byb3BlcnR5VmFsdWVBcnJheSB9IGZyb20gXCJAL2xpYi90eXBlc1wiO1xyXG5pbXBvcnQge1xyXG4gIHVwZGF0ZU1ldGFkYXRhUHJvcGVydHksXHJcbiAgdHJ5RGF0YXZpZXdMaW5rVG9NYXJrZG93bixcclxuICBEYXRhRWRpdEJsb2NrQ29uZmlnLFxyXG59IGZyb20gXCJAL2xpYi91dGlsXCI7XHJcbmltcG9ydCBEYXRhRWRpdCBmcm9tIFwiQC9tYWluXCI7XHJcbmltcG9ydCBQbHVzIGZyb20gXCJsdWNpZGUtc29saWQvaWNvbnMvUGx1c1wiO1xyXG5pbXBvcnQgeyBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0IH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7IEZvciwgY3JlYXRlU2lnbmFsLCBTaG93LCBTZXR0ZXIgfSBmcm9tIFwic29saWQtanNcIjtcclxuaW1wb3J0IHsgTWFya2Rvd24gfSBmcm9tIFwiLi4vTWFya2Rvd25cIjtcclxuaW1wb3J0IHsgVGFibGVEYXRhUHJvcHMgfSBmcm9tIFwiLi4vVGFibGUvVGFibGVEYXRhXCI7XHJcbmltcG9ydCB7IFRleHRJbnB1dCB9IGZyb20gXCIuL3RleHRcIjtcclxuaW1wb3J0IHsgdWVzQ29kZUJsb2NrIH0gZnJvbSBcIkAvaG9va3MvdXNlRGF0YUVkaXRcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBMaXN0VGFibGVEYXRhV3JhcHBlciA9IChcclxuICBwcm9wczogVGFibGVEYXRhUHJvcHM8RGF0YXZpZXdQcm9wZXJ0eVZhbHVlQXJyYXk+LFxyXG4pID0+IHtcclxuICBjb25zdCB7IHBsdWdpbiwgY3R4LCBjb25maWcgfSA9IHVlc0NvZGVCbG9jaygpO1xyXG4gIHJldHVybiAoXHJcbiAgICA8dWwgY2xhc3M9XCJtLTAgZmxleCBmbGV4LWNvbCBnYXAtMSBwLTAgWyY+bGldOmxpc3QtZGlzY1wiPlxyXG4gICAgICA8Rm9yIGVhY2g9e3Byb3BzLnZhbHVlfT5cclxuICAgICAgICB7KHZhbCwgaW5kZXgpID0+IChcclxuICAgICAgICAgIDxMaXN0VGFibGVEYXRhSXRlbVxyXG4gICAgICAgICAgICB7Li4ucHJvcHN9XHJcbiAgICAgICAgICAgIHBsdWdpbj17cGx1Z2lufVxyXG4gICAgICAgICAgICBjdHg9e2N0eH1cclxuICAgICAgICAgICAgaXRlbVZhbHVlPXt2YWx9XHJcbiAgICAgICAgICAgIGl0ZW1JbmRleD17aW5kZXgoKX1cclxuICAgICAgICAgICAgY29uZmlnPXtjb25maWd9XHJcbiAgICAgICAgICAvPlxyXG4gICAgICAgICl9XHJcbiAgICAgIDwvRm9yPlxyXG4gICAgICA8YnV0dG9uXHJcbiAgICAgICAgY2xhc3M9XCJjbGlja2FibGUtaWNvbiBzaXplLWZpdCBwLTFcIlxyXG4gICAgICAgIGRpc2FibGVkPXtjb25maWcubG9ja0VkaXRpbmd9XHJcbiAgICAgICAgb25DbGljaz17YXN5bmMgKGUpID0+IHtcclxuICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgIGF3YWl0IHVwZGF0ZU1ldGFkYXRhUHJvcGVydHkoXHJcbiAgICAgICAgICAgIHByb3BzLnByb3BlcnR5LFxyXG4gICAgICAgICAgICBbLi4ucHJvcHMudmFsdWUsIFwiXCJdLFxyXG4gICAgICAgICAgICBwcm9wcy5maWxlUGF0aCxcclxuICAgICAgICAgICAgcGx1Z2luLFxyXG4gICAgICAgICAgICBwcm9wcy52YWx1ZSxcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfX1cclxuICAgICAgPlxyXG4gICAgICAgIDxQbHVzIGNsYXNzPVwicG9pbnRlci1ldmVudHMtbm9uZSBzaXplLTNcIiAvPlxyXG4gICAgICA8L2J1dHRvbj5cclxuICAgIDwvdWw+XHJcbiAgKTtcclxufTtcclxuXHJcbmV4cG9ydCB0eXBlIExpc3RUYWJsZURhdGFJdGVtUHJvcHMgPVxyXG4gIFRhYmxlRGF0YVByb3BzPERhdGF2aWV3UHJvcGVydHlWYWx1ZUFycmF5PiAmIHtcclxuICAgIHBsdWdpbjogRGF0YUVkaXQ7XHJcbiAgICBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQ7XHJcbiAgICBpdGVtVmFsdWU6IHVua25vd247XHJcbiAgICBpdGVtSW5kZXg6IG51bWJlcjtcclxuICB9O1xyXG5leHBvcnQgY29uc3QgTGlzdFRhYmxlRGF0YUl0ZW0gPSAoXHJcbiAgcHJvcHM6IExpc3RUYWJsZURhdGFJdGVtUHJvcHMgJiB7IGNvbmZpZzogRGF0YUVkaXRCbG9ja0NvbmZpZyB9LFxyXG4pID0+IHtcclxuICBjb25zdCBbaXNFZGl0aW5nLCBzZXRFZGl0aW5nXSA9IGNyZWF0ZVNpZ25hbChmYWxzZSk7XHJcbiAgcmV0dXJuIChcclxuICAgIDxsaSBjbGFzcz1cIm0tMCBtbC0zXCI+XHJcbiAgICAgIDxTaG93XHJcbiAgICAgICAgd2hlbj17IXByb3BzLmNvbmZpZy5sb2NrRWRpdGluZyAmJiBpc0VkaXRpbmcoKX1cclxuICAgICAgICBmYWxsYmFjaz17XHJcbiAgICAgICAgICA8TWFya2Rvd25cclxuICAgICAgICAgICAgY2xhc3M9XCJzaXplLWZ1bGxcIlxyXG4gICAgICAgICAgICBhcHA9e3Byb3BzLnBsdWdpbi5hcHB9XHJcbiAgICAgICAgICAgIG1hcmtkb3duPXt0cnlEYXRhdmlld0xpbmtUb01hcmtkb3duKHByb3BzLml0ZW1WYWx1ZSl9XHJcbiAgICAgICAgICAgIHNvdXJjZVBhdGg9e3Byb3BzLmN0eC5zb3VyY2VQYXRofVxyXG4gICAgICAgICAgICBvbkNsaWNrPXtcclxuICAgICAgICAgICAgICBwcm9wcy5jb25maWcubG9ja0VkaXRpbmcgPyB1bmRlZmluZWQgOiAoKSA9PiBzZXRFZGl0aW5nKHRydWUpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIC8+XHJcbiAgICAgICAgfVxyXG4gICAgICA+XHJcbiAgICAgICAgPExpc3RJbnB1dCB7Li4ucHJvcHN9IHNldEVkaXRpbmc9e3NldEVkaXRpbmd9IC8+XHJcbiAgICAgIDwvU2hvdz5cclxuICAgIDwvbGk+XHJcbiAgKTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBMaXN0SW5wdXQgPSAoXHJcbiAgcHJvcHM6IExpc3RUYWJsZURhdGFJdGVtUHJvcHMgJiB7IHNldEVkaXRpbmc6IFNldHRlcjxib29sZWFuPiB9LFxyXG4pID0+IHtcclxuICByZXR1cm4gKFxyXG4gICAgPFRleHRJbnB1dFxyXG4gICAgICB7Li4ucHJvcHN9XHJcbiAgICAgIHZhbHVlPXtwcm9wcy5pdGVtVmFsdWV9XHJcbiAgICAgIHZhbHVlVHlwZT1cImxpc3RcIlxyXG4gICAgICB1cGRhdGVQcm9wZXJ0eT17YXN5bmMgKG5ld1ZhbCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHZhbHVlID0gWy4uLnByb3BzLnZhbHVlXSBhcyB1bmtub3duW107XHJcbiAgICAgICAgaWYgKCFuZXdWYWwgJiYgbmV3VmFsICE9PSAwKSB7XHJcbiAgICAgICAgICBjb25zdCBhcnIgPSB2YWx1ZS5maWx0ZXIoKF8sIGkpID0+IGkgIT09IHByb3BzLml0ZW1JbmRleCk7XHJcbiAgICAgICAgICBhd2FpdCB1cGRhdGVNZXRhZGF0YVByb3BlcnR5KFxyXG4gICAgICAgICAgICBwcm9wcy5wcm9wZXJ0eSxcclxuICAgICAgICAgICAgYXJyLFxyXG4gICAgICAgICAgICBwcm9wcy5maWxlUGF0aCxcclxuICAgICAgICAgICAgcHJvcHMucGx1Z2luLFxyXG4gICAgICAgICAgICBwcm9wcy5pdGVtVmFsdWUsXHJcbiAgICAgICAgICAgIHByb3BzLml0ZW1JbmRleCxcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhbHVlW3Byb3BzLml0ZW1JbmRleF0gPSBuZXdWYWw7XHJcbiAgICAgICAgYXdhaXQgdXBkYXRlTWV0YWRhdGFQcm9wZXJ0eShcclxuICAgICAgICAgIHByb3BzLnByb3BlcnR5LFxyXG4gICAgICAgICAgdmFsdWUsXHJcbiAgICAgICAgICBwcm9wcy5maWxlUGF0aCxcclxuICAgICAgICAgIHByb3BzLnBsdWdpbixcclxuICAgICAgICAgIHByb3BzLml0ZW1WYWx1ZSxcclxuICAgICAgICAgIHByb3BzLml0ZW1JbmRleCxcclxuICAgICAgICApO1xyXG4gICAgICB9fVxyXG4gICAgLz5cclxuICApO1xyXG59O1xyXG4iLCJmdW5jdGlvbiByKGUpe3ZhciB0LGYsbj1cIlwiO2lmKFwic3RyaW5nXCI9PXR5cGVvZiBlfHxcIm51bWJlclwiPT10eXBlb2YgZSluKz1lO2Vsc2UgaWYoXCJvYmplY3RcIj09dHlwZW9mIGUpaWYoQXJyYXkuaXNBcnJheShlKSl7dmFyIG89ZS5sZW5ndGg7Zm9yKHQ9MDt0PG87dCsrKWVbdF0mJihmPXIoZVt0XSkpJiYobiYmKG4rPVwiIFwiKSxuKz1mKX1lbHNlIGZvcihmIGluIGUpZVtmXSYmKG4mJihuKz1cIiBcIiksbis9Zik7cmV0dXJuIG59ZXhwb3J0IGZ1bmN0aW9uIGNsc3goKXtmb3IodmFyIGUsdCxmPTAsbj1cIlwiLG89YXJndW1lbnRzLmxlbmd0aDtmPG87ZisrKShlPWFyZ3VtZW50c1tmXSkmJih0PXIoZSkpJiYobiYmKG4rPVwiIFwiKSxuKz10KTtyZXR1cm4gbn1leHBvcnQgZGVmYXVsdCBjbHN4OyIsImNvbnN0IENMQVNTX1BBUlRfU0VQQVJBVE9SID0gJy0nO1xuZnVuY3Rpb24gY3JlYXRlQ2xhc3NHcm91cFV0aWxzKGNvbmZpZykge1xuICBjb25zdCBjbGFzc01hcCA9IGNyZWF0ZUNsYXNzTWFwKGNvbmZpZyk7XG4gIGNvbnN0IHtcbiAgICBjb25mbGljdGluZ0NsYXNzR3JvdXBzLFxuICAgIGNvbmZsaWN0aW5nQ2xhc3NHcm91cE1vZGlmaWVyc1xuICB9ID0gY29uZmlnO1xuICBmdW5jdGlvbiBnZXRDbGFzc0dyb3VwSWQoY2xhc3NOYW1lKSB7XG4gICAgY29uc3QgY2xhc3NQYXJ0cyA9IGNsYXNzTmFtZS5zcGxpdChDTEFTU19QQVJUX1NFUEFSQVRPUik7XG4gICAgLy8gQ2xhc3NlcyBsaWtlIGAtaW5zZXQtMWAgcHJvZHVjZSBhbiBlbXB0eSBzdHJpbmcgYXMgZmlyc3QgY2xhc3NQYXJ0LiBXZSBhc3N1bWUgdGhhdCBjbGFzc2VzIGZvciBuZWdhdGl2ZSB2YWx1ZXMgYXJlIHVzZWQgY29ycmVjdGx5IGFuZCByZW1vdmUgaXQgZnJvbSBjbGFzc1BhcnRzLlxuICAgIGlmIChjbGFzc1BhcnRzWzBdID09PSAnJyAmJiBjbGFzc1BhcnRzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgY2xhc3NQYXJ0cy5zaGlmdCgpO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0R3JvdXBSZWN1cnNpdmUoY2xhc3NQYXJ0cywgY2xhc3NNYXApIHx8IGdldEdyb3VwSWRGb3JBcmJpdHJhcnlQcm9wZXJ0eShjbGFzc05hbWUpO1xuICB9XG4gIGZ1bmN0aW9uIGdldENvbmZsaWN0aW5nQ2xhc3NHcm91cElkcyhjbGFzc0dyb3VwSWQsIGhhc1Bvc3RmaXhNb2RpZmllcikge1xuICAgIGNvbnN0IGNvbmZsaWN0cyA9IGNvbmZsaWN0aW5nQ2xhc3NHcm91cHNbY2xhc3NHcm91cElkXSB8fCBbXTtcbiAgICBpZiAoaGFzUG9zdGZpeE1vZGlmaWVyICYmIGNvbmZsaWN0aW5nQ2xhc3NHcm91cE1vZGlmaWVyc1tjbGFzc0dyb3VwSWRdKSB7XG4gICAgICByZXR1cm4gWy4uLmNvbmZsaWN0cywgLi4uY29uZmxpY3RpbmdDbGFzc0dyb3VwTW9kaWZpZXJzW2NsYXNzR3JvdXBJZF1dO1xuICAgIH1cbiAgICByZXR1cm4gY29uZmxpY3RzO1xuICB9XG4gIHJldHVybiB7XG4gICAgZ2V0Q2xhc3NHcm91cElkLFxuICAgIGdldENvbmZsaWN0aW5nQ2xhc3NHcm91cElkc1xuICB9O1xufVxuZnVuY3Rpb24gZ2V0R3JvdXBSZWN1cnNpdmUoY2xhc3NQYXJ0cywgY2xhc3NQYXJ0T2JqZWN0KSB7XG4gIGlmIChjbGFzc1BhcnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBjbGFzc1BhcnRPYmplY3QuY2xhc3NHcm91cElkO1xuICB9XG4gIGNvbnN0IGN1cnJlbnRDbGFzc1BhcnQgPSBjbGFzc1BhcnRzWzBdO1xuICBjb25zdCBuZXh0Q2xhc3NQYXJ0T2JqZWN0ID0gY2xhc3NQYXJ0T2JqZWN0Lm5leHRQYXJ0LmdldChjdXJyZW50Q2xhc3NQYXJ0KTtcbiAgY29uc3QgY2xhc3NHcm91cEZyb21OZXh0Q2xhc3NQYXJ0ID0gbmV4dENsYXNzUGFydE9iamVjdCA/IGdldEdyb3VwUmVjdXJzaXZlKGNsYXNzUGFydHMuc2xpY2UoMSksIG5leHRDbGFzc1BhcnRPYmplY3QpIDogdW5kZWZpbmVkO1xuICBpZiAoY2xhc3NHcm91cEZyb21OZXh0Q2xhc3NQYXJ0KSB7XG4gICAgcmV0dXJuIGNsYXNzR3JvdXBGcm9tTmV4dENsYXNzUGFydDtcbiAgfVxuICBpZiAoY2xhc3NQYXJ0T2JqZWN0LnZhbGlkYXRvcnMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICBjb25zdCBjbGFzc1Jlc3QgPSBjbGFzc1BhcnRzLmpvaW4oQ0xBU1NfUEFSVF9TRVBBUkFUT1IpO1xuICByZXR1cm4gY2xhc3NQYXJ0T2JqZWN0LnZhbGlkYXRvcnMuZmluZCgoe1xuICAgIHZhbGlkYXRvclxuICB9KSA9PiB2YWxpZGF0b3IoY2xhc3NSZXN0KSk/LmNsYXNzR3JvdXBJZDtcbn1cbmNvbnN0IGFyYml0cmFyeVByb3BlcnR5UmVnZXggPSAvXlxcWyguKylcXF0kLztcbmZ1bmN0aW9uIGdldEdyb3VwSWRGb3JBcmJpdHJhcnlQcm9wZXJ0eShjbGFzc05hbWUpIHtcbiAgaWYgKGFyYml0cmFyeVByb3BlcnR5UmVnZXgudGVzdChjbGFzc05hbWUpKSB7XG4gICAgY29uc3QgYXJiaXRyYXJ5UHJvcGVydHlDbGFzc05hbWUgPSBhcmJpdHJhcnlQcm9wZXJ0eVJlZ2V4LmV4ZWMoY2xhc3NOYW1lKVsxXTtcbiAgICBjb25zdCBwcm9wZXJ0eSA9IGFyYml0cmFyeVByb3BlcnR5Q2xhc3NOYW1lPy5zdWJzdHJpbmcoMCwgYXJiaXRyYXJ5UHJvcGVydHlDbGFzc05hbWUuaW5kZXhPZignOicpKTtcbiAgICBpZiAocHJvcGVydHkpIHtcbiAgICAgIC8vIEkgdXNlIHR3byBkb3RzIGhlcmUgYmVjYXVzZSBvbmUgZG90IGlzIHVzZWQgYXMgcHJlZml4IGZvciBjbGFzcyBncm91cHMgaW4gcGx1Z2luc1xuICAgICAgcmV0dXJuICdhcmJpdHJhcnkuLicgKyBwcm9wZXJ0eTtcbiAgICB9XG4gIH1cbn1cbi8qKlxuICogRXhwb3J0ZWQgZm9yIHRlc3Rpbmcgb25seVxuICovXG5mdW5jdGlvbiBjcmVhdGVDbGFzc01hcChjb25maWcpIHtcbiAgY29uc3Qge1xuICAgIHRoZW1lLFxuICAgIHByZWZpeFxuICB9ID0gY29uZmlnO1xuICBjb25zdCBjbGFzc01hcCA9IHtcbiAgICBuZXh0UGFydDogbmV3IE1hcCgpLFxuICAgIHZhbGlkYXRvcnM6IFtdXG4gIH07XG4gIGNvbnN0IHByZWZpeGVkQ2xhc3NHcm91cEVudHJpZXMgPSBnZXRQcmVmaXhlZENsYXNzR3JvdXBFbnRyaWVzKE9iamVjdC5lbnRyaWVzKGNvbmZpZy5jbGFzc0dyb3VwcyksIHByZWZpeCk7XG4gIHByZWZpeGVkQ2xhc3NHcm91cEVudHJpZXMuZm9yRWFjaCgoW2NsYXNzR3JvdXBJZCwgY2xhc3NHcm91cF0pID0+IHtcbiAgICBwcm9jZXNzQ2xhc3Nlc1JlY3Vyc2l2ZWx5KGNsYXNzR3JvdXAsIGNsYXNzTWFwLCBjbGFzc0dyb3VwSWQsIHRoZW1lKTtcbiAgfSk7XG4gIHJldHVybiBjbGFzc01hcDtcbn1cbmZ1bmN0aW9uIHByb2Nlc3NDbGFzc2VzUmVjdXJzaXZlbHkoY2xhc3NHcm91cCwgY2xhc3NQYXJ0T2JqZWN0LCBjbGFzc0dyb3VwSWQsIHRoZW1lKSB7XG4gIGNsYXNzR3JvdXAuZm9yRWFjaChjbGFzc0RlZmluaXRpb24gPT4ge1xuICAgIGlmICh0eXBlb2YgY2xhc3NEZWZpbml0aW9uID09PSAnc3RyaW5nJykge1xuICAgICAgY29uc3QgY2xhc3NQYXJ0T2JqZWN0VG9FZGl0ID0gY2xhc3NEZWZpbml0aW9uID09PSAnJyA/IGNsYXNzUGFydE9iamVjdCA6IGdldFBhcnQoY2xhc3NQYXJ0T2JqZWN0LCBjbGFzc0RlZmluaXRpb24pO1xuICAgICAgY2xhc3NQYXJ0T2JqZWN0VG9FZGl0LmNsYXNzR3JvdXBJZCA9IGNsYXNzR3JvdXBJZDtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBjbGFzc0RlZmluaXRpb24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGlmIChpc1RoZW1lR2V0dGVyKGNsYXNzRGVmaW5pdGlvbikpIHtcbiAgICAgICAgcHJvY2Vzc0NsYXNzZXNSZWN1cnNpdmVseShjbGFzc0RlZmluaXRpb24odGhlbWUpLCBjbGFzc1BhcnRPYmplY3QsIGNsYXNzR3JvdXBJZCwgdGhlbWUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjbGFzc1BhcnRPYmplY3QudmFsaWRhdG9ycy5wdXNoKHtcbiAgICAgICAgdmFsaWRhdG9yOiBjbGFzc0RlZmluaXRpb24sXG4gICAgICAgIGNsYXNzR3JvdXBJZFxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIE9iamVjdC5lbnRyaWVzKGNsYXNzRGVmaW5pdGlvbikuZm9yRWFjaCgoW2tleSwgY2xhc3NHcm91cF0pID0+IHtcbiAgICAgIHByb2Nlc3NDbGFzc2VzUmVjdXJzaXZlbHkoY2xhc3NHcm91cCwgZ2V0UGFydChjbGFzc1BhcnRPYmplY3QsIGtleSksIGNsYXNzR3JvdXBJZCwgdGhlbWUpO1xuICAgIH0pO1xuICB9KTtcbn1cbmZ1bmN0aW9uIGdldFBhcnQoY2xhc3NQYXJ0T2JqZWN0LCBwYXRoKSB7XG4gIGxldCBjdXJyZW50Q2xhc3NQYXJ0T2JqZWN0ID0gY2xhc3NQYXJ0T2JqZWN0O1xuICBwYXRoLnNwbGl0KENMQVNTX1BBUlRfU0VQQVJBVE9SKS5mb3JFYWNoKHBhdGhQYXJ0ID0+IHtcbiAgICBpZiAoIWN1cnJlbnRDbGFzc1BhcnRPYmplY3QubmV4dFBhcnQuaGFzKHBhdGhQYXJ0KSkge1xuICAgICAgY3VycmVudENsYXNzUGFydE9iamVjdC5uZXh0UGFydC5zZXQocGF0aFBhcnQsIHtcbiAgICAgICAgbmV4dFBhcnQ6IG5ldyBNYXAoKSxcbiAgICAgICAgdmFsaWRhdG9yczogW11cbiAgICAgIH0pO1xuICAgIH1cbiAgICBjdXJyZW50Q2xhc3NQYXJ0T2JqZWN0ID0gY3VycmVudENsYXNzUGFydE9iamVjdC5uZXh0UGFydC5nZXQocGF0aFBhcnQpO1xuICB9KTtcbiAgcmV0dXJuIGN1cnJlbnRDbGFzc1BhcnRPYmplY3Q7XG59XG5mdW5jdGlvbiBpc1RoZW1lR2V0dGVyKGZ1bmMpIHtcbiAgcmV0dXJuIGZ1bmMuaXNUaGVtZUdldHRlcjtcbn1cbmZ1bmN0aW9uIGdldFByZWZpeGVkQ2xhc3NHcm91cEVudHJpZXMoY2xhc3NHcm91cEVudHJpZXMsIHByZWZpeCkge1xuICBpZiAoIXByZWZpeCkge1xuICAgIHJldHVybiBjbGFzc0dyb3VwRW50cmllcztcbiAgfVxuICByZXR1cm4gY2xhc3NHcm91cEVudHJpZXMubWFwKChbY2xhc3NHcm91cElkLCBjbGFzc0dyb3VwXSkgPT4ge1xuICAgIGNvbnN0IHByZWZpeGVkQ2xhc3NHcm91cCA9IGNsYXNzR3JvdXAubWFwKGNsYXNzRGVmaW5pdGlvbiA9PiB7XG4gICAgICBpZiAodHlwZW9mIGNsYXNzRGVmaW5pdGlvbiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIHByZWZpeCArIGNsYXNzRGVmaW5pdGlvbjtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgY2xhc3NEZWZpbml0aW9uID09PSAnb2JqZWN0Jykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKGNsYXNzRGVmaW5pdGlvbikubWFwKChba2V5LCB2YWx1ZV0pID0+IFtwcmVmaXggKyBrZXksIHZhbHVlXSkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNsYXNzRGVmaW5pdGlvbjtcbiAgICB9KTtcbiAgICByZXR1cm4gW2NsYXNzR3JvdXBJZCwgcHJlZml4ZWRDbGFzc0dyb3VwXTtcbiAgfSk7XG59XG5cbi8vIExSVSBjYWNoZSBpbnNwaXJlZCBmcm9tIGhhc2hscnUgKGh0dHBzOi8vZ2l0aHViLmNvbS9kb21pbmljdGFyci9oYXNobHJ1L2Jsb2IvdjEuMC40L2luZGV4LmpzKSBidXQgb2JqZWN0IHJlcGxhY2VkIHdpdGggTWFwIHRvIGltcHJvdmUgcGVyZm9ybWFuY2VcbmZ1bmN0aW9uIGNyZWF0ZUxydUNhY2hlKG1heENhY2hlU2l6ZSkge1xuICBpZiAobWF4Q2FjaGVTaXplIDwgMSkge1xuICAgIHJldHVybiB7XG4gICAgICBnZXQ6ICgpID0+IHVuZGVmaW5lZCxcbiAgICAgIHNldDogKCkgPT4ge31cbiAgICB9O1xuICB9XG4gIGxldCBjYWNoZVNpemUgPSAwO1xuICBsZXQgY2FjaGUgPSBuZXcgTWFwKCk7XG4gIGxldCBwcmV2aW91c0NhY2hlID0gbmV3IE1hcCgpO1xuICBmdW5jdGlvbiB1cGRhdGUoa2V5LCB2YWx1ZSkge1xuICAgIGNhY2hlLnNldChrZXksIHZhbHVlKTtcbiAgICBjYWNoZVNpemUrKztcbiAgICBpZiAoY2FjaGVTaXplID4gbWF4Q2FjaGVTaXplKSB7XG4gICAgICBjYWNoZVNpemUgPSAwO1xuICAgICAgcHJldmlvdXNDYWNoZSA9IGNhY2hlO1xuICAgICAgY2FjaGUgPSBuZXcgTWFwKCk7XG4gICAgfVxuICB9XG4gIHJldHVybiB7XG4gICAgZ2V0KGtleSkge1xuICAgICAgbGV0IHZhbHVlID0gY2FjaGUuZ2V0KGtleSk7XG4gICAgICBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICB9XG4gICAgICBpZiAoKHZhbHVlID0gcHJldmlvdXNDYWNoZS5nZXQoa2V5KSkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB1cGRhdGUoa2V5LCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgIH1cbiAgICB9LFxuICAgIHNldChrZXksIHZhbHVlKSB7XG4gICAgICBpZiAoY2FjaGUuaGFzKGtleSkpIHtcbiAgICAgICAgY2FjaGUuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdXBkYXRlKGtleSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbn1cbmNvbnN0IElNUE9SVEFOVF9NT0RJRklFUiA9ICchJztcbmZ1bmN0aW9uIGNyZWF0ZVBhcnNlQ2xhc3NOYW1lKGNvbmZpZykge1xuICBjb25zdCB7XG4gICAgc2VwYXJhdG9yLFxuICAgIGV4cGVyaW1lbnRhbFBhcnNlQ2xhc3NOYW1lXG4gIH0gPSBjb25maWc7XG4gIGNvbnN0IGlzU2VwYXJhdG9yU2luZ2xlQ2hhcmFjdGVyID0gc2VwYXJhdG9yLmxlbmd0aCA9PT0gMTtcbiAgY29uc3QgZmlyc3RTZXBhcmF0b3JDaGFyYWN0ZXIgPSBzZXBhcmF0b3JbMF07XG4gIGNvbnN0IHNlcGFyYXRvckxlbmd0aCA9IHNlcGFyYXRvci5sZW5ndGg7XG4gIC8vIHBhcnNlQ2xhc3NOYW1lIGluc3BpcmVkIGJ5IGh0dHBzOi8vZ2l0aHViLmNvbS90YWlsd2luZGxhYnMvdGFpbHdpbmRjc3MvYmxvYi92My4yLjIvc3JjL3V0aWwvc3BsaXRBdFRvcExldmVsT25seS5qc1xuICBmdW5jdGlvbiBwYXJzZUNsYXNzTmFtZShjbGFzc05hbWUpIHtcbiAgICBjb25zdCBtb2RpZmllcnMgPSBbXTtcbiAgICBsZXQgYnJhY2tldERlcHRoID0gMDtcbiAgICBsZXQgbW9kaWZpZXJTdGFydCA9IDA7XG4gICAgbGV0IHBvc3RmaXhNb2RpZmllclBvc2l0aW9uO1xuICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBjbGFzc05hbWUubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICBsZXQgY3VycmVudENoYXJhY3RlciA9IGNsYXNzTmFtZVtpbmRleF07XG4gICAgICBpZiAoYnJhY2tldERlcHRoID09PSAwKSB7XG4gICAgICAgIGlmIChjdXJyZW50Q2hhcmFjdGVyID09PSBmaXJzdFNlcGFyYXRvckNoYXJhY3RlciAmJiAoaXNTZXBhcmF0b3JTaW5nbGVDaGFyYWN0ZXIgfHwgY2xhc3NOYW1lLnNsaWNlKGluZGV4LCBpbmRleCArIHNlcGFyYXRvckxlbmd0aCkgPT09IHNlcGFyYXRvcikpIHtcbiAgICAgICAgICBtb2RpZmllcnMucHVzaChjbGFzc05hbWUuc2xpY2UobW9kaWZpZXJTdGFydCwgaW5kZXgpKTtcbiAgICAgICAgICBtb2RpZmllclN0YXJ0ID0gaW5kZXggKyBzZXBhcmF0b3JMZW5ndGg7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN1cnJlbnRDaGFyYWN0ZXIgPT09ICcvJykge1xuICAgICAgICAgIHBvc3RmaXhNb2RpZmllclBvc2l0aW9uID0gaW5kZXg7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjdXJyZW50Q2hhcmFjdGVyID09PSAnWycpIHtcbiAgICAgICAgYnJhY2tldERlcHRoKys7XG4gICAgICB9IGVsc2UgaWYgKGN1cnJlbnRDaGFyYWN0ZXIgPT09ICddJykge1xuICAgICAgICBicmFja2V0RGVwdGgtLTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgYmFzZUNsYXNzTmFtZVdpdGhJbXBvcnRhbnRNb2RpZmllciA9IG1vZGlmaWVycy5sZW5ndGggPT09IDAgPyBjbGFzc05hbWUgOiBjbGFzc05hbWUuc3Vic3RyaW5nKG1vZGlmaWVyU3RhcnQpO1xuICAgIGNvbnN0IGhhc0ltcG9ydGFudE1vZGlmaWVyID0gYmFzZUNsYXNzTmFtZVdpdGhJbXBvcnRhbnRNb2RpZmllci5zdGFydHNXaXRoKElNUE9SVEFOVF9NT0RJRklFUik7XG4gICAgY29uc3QgYmFzZUNsYXNzTmFtZSA9IGhhc0ltcG9ydGFudE1vZGlmaWVyID8gYmFzZUNsYXNzTmFtZVdpdGhJbXBvcnRhbnRNb2RpZmllci5zdWJzdHJpbmcoMSkgOiBiYXNlQ2xhc3NOYW1lV2l0aEltcG9ydGFudE1vZGlmaWVyO1xuICAgIGNvbnN0IG1heWJlUG9zdGZpeE1vZGlmaWVyUG9zaXRpb24gPSBwb3N0Zml4TW9kaWZpZXJQb3NpdGlvbiAmJiBwb3N0Zml4TW9kaWZpZXJQb3NpdGlvbiA+IG1vZGlmaWVyU3RhcnQgPyBwb3N0Zml4TW9kaWZpZXJQb3NpdGlvbiAtIG1vZGlmaWVyU3RhcnQgOiB1bmRlZmluZWQ7XG4gICAgcmV0dXJuIHtcbiAgICAgIG1vZGlmaWVycyxcbiAgICAgIGhhc0ltcG9ydGFudE1vZGlmaWVyLFxuICAgICAgYmFzZUNsYXNzTmFtZSxcbiAgICAgIG1heWJlUG9zdGZpeE1vZGlmaWVyUG9zaXRpb25cbiAgICB9O1xuICB9XG4gIGlmIChleHBlcmltZW50YWxQYXJzZUNsYXNzTmFtZSkge1xuICAgIHJldHVybiBmdW5jdGlvbiBwYXJzZUNsYXNzTmFtZUV4cGVyaW1lbnRhbChjbGFzc05hbWUpIHtcbiAgICAgIHJldHVybiBleHBlcmltZW50YWxQYXJzZUNsYXNzTmFtZSh7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgcGFyc2VDbGFzc05hbWVcbiAgICAgIH0pO1xuICAgIH07XG4gIH1cbiAgcmV0dXJuIHBhcnNlQ2xhc3NOYW1lO1xufVxuLyoqXG4gKiBTb3J0cyBtb2RpZmllcnMgYWNjb3JkaW5nIHRvIGZvbGxvd2luZyBzY2hlbWE6XG4gKiAtIFByZWRlZmluZWQgbW9kaWZpZXJzIGFyZSBzb3J0ZWQgYWxwaGFiZXRpY2FsbHlcbiAqIC0gV2hlbiBhbiBhcmJpdHJhcnkgdmFyaWFudCBhcHBlYXJzLCBpdCBtdXN0IGJlIHByZXNlcnZlZCB3aGljaCBtb2RpZmllcnMgYXJlIGJlZm9yZSBhbmQgYWZ0ZXIgaXRcbiAqL1xuZnVuY3Rpb24gc29ydE1vZGlmaWVycyhtb2RpZmllcnMpIHtcbiAgaWYgKG1vZGlmaWVycy5sZW5ndGggPD0gMSkge1xuICAgIHJldHVybiBtb2RpZmllcnM7XG4gIH1cbiAgY29uc3Qgc29ydGVkTW9kaWZpZXJzID0gW107XG4gIGxldCB1bnNvcnRlZE1vZGlmaWVycyA9IFtdO1xuICBtb2RpZmllcnMuZm9yRWFjaChtb2RpZmllciA9PiB7XG4gICAgY29uc3QgaXNBcmJpdHJhcnlWYXJpYW50ID0gbW9kaWZpZXJbMF0gPT09ICdbJztcbiAgICBpZiAoaXNBcmJpdHJhcnlWYXJpYW50KSB7XG4gICAgICBzb3J0ZWRNb2RpZmllcnMucHVzaCguLi51bnNvcnRlZE1vZGlmaWVycy5zb3J0KCksIG1vZGlmaWVyKTtcbiAgICAgIHVuc29ydGVkTW9kaWZpZXJzID0gW107XG4gICAgfSBlbHNlIHtcbiAgICAgIHVuc29ydGVkTW9kaWZpZXJzLnB1c2gobW9kaWZpZXIpO1xuICAgIH1cbiAgfSk7XG4gIHNvcnRlZE1vZGlmaWVycy5wdXNoKC4uLnVuc29ydGVkTW9kaWZpZXJzLnNvcnQoKSk7XG4gIHJldHVybiBzb3J0ZWRNb2RpZmllcnM7XG59XG5mdW5jdGlvbiBjcmVhdGVDb25maWdVdGlscyhjb25maWcpIHtcbiAgcmV0dXJuIHtcbiAgICBjYWNoZTogY3JlYXRlTHJ1Q2FjaGUoY29uZmlnLmNhY2hlU2l6ZSksXG4gICAgcGFyc2VDbGFzc05hbWU6IGNyZWF0ZVBhcnNlQ2xhc3NOYW1lKGNvbmZpZyksXG4gICAgLi4uY3JlYXRlQ2xhc3NHcm91cFV0aWxzKGNvbmZpZylcbiAgfTtcbn1cbmNvbnN0IFNQTElUX0NMQVNTRVNfUkVHRVggPSAvXFxzKy87XG5mdW5jdGlvbiBtZXJnZUNsYXNzTGlzdChjbGFzc0xpc3QsIGNvbmZpZ1V0aWxzKSB7XG4gIGNvbnN0IHtcbiAgICBwYXJzZUNsYXNzTmFtZSxcbiAgICBnZXRDbGFzc0dyb3VwSWQsXG4gICAgZ2V0Q29uZmxpY3RpbmdDbGFzc0dyb3VwSWRzXG4gIH0gPSBjb25maWdVdGlscztcbiAgLyoqXG4gICAqIFNldCBvZiBjbGFzc0dyb3VwSWRzIGluIGZvbGxvd2luZyBmb3JtYXQ6XG4gICAqIGB7aW1wb3J0YW50TW9kaWZpZXJ9e3ZhcmlhbnRNb2RpZmllcnN9e2NsYXNzR3JvdXBJZH1gXG4gICAqIEBleGFtcGxlICdmbG9hdCdcbiAgICogQGV4YW1wbGUgJ2hvdmVyOmZvY3VzOmJnLWNvbG9yJ1xuICAgKiBAZXhhbXBsZSAnbWQ6IXByJ1xuICAgKi9cbiAgY29uc3QgY2xhc3NHcm91cHNJbkNvbmZsaWN0ID0gbmV3IFNldCgpO1xuICByZXR1cm4gY2xhc3NMaXN0LnRyaW0oKS5zcGxpdChTUExJVF9DTEFTU0VTX1JFR0VYKS5tYXAob3JpZ2luYWxDbGFzc05hbWUgPT4ge1xuICAgIGNvbnN0IHtcbiAgICAgIG1vZGlmaWVycyxcbiAgICAgIGhhc0ltcG9ydGFudE1vZGlmaWVyLFxuICAgICAgYmFzZUNsYXNzTmFtZSxcbiAgICAgIG1heWJlUG9zdGZpeE1vZGlmaWVyUG9zaXRpb25cbiAgICB9ID0gcGFyc2VDbGFzc05hbWUob3JpZ2luYWxDbGFzc05hbWUpO1xuICAgIGxldCBoYXNQb3N0Zml4TW9kaWZpZXIgPSBCb29sZWFuKG1heWJlUG9zdGZpeE1vZGlmaWVyUG9zaXRpb24pO1xuICAgIGxldCBjbGFzc0dyb3VwSWQgPSBnZXRDbGFzc0dyb3VwSWQoaGFzUG9zdGZpeE1vZGlmaWVyID8gYmFzZUNsYXNzTmFtZS5zdWJzdHJpbmcoMCwgbWF5YmVQb3N0Zml4TW9kaWZpZXJQb3NpdGlvbikgOiBiYXNlQ2xhc3NOYW1lKTtcbiAgICBpZiAoIWNsYXNzR3JvdXBJZCkge1xuICAgICAgaWYgKCFoYXNQb3N0Zml4TW9kaWZpZXIpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBpc1RhaWx3aW5kQ2xhc3M6IGZhbHNlLFxuICAgICAgICAgIG9yaWdpbmFsQ2xhc3NOYW1lXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBjbGFzc0dyb3VwSWQgPSBnZXRDbGFzc0dyb3VwSWQoYmFzZUNsYXNzTmFtZSk7XG4gICAgICBpZiAoIWNsYXNzR3JvdXBJZCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGlzVGFpbHdpbmRDbGFzczogZmFsc2UsXG4gICAgICAgICAgb3JpZ2luYWxDbGFzc05hbWVcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGhhc1Bvc3RmaXhNb2RpZmllciA9IGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCB2YXJpYW50TW9kaWZpZXIgPSBzb3J0TW9kaWZpZXJzKG1vZGlmaWVycykuam9pbignOicpO1xuICAgIGNvbnN0IG1vZGlmaWVySWQgPSBoYXNJbXBvcnRhbnRNb2RpZmllciA/IHZhcmlhbnRNb2RpZmllciArIElNUE9SVEFOVF9NT0RJRklFUiA6IHZhcmlhbnRNb2RpZmllcjtcbiAgICByZXR1cm4ge1xuICAgICAgaXNUYWlsd2luZENsYXNzOiB0cnVlLFxuICAgICAgbW9kaWZpZXJJZCxcbiAgICAgIGNsYXNzR3JvdXBJZCxcbiAgICAgIG9yaWdpbmFsQ2xhc3NOYW1lLFxuICAgICAgaGFzUG9zdGZpeE1vZGlmaWVyXG4gICAgfTtcbiAgfSkucmV2ZXJzZSgpXG4gIC8vIExhc3QgY2xhc3MgaW4gY29uZmxpY3Qgd2lucywgc28gd2UgbmVlZCB0byBmaWx0ZXIgY29uZmxpY3RpbmcgY2xhc3NlcyBpbiByZXZlcnNlIG9yZGVyLlxuICAuZmlsdGVyKHBhcnNlZCA9PiB7XG4gICAgaWYgKCFwYXJzZWQuaXNUYWlsd2luZENsYXNzKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3Qge1xuICAgICAgbW9kaWZpZXJJZCxcbiAgICAgIGNsYXNzR3JvdXBJZCxcbiAgICAgIGhhc1Bvc3RmaXhNb2RpZmllclxuICAgIH0gPSBwYXJzZWQ7XG4gICAgY29uc3QgY2xhc3NJZCA9IG1vZGlmaWVySWQgKyBjbGFzc0dyb3VwSWQ7XG4gICAgaWYgKGNsYXNzR3JvdXBzSW5Db25mbGljdC5oYXMoY2xhc3NJZCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY2xhc3NHcm91cHNJbkNvbmZsaWN0LmFkZChjbGFzc0lkKTtcbiAgICBnZXRDb25mbGljdGluZ0NsYXNzR3JvdXBJZHMoY2xhc3NHcm91cElkLCBoYXNQb3N0Zml4TW9kaWZpZXIpLmZvckVhY2goZ3JvdXAgPT4gY2xhc3NHcm91cHNJbkNvbmZsaWN0LmFkZChtb2RpZmllcklkICsgZ3JvdXApKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSkucmV2ZXJzZSgpLm1hcChwYXJzZWQgPT4gcGFyc2VkLm9yaWdpbmFsQ2xhc3NOYW1lKS5qb2luKCcgJyk7XG59XG5cbi8qKlxuICogVGhlIGNvZGUgaW4gdGhpcyBmaWxlIGlzIGNvcGllZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9sdWtlZWQvY2xzeCBhbmQgbW9kaWZpZWQgdG8gc3VpdCB0aGUgbmVlZHMgb2YgdGFpbHdpbmQtbWVyZ2UgYmV0dGVyLlxuICpcbiAqIFNwZWNpZmljYWxseTpcbiAqIC0gUnVudGltZSBjb2RlIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2x1a2VlZC9jbHN4L2Jsb2IvdjEuMi4xL3NyYy9pbmRleC5qc1xuICogLSBUeXBlU2NyaXB0IHR5cGVzIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2x1a2VlZC9jbHN4L2Jsb2IvdjEuMi4xL2Nsc3guZC50c1xuICpcbiAqIE9yaWdpbmFsIGNvZGUgaGFzIE1JVCBsaWNlbnNlOiBDb3B5cmlnaHQgKGMpIEx1a2UgRWR3YXJkcyA8bHVrZS5lZHdhcmRzMDVAZ21haWwuY29tPiAobHVrZWVkLmNvbSlcbiAqL1xuZnVuY3Rpb24gdHdKb2luKCkge1xuICBsZXQgaW5kZXggPSAwO1xuICBsZXQgYXJndW1lbnQ7XG4gIGxldCByZXNvbHZlZFZhbHVlO1xuICBsZXQgc3RyaW5nID0gJyc7XG4gIHdoaWxlIChpbmRleCA8IGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICBpZiAoYXJndW1lbnQgPSBhcmd1bWVudHNbaW5kZXgrK10pIHtcbiAgICAgIGlmIChyZXNvbHZlZFZhbHVlID0gdG9WYWx1ZShhcmd1bWVudCkpIHtcbiAgICAgICAgc3RyaW5nICYmIChzdHJpbmcgKz0gJyAnKTtcbiAgICAgICAgc3RyaW5nICs9IHJlc29sdmVkVmFsdWU7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBzdHJpbmc7XG59XG5mdW5jdGlvbiB0b1ZhbHVlKG1peCkge1xuICBpZiAodHlwZW9mIG1peCA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbWl4O1xuICB9XG4gIGxldCByZXNvbHZlZFZhbHVlO1xuICBsZXQgc3RyaW5nID0gJyc7XG4gIGZvciAobGV0IGsgPSAwOyBrIDwgbWl4Lmxlbmd0aDsgaysrKSB7XG4gICAgaWYgKG1peFtrXSkge1xuICAgICAgaWYgKHJlc29sdmVkVmFsdWUgPSB0b1ZhbHVlKG1peFtrXSkpIHtcbiAgICAgICAgc3RyaW5nICYmIChzdHJpbmcgKz0gJyAnKTtcbiAgICAgICAgc3RyaW5nICs9IHJlc29sdmVkVmFsdWU7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBzdHJpbmc7XG59XG5mdW5jdGlvbiBjcmVhdGVUYWlsd2luZE1lcmdlKGNyZWF0ZUNvbmZpZ0ZpcnN0LCAuLi5jcmVhdGVDb25maWdSZXN0KSB7XG4gIGxldCBjb25maWdVdGlscztcbiAgbGV0IGNhY2hlR2V0O1xuICBsZXQgY2FjaGVTZXQ7XG4gIGxldCBmdW5jdGlvblRvQ2FsbCA9IGluaXRUYWlsd2luZE1lcmdlO1xuICBmdW5jdGlvbiBpbml0VGFpbHdpbmRNZXJnZShjbGFzc0xpc3QpIHtcbiAgICBjb25zdCBjb25maWcgPSBjcmVhdGVDb25maWdSZXN0LnJlZHVjZSgocHJldmlvdXNDb25maWcsIGNyZWF0ZUNvbmZpZ0N1cnJlbnQpID0+IGNyZWF0ZUNvbmZpZ0N1cnJlbnQocHJldmlvdXNDb25maWcpLCBjcmVhdGVDb25maWdGaXJzdCgpKTtcbiAgICBjb25maWdVdGlscyA9IGNyZWF0ZUNvbmZpZ1V0aWxzKGNvbmZpZyk7XG4gICAgY2FjaGVHZXQgPSBjb25maWdVdGlscy5jYWNoZS5nZXQ7XG4gICAgY2FjaGVTZXQgPSBjb25maWdVdGlscy5jYWNoZS5zZXQ7XG4gICAgZnVuY3Rpb25Ub0NhbGwgPSB0YWlsd2luZE1lcmdlO1xuICAgIHJldHVybiB0YWlsd2luZE1lcmdlKGNsYXNzTGlzdCk7XG4gIH1cbiAgZnVuY3Rpb24gdGFpbHdpbmRNZXJnZShjbGFzc0xpc3QpIHtcbiAgICBjb25zdCBjYWNoZWRSZXN1bHQgPSBjYWNoZUdldChjbGFzc0xpc3QpO1xuICAgIGlmIChjYWNoZWRSZXN1bHQpIHtcbiAgICAgIHJldHVybiBjYWNoZWRSZXN1bHQ7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IG1lcmdlQ2xhc3NMaXN0KGNsYXNzTGlzdCwgY29uZmlnVXRpbHMpO1xuICAgIGNhY2hlU2V0KGNsYXNzTGlzdCwgcmVzdWx0KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIHJldHVybiBmdW5jdGlvbiBjYWxsVGFpbHdpbmRNZXJnZSgpIHtcbiAgICByZXR1cm4gZnVuY3Rpb25Ub0NhbGwodHdKb2luLmFwcGx5KG51bGwsIGFyZ3VtZW50cykpO1xuICB9O1xufVxuZnVuY3Rpb24gZnJvbVRoZW1lKGtleSkge1xuICBjb25zdCB0aGVtZUdldHRlciA9IHRoZW1lID0+IHRoZW1lW2tleV0gfHwgW107XG4gIHRoZW1lR2V0dGVyLmlzVGhlbWVHZXR0ZXIgPSB0cnVlO1xuICByZXR1cm4gdGhlbWVHZXR0ZXI7XG59XG5jb25zdCBhcmJpdHJhcnlWYWx1ZVJlZ2V4ID0gL15cXFsoPzooW2Etei1dKyk6KT8oLispXFxdJC9pO1xuY29uc3QgZnJhY3Rpb25SZWdleCA9IC9eXFxkK1xcL1xcZCskLztcbmNvbnN0IHN0cmluZ0xlbmd0aHMgPSAvKiNfX1BVUkVfXyovbmV3IFNldChbJ3B4JywgJ2Z1bGwnLCAnc2NyZWVuJ10pO1xuY29uc3QgdHNoaXJ0VW5pdFJlZ2V4ID0gL14oXFxkKyhcXC5cXGQrKT8pPyh4c3xzbXxtZHxsZ3x4bCkkLztcbmNvbnN0IGxlbmd0aFVuaXRSZWdleCA9IC9cXGQrKCV8cHh8cj9lbXxbc2RsXT92KFtod2liXXxtaW58bWF4KXxwdHxwY3xpbnxjbXxtbXxjYXB8Y2h8ZXh8cj9saHxjcSh3fGh8aXxifG1pbnxtYXgpKXxcXGIoY2FsY3xtaW58bWF4fGNsYW1wKVxcKC4rXFwpfF4wJC87XG5jb25zdCBjb2xvckZ1bmN0aW9uUmVnZXggPSAvXihyZ2JhP3xoc2xhP3xod2J8KG9rKT8obGFifGxjaCkpXFwoLitcXCkkLztcbi8vIFNoYWRvdyBhbHdheXMgYmVnaW5zIHdpdGggeCBhbmQgeSBvZmZzZXQgc2VwYXJhdGVkIGJ5IHVuZGVyc2NvcmUgb3B0aW9uYWxseSBwcmVwZW5kZWQgYnkgaW5zZXRcbmNvbnN0IHNoYWRvd1JlZ2V4ID0gL14oaW5zZXRfKT8tPygoXFxkKyk/XFwuPyhcXGQrKVthLXpdK3wwKV8tPygoXFxkKyk/XFwuPyhcXGQrKVthLXpdK3wwKS87XG5jb25zdCBpbWFnZVJlZ2V4ID0gL14odXJsfGltYWdlfGltYWdlLXNldHxjcm9zcy1mYWRlfGVsZW1lbnR8KHJlcGVhdGluZy0pPyhsaW5lYXJ8cmFkaWFsfGNvbmljKS1ncmFkaWVudClcXCguK1xcKSQvO1xuZnVuY3Rpb24gaXNMZW5ndGgodmFsdWUpIHtcbiAgcmV0dXJuIGlzTnVtYmVyKHZhbHVlKSB8fCBzdHJpbmdMZW5ndGhzLmhhcyh2YWx1ZSkgfHwgZnJhY3Rpb25SZWdleC50ZXN0KHZhbHVlKTtcbn1cbmZ1bmN0aW9uIGlzQXJiaXRyYXJ5TGVuZ3RoKHZhbHVlKSB7XG4gIHJldHVybiBnZXRJc0FyYml0cmFyeVZhbHVlKHZhbHVlLCAnbGVuZ3RoJywgaXNMZW5ndGhPbmx5KTtcbn1cbmZ1bmN0aW9uIGlzTnVtYmVyKHZhbHVlKSB7XG4gIHJldHVybiBCb29sZWFuKHZhbHVlKSAmJiAhTnVtYmVyLmlzTmFOKE51bWJlcih2YWx1ZSkpO1xufVxuZnVuY3Rpb24gaXNBcmJpdHJhcnlOdW1iZXIodmFsdWUpIHtcbiAgcmV0dXJuIGdldElzQXJiaXRyYXJ5VmFsdWUodmFsdWUsICdudW1iZXInLCBpc051bWJlcik7XG59XG5mdW5jdGlvbiBpc0ludGVnZXIodmFsdWUpIHtcbiAgcmV0dXJuIEJvb2xlYW4odmFsdWUpICYmIE51bWJlci5pc0ludGVnZXIoTnVtYmVyKHZhbHVlKSk7XG59XG5mdW5jdGlvbiBpc1BlcmNlbnQodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlLmVuZHNXaXRoKCclJykgJiYgaXNOdW1iZXIodmFsdWUuc2xpY2UoMCwgLTEpKTtcbn1cbmZ1bmN0aW9uIGlzQXJiaXRyYXJ5VmFsdWUodmFsdWUpIHtcbiAgcmV0dXJuIGFyYml0cmFyeVZhbHVlUmVnZXgudGVzdCh2YWx1ZSk7XG59XG5mdW5jdGlvbiBpc1RzaGlydFNpemUodmFsdWUpIHtcbiAgcmV0dXJuIHRzaGlydFVuaXRSZWdleC50ZXN0KHZhbHVlKTtcbn1cbmNvbnN0IHNpemVMYWJlbHMgPSAvKiNfX1BVUkVfXyovbmV3IFNldChbJ2xlbmd0aCcsICdzaXplJywgJ3BlcmNlbnRhZ2UnXSk7XG5mdW5jdGlvbiBpc0FyYml0cmFyeVNpemUodmFsdWUpIHtcbiAgcmV0dXJuIGdldElzQXJiaXRyYXJ5VmFsdWUodmFsdWUsIHNpemVMYWJlbHMsIGlzTmV2ZXIpO1xufVxuZnVuY3Rpb24gaXNBcmJpdHJhcnlQb3NpdGlvbih2YWx1ZSkge1xuICByZXR1cm4gZ2V0SXNBcmJpdHJhcnlWYWx1ZSh2YWx1ZSwgJ3Bvc2l0aW9uJywgaXNOZXZlcik7XG59XG5jb25zdCBpbWFnZUxhYmVscyA9IC8qI19fUFVSRV9fKi9uZXcgU2V0KFsnaW1hZ2UnLCAndXJsJ10pO1xuZnVuY3Rpb24gaXNBcmJpdHJhcnlJbWFnZSh2YWx1ZSkge1xuICByZXR1cm4gZ2V0SXNBcmJpdHJhcnlWYWx1ZSh2YWx1ZSwgaW1hZ2VMYWJlbHMsIGlzSW1hZ2UpO1xufVxuZnVuY3Rpb24gaXNBcmJpdHJhcnlTaGFkb3codmFsdWUpIHtcbiAgcmV0dXJuIGdldElzQXJiaXRyYXJ5VmFsdWUodmFsdWUsICcnLCBpc1NoYWRvdyk7XG59XG5mdW5jdGlvbiBpc0FueSgpIHtcbiAgcmV0dXJuIHRydWU7XG59XG5mdW5jdGlvbiBnZXRJc0FyYml0cmFyeVZhbHVlKHZhbHVlLCBsYWJlbCwgdGVzdFZhbHVlKSB7XG4gIGNvbnN0IHJlc3VsdCA9IGFyYml0cmFyeVZhbHVlUmVnZXguZXhlYyh2YWx1ZSk7XG4gIGlmIChyZXN1bHQpIHtcbiAgICBpZiAocmVzdWx0WzFdKSB7XG4gICAgICByZXR1cm4gdHlwZW9mIGxhYmVsID09PSAnc3RyaW5nJyA/IHJlc3VsdFsxXSA9PT0gbGFiZWwgOiBsYWJlbC5oYXMocmVzdWx0WzFdKTtcbiAgICB9XG4gICAgcmV0dXJuIHRlc3RWYWx1ZShyZXN1bHRbMl0pO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cbmZ1bmN0aW9uIGlzTGVuZ3RoT25seSh2YWx1ZSkge1xuICAvLyBgY29sb3JGdW5jdGlvblJlZ2V4YCBjaGVjayBpcyBuZWNlc3NhcnkgYmVjYXVzZSBjb2xvciBmdW5jdGlvbnMgY2FuIGhhdmUgcGVyY2VudGFnZXMgaW4gdGhlbSB3aGljaCB3aGljaCB3b3VsZCBiZSBpbmNvcnJlY3RseSBjbGFzc2lmaWVkIGFzIGxlbmd0aHMuXG4gIC8vIEZvciBleGFtcGxlLCBgaHNsKDAgMCUgMCUpYCB3b3VsZCBiZSBjbGFzc2lmaWVkIGFzIGEgbGVuZ3RoIHdpdGhvdXQgdGhpcyBjaGVjay5cbiAgLy8gSSBjb3VsZCBhbHNvIHVzZSBsb29rYmVoaW5kIGFzc2VydGlvbiBpbiBgbGVuZ3RoVW5pdFJlZ2V4YCBidXQgdGhhdCBpc24ndCBzdXBwb3J0ZWQgd2lkZWx5IGVub3VnaC5cbiAgcmV0dXJuIGxlbmd0aFVuaXRSZWdleC50ZXN0KHZhbHVlKSAmJiAhY29sb3JGdW5jdGlvblJlZ2V4LnRlc3QodmFsdWUpO1xufVxuZnVuY3Rpb24gaXNOZXZlcigpIHtcbiAgcmV0dXJuIGZhbHNlO1xufVxuZnVuY3Rpb24gaXNTaGFkb3codmFsdWUpIHtcbiAgcmV0dXJuIHNoYWRvd1JlZ2V4LnRlc3QodmFsdWUpO1xufVxuZnVuY3Rpb24gaXNJbWFnZSh2YWx1ZSkge1xuICByZXR1cm4gaW1hZ2VSZWdleC50ZXN0KHZhbHVlKTtcbn1cbmNvbnN0IHZhbGlkYXRvcnMgPSAvKiNfX1BVUkVfXyovT2JqZWN0LmRlZmluZVByb3BlcnR5KHtcbiAgX19wcm90b19fOiBudWxsLFxuICBpc0FueSxcbiAgaXNBcmJpdHJhcnlJbWFnZSxcbiAgaXNBcmJpdHJhcnlMZW5ndGgsXG4gIGlzQXJiaXRyYXJ5TnVtYmVyLFxuICBpc0FyYml0cmFyeVBvc2l0aW9uLFxuICBpc0FyYml0cmFyeVNoYWRvdyxcbiAgaXNBcmJpdHJhcnlTaXplLFxuICBpc0FyYml0cmFyeVZhbHVlLFxuICBpc0ludGVnZXIsXG4gIGlzTGVuZ3RoLFxuICBpc051bWJlcixcbiAgaXNQZXJjZW50LFxuICBpc1RzaGlydFNpemVcbn0sIFN5bWJvbC50b1N0cmluZ1RhZywge1xuICB2YWx1ZTogJ01vZHVsZSdcbn0pO1xuZnVuY3Rpb24gZ2V0RGVmYXVsdENvbmZpZygpIHtcbiAgY29uc3QgY29sb3JzID0gZnJvbVRoZW1lKCdjb2xvcnMnKTtcbiAgY29uc3Qgc3BhY2luZyA9IGZyb21UaGVtZSgnc3BhY2luZycpO1xuICBjb25zdCBibHVyID0gZnJvbVRoZW1lKCdibHVyJyk7XG4gIGNvbnN0IGJyaWdodG5lc3MgPSBmcm9tVGhlbWUoJ2JyaWdodG5lc3MnKTtcbiAgY29uc3QgYm9yZGVyQ29sb3IgPSBmcm9tVGhlbWUoJ2JvcmRlckNvbG9yJyk7XG4gIGNvbnN0IGJvcmRlclJhZGl1cyA9IGZyb21UaGVtZSgnYm9yZGVyUmFkaXVzJyk7XG4gIGNvbnN0IGJvcmRlclNwYWNpbmcgPSBmcm9tVGhlbWUoJ2JvcmRlclNwYWNpbmcnKTtcbiAgY29uc3QgYm9yZGVyV2lkdGggPSBmcm9tVGhlbWUoJ2JvcmRlcldpZHRoJyk7XG4gIGNvbnN0IGNvbnRyYXN0ID0gZnJvbVRoZW1lKCdjb250cmFzdCcpO1xuICBjb25zdCBncmF5c2NhbGUgPSBmcm9tVGhlbWUoJ2dyYXlzY2FsZScpO1xuICBjb25zdCBodWVSb3RhdGUgPSBmcm9tVGhlbWUoJ2h1ZVJvdGF0ZScpO1xuICBjb25zdCBpbnZlcnQgPSBmcm9tVGhlbWUoJ2ludmVydCcpO1xuICBjb25zdCBnYXAgPSBmcm9tVGhlbWUoJ2dhcCcpO1xuICBjb25zdCBncmFkaWVudENvbG9yU3RvcHMgPSBmcm9tVGhlbWUoJ2dyYWRpZW50Q29sb3JTdG9wcycpO1xuICBjb25zdCBncmFkaWVudENvbG9yU3RvcFBvc2l0aW9ucyA9IGZyb21UaGVtZSgnZ3JhZGllbnRDb2xvclN0b3BQb3NpdGlvbnMnKTtcbiAgY29uc3QgaW5zZXQgPSBmcm9tVGhlbWUoJ2luc2V0Jyk7XG4gIGNvbnN0IG1hcmdpbiA9IGZyb21UaGVtZSgnbWFyZ2luJyk7XG4gIGNvbnN0IG9wYWNpdHkgPSBmcm9tVGhlbWUoJ29wYWNpdHknKTtcbiAgY29uc3QgcGFkZGluZyA9IGZyb21UaGVtZSgncGFkZGluZycpO1xuICBjb25zdCBzYXR1cmF0ZSA9IGZyb21UaGVtZSgnc2F0dXJhdGUnKTtcbiAgY29uc3Qgc2NhbGUgPSBmcm9tVGhlbWUoJ3NjYWxlJyk7XG4gIGNvbnN0IHNlcGlhID0gZnJvbVRoZW1lKCdzZXBpYScpO1xuICBjb25zdCBza2V3ID0gZnJvbVRoZW1lKCdza2V3Jyk7XG4gIGNvbnN0IHNwYWNlID0gZnJvbVRoZW1lKCdzcGFjZScpO1xuICBjb25zdCB0cmFuc2xhdGUgPSBmcm9tVGhlbWUoJ3RyYW5zbGF0ZScpO1xuICBjb25zdCBnZXRPdmVyc2Nyb2xsID0gKCkgPT4gWydhdXRvJywgJ2NvbnRhaW4nLCAnbm9uZSddO1xuICBjb25zdCBnZXRPdmVyZmxvdyA9ICgpID0+IFsnYXV0bycsICdoaWRkZW4nLCAnY2xpcCcsICd2aXNpYmxlJywgJ3Njcm9sbCddO1xuICBjb25zdCBnZXRTcGFjaW5nV2l0aEF1dG9BbmRBcmJpdHJhcnkgPSAoKSA9PiBbJ2F1dG8nLCBpc0FyYml0cmFyeVZhbHVlLCBzcGFjaW5nXTtcbiAgY29uc3QgZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkgPSAoKSA9PiBbaXNBcmJpdHJhcnlWYWx1ZSwgc3BhY2luZ107XG4gIGNvbnN0IGdldExlbmd0aFdpdGhFbXB0eUFuZEFyYml0cmFyeSA9ICgpID0+IFsnJywgaXNMZW5ndGgsIGlzQXJiaXRyYXJ5TGVuZ3RoXTtcbiAgY29uc3QgZ2V0TnVtYmVyV2l0aEF1dG9BbmRBcmJpdHJhcnkgPSAoKSA9PiBbJ2F1dG8nLCBpc051bWJlciwgaXNBcmJpdHJhcnlWYWx1ZV07XG4gIGNvbnN0IGdldFBvc2l0aW9ucyA9ICgpID0+IFsnYm90dG9tJywgJ2NlbnRlcicsICdsZWZ0JywgJ2xlZnQtYm90dG9tJywgJ2xlZnQtdG9wJywgJ3JpZ2h0JywgJ3JpZ2h0LWJvdHRvbScsICdyaWdodC10b3AnLCAndG9wJ107XG4gIGNvbnN0IGdldExpbmVTdHlsZXMgPSAoKSA9PiBbJ3NvbGlkJywgJ2Rhc2hlZCcsICdkb3R0ZWQnLCAnZG91YmxlJywgJ25vbmUnXTtcbiAgY29uc3QgZ2V0QmxlbmRNb2RlcyA9ICgpID0+IFsnbm9ybWFsJywgJ211bHRpcGx5JywgJ3NjcmVlbicsICdvdmVybGF5JywgJ2RhcmtlbicsICdsaWdodGVuJywgJ2NvbG9yLWRvZGdlJywgJ2NvbG9yLWJ1cm4nLCAnaGFyZC1saWdodCcsICdzb2Z0LWxpZ2h0JywgJ2RpZmZlcmVuY2UnLCAnZXhjbHVzaW9uJywgJ2h1ZScsICdzYXR1cmF0aW9uJywgJ2NvbG9yJywgJ2x1bWlub3NpdHknXTtcbiAgY29uc3QgZ2V0QWxpZ24gPSAoKSA9PiBbJ3N0YXJ0JywgJ2VuZCcsICdjZW50ZXInLCAnYmV0d2VlbicsICdhcm91bmQnLCAnZXZlbmx5JywgJ3N0cmV0Y2gnXTtcbiAgY29uc3QgZ2V0WmVyb0FuZEVtcHR5ID0gKCkgPT4gWycnLCAnMCcsIGlzQXJiaXRyYXJ5VmFsdWVdO1xuICBjb25zdCBnZXRCcmVha3MgPSAoKSA9PiBbJ2F1dG8nLCAnYXZvaWQnLCAnYWxsJywgJ2F2b2lkLXBhZ2UnLCAncGFnZScsICdsZWZ0JywgJ3JpZ2h0JywgJ2NvbHVtbiddO1xuICBjb25zdCBnZXROdW1iZXIgPSAoKSA9PiBbaXNOdW1iZXIsIGlzQXJiaXRyYXJ5TnVtYmVyXTtcbiAgY29uc3QgZ2V0TnVtYmVyQW5kQXJiaXRyYXJ5ID0gKCkgPT4gW2lzTnVtYmVyLCBpc0FyYml0cmFyeVZhbHVlXTtcbiAgcmV0dXJuIHtcbiAgICBjYWNoZVNpemU6IDUwMCxcbiAgICBzZXBhcmF0b3I6ICc6JyxcbiAgICB0aGVtZToge1xuICAgICAgY29sb3JzOiBbaXNBbnldLFxuICAgICAgc3BhY2luZzogW2lzTGVuZ3RoLCBpc0FyYml0cmFyeUxlbmd0aF0sXG4gICAgICBibHVyOiBbJ25vbmUnLCAnJywgaXNUc2hpcnRTaXplLCBpc0FyYml0cmFyeVZhbHVlXSxcbiAgICAgIGJyaWdodG5lc3M6IGdldE51bWJlcigpLFxuICAgICAgYm9yZGVyQ29sb3I6IFtjb2xvcnNdLFxuICAgICAgYm9yZGVyUmFkaXVzOiBbJ25vbmUnLCAnJywgJ2Z1bGwnLCBpc1RzaGlydFNpemUsIGlzQXJiaXRyYXJ5VmFsdWVdLFxuICAgICAgYm9yZGVyU3BhY2luZzogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKSxcbiAgICAgIGJvcmRlcldpZHRoOiBnZXRMZW5ndGhXaXRoRW1wdHlBbmRBcmJpdHJhcnkoKSxcbiAgICAgIGNvbnRyYXN0OiBnZXROdW1iZXIoKSxcbiAgICAgIGdyYXlzY2FsZTogZ2V0WmVyb0FuZEVtcHR5KCksXG4gICAgICBodWVSb3RhdGU6IGdldE51bWJlckFuZEFyYml0cmFyeSgpLFxuICAgICAgaW52ZXJ0OiBnZXRaZXJvQW5kRW1wdHkoKSxcbiAgICAgIGdhcDogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKSxcbiAgICAgIGdyYWRpZW50Q29sb3JTdG9wczogW2NvbG9yc10sXG4gICAgICBncmFkaWVudENvbG9yU3RvcFBvc2l0aW9uczogW2lzUGVyY2VudCwgaXNBcmJpdHJhcnlMZW5ndGhdLFxuICAgICAgaW5zZXQ6IGdldFNwYWNpbmdXaXRoQXV0b0FuZEFyYml0cmFyeSgpLFxuICAgICAgbWFyZ2luOiBnZXRTcGFjaW5nV2l0aEF1dG9BbmRBcmJpdHJhcnkoKSxcbiAgICAgIG9wYWNpdHk6IGdldE51bWJlcigpLFxuICAgICAgcGFkZGluZzogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKSxcbiAgICAgIHNhdHVyYXRlOiBnZXROdW1iZXIoKSxcbiAgICAgIHNjYWxlOiBnZXROdW1iZXIoKSxcbiAgICAgIHNlcGlhOiBnZXRaZXJvQW5kRW1wdHkoKSxcbiAgICAgIHNrZXc6IGdldE51bWJlckFuZEFyYml0cmFyeSgpLFxuICAgICAgc3BhY2U6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KCksXG4gICAgICB0cmFuc2xhdGU6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICB9LFxuICAgIGNsYXNzR3JvdXBzOiB7XG4gICAgICAvLyBMYXlvdXRcbiAgICAgIC8qKlxuICAgICAgICogQXNwZWN0IFJhdGlvXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYXNwZWN0LXJhdGlvXG4gICAgICAgKi9cbiAgICAgIGFzcGVjdDogW3tcbiAgICAgICAgYXNwZWN0OiBbJ2F1dG8nLCAnc3F1YXJlJywgJ3ZpZGVvJywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBDb250YWluZXJcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9jb250YWluZXJcbiAgICAgICAqL1xuICAgICAgY29udGFpbmVyOiBbJ2NvbnRhaW5lciddLFxuICAgICAgLyoqXG4gICAgICAgKiBDb2x1bW5zXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvY29sdW1uc1xuICAgICAgICovXG4gICAgICBjb2x1bW5zOiBbe1xuICAgICAgICBjb2x1bW5zOiBbaXNUc2hpcnRTaXplXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJyZWFrIEFmdGVyXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYnJlYWstYWZ0ZXJcbiAgICAgICAqL1xuICAgICAgJ2JyZWFrLWFmdGVyJzogW3tcbiAgICAgICAgJ2JyZWFrLWFmdGVyJzogZ2V0QnJlYWtzKClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCcmVhayBCZWZvcmVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9icmVhay1iZWZvcmVcbiAgICAgICAqL1xuICAgICAgJ2JyZWFrLWJlZm9yZSc6IFt7XG4gICAgICAgICdicmVhay1iZWZvcmUnOiBnZXRCcmVha3MoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJyZWFrIEluc2lkZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JyZWFrLWluc2lkZVxuICAgICAgICovXG4gICAgICAnYnJlYWstaW5zaWRlJzogW3tcbiAgICAgICAgJ2JyZWFrLWluc2lkZSc6IFsnYXV0bycsICdhdm9pZCcsICdhdm9pZC1wYWdlJywgJ2F2b2lkLWNvbHVtbiddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm94IERlY29yYXRpb24gQnJlYWtcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3gtZGVjb3JhdGlvbi1icmVha1xuICAgICAgICovXG4gICAgICAnYm94LWRlY29yYXRpb24nOiBbe1xuICAgICAgICAnYm94LWRlY29yYXRpb24nOiBbJ3NsaWNlJywgJ2Nsb25lJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3ggU2l6aW5nXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm94LXNpemluZ1xuICAgICAgICovXG4gICAgICBib3g6IFt7XG4gICAgICAgIGJveDogWydib3JkZXInLCAnY29udGVudCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRGlzcGxheVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2Rpc3BsYXlcbiAgICAgICAqL1xuICAgICAgZGlzcGxheTogWydibG9jaycsICdpbmxpbmUtYmxvY2snLCAnaW5saW5lJywgJ2ZsZXgnLCAnaW5saW5lLWZsZXgnLCAndGFibGUnLCAnaW5saW5lLXRhYmxlJywgJ3RhYmxlLWNhcHRpb24nLCAndGFibGUtY2VsbCcsICd0YWJsZS1jb2x1bW4nLCAndGFibGUtY29sdW1uLWdyb3VwJywgJ3RhYmxlLWZvb3Rlci1ncm91cCcsICd0YWJsZS1oZWFkZXItZ3JvdXAnLCAndGFibGUtcm93LWdyb3VwJywgJ3RhYmxlLXJvdycsICdmbG93LXJvb3QnLCAnZ3JpZCcsICdpbmxpbmUtZ3JpZCcsICdjb250ZW50cycsICdsaXN0LWl0ZW0nLCAnaGlkZGVuJ10sXG4gICAgICAvKipcbiAgICAgICAqIEZsb2F0c1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2Zsb2F0XG4gICAgICAgKi9cbiAgICAgIGZsb2F0OiBbe1xuICAgICAgICBmbG9hdDogWydyaWdodCcsICdsZWZ0JywgJ25vbmUnLCAnc3RhcnQnLCAnZW5kJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBDbGVhclxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2NsZWFyXG4gICAgICAgKi9cbiAgICAgIGNsZWFyOiBbe1xuICAgICAgICBjbGVhcjogWydsZWZ0JywgJ3JpZ2h0JywgJ2JvdGgnLCAnbm9uZScsICdzdGFydCcsICdlbmQnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIElzb2xhdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2lzb2xhdGlvblxuICAgICAgICovXG4gICAgICBpc29sYXRpb246IFsnaXNvbGF0ZScsICdpc29sYXRpb24tYXV0byddLFxuICAgICAgLyoqXG4gICAgICAgKiBPYmplY3QgRml0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb2JqZWN0LWZpdFxuICAgICAgICovXG4gICAgICAnb2JqZWN0LWZpdCc6IFt7XG4gICAgICAgIG9iamVjdDogWydjb250YWluJywgJ2NvdmVyJywgJ2ZpbGwnLCAnbm9uZScsICdzY2FsZS1kb3duJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBPYmplY3QgUG9zaXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9vYmplY3QtcG9zaXRpb25cbiAgICAgICAqL1xuICAgICAgJ29iamVjdC1wb3NpdGlvbic6IFt7XG4gICAgICAgIG9iamVjdDogWy4uLmdldFBvc2l0aW9ucygpLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE92ZXJmbG93XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3ZlcmZsb3dcbiAgICAgICAqL1xuICAgICAgb3ZlcmZsb3c6IFt7XG4gICAgICAgIG92ZXJmbG93OiBnZXRPdmVyZmxvdygpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogT3ZlcmZsb3cgWFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL292ZXJmbG93XG4gICAgICAgKi9cbiAgICAgICdvdmVyZmxvdy14JzogW3tcbiAgICAgICAgJ292ZXJmbG93LXgnOiBnZXRPdmVyZmxvdygpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogT3ZlcmZsb3cgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL292ZXJmbG93XG4gICAgICAgKi9cbiAgICAgICdvdmVyZmxvdy15JzogW3tcbiAgICAgICAgJ292ZXJmbG93LXknOiBnZXRPdmVyZmxvdygpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogT3ZlcnNjcm9sbCBCZWhhdmlvclxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL292ZXJzY3JvbGwtYmVoYXZpb3JcbiAgICAgICAqL1xuICAgICAgb3ZlcnNjcm9sbDogW3tcbiAgICAgICAgb3ZlcnNjcm9sbDogZ2V0T3ZlcnNjcm9sbCgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogT3ZlcnNjcm9sbCBCZWhhdmlvciBYXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3ZlcnNjcm9sbC1iZWhhdmlvclxuICAgICAgICovXG4gICAgICAnb3ZlcnNjcm9sbC14JzogW3tcbiAgICAgICAgJ292ZXJzY3JvbGwteCc6IGdldE92ZXJzY3JvbGwoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE92ZXJzY3JvbGwgQmVoYXZpb3IgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL292ZXJzY3JvbGwtYmVoYXZpb3JcbiAgICAgICAqL1xuICAgICAgJ292ZXJzY3JvbGwteSc6IFt7XG4gICAgICAgICdvdmVyc2Nyb2xsLXknOiBnZXRPdmVyc2Nyb2xsKClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBQb3NpdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Bvc2l0aW9uXG4gICAgICAgKi9cbiAgICAgIHBvc2l0aW9uOiBbJ3N0YXRpYycsICdmaXhlZCcsICdhYnNvbHV0ZScsICdyZWxhdGl2ZScsICdzdGlja3knXSxcbiAgICAgIC8qKlxuICAgICAgICogVG9wIC8gUmlnaHQgLyBCb3R0b20gLyBMZWZ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdG9wLXJpZ2h0LWJvdHRvbS1sZWZ0XG4gICAgICAgKi9cbiAgICAgIGluc2V0OiBbe1xuICAgICAgICBpbnNldDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFJpZ2h0IC8gTGVmdFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvcC1yaWdodC1ib3R0b20tbGVmdFxuICAgICAgICovXG4gICAgICAnaW5zZXQteCc6IFt7XG4gICAgICAgICdpbnNldC14JzogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRvcCAvIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvcC1yaWdodC1ib3R0b20tbGVmdFxuICAgICAgICovXG4gICAgICAnaW5zZXQteSc6IFt7XG4gICAgICAgICdpbnNldC15JzogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFN0YXJ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdG9wLXJpZ2h0LWJvdHRvbS1sZWZ0XG4gICAgICAgKi9cbiAgICAgIHN0YXJ0OiBbe1xuICAgICAgICBzdGFydDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEVuZFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvcC1yaWdodC1ib3R0b20tbGVmdFxuICAgICAgICovXG4gICAgICBlbmQ6IFt7XG4gICAgICAgIGVuZDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRvcFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvcC1yaWdodC1ib3R0b20tbGVmdFxuICAgICAgICovXG4gICAgICB0b3A6IFt7XG4gICAgICAgIHRvcDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFJpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdG9wLXJpZ2h0LWJvdHRvbS1sZWZ0XG4gICAgICAgKi9cbiAgICAgIHJpZ2h0OiBbe1xuICAgICAgICByaWdodDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvcC1yaWdodC1ib3R0b20tbGVmdFxuICAgICAgICovXG4gICAgICBib3R0b206IFt7XG4gICAgICAgIGJvdHRvbTogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIExlZnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90b3AtcmlnaHQtYm90dG9tLWxlZnRcbiAgICAgICAqL1xuICAgICAgbGVmdDogW3tcbiAgICAgICAgbGVmdDogW2luc2V0XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFZpc2liaWxpdHlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy92aXNpYmlsaXR5XG4gICAgICAgKi9cbiAgICAgIHZpc2liaWxpdHk6IFsndmlzaWJsZScsICdpbnZpc2libGUnLCAnY29sbGFwc2UnXSxcbiAgICAgIC8qKlxuICAgICAgICogWi1JbmRleFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3otaW5kZXhcbiAgICAgICAqL1xuICAgICAgejogW3tcbiAgICAgICAgejogWydhdXRvJywgaXNJbnRlZ2VyLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvLyBGbGV4Ym94IGFuZCBHcmlkXG4gICAgICAvKipcbiAgICAgICAqIEZsZXggQmFzaXNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mbGV4LWJhc2lzXG4gICAgICAgKi9cbiAgICAgIGJhc2lzOiBbe1xuICAgICAgICBiYXNpczogZ2V0U3BhY2luZ1dpdGhBdXRvQW5kQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBGbGV4IERpcmVjdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZsZXgtZGlyZWN0aW9uXG4gICAgICAgKi9cbiAgICAgICdmbGV4LWRpcmVjdGlvbic6IFt7XG4gICAgICAgIGZsZXg6IFsncm93JywgJ3Jvdy1yZXZlcnNlJywgJ2NvbCcsICdjb2wtcmV2ZXJzZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRmxleCBXcmFwXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZmxleC13cmFwXG4gICAgICAgKi9cbiAgICAgICdmbGV4LXdyYXAnOiBbe1xuICAgICAgICBmbGV4OiBbJ3dyYXAnLCAnd3JhcC1yZXZlcnNlJywgJ25vd3JhcCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRmxleFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZsZXhcbiAgICAgICAqL1xuICAgICAgZmxleDogW3tcbiAgICAgICAgZmxleDogWycxJywgJ2F1dG8nLCAnaW5pdGlhbCcsICdub25lJywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBGbGV4IEdyb3dcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mbGV4LWdyb3dcbiAgICAgICAqL1xuICAgICAgZ3JvdzogW3tcbiAgICAgICAgZ3JvdzogZ2V0WmVyb0FuZEVtcHR5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBGbGV4IFNocmlua1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZsZXgtc2hyaW5rXG4gICAgICAgKi9cbiAgICAgIHNocmluazogW3tcbiAgICAgICAgc2hyaW5rOiBnZXRaZXJvQW5kRW1wdHkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE9yZGVyXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3JkZXJcbiAgICAgICAqL1xuICAgICAgb3JkZXI6IFt7XG4gICAgICAgIG9yZGVyOiBbJ2ZpcnN0JywgJ2xhc3QnLCAnbm9uZScsIGlzSW50ZWdlciwgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHcmlkIFRlbXBsYXRlIENvbHVtbnNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ncmlkLXRlbXBsYXRlLWNvbHVtbnNcbiAgICAgICAqL1xuICAgICAgJ2dyaWQtY29scyc6IFt7XG4gICAgICAgICdncmlkLWNvbHMnOiBbaXNBbnldXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JpZCBDb2x1bW4gU3RhcnQgLyBFbmRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ncmlkLWNvbHVtblxuICAgICAgICovXG4gICAgICAnY29sLXN0YXJ0LWVuZCc6IFt7XG4gICAgICAgIGNvbDogWydhdXRvJywge1xuICAgICAgICAgIHNwYW46IFsnZnVsbCcsIGlzSW50ZWdlciwgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgICAgfSwgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHcmlkIENvbHVtbiBTdGFydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dyaWQtY29sdW1uXG4gICAgICAgKi9cbiAgICAgICdjb2wtc3RhcnQnOiBbe1xuICAgICAgICAnY29sLXN0YXJ0JzogZ2V0TnVtYmVyV2l0aEF1dG9BbmRBcmJpdHJhcnkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyaWQgQ29sdW1uIEVuZFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dyaWQtY29sdW1uXG4gICAgICAgKi9cbiAgICAgICdjb2wtZW5kJzogW3tcbiAgICAgICAgJ2NvbC1lbmQnOiBnZXROdW1iZXJXaXRoQXV0b0FuZEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JpZCBUZW1wbGF0ZSBSb3dzXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JpZC10ZW1wbGF0ZS1yb3dzXG4gICAgICAgKi9cbiAgICAgICdncmlkLXJvd3MnOiBbe1xuICAgICAgICAnZ3JpZC1yb3dzJzogW2lzQW55XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyaWQgUm93IFN0YXJ0IC8gRW5kXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JpZC1yb3dcbiAgICAgICAqL1xuICAgICAgJ3Jvdy1zdGFydC1lbmQnOiBbe1xuICAgICAgICByb3c6IFsnYXV0bycsIHtcbiAgICAgICAgICBzcGFuOiBbaXNJbnRlZ2VyLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgICB9LCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyaWQgUm93IFN0YXJ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JpZC1yb3dcbiAgICAgICAqL1xuICAgICAgJ3Jvdy1zdGFydCc6IFt7XG4gICAgICAgICdyb3ctc3RhcnQnOiBnZXROdW1iZXJXaXRoQXV0b0FuZEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JpZCBSb3cgRW5kXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JpZC1yb3dcbiAgICAgICAqL1xuICAgICAgJ3Jvdy1lbmQnOiBbe1xuICAgICAgICAncm93LWVuZCc6IGdldE51bWJlcldpdGhBdXRvQW5kQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHcmlkIEF1dG8gRmxvd1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dyaWQtYXV0by1mbG93XG4gICAgICAgKi9cbiAgICAgICdncmlkLWZsb3cnOiBbe1xuICAgICAgICAnZ3JpZC1mbG93JzogWydyb3cnLCAnY29sJywgJ2RlbnNlJywgJ3Jvdy1kZW5zZScsICdjb2wtZGVuc2UnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyaWQgQXV0byBDb2x1bW5zXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JpZC1hdXRvLWNvbHVtbnNcbiAgICAgICAqL1xuICAgICAgJ2F1dG8tY29scyc6IFt7XG4gICAgICAgICdhdXRvLWNvbHMnOiBbJ2F1dG8nLCAnbWluJywgJ21heCcsICdmcicsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JpZCBBdXRvIFJvd3NcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ncmlkLWF1dG8tcm93c1xuICAgICAgICovXG4gICAgICAnYXV0by1yb3dzJzogW3tcbiAgICAgICAgJ2F1dG8tcm93cyc6IFsnYXV0bycsICdtaW4nLCAnbWF4JywgJ2ZyJywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHYXBcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9nYXBcbiAgICAgICAqL1xuICAgICAgZ2FwOiBbe1xuICAgICAgICBnYXA6IFtnYXBdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR2FwIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9nYXBcbiAgICAgICAqL1xuICAgICAgJ2dhcC14JzogW3tcbiAgICAgICAgJ2dhcC14JzogW2dhcF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHYXAgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dhcFxuICAgICAgICovXG4gICAgICAnZ2FwLXknOiBbe1xuICAgICAgICAnZ2FwLXknOiBbZ2FwXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEp1c3RpZnkgQ29udGVudFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2p1c3RpZnktY29udGVudFxuICAgICAgICovXG4gICAgICAnanVzdGlmeS1jb250ZW50JzogW3tcbiAgICAgICAganVzdGlmeTogWydub3JtYWwnLCAuLi5nZXRBbGlnbigpXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEp1c3RpZnkgSXRlbXNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9qdXN0aWZ5LWl0ZW1zXG4gICAgICAgKi9cbiAgICAgICdqdXN0aWZ5LWl0ZW1zJzogW3tcbiAgICAgICAgJ2p1c3RpZnktaXRlbXMnOiBbJ3N0YXJ0JywgJ2VuZCcsICdjZW50ZXInLCAnc3RyZXRjaCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogSnVzdGlmeSBTZWxmXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvanVzdGlmeS1zZWxmXG4gICAgICAgKi9cbiAgICAgICdqdXN0aWZ5LXNlbGYnOiBbe1xuICAgICAgICAnanVzdGlmeS1zZWxmJzogWydhdXRvJywgJ3N0YXJ0JywgJ2VuZCcsICdjZW50ZXInLCAnc3RyZXRjaCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQWxpZ24gQ29udGVudFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2FsaWduLWNvbnRlbnRcbiAgICAgICAqL1xuICAgICAgJ2FsaWduLWNvbnRlbnQnOiBbe1xuICAgICAgICBjb250ZW50OiBbJ25vcm1hbCcsIC4uLmdldEFsaWduKCksICdiYXNlbGluZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQWxpZ24gSXRlbXNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9hbGlnbi1pdGVtc1xuICAgICAgICovXG4gICAgICAnYWxpZ24taXRlbXMnOiBbe1xuICAgICAgICBpdGVtczogWydzdGFydCcsICdlbmQnLCAnY2VudGVyJywgJ2Jhc2VsaW5lJywgJ3N0cmV0Y2gnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEFsaWduIFNlbGZcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9hbGlnbi1zZWxmXG4gICAgICAgKi9cbiAgICAgICdhbGlnbi1zZWxmJzogW3tcbiAgICAgICAgc2VsZjogWydhdXRvJywgJ3N0YXJ0JywgJ2VuZCcsICdjZW50ZXInLCAnc3RyZXRjaCcsICdiYXNlbGluZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGxhY2UgQ29udGVudFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3BsYWNlLWNvbnRlbnRcbiAgICAgICAqL1xuICAgICAgJ3BsYWNlLWNvbnRlbnQnOiBbe1xuICAgICAgICAncGxhY2UtY29udGVudCc6IFsuLi5nZXRBbGlnbigpLCAnYmFzZWxpbmUnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFBsYWNlIEl0ZW1zXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcGxhY2UtaXRlbXNcbiAgICAgICAqL1xuICAgICAgJ3BsYWNlLWl0ZW1zJzogW3tcbiAgICAgICAgJ3BsYWNlLWl0ZW1zJzogWydzdGFydCcsICdlbmQnLCAnY2VudGVyJywgJ2Jhc2VsaW5lJywgJ3N0cmV0Y2gnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFBsYWNlIFNlbGZcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wbGFjZS1zZWxmXG4gICAgICAgKi9cbiAgICAgICdwbGFjZS1zZWxmJzogW3tcbiAgICAgICAgJ3BsYWNlLXNlbGYnOiBbJ2F1dG8nLCAnc3RhcnQnLCAnZW5kJywgJ2NlbnRlcicsICdzdHJldGNoJ11cbiAgICAgIH1dLFxuICAgICAgLy8gU3BhY2luZ1xuICAgICAgLyoqXG4gICAgICAgKiBQYWRkaW5nXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcGFkZGluZ1xuICAgICAgICovXG4gICAgICBwOiBbe1xuICAgICAgICBwOiBbcGFkZGluZ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBQYWRkaW5nIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgIHB4OiBbe1xuICAgICAgICBweDogW3BhZGRpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGFkZGluZyBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcGFkZGluZ1xuICAgICAgICovXG4gICAgICBweTogW3tcbiAgICAgICAgcHk6IFtwYWRkaW5nXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFBhZGRpbmcgU3RhcnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgIHBzOiBbe1xuICAgICAgICBwczogW3BhZGRpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGFkZGluZyBFbmRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgIHBlOiBbe1xuICAgICAgICBwZTogW3BhZGRpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGFkZGluZyBUb3BcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgIHB0OiBbe1xuICAgICAgICBwdDogW3BhZGRpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGFkZGluZyBSaWdodFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3BhZGRpbmdcbiAgICAgICAqL1xuICAgICAgcHI6IFt7XG4gICAgICAgIHByOiBbcGFkZGluZ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBQYWRkaW5nIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3BhZGRpbmdcbiAgICAgICAqL1xuICAgICAgcGI6IFt7XG4gICAgICAgIHBiOiBbcGFkZGluZ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBQYWRkaW5nIExlZnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgIHBsOiBbe1xuICAgICAgICBwbDogW3BhZGRpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogTWFyZ2luXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbWFyZ2luXG4gICAgICAgKi9cbiAgICAgIG06IFt7XG4gICAgICAgIG06IFttYXJnaW5dXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogTWFyZ2luIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXJnaW5cbiAgICAgICAqL1xuICAgICAgbXg6IFt7XG4gICAgICAgIG14OiBbbWFyZ2luXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1hcmdpbiBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbWFyZ2luXG4gICAgICAgKi9cbiAgICAgIG15OiBbe1xuICAgICAgICBteTogW21hcmdpbl1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBNYXJnaW4gU3RhcnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXJnaW5cbiAgICAgICAqL1xuICAgICAgbXM6IFt7XG4gICAgICAgIG1zOiBbbWFyZ2luXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1hcmdpbiBFbmRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXJnaW5cbiAgICAgICAqL1xuICAgICAgbWU6IFt7XG4gICAgICAgIG1lOiBbbWFyZ2luXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1hcmdpbiBUb3BcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXJnaW5cbiAgICAgICAqL1xuICAgICAgbXQ6IFt7XG4gICAgICAgIG10OiBbbWFyZ2luXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1hcmdpbiBSaWdodFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL21hcmdpblxuICAgICAgICovXG4gICAgICBtcjogW3tcbiAgICAgICAgbXI6IFttYXJnaW5dXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogTWFyZ2luIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL21hcmdpblxuICAgICAgICovXG4gICAgICBtYjogW3tcbiAgICAgICAgbWI6IFttYXJnaW5dXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogTWFyZ2luIExlZnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXJnaW5cbiAgICAgICAqL1xuICAgICAgbWw6IFt7XG4gICAgICAgIG1sOiBbbWFyZ2luXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNwYWNlIEJldHdlZW4gWFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3NwYWNlXG4gICAgICAgKi9cbiAgICAgICdzcGFjZS14JzogW3tcbiAgICAgICAgJ3NwYWNlLXgnOiBbc3BhY2VdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU3BhY2UgQmV0d2VlbiBYIFJldmVyc2VcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zcGFjZVxuICAgICAgICovXG4gICAgICAnc3BhY2UteC1yZXZlcnNlJzogWydzcGFjZS14LXJldmVyc2UnXSxcbiAgICAgIC8qKlxuICAgICAgICogU3BhY2UgQmV0d2VlbiBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc3BhY2VcbiAgICAgICAqL1xuICAgICAgJ3NwYWNlLXknOiBbe1xuICAgICAgICAnc3BhY2UteSc6IFtzcGFjZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTcGFjZSBCZXR3ZWVuIFkgUmV2ZXJzZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3NwYWNlXG4gICAgICAgKi9cbiAgICAgICdzcGFjZS15LXJldmVyc2UnOiBbJ3NwYWNlLXktcmV2ZXJzZSddLFxuICAgICAgLy8gU2l6aW5nXG4gICAgICAvKipcbiAgICAgICAqIFdpZHRoXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvd2lkdGhcbiAgICAgICAqL1xuICAgICAgdzogW3tcbiAgICAgICAgdzogWydhdXRvJywgJ21pbicsICdtYXgnLCAnZml0JywgJ3N2dycsICdsdncnLCAnZHZ3JywgaXNBcmJpdHJhcnlWYWx1ZSwgc3BhY2luZ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBNaW4tV2lkdGhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9taW4td2lkdGhcbiAgICAgICAqL1xuICAgICAgJ21pbi13JzogW3tcbiAgICAgICAgJ21pbi13JzogW2lzQXJiaXRyYXJ5VmFsdWUsIHNwYWNpbmcsICdtaW4nLCAnbWF4JywgJ2ZpdCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogTWF4LVdpZHRoXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbWF4LXdpZHRoXG4gICAgICAgKi9cbiAgICAgICdtYXgtdyc6IFt7XG4gICAgICAgICdtYXgtdyc6IFtpc0FyYml0cmFyeVZhbHVlLCBzcGFjaW5nLCAnbm9uZScsICdmdWxsJywgJ21pbicsICdtYXgnLCAnZml0JywgJ3Byb3NlJywge1xuICAgICAgICAgIHNjcmVlbjogW2lzVHNoaXJ0U2l6ZV1cbiAgICAgICAgfSwgaXNUc2hpcnRTaXplXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEhlaWdodFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2hlaWdodFxuICAgICAgICovXG4gICAgICBoOiBbe1xuICAgICAgICBoOiBbaXNBcmJpdHJhcnlWYWx1ZSwgc3BhY2luZywgJ2F1dG8nLCAnbWluJywgJ21heCcsICdmaXQnLCAnc3ZoJywgJ2x2aCcsICdkdmgnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1pbi1IZWlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9taW4taGVpZ2h0XG4gICAgICAgKi9cbiAgICAgICdtaW4taCc6IFt7XG4gICAgICAgICdtaW4taCc6IFtpc0FyYml0cmFyeVZhbHVlLCBzcGFjaW5nLCAnbWluJywgJ21heCcsICdmaXQnLCAnc3ZoJywgJ2x2aCcsICdkdmgnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE1heC1IZWlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9tYXgtaGVpZ2h0XG4gICAgICAgKi9cbiAgICAgICdtYXgtaCc6IFt7XG4gICAgICAgICdtYXgtaCc6IFtpc0FyYml0cmFyeVZhbHVlLCBzcGFjaW5nLCAnbWluJywgJ21heCcsICdmaXQnLCAnc3ZoJywgJ2x2aCcsICdkdmgnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNpemVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zaXplXG4gICAgICAgKi9cbiAgICAgIHNpemU6IFt7XG4gICAgICAgIHNpemU6IFtpc0FyYml0cmFyeVZhbHVlLCBzcGFjaW5nLCAnYXV0bycsICdtaW4nLCAnbWF4JywgJ2ZpdCddXG4gICAgICB9XSxcbiAgICAgIC8vIFR5cG9ncmFwaHlcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBTaXplXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZm9udC1zaXplXG4gICAgICAgKi9cbiAgICAgICdmb250LXNpemUnOiBbe1xuICAgICAgICB0ZXh0OiBbJ2Jhc2UnLCBpc1RzaGlydFNpemUsIGlzQXJiaXRyYXJ5TGVuZ3RoXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEZvbnQgU21vb3RoaW5nXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZm9udC1zbW9vdGhpbmdcbiAgICAgICAqL1xuICAgICAgJ2ZvbnQtc21vb3RoaW5nJzogWydhbnRpYWxpYXNlZCcsICdzdWJwaXhlbC1hbnRpYWxpYXNlZCddLFxuICAgICAgLyoqXG4gICAgICAgKiBGb250IFN0eWxlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZm9udC1zdHlsZVxuICAgICAgICovXG4gICAgICAnZm9udC1zdHlsZSc6IFsnaXRhbGljJywgJ25vdC1pdGFsaWMnXSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBXZWlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LXdlaWdodFxuICAgICAgICovXG4gICAgICAnZm9udC13ZWlnaHQnOiBbe1xuICAgICAgICBmb250OiBbJ3RoaW4nLCAnZXh0cmFsaWdodCcsICdsaWdodCcsICdub3JtYWwnLCAnbWVkaXVtJywgJ3NlbWlib2xkJywgJ2JvbGQnLCAnZXh0cmFib2xkJywgJ2JsYWNrJywgaXNBcmJpdHJhcnlOdW1iZXJdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBGYW1pbHlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LWZhbWlseVxuICAgICAgICovXG4gICAgICAnZm9udC1mYW1pbHknOiBbe1xuICAgICAgICBmb250OiBbaXNBbnldXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBWYXJpYW50IE51bWVyaWNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LXZhcmlhbnQtbnVtZXJpY1xuICAgICAgICovXG4gICAgICAnZnZuLW5vcm1hbCc6IFsnbm9ybWFsLW51bXMnXSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBWYXJpYW50IE51bWVyaWNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LXZhcmlhbnQtbnVtZXJpY1xuICAgICAgICovXG4gICAgICAnZnZuLW9yZGluYWwnOiBbJ29yZGluYWwnXSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBWYXJpYW50IE51bWVyaWNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LXZhcmlhbnQtbnVtZXJpY1xuICAgICAgICovXG4gICAgICAnZnZuLXNsYXNoZWQtemVybyc6IFsnc2xhc2hlZC16ZXJvJ10sXG4gICAgICAvKipcbiAgICAgICAqIEZvbnQgVmFyaWFudCBOdW1lcmljXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZm9udC12YXJpYW50LW51bWVyaWNcbiAgICAgICAqL1xuICAgICAgJ2Z2bi1maWd1cmUnOiBbJ2xpbmluZy1udW1zJywgJ29sZHN0eWxlLW51bXMnXSxcbiAgICAgIC8qKlxuICAgICAgICogRm9udCBWYXJpYW50IE51bWVyaWNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9mb250LXZhcmlhbnQtbnVtZXJpY1xuICAgICAgICovXG4gICAgICAnZnZuLXNwYWNpbmcnOiBbJ3Byb3BvcnRpb25hbC1udW1zJywgJ3RhYnVsYXItbnVtcyddLFxuICAgICAgLyoqXG4gICAgICAgKiBGb250IFZhcmlhbnQgTnVtZXJpY1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZvbnQtdmFyaWFudC1udW1lcmljXG4gICAgICAgKi9cbiAgICAgICdmdm4tZnJhY3Rpb24nOiBbJ2RpYWdvbmFsLWZyYWN0aW9ucycsICdzdGFja2VkLWZyYWN0b25zJ10sXG4gICAgICAvKipcbiAgICAgICAqIExldHRlciBTcGFjaW5nXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbGV0dGVyLXNwYWNpbmdcbiAgICAgICAqL1xuICAgICAgdHJhY2tpbmc6IFt7XG4gICAgICAgIHRyYWNraW5nOiBbJ3RpZ2h0ZXInLCAndGlnaHQnLCAnbm9ybWFsJywgJ3dpZGUnLCAnd2lkZXInLCAnd2lkZXN0JywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBMaW5lIENsYW1wXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbGluZS1jbGFtcFxuICAgICAgICovXG4gICAgICAnbGluZS1jbGFtcCc6IFt7XG4gICAgICAgICdsaW5lLWNsYW1wJzogWydub25lJywgaXNOdW1iZXIsIGlzQXJiaXRyYXJ5TnVtYmVyXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIExpbmUgSGVpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbGluZS1oZWlnaHRcbiAgICAgICAqL1xuICAgICAgbGVhZGluZzogW3tcbiAgICAgICAgbGVhZGluZzogWydub25lJywgJ3RpZ2h0JywgJ3NudWcnLCAnbm9ybWFsJywgJ3JlbGF4ZWQnLCAnbG9vc2UnLCBpc0xlbmd0aCwgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBMaXN0IFN0eWxlIEltYWdlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvbGlzdC1zdHlsZS1pbWFnZVxuICAgICAgICovXG4gICAgICAnbGlzdC1pbWFnZSc6IFt7XG4gICAgICAgICdsaXN0LWltYWdlJzogWydub25lJywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBMaXN0IFN0eWxlIFR5cGVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9saXN0LXN0eWxlLXR5cGVcbiAgICAgICAqL1xuICAgICAgJ2xpc3Qtc3R5bGUtdHlwZSc6IFt7XG4gICAgICAgIGxpc3Q6IFsnbm9uZScsICdkaXNjJywgJ2RlY2ltYWwnLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIExpc3QgU3R5bGUgUG9zaXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9saXN0LXN0eWxlLXBvc2l0aW9uXG4gICAgICAgKi9cbiAgICAgICdsaXN0LXN0eWxlLXBvc2l0aW9uJzogW3tcbiAgICAgICAgbGlzdDogWydpbnNpZGUnLCAnb3V0c2lkZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUGxhY2Vob2xkZXIgQ29sb3JcbiAgICAgICAqIEBkZXByZWNhdGVkIHNpbmNlIFRhaWx3aW5kIENTUyB2My4wLjBcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wbGFjZWhvbGRlci1jb2xvclxuICAgICAgICovXG4gICAgICAncGxhY2Vob2xkZXItY29sb3InOiBbe1xuICAgICAgICBwbGFjZWhvbGRlcjogW2NvbG9yc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBQbGFjZWhvbGRlciBPcGFjaXR5XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcGxhY2Vob2xkZXItb3BhY2l0eVxuICAgICAgICovXG4gICAgICAncGxhY2Vob2xkZXItb3BhY2l0eSc6IFt7XG4gICAgICAgICdwbGFjZWhvbGRlci1vcGFjaXR5JzogW29wYWNpdHldXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBBbGlnbm1lbnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90ZXh0LWFsaWduXG4gICAgICAgKi9cbiAgICAgICd0ZXh0LWFsaWdubWVudCc6IFt7XG4gICAgICAgIHRleHQ6IFsnbGVmdCcsICdjZW50ZXInLCAncmlnaHQnLCAnanVzdGlmeScsICdzdGFydCcsICdlbmQnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRleHQgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90ZXh0LWNvbG9yXG4gICAgICAgKi9cbiAgICAgICd0ZXh0LWNvbG9yJzogW3tcbiAgICAgICAgdGV4dDogW2NvbG9yc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBUZXh0IE9wYWNpdHlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90ZXh0LW9wYWNpdHlcbiAgICAgICAqL1xuICAgICAgJ3RleHQtb3BhY2l0eSc6IFt7XG4gICAgICAgICd0ZXh0LW9wYWNpdHknOiBbb3BhY2l0eV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBUZXh0IERlY29yYXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90ZXh0LWRlY29yYXRpb25cbiAgICAgICAqL1xuICAgICAgJ3RleHQtZGVjb3JhdGlvbic6IFsndW5kZXJsaW5lJywgJ292ZXJsaW5lJywgJ2xpbmUtdGhyb3VnaCcsICduby11bmRlcmxpbmUnXSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBEZWNvcmF0aW9uIFN0eWxlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdGV4dC1kZWNvcmF0aW9uLXN0eWxlXG4gICAgICAgKi9cbiAgICAgICd0ZXh0LWRlY29yYXRpb24tc3R5bGUnOiBbe1xuICAgICAgICBkZWNvcmF0aW9uOiBbLi4uZ2V0TGluZVN0eWxlcygpLCAnd2F2eSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBEZWNvcmF0aW9uIFRoaWNrbmVzc1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RleHQtZGVjb3JhdGlvbi10aGlja25lc3NcbiAgICAgICAqL1xuICAgICAgJ3RleHQtZGVjb3JhdGlvbi10aGlja25lc3MnOiBbe1xuICAgICAgICBkZWNvcmF0aW9uOiBbJ2F1dG8nLCAnZnJvbS1mb250JywgaXNMZW5ndGgsIGlzQXJiaXRyYXJ5TGVuZ3RoXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRleHQgVW5kZXJsaW5lIE9mZnNldFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RleHQtdW5kZXJsaW5lLW9mZnNldFxuICAgICAgICovXG4gICAgICAndW5kZXJsaW5lLW9mZnNldCc6IFt7XG4gICAgICAgICd1bmRlcmxpbmUtb2Zmc2V0JzogWydhdXRvJywgaXNMZW5ndGgsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBEZWNvcmF0aW9uIENvbG9yXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdGV4dC1kZWNvcmF0aW9uLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICd0ZXh0LWRlY29yYXRpb24tY29sb3InOiBbe1xuICAgICAgICBkZWNvcmF0aW9uOiBbY29sb3JzXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRleHQgVHJhbnNmb3JtXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdGV4dC10cmFuc2Zvcm1cbiAgICAgICAqL1xuICAgICAgJ3RleHQtdHJhbnNmb3JtJzogWyd1cHBlcmNhc2UnLCAnbG93ZXJjYXNlJywgJ2NhcGl0YWxpemUnLCAnbm9ybWFsLWNhc2UnXSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBPdmVyZmxvd1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RleHQtb3ZlcmZsb3dcbiAgICAgICAqL1xuICAgICAgJ3RleHQtb3ZlcmZsb3cnOiBbJ3RydW5jYXRlJywgJ3RleHQtZWxsaXBzaXMnLCAndGV4dC1jbGlwJ10sXG4gICAgICAvKipcbiAgICAgICAqIFRleHQgV3JhcFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RleHQtd3JhcFxuICAgICAgICovXG4gICAgICAndGV4dC13cmFwJzogW3tcbiAgICAgICAgdGV4dDogWyd3cmFwJywgJ25vd3JhcCcsICdiYWxhbmNlJywgJ3ByZXR0eSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVGV4dCBJbmRlbnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90ZXh0LWluZGVudFxuICAgICAgICovXG4gICAgICBpbmRlbnQ6IFt7XG4gICAgICAgIGluZGVudDogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFZlcnRpY2FsIEFsaWdubWVudFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3ZlcnRpY2FsLWFsaWduXG4gICAgICAgKi9cbiAgICAgICd2ZXJ0aWNhbC1hbGlnbic6IFt7XG4gICAgICAgIGFsaWduOiBbJ2Jhc2VsaW5lJywgJ3RvcCcsICdtaWRkbGUnLCAnYm90dG9tJywgJ3RleHQtdG9wJywgJ3RleHQtYm90dG9tJywgJ3N1YicsICdzdXBlcicsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogV2hpdGVzcGFjZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3doaXRlc3BhY2VcbiAgICAgICAqL1xuICAgICAgd2hpdGVzcGFjZTogW3tcbiAgICAgICAgd2hpdGVzcGFjZTogWydub3JtYWwnLCAnbm93cmFwJywgJ3ByZScsICdwcmUtbGluZScsICdwcmUtd3JhcCcsICdicmVhay1zcGFjZXMnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFdvcmQgQnJlYWtcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy93b3JkLWJyZWFrXG4gICAgICAgKi9cbiAgICAgIGJyZWFrOiBbe1xuICAgICAgICBicmVhazogWydub3JtYWwnLCAnd29yZHMnLCAnYWxsJywgJ2tlZXAnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEh5cGhlbnNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9oeXBoZW5zXG4gICAgICAgKi9cbiAgICAgIGh5cGhlbnM6IFt7XG4gICAgICAgIGh5cGhlbnM6IFsnbm9uZScsICdtYW51YWwnLCAnYXV0byddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQ29udGVudFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2NvbnRlbnRcbiAgICAgICAqL1xuICAgICAgY29udGVudDogW3tcbiAgICAgICAgY29udGVudDogWydub25lJywgaXNBcmJpdHJhcnlWYWx1ZV1cbiAgICAgIH1dLFxuICAgICAgLy8gQmFja2dyb3VuZHNcbiAgICAgIC8qKlxuICAgICAgICogQmFja2dyb3VuZCBBdHRhY2htZW50XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2dyb3VuZC1hdHRhY2htZW50XG4gICAgICAgKi9cbiAgICAgICdiZy1hdHRhY2htZW50JzogW3tcbiAgICAgICAgYmc6IFsnZml4ZWQnLCAnbG9jYWwnLCAnc2Nyb2xsJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCYWNrZ3JvdW5kIENsaXBcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLWNsaXBcbiAgICAgICAqL1xuICAgICAgJ2JnLWNsaXAnOiBbe1xuICAgICAgICAnYmctY2xpcCc6IFsnYm9yZGVyJywgJ3BhZGRpbmcnLCAnY29udGVudCcsICd0ZXh0J11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCYWNrZ3JvdW5kIE9wYWNpdHlcbiAgICAgICAqIEBkZXByZWNhdGVkIHNpbmNlIFRhaWx3aW5kIENTUyB2My4wLjBcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLW9wYWNpdHlcbiAgICAgICAqL1xuICAgICAgJ2JnLW9wYWNpdHknOiBbe1xuICAgICAgICAnYmctb3BhY2l0eSc6IFtvcGFjaXR5XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tncm91bmQgT3JpZ2luXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2dyb3VuZC1vcmlnaW5cbiAgICAgICAqL1xuICAgICAgJ2JnLW9yaWdpbic6IFt7XG4gICAgICAgICdiZy1vcmlnaW4nOiBbJ2JvcmRlcicsICdwYWRkaW5nJywgJ2NvbnRlbnQnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tncm91bmQgUG9zaXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLXBvc2l0aW9uXG4gICAgICAgKi9cbiAgICAgICdiZy1wb3NpdGlvbic6IFt7XG4gICAgICAgIGJnOiBbLi4uZ2V0UG9zaXRpb25zKCksIGlzQXJiaXRyYXJ5UG9zaXRpb25dXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2dyb3VuZCBSZXBlYXRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLXJlcGVhdFxuICAgICAgICovXG4gICAgICAnYmctcmVwZWF0JzogW3tcbiAgICAgICAgYmc6IFsnbm8tcmVwZWF0Jywge1xuICAgICAgICAgIHJlcGVhdDogWycnLCAneCcsICd5JywgJ3JvdW5kJywgJ3NwYWNlJ11cbiAgICAgICAgfV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCYWNrZ3JvdW5kIFNpemVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLXNpemVcbiAgICAgICAqL1xuICAgICAgJ2JnLXNpemUnOiBbe1xuICAgICAgICBiZzogWydhdXRvJywgJ2NvdmVyJywgJ2NvbnRhaW4nLCBpc0FyYml0cmFyeVNpemVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2dyb3VuZCBJbWFnZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JhY2tncm91bmQtaW1hZ2VcbiAgICAgICAqL1xuICAgICAgJ2JnLWltYWdlJzogW3tcbiAgICAgICAgYmc6IFsnbm9uZScsIHtcbiAgICAgICAgICAnZ3JhZGllbnQtdG8nOiBbJ3QnLCAndHInLCAncicsICdicicsICdiJywgJ2JsJywgJ2wnLCAndGwnXVxuICAgICAgICB9LCBpc0FyYml0cmFyeUltYWdlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tncm91bmQgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZ3JvdW5kLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdiZy1jb2xvcic6IFt7XG4gICAgICAgIGJnOiBbY29sb3JzXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyYWRpZW50IENvbG9yIFN0b3BzIEZyb20gUG9zaXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ncmFkaWVudC1jb2xvci1zdG9wc1xuICAgICAgICovXG4gICAgICAnZ3JhZGllbnQtZnJvbS1wb3MnOiBbe1xuICAgICAgICBmcm9tOiBbZ3JhZGllbnRDb2xvclN0b3BQb3NpdGlvbnNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JhZGllbnQgQ29sb3IgU3RvcHMgVmlhIFBvc2l0aW9uXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JhZGllbnQtY29sb3Itc3RvcHNcbiAgICAgICAqL1xuICAgICAgJ2dyYWRpZW50LXZpYS1wb3MnOiBbe1xuICAgICAgICB2aWE6IFtncmFkaWVudENvbG9yU3RvcFBvc2l0aW9uc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHcmFkaWVudCBDb2xvciBTdG9wcyBUbyBQb3NpdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dyYWRpZW50LWNvbG9yLXN0b3BzXG4gICAgICAgKi9cbiAgICAgICdncmFkaWVudC10by1wb3MnOiBbe1xuICAgICAgICB0bzogW2dyYWRpZW50Q29sb3JTdG9wUG9zaXRpb25zXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEdyYWRpZW50IENvbG9yIFN0b3BzIEZyb21cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ncmFkaWVudC1jb2xvci1zdG9wc1xuICAgICAgICovXG4gICAgICAnZ3JhZGllbnQtZnJvbSc6IFt7XG4gICAgICAgIGZyb206IFtncmFkaWVudENvbG9yU3RvcHNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JhZGllbnQgQ29sb3IgU3RvcHMgVmlhXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JhZGllbnQtY29sb3Itc3RvcHNcbiAgICAgICAqL1xuICAgICAgJ2dyYWRpZW50LXZpYSc6IFt7XG4gICAgICAgIHZpYTogW2dyYWRpZW50Q29sb3JTdG9wc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBHcmFkaWVudCBDb2xvciBTdG9wcyBUb1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2dyYWRpZW50LWNvbG9yLXN0b3BzXG4gICAgICAgKi9cbiAgICAgICdncmFkaWVudC10byc6IFt7XG4gICAgICAgIHRvOiBbZ3JhZGllbnRDb2xvclN0b3BzXVxuICAgICAgfV0sXG4gICAgICAvLyBCb3JkZXJzXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBSYWRpdXNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItcmFkaXVzXG4gICAgICAgKi9cbiAgICAgIHJvdW5kZWQ6IFt7XG4gICAgICAgIHJvdW5kZWQ6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBTdGFydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1yYWRpdXNcbiAgICAgICAqL1xuICAgICAgJ3JvdW5kZWQtcyc6IFt7XG4gICAgICAgICdyb3VuZGVkLXMnOiBbYm9yZGVyUmFkaXVzXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBSYWRpdXMgRW5kXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1lJzogW3tcbiAgICAgICAgJ3JvdW5kZWQtZSc6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBUb3BcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItcmFkaXVzXG4gICAgICAgKi9cbiAgICAgICdyb3VuZGVkLXQnOiBbe1xuICAgICAgICAncm91bmRlZC10JzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIFJpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1yJzogW3tcbiAgICAgICAgJ3JvdW5kZWQtcic6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBCb3R0b21cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItcmFkaXVzXG4gICAgICAgKi9cbiAgICAgICdyb3VuZGVkLWInOiBbe1xuICAgICAgICAncm91bmRlZC1iJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIExlZnRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItcmFkaXVzXG4gICAgICAgKi9cbiAgICAgICdyb3VuZGVkLWwnOiBbe1xuICAgICAgICAncm91bmRlZC1sJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIFN0YXJ0IFN0YXJ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1zcyc6IFt7XG4gICAgICAgICdyb3VuZGVkLXNzJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIFN0YXJ0IEVuZFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1yYWRpdXNcbiAgICAgICAqL1xuICAgICAgJ3JvdW5kZWQtc2UnOiBbe1xuICAgICAgICAncm91bmRlZC1zZSc6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBFbmQgRW5kXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1lZSc6IFt7XG4gICAgICAgICdyb3VuZGVkLWVlJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIEVuZCBTdGFydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1yYWRpdXNcbiAgICAgICAqL1xuICAgICAgJ3JvdW5kZWQtZXMnOiBbe1xuICAgICAgICAncm91bmRlZC1lcyc6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBUb3AgTGVmdFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1yYWRpdXNcbiAgICAgICAqL1xuICAgICAgJ3JvdW5kZWQtdGwnOiBbe1xuICAgICAgICAncm91bmRlZC10bCc6IFtib3JkZXJSYWRpdXNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFJhZGl1cyBUb3AgUmlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItcmFkaXVzXG4gICAgICAgKi9cbiAgICAgICdyb3VuZGVkLXRyJzogW3tcbiAgICAgICAgJ3JvdW5kZWQtdHInOiBbYm9yZGVyUmFkaXVzXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBSYWRpdXMgQm90dG9tIFJpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1icic6IFt7XG4gICAgICAgICdyb3VuZGVkLWJyJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgUmFkaXVzIEJvdHRvbSBMZWZ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXJhZGl1c1xuICAgICAgICovXG4gICAgICAncm91bmRlZC1ibCc6IFt7XG4gICAgICAgICdyb3VuZGVkLWJsJzogW2JvcmRlclJhZGl1c11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgV2lkdGhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItd2lkdGhcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci13JzogW3tcbiAgICAgICAgYm9yZGVyOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFdpZHRoIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItd2lkdGhcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci13LXgnOiBbe1xuICAgICAgICAnYm9yZGVyLXgnOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFdpZHRoIFlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItd2lkdGhcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci13LXknOiBbe1xuICAgICAgICAnYm9yZGVyLXknOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFdpZHRoIFN0YXJ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXdpZHRoXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItdy1zJzogW3tcbiAgICAgICAgJ2JvcmRlci1zJzogW2JvcmRlcldpZHRoXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBXaWR0aCBFbmRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItd2lkdGhcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci13LWUnOiBbe1xuICAgICAgICAnYm9yZGVyLWUnOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFdpZHRoIFRvcFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci13aWR0aFxuICAgICAgICovXG4gICAgICAnYm9yZGVyLXctdCc6IFt7XG4gICAgICAgICdib3JkZXItdCc6IFtib3JkZXJXaWR0aF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgV2lkdGggUmlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItd2lkdGhcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci13LXInOiBbe1xuICAgICAgICAnYm9yZGVyLXInOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFdpZHRoIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci13aWR0aFxuICAgICAgICovXG4gICAgICAnYm9yZGVyLXctYic6IFt7XG4gICAgICAgICdib3JkZXItYic6IFtib3JkZXJXaWR0aF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgV2lkdGggTGVmdFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci13aWR0aFxuICAgICAgICovXG4gICAgICAnYm9yZGVyLXctbCc6IFt7XG4gICAgICAgICdib3JkZXItbCc6IFtib3JkZXJXaWR0aF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgT3BhY2l0eVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1vcGFjaXR5XG4gICAgICAgKi9cbiAgICAgICdib3JkZXItb3BhY2l0eSc6IFt7XG4gICAgICAgICdib3JkZXItb3BhY2l0eSc6IFtvcGFjaXR5XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBTdHlsZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1zdHlsZVxuICAgICAgICovXG4gICAgICAnYm9yZGVyLXN0eWxlJzogW3tcbiAgICAgICAgYm9yZGVyOiBbLi4uZ2V0TGluZVN0eWxlcygpLCAnaGlkZGVuJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBEaXZpZGUgV2lkdGggWFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS13aWR0aFxuICAgICAgICovXG4gICAgICAnZGl2aWRlLXgnOiBbe1xuICAgICAgICAnZGl2aWRlLXgnOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRGl2aWRlIFdpZHRoIFggUmV2ZXJzZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS13aWR0aFxuICAgICAgICovXG4gICAgICAnZGl2aWRlLXgtcmV2ZXJzZSc6IFsnZGl2aWRlLXgtcmV2ZXJzZSddLFxuICAgICAgLyoqXG4gICAgICAgKiBEaXZpZGUgV2lkdGggWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS13aWR0aFxuICAgICAgICovXG4gICAgICAnZGl2aWRlLXknOiBbe1xuICAgICAgICAnZGl2aWRlLXknOiBbYm9yZGVyV2lkdGhdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRGl2aWRlIFdpZHRoIFkgUmV2ZXJzZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS13aWR0aFxuICAgICAgICovXG4gICAgICAnZGl2aWRlLXktcmV2ZXJzZSc6IFsnZGl2aWRlLXktcmV2ZXJzZSddLFxuICAgICAgLyoqXG4gICAgICAgKiBEaXZpZGUgT3BhY2l0eVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS1vcGFjaXR5XG4gICAgICAgKi9cbiAgICAgICdkaXZpZGUtb3BhY2l0eSc6IFt7XG4gICAgICAgICdkaXZpZGUtb3BhY2l0eSc6IFtvcGFjaXR5XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIERpdmlkZSBTdHlsZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2RpdmlkZS1zdHlsZVxuICAgICAgICovXG4gICAgICAnZGl2aWRlLXN0eWxlJzogW3tcbiAgICAgICAgZGl2aWRlOiBnZXRMaW5lU3R5bGVzKClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3JkZXItY29sb3JcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci1jb2xvcic6IFt7XG4gICAgICAgIGJvcmRlcjogW2JvcmRlckNvbG9yXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBDb2xvciBYXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItY29sb3IteCc6IFt7XG4gICAgICAgICdib3JkZXIteCc6IFtib3JkZXJDb2xvcl1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgQ29sb3IgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1jb2xvclxuICAgICAgICovXG4gICAgICAnYm9yZGVyLWNvbG9yLXknOiBbe1xuICAgICAgICAnYm9yZGVyLXknOiBbYm9yZGVyQ29sb3JdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIENvbG9yIFRvcFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1jb2xvclxuICAgICAgICovXG4gICAgICAnYm9yZGVyLWNvbG9yLXQnOiBbe1xuICAgICAgICAnYm9yZGVyLXQnOiBbYm9yZGVyQ29sb3JdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIENvbG9yIFJpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItY29sb3Itcic6IFt7XG4gICAgICAgICdib3JkZXItcic6IFtib3JkZXJDb2xvcl1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgQ29sb3IgQm90dG9tXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItY29sb3ItYic6IFt7XG4gICAgICAgICdib3JkZXItYic6IFtib3JkZXJDb2xvcl1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgQ29sb3IgTGVmdFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1jb2xvclxuICAgICAgICovXG4gICAgICAnYm9yZGVyLWNvbG9yLWwnOiBbe1xuICAgICAgICAnYm9yZGVyLWwnOiBbYm9yZGVyQ29sb3JdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogRGl2aWRlIENvbG9yXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZGl2aWRlLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdkaXZpZGUtY29sb3InOiBbe1xuICAgICAgICBkaXZpZGU6IFtib3JkZXJDb2xvcl1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBPdXRsaW5lIFN0eWxlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3V0bGluZS1zdHlsZVxuICAgICAgICovXG4gICAgICAnb3V0bGluZS1zdHlsZSc6IFt7XG4gICAgICAgIG91dGxpbmU6IFsnJywgLi4uZ2V0TGluZVN0eWxlcygpXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE91dGxpbmUgT2Zmc2V0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3V0bGluZS1vZmZzZXRcbiAgICAgICAqL1xuICAgICAgJ291dGxpbmUtb2Zmc2V0JzogW3tcbiAgICAgICAgJ291dGxpbmUtb2Zmc2V0JzogW2lzTGVuZ3RoLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE91dGxpbmUgV2lkdGhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9vdXRsaW5lLXdpZHRoXG4gICAgICAgKi9cbiAgICAgICdvdXRsaW5lLXcnOiBbe1xuICAgICAgICBvdXRsaW5lOiBbaXNMZW5ndGgsIGlzQXJiaXRyYXJ5TGVuZ3RoXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIE91dGxpbmUgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9vdXRsaW5lLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdvdXRsaW5lLWNvbG9yJzogW3tcbiAgICAgICAgb3V0bGluZTogW2NvbG9yc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBSaW5nIFdpZHRoXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcmluZy13aWR0aFxuICAgICAgICovXG4gICAgICAncmluZy13JzogW3tcbiAgICAgICAgcmluZzogZ2V0TGVuZ3RoV2l0aEVtcHR5QW5kQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBSaW5nIFdpZHRoIEluc2V0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcmluZy13aWR0aFxuICAgICAgICovXG4gICAgICAncmluZy13LWluc2V0JzogWydyaW5nLWluc2V0J10sXG4gICAgICAvKipcbiAgICAgICAqIFJpbmcgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9yaW5nLWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdyaW5nLWNvbG9yJzogW3tcbiAgICAgICAgcmluZzogW2NvbG9yc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBSaW5nIE9wYWNpdHlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9yaW5nLW9wYWNpdHlcbiAgICAgICAqL1xuICAgICAgJ3Jpbmctb3BhY2l0eSc6IFt7XG4gICAgICAgICdyaW5nLW9wYWNpdHknOiBbb3BhY2l0eV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBSaW5nIE9mZnNldCBXaWR0aFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Jpbmctb2Zmc2V0LXdpZHRoXG4gICAgICAgKi9cbiAgICAgICdyaW5nLW9mZnNldC13JzogW3tcbiAgICAgICAgJ3Jpbmctb2Zmc2V0JzogW2lzTGVuZ3RoLCBpc0FyYml0cmFyeUxlbmd0aF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBSaW5nIE9mZnNldCBDb2xvclxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Jpbmctb2Zmc2V0LWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdyaW5nLW9mZnNldC1jb2xvcic6IFt7XG4gICAgICAgICdyaW5nLW9mZnNldCc6IFtjb2xvcnNdXG4gICAgICB9XSxcbiAgICAgIC8vIEVmZmVjdHNcbiAgICAgIC8qKlxuICAgICAgICogQm94IFNoYWRvd1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JveC1zaGFkb3dcbiAgICAgICAqL1xuICAgICAgc2hhZG93OiBbe1xuICAgICAgICBzaGFkb3c6IFsnJywgJ2lubmVyJywgJ25vbmUnLCBpc1RzaGlydFNpemUsIGlzQXJiaXRyYXJ5U2hhZG93XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJveCBTaGFkb3cgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9ib3gtc2hhZG93LWNvbG9yXG4gICAgICAgKi9cbiAgICAgICdzaGFkb3ctY29sb3InOiBbe1xuICAgICAgICBzaGFkb3c6IFtpc0FueV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBPcGFjaXR5XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvb3BhY2l0eVxuICAgICAgICovXG4gICAgICBvcGFjaXR5OiBbe1xuICAgICAgICBvcGFjaXR5OiBbb3BhY2l0eV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBNaXggQmxlbmQgTW9kZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL21peC1ibGVuZC1tb2RlXG4gICAgICAgKi9cbiAgICAgICdtaXgtYmxlbmQnOiBbe1xuICAgICAgICAnbWl4LWJsZW5kJzogWy4uLmdldEJsZW5kTW9kZXMoKSwgJ3BsdXMtbGlnaHRlcicsICdwbHVzLWRhcmtlciddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2dyb3VuZCBCbGVuZCBNb2RlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2dyb3VuZC1ibGVuZC1tb2RlXG4gICAgICAgKi9cbiAgICAgICdiZy1ibGVuZCc6IFt7XG4gICAgICAgICdiZy1ibGVuZCc6IGdldEJsZW5kTW9kZXMoKVxuICAgICAgfV0sXG4gICAgICAvLyBGaWx0ZXJzXG4gICAgICAvKipcbiAgICAgICAqIEZpbHRlclxuICAgICAgICogQGRlcHJlY2F0ZWQgc2luY2UgVGFpbHdpbmQgQ1NTIHYzLjAuMFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZpbHRlclxuICAgICAgICovXG4gICAgICBmaWx0ZXI6IFt7XG4gICAgICAgIGZpbHRlcjogWycnLCAnbm9uZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmx1clxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JsdXJcbiAgICAgICAqL1xuICAgICAgYmx1cjogW3tcbiAgICAgICAgYmx1cjogW2JsdXJdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQnJpZ2h0bmVzc1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JyaWdodG5lc3NcbiAgICAgICAqL1xuICAgICAgYnJpZ2h0bmVzczogW3tcbiAgICAgICAgYnJpZ2h0bmVzczogW2JyaWdodG5lc3NdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQ29udHJhc3RcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9jb250cmFzdFxuICAgICAgICovXG4gICAgICBjb250cmFzdDogW3tcbiAgICAgICAgY29udHJhc3Q6IFtjb250cmFzdF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBEcm9wIFNoYWRvd1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2Ryb3Atc2hhZG93XG4gICAgICAgKi9cbiAgICAgICdkcm9wLXNoYWRvdyc6IFt7XG4gICAgICAgICdkcm9wLXNoYWRvdyc6IFsnJywgJ25vbmUnLCBpc1RzaGlydFNpemUsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogR3JheXNjYWxlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZ3JheXNjYWxlXG4gICAgICAgKi9cbiAgICAgIGdyYXlzY2FsZTogW3tcbiAgICAgICAgZ3JheXNjYWxlOiBbZ3JheXNjYWxlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEh1ZSBSb3RhdGVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9odWUtcm90YXRlXG4gICAgICAgKi9cbiAgICAgICdodWUtcm90YXRlJzogW3tcbiAgICAgICAgJ2h1ZS1yb3RhdGUnOiBbaHVlUm90YXRlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEludmVydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ludmVydFxuICAgICAgICovXG4gICAgICBpbnZlcnQ6IFt7XG4gICAgICAgIGludmVydDogW2ludmVydF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTYXR1cmF0ZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3NhdHVyYXRlXG4gICAgICAgKi9cbiAgICAgIHNhdHVyYXRlOiBbe1xuICAgICAgICBzYXR1cmF0ZTogW3NhdHVyYXRlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNlcGlhXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2VwaWFcbiAgICAgICAqL1xuICAgICAgc2VwaWE6IFt7XG4gICAgICAgIHNlcGlhOiBbc2VwaWFdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2Ryb3AgRmlsdGVyXG4gICAgICAgKiBAZGVwcmVjYXRlZCBzaW5jZSBUYWlsd2luZCBDU1MgdjMuMC4wXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2Ryb3AtZmlsdGVyXG4gICAgICAgKi9cbiAgICAgICdiYWNrZHJvcC1maWx0ZXInOiBbe1xuICAgICAgICAnYmFja2Ryb3AtZmlsdGVyJzogWycnLCAnbm9uZSddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2Ryb3AgQmx1clxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JhY2tkcm9wLWJsdXJcbiAgICAgICAqL1xuICAgICAgJ2JhY2tkcm9wLWJsdXInOiBbe1xuICAgICAgICAnYmFja2Ryb3AtYmx1cic6IFtibHVyXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tkcm9wIEJyaWdodG5lc3NcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZHJvcC1icmlnaHRuZXNzXG4gICAgICAgKi9cbiAgICAgICdiYWNrZHJvcC1icmlnaHRuZXNzJzogW3tcbiAgICAgICAgJ2JhY2tkcm9wLWJyaWdodG5lc3MnOiBbYnJpZ2h0bmVzc11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCYWNrZHJvcCBDb250cmFzdFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JhY2tkcm9wLWNvbnRyYXN0XG4gICAgICAgKi9cbiAgICAgICdiYWNrZHJvcC1jb250cmFzdCc6IFt7XG4gICAgICAgICdiYWNrZHJvcC1jb250cmFzdCc6IFtjb250cmFzdF1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCYWNrZHJvcCBHcmF5c2NhbGVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZHJvcC1ncmF5c2NhbGVcbiAgICAgICAqL1xuICAgICAgJ2JhY2tkcm9wLWdyYXlzY2FsZSc6IFt7XG4gICAgICAgICdiYWNrZHJvcC1ncmF5c2NhbGUnOiBbZ3JheXNjYWxlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tkcm9wIEh1ZSBSb3RhdGVcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9iYWNrZHJvcC1odWUtcm90YXRlXG4gICAgICAgKi9cbiAgICAgICdiYWNrZHJvcC1odWUtcm90YXRlJzogW3tcbiAgICAgICAgJ2JhY2tkcm9wLWh1ZS1yb3RhdGUnOiBbaHVlUm90YXRlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tkcm9wIEludmVydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JhY2tkcm9wLWludmVydFxuICAgICAgICovXG4gICAgICAnYmFja2Ryb3AtaW52ZXJ0JzogW3tcbiAgICAgICAgJ2JhY2tkcm9wLWludmVydCc6IFtpbnZlcnRdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQmFja2Ryb3AgT3BhY2l0eVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JhY2tkcm9wLW9wYWNpdHlcbiAgICAgICAqL1xuICAgICAgJ2JhY2tkcm9wLW9wYWNpdHknOiBbe1xuICAgICAgICAnYmFja2Ryb3Atb3BhY2l0eSc6IFtvcGFjaXR5XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tkcm9wIFNhdHVyYXRlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2Ryb3Atc2F0dXJhdGVcbiAgICAgICAqL1xuICAgICAgJ2JhY2tkcm9wLXNhdHVyYXRlJzogW3tcbiAgICAgICAgJ2JhY2tkcm9wLXNhdHVyYXRlJzogW3NhdHVyYXRlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJhY2tkcm9wIFNlcGlhXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYmFja2Ryb3Atc2VwaWFcbiAgICAgICAqL1xuICAgICAgJ2JhY2tkcm9wLXNlcGlhJzogW3tcbiAgICAgICAgJ2JhY2tkcm9wLXNlcGlhJzogW3NlcGlhXVxuICAgICAgfV0sXG4gICAgICAvLyBUYWJsZXNcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIENvbGxhcHNlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLWNvbGxhcHNlXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItY29sbGFwc2UnOiBbe1xuICAgICAgICBib3JkZXI6IFsnY29sbGFwc2UnLCAnc2VwYXJhdGUnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEJvcmRlciBTcGFjaW5nXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXNwYWNpbmdcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci1zcGFjaW5nJzogW3tcbiAgICAgICAgJ2JvcmRlci1zcGFjaW5nJzogW2JvcmRlclNwYWNpbmddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQm9yZGVyIFNwYWNpbmcgWFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2JvcmRlci1zcGFjaW5nXG4gICAgICAgKi9cbiAgICAgICdib3JkZXItc3BhY2luZy14JzogW3tcbiAgICAgICAgJ2JvcmRlci1zcGFjaW5nLXgnOiBbYm9yZGVyU3BhY2luZ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBCb3JkZXIgU3BhY2luZyBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYm9yZGVyLXNwYWNpbmdcbiAgICAgICAqL1xuICAgICAgJ2JvcmRlci1zcGFjaW5nLXknOiBbe1xuICAgICAgICAnYm9yZGVyLXNwYWNpbmcteSc6IFtib3JkZXJTcGFjaW5nXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRhYmxlIExheW91dFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RhYmxlLWxheW91dFxuICAgICAgICovXG4gICAgICAndGFibGUtbGF5b3V0JzogW3tcbiAgICAgICAgdGFibGU6IFsnYXV0bycsICdmaXhlZCddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQ2FwdGlvbiBTaWRlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvY2FwdGlvbi1zaWRlXG4gICAgICAgKi9cbiAgICAgIGNhcHRpb246IFt7XG4gICAgICAgIGNhcHRpb246IFsndG9wJywgJ2JvdHRvbSddXG4gICAgICB9XSxcbiAgICAgIC8vIFRyYW5zaXRpb25zIGFuZCBBbmltYXRpb25cbiAgICAgIC8qKlxuICAgICAgICogVHJhbmlzaXRpb24gUHJvcGVydHlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90cmFuc2l0aW9uLXByb3BlcnR5XG4gICAgICAgKi9cbiAgICAgIHRyYW5zaXRpb246IFt7XG4gICAgICAgIHRyYW5zaXRpb246IFsnbm9uZScsICdhbGwnLCAnJywgJ2NvbG9ycycsICdvcGFjaXR5JywgJ3NoYWRvdycsICd0cmFuc2Zvcm0nLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRyYW5zaXRpb24gRHVyYXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90cmFuc2l0aW9uLWR1cmF0aW9uXG4gICAgICAgKi9cbiAgICAgIGR1cmF0aW9uOiBbe1xuICAgICAgICBkdXJhdGlvbjogZ2V0TnVtYmVyQW5kQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBUcmFuc2l0aW9uIFRpbWluZyBGdW5jdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RyYW5zaXRpb24tdGltaW5nLWZ1bmN0aW9uXG4gICAgICAgKi9cbiAgICAgIGVhc2U6IFt7XG4gICAgICAgIGVhc2U6IFsnbGluZWFyJywgJ2luJywgJ291dCcsICdpbi1vdXQnLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRyYW5zaXRpb24gRGVsYXlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90cmFuc2l0aW9uLWRlbGF5XG4gICAgICAgKi9cbiAgICAgIGRlbGF5OiBbe1xuICAgICAgICBkZWxheTogZ2V0TnVtYmVyQW5kQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBBbmltYXRpb25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9hbmltYXRpb25cbiAgICAgICAqL1xuICAgICAgYW5pbWF0ZTogW3tcbiAgICAgICAgYW5pbWF0ZTogWydub25lJywgJ3NwaW4nLCAncGluZycsICdwdWxzZScsICdib3VuY2UnLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvLyBUcmFuc2Zvcm1zXG4gICAgICAvKipcbiAgICAgICAqIFRyYW5zZm9ybVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RyYW5zZm9ybVxuICAgICAgICovXG4gICAgICB0cmFuc2Zvcm06IFt7XG4gICAgICAgIHRyYW5zZm9ybTogWycnLCAnZ3B1JywgJ25vbmUnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNjYWxlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2NhbGVcbiAgICAgICAqL1xuICAgICAgc2NhbGU6IFt7XG4gICAgICAgIHNjYWxlOiBbc2NhbGVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2NhbGUgWFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3NjYWxlXG4gICAgICAgKi9cbiAgICAgICdzY2FsZS14JzogW3tcbiAgICAgICAgJ3NjYWxlLXgnOiBbc2NhbGVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2NhbGUgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3NjYWxlXG4gICAgICAgKi9cbiAgICAgICdzY2FsZS15JzogW3tcbiAgICAgICAgJ3NjYWxlLXknOiBbc2NhbGVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUm90YXRlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvcm90YXRlXG4gICAgICAgKi9cbiAgICAgIHJvdGF0ZTogW3tcbiAgICAgICAgcm90YXRlOiBbaXNJbnRlZ2VyLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRyYW5zbGF0ZSBYXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdHJhbnNsYXRlXG4gICAgICAgKi9cbiAgICAgICd0cmFuc2xhdGUteCc6IFt7XG4gICAgICAgICd0cmFuc2xhdGUteCc6IFt0cmFuc2xhdGVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVHJhbnNsYXRlIFlcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90cmFuc2xhdGVcbiAgICAgICAqL1xuICAgICAgJ3RyYW5zbGF0ZS15JzogW3tcbiAgICAgICAgJ3RyYW5zbGF0ZS15JzogW3RyYW5zbGF0ZV1cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTa2V3IFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9za2V3XG4gICAgICAgKi9cbiAgICAgICdza2V3LXgnOiBbe1xuICAgICAgICAnc2tldy14JzogW3NrZXddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2tldyBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2tld1xuICAgICAgICovXG4gICAgICAnc2tldy15JzogW3tcbiAgICAgICAgJ3NrZXcteSc6IFtza2V3XVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRyYW5zZm9ybSBPcmlnaW5cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90cmFuc2Zvcm0tb3JpZ2luXG4gICAgICAgKi9cbiAgICAgICd0cmFuc2Zvcm0tb3JpZ2luJzogW3tcbiAgICAgICAgb3JpZ2luOiBbJ2NlbnRlcicsICd0b3AnLCAndG9wLXJpZ2h0JywgJ3JpZ2h0JywgJ2JvdHRvbS1yaWdodCcsICdib3R0b20nLCAnYm90dG9tLWxlZnQnLCAnbGVmdCcsICd0b3AtbGVmdCcsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8vIEludGVyYWN0aXZpdHlcbiAgICAgIC8qKlxuICAgICAgICogQWNjZW50IENvbG9yXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvYWNjZW50LWNvbG9yXG4gICAgICAgKi9cbiAgICAgIGFjY2VudDogW3tcbiAgICAgICAgYWNjZW50OiBbJ2F1dG8nLCBjb2xvcnNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQXBwZWFyYW5jZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2FwcGVhcmFuY2VcbiAgICAgICAqL1xuICAgICAgYXBwZWFyYW5jZTogW3tcbiAgICAgICAgYXBwZWFyYW5jZTogWydub25lJywgJ2F1dG8nXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIEN1cnNvclxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2N1cnNvclxuICAgICAgICovXG4gICAgICBjdXJzb3I6IFt7XG4gICAgICAgIGN1cnNvcjogWydhdXRvJywgJ2RlZmF1bHQnLCAncG9pbnRlcicsICd3YWl0JywgJ3RleHQnLCAnbW92ZScsICdoZWxwJywgJ25vdC1hbGxvd2VkJywgJ25vbmUnLCAnY29udGV4dC1tZW51JywgJ3Byb2dyZXNzJywgJ2NlbGwnLCAnY3Jvc3NoYWlyJywgJ3ZlcnRpY2FsLXRleHQnLCAnYWxpYXMnLCAnY29weScsICduby1kcm9wJywgJ2dyYWInLCAnZ3JhYmJpbmcnLCAnYWxsLXNjcm9sbCcsICdjb2wtcmVzaXplJywgJ3Jvdy1yZXNpemUnLCAnbi1yZXNpemUnLCAnZS1yZXNpemUnLCAncy1yZXNpemUnLCAndy1yZXNpemUnLCAnbmUtcmVzaXplJywgJ253LXJlc2l6ZScsICdzZS1yZXNpemUnLCAnc3ctcmVzaXplJywgJ2V3LXJlc2l6ZScsICducy1yZXNpemUnLCAnbmVzdy1yZXNpemUnLCAnbndzZS1yZXNpemUnLCAnem9vbS1pbicsICd6b29tLW91dCcsIGlzQXJiaXRyYXJ5VmFsdWVdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogQ2FyZXQgQ29sb3JcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9qdXN0LWluLXRpbWUtbW9kZSNjYXJldC1jb2xvci11dGlsaXRpZXNcbiAgICAgICAqL1xuICAgICAgJ2NhcmV0LWNvbG9yJzogW3tcbiAgICAgICAgY2FyZXQ6IFtjb2xvcnNdXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUG9pbnRlciBFdmVudHNcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9wb2ludGVyLWV2ZW50c1xuICAgICAgICovXG4gICAgICAncG9pbnRlci1ldmVudHMnOiBbe1xuICAgICAgICAncG9pbnRlci1ldmVudHMnOiBbJ25vbmUnLCAnYXV0byddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogUmVzaXplXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvcmVzaXplXG4gICAgICAgKi9cbiAgICAgIHJlc2l6ZTogW3tcbiAgICAgICAgcmVzaXplOiBbJ25vbmUnLCAneScsICd4JywgJyddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIEJlaGF2aW9yXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLWJlaGF2aW9yXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtYmVoYXZpb3InOiBbe1xuICAgICAgICBzY3JvbGw6IFsnYXV0bycsICdzbW9vdGgnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNjcm9sbCBNYXJnaW5cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtbWFyZ2luXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtbSc6IFt7XG4gICAgICAgICdzY3JvbGwtbSc6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgTWFyZ2luIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtbWFyZ2luXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtbXgnOiBbe1xuICAgICAgICAnc2Nyb2xsLW14JzogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNjcm9sbCBNYXJnaW4gWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Njcm9sbC1tYXJnaW5cbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1teSc6IFt7XG4gICAgICAgICdzY3JvbGwtbXknOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIE1hcmdpbiBTdGFydFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Njcm9sbC1tYXJnaW5cbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1tcyc6IFt7XG4gICAgICAgICdzY3JvbGwtbXMnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIE1hcmdpbiBFbmRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtbWFyZ2luXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtbWUnOiBbe1xuICAgICAgICAnc2Nyb2xsLW1lJzogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNjcm9sbCBNYXJnaW4gVG9wXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLW1hcmdpblxuICAgICAgICovXG4gICAgICAnc2Nyb2xsLW10JzogW3tcbiAgICAgICAgJ3Njcm9sbC1tdCc6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgTWFyZ2luIFJpZ2h0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLW1hcmdpblxuICAgICAgICovXG4gICAgICAnc2Nyb2xsLW1yJzogW3tcbiAgICAgICAgJ3Njcm9sbC1tcic6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgTWFyZ2luIEJvdHRvbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Njcm9sbC1tYXJnaW5cbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1tYic6IFt7XG4gICAgICAgICdzY3JvbGwtbWInOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIE1hcmdpbiBMZWZ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLW1hcmdpblxuICAgICAgICovXG4gICAgICAnc2Nyb2xsLW1sJzogW3tcbiAgICAgICAgJ3Njcm9sbC1tbCc6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgUGFkZGluZ1xuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Njcm9sbC1wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtcCc6IFt7XG4gICAgICAgICdzY3JvbGwtcCc6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgUGFkZGluZyBYXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXBhZGRpbmdcbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1weCc6IFt7XG4gICAgICAgICdzY3JvbGwtcHgnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIFBhZGRpbmcgWVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3Njcm9sbC1wYWRkaW5nXG4gICAgICAgKi9cbiAgICAgICdzY3JvbGwtcHknOiBbe1xuICAgICAgICAnc2Nyb2xsLXB5JzogZ2V0U3BhY2luZ1dpdGhBcmJpdHJhcnkoKVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFNjcm9sbCBQYWRkaW5nIFN0YXJ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXBhZGRpbmdcbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1wcyc6IFt7XG4gICAgICAgICdzY3JvbGwtcHMnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIFBhZGRpbmcgRW5kXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXBhZGRpbmdcbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1wZSc6IFt7XG4gICAgICAgICdzY3JvbGwtcGUnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIFBhZGRpbmcgVG9wXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXBhZGRpbmdcbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1wdCc6IFt7XG4gICAgICAgICdzY3JvbGwtcHQnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIFBhZGRpbmcgUmlnaHRcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtcGFkZGluZ1xuICAgICAgICovXG4gICAgICAnc2Nyb2xsLXByJzogW3tcbiAgICAgICAgJ3Njcm9sbC1wcic6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgUGFkZGluZyBCb3R0b21cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtcGFkZGluZ1xuICAgICAgICovXG4gICAgICAnc2Nyb2xsLXBiJzogW3tcbiAgICAgICAgJ3Njcm9sbC1wYic6IGdldFNwYWNpbmdXaXRoQXJiaXRyYXJ5KClcbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgUGFkZGluZyBMZWZ0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXBhZGRpbmdcbiAgICAgICAqL1xuICAgICAgJ3Njcm9sbC1wbCc6IFt7XG4gICAgICAgICdzY3JvbGwtcGwnOiBnZXRTcGFjaW5nV2l0aEFyYml0cmFyeSgpXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogU2Nyb2xsIFNuYXAgQWxpZ25cbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtc25hcC1hbGlnblxuICAgICAgICovXG4gICAgICAnc25hcC1hbGlnbic6IFt7XG4gICAgICAgIHNuYXA6IFsnc3RhcnQnLCAnZW5kJywgJ2NlbnRlcicsICdhbGlnbi1ub25lJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgU25hcCBTdG9wXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXNuYXAtc3RvcFxuICAgICAgICovXG4gICAgICAnc25hcC1zdG9wJzogW3tcbiAgICAgICAgc25hcDogWydub3JtYWwnLCAnYWx3YXlzJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgU25hcCBUeXBlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2Nyb2xsLXNuYXAtdHlwZVxuICAgICAgICovXG4gICAgICAnc25hcC10eXBlJzogW3tcbiAgICAgICAgc25hcDogWydub25lJywgJ3gnLCAneScsICdib3RoJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBTY3JvbGwgU25hcCBUeXBlIFN0cmljdG5lc3NcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy9zY3JvbGwtc25hcC10eXBlXG4gICAgICAgKi9cbiAgICAgICdzbmFwLXN0cmljdG5lc3MnOiBbe1xuICAgICAgICBzbmFwOiBbJ21hbmRhdG9yeScsICdwcm94aW1pdHknXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRvdWNoIEFjdGlvblxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvdWNoLWFjdGlvblxuICAgICAgICovXG4gICAgICB0b3VjaDogW3tcbiAgICAgICAgdG91Y2g6IFsnYXV0bycsICdub25lJywgJ21hbmlwdWxhdGlvbiddXG4gICAgICB9XSxcbiAgICAgIC8qKlxuICAgICAgICogVG91Y2ggQWN0aW9uIFhcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy90b3VjaC1hY3Rpb25cbiAgICAgICAqL1xuICAgICAgJ3RvdWNoLXgnOiBbe1xuICAgICAgICAndG91Y2gtcGFuJzogWyd4JywgJ2xlZnQnLCAncmlnaHQnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFRvdWNoIEFjdGlvbiBZXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvdG91Y2gtYWN0aW9uXG4gICAgICAgKi9cbiAgICAgICd0b3VjaC15JzogW3tcbiAgICAgICAgJ3RvdWNoLXBhbic6IFsneScsICd1cCcsICdkb3duJ11cbiAgICAgIH1dLFxuICAgICAgLyoqXG4gICAgICAgKiBUb3VjaCBBY3Rpb24gUGluY2ggWm9vbVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3RvdWNoLWFjdGlvblxuICAgICAgICovXG4gICAgICAndG91Y2gtcHonOiBbJ3RvdWNoLXBpbmNoLXpvb20nXSxcbiAgICAgIC8qKlxuICAgICAgICogVXNlciBTZWxlY3RcbiAgICAgICAqIEBzZWUgaHR0cHM6Ly90YWlsd2luZGNzcy5jb20vZG9jcy91c2VyLXNlbGVjdFxuICAgICAgICovXG4gICAgICBzZWxlY3Q6IFt7XG4gICAgICAgIHNlbGVjdDogWydub25lJywgJ3RleHQnLCAnYWxsJywgJ2F1dG8nXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFdpbGwgQ2hhbmdlXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvd2lsbC1jaGFuZ2VcbiAgICAgICAqL1xuICAgICAgJ3dpbGwtY2hhbmdlJzogW3tcbiAgICAgICAgJ3dpbGwtY2hhbmdlJzogWydhdXRvJywgJ3Njcm9sbCcsICdjb250ZW50cycsICd0cmFuc2Zvcm0nLCBpc0FyYml0cmFyeVZhbHVlXVxuICAgICAgfV0sXG4gICAgICAvLyBTVkdcbiAgICAgIC8qKlxuICAgICAgICogRmlsbFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL2ZpbGxcbiAgICAgICAqL1xuICAgICAgZmlsbDogW3tcbiAgICAgICAgZmlsbDogW2NvbG9ycywgJ25vbmUnXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFN0cm9rZSBXaWR0aFxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3N0cm9rZS13aWR0aFxuICAgICAgICovXG4gICAgICAnc3Ryb2tlLXcnOiBbe1xuICAgICAgICBzdHJva2U6IFtpc0xlbmd0aCwgaXNBcmJpdHJhcnlMZW5ndGgsIGlzQXJiaXRyYXJ5TnVtYmVyXVxuICAgICAgfV0sXG4gICAgICAvKipcbiAgICAgICAqIFN0cm9rZVxuICAgICAgICogQHNlZSBodHRwczovL3RhaWx3aW5kY3NzLmNvbS9kb2NzL3N0cm9rZVxuICAgICAgICovXG4gICAgICBzdHJva2U6IFt7XG4gICAgICAgIHN0cm9rZTogW2NvbG9ycywgJ25vbmUnXVxuICAgICAgfV0sXG4gICAgICAvLyBBY2Nlc3NpYmlsaXR5XG4gICAgICAvKipcbiAgICAgICAqIFNjcmVlbiBSZWFkZXJzXG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3Mvc2NyZWVuLXJlYWRlcnNcbiAgICAgICAqL1xuICAgICAgc3I6IFsnc3Itb25seScsICdub3Qtc3Itb25seSddLFxuICAgICAgLyoqXG4gICAgICAgKiBGb3JjZWQgQ29sb3IgQWRqdXN0XG4gICAgICAgKiBAc2VlIGh0dHBzOi8vdGFpbHdpbmRjc3MuY29tL2RvY3MvZm9yY2VkLWNvbG9yLWFkanVzdFxuICAgICAgICovXG4gICAgICAnZm9yY2VkLWNvbG9yLWFkanVzdCc6IFt7XG4gICAgICAgICdmb3JjZWQtY29sb3ItYWRqdXN0JzogWydhdXRvJywgJ25vbmUnXVxuICAgICAgfV1cbiAgICB9LFxuICAgIGNvbmZsaWN0aW5nQ2xhc3NHcm91cHM6IHtcbiAgICAgIG92ZXJmbG93OiBbJ292ZXJmbG93LXgnLCAnb3ZlcmZsb3cteSddLFxuICAgICAgb3ZlcnNjcm9sbDogWydvdmVyc2Nyb2xsLXgnLCAnb3ZlcnNjcm9sbC15J10sXG4gICAgICBpbnNldDogWydpbnNldC14JywgJ2luc2V0LXknLCAnc3RhcnQnLCAnZW5kJywgJ3RvcCcsICdyaWdodCcsICdib3R0b20nLCAnbGVmdCddLFxuICAgICAgJ2luc2V0LXgnOiBbJ3JpZ2h0JywgJ2xlZnQnXSxcbiAgICAgICdpbnNldC15JzogWyd0b3AnLCAnYm90dG9tJ10sXG4gICAgICBmbGV4OiBbJ2Jhc2lzJywgJ2dyb3cnLCAnc2hyaW5rJ10sXG4gICAgICBnYXA6IFsnZ2FwLXgnLCAnZ2FwLXknXSxcbiAgICAgIHA6IFsncHgnLCAncHknLCAncHMnLCAncGUnLCAncHQnLCAncHInLCAncGInLCAncGwnXSxcbiAgICAgIHB4OiBbJ3ByJywgJ3BsJ10sXG4gICAgICBweTogWydwdCcsICdwYiddLFxuICAgICAgbTogWydteCcsICdteScsICdtcycsICdtZScsICdtdCcsICdtcicsICdtYicsICdtbCddLFxuICAgICAgbXg6IFsnbXInLCAnbWwnXSxcbiAgICAgIG15OiBbJ210JywgJ21iJ10sXG4gICAgICBzaXplOiBbJ3cnLCAnaCddLFxuICAgICAgJ2ZvbnQtc2l6ZSc6IFsnbGVhZGluZyddLFxuICAgICAgJ2Z2bi1ub3JtYWwnOiBbJ2Z2bi1vcmRpbmFsJywgJ2Z2bi1zbGFzaGVkLXplcm8nLCAnZnZuLWZpZ3VyZScsICdmdm4tc3BhY2luZycsICdmdm4tZnJhY3Rpb24nXSxcbiAgICAgICdmdm4tb3JkaW5hbCc6IFsnZnZuLW5vcm1hbCddLFxuICAgICAgJ2Z2bi1zbGFzaGVkLXplcm8nOiBbJ2Z2bi1ub3JtYWwnXSxcbiAgICAgICdmdm4tZmlndXJlJzogWydmdm4tbm9ybWFsJ10sXG4gICAgICAnZnZuLXNwYWNpbmcnOiBbJ2Z2bi1ub3JtYWwnXSxcbiAgICAgICdmdm4tZnJhY3Rpb24nOiBbJ2Z2bi1ub3JtYWwnXSxcbiAgICAgICdsaW5lLWNsYW1wJzogWydkaXNwbGF5JywgJ292ZXJmbG93J10sXG4gICAgICByb3VuZGVkOiBbJ3JvdW5kZWQtcycsICdyb3VuZGVkLWUnLCAncm91bmRlZC10JywgJ3JvdW5kZWQtcicsICdyb3VuZGVkLWInLCAncm91bmRlZC1sJywgJ3JvdW5kZWQtc3MnLCAncm91bmRlZC1zZScsICdyb3VuZGVkLWVlJywgJ3JvdW5kZWQtZXMnLCAncm91bmRlZC10bCcsICdyb3VuZGVkLXRyJywgJ3JvdW5kZWQtYnInLCAncm91bmRlZC1ibCddLFxuICAgICAgJ3JvdW5kZWQtcyc6IFsncm91bmRlZC1zcycsICdyb3VuZGVkLWVzJ10sXG4gICAgICAncm91bmRlZC1lJzogWydyb3VuZGVkLXNlJywgJ3JvdW5kZWQtZWUnXSxcbiAgICAgICdyb3VuZGVkLXQnOiBbJ3JvdW5kZWQtdGwnLCAncm91bmRlZC10ciddLFxuICAgICAgJ3JvdW5kZWQtcic6IFsncm91bmRlZC10cicsICdyb3VuZGVkLWJyJ10sXG4gICAgICAncm91bmRlZC1iJzogWydyb3VuZGVkLWJyJywgJ3JvdW5kZWQtYmwnXSxcbiAgICAgICdyb3VuZGVkLWwnOiBbJ3JvdW5kZWQtdGwnLCAncm91bmRlZC1ibCddLFxuICAgICAgJ2JvcmRlci1zcGFjaW5nJzogWydib3JkZXItc3BhY2luZy14JywgJ2JvcmRlci1zcGFjaW5nLXknXSxcbiAgICAgICdib3JkZXItdyc6IFsnYm9yZGVyLXctcycsICdib3JkZXItdy1lJywgJ2JvcmRlci13LXQnLCAnYm9yZGVyLXctcicsICdib3JkZXItdy1iJywgJ2JvcmRlci13LWwnXSxcbiAgICAgICdib3JkZXItdy14JzogWydib3JkZXItdy1yJywgJ2JvcmRlci13LWwnXSxcbiAgICAgICdib3JkZXItdy15JzogWydib3JkZXItdy10JywgJ2JvcmRlci13LWInXSxcbiAgICAgICdib3JkZXItY29sb3InOiBbJ2JvcmRlci1jb2xvci10JywgJ2JvcmRlci1jb2xvci1yJywgJ2JvcmRlci1jb2xvci1iJywgJ2JvcmRlci1jb2xvci1sJ10sXG4gICAgICAnYm9yZGVyLWNvbG9yLXgnOiBbJ2JvcmRlci1jb2xvci1yJywgJ2JvcmRlci1jb2xvci1sJ10sXG4gICAgICAnYm9yZGVyLWNvbG9yLXknOiBbJ2JvcmRlci1jb2xvci10JywgJ2JvcmRlci1jb2xvci1iJ10sXG4gICAgICAnc2Nyb2xsLW0nOiBbJ3Njcm9sbC1teCcsICdzY3JvbGwtbXknLCAnc2Nyb2xsLW1zJywgJ3Njcm9sbC1tZScsICdzY3JvbGwtbXQnLCAnc2Nyb2xsLW1yJywgJ3Njcm9sbC1tYicsICdzY3JvbGwtbWwnXSxcbiAgICAgICdzY3JvbGwtbXgnOiBbJ3Njcm9sbC1tcicsICdzY3JvbGwtbWwnXSxcbiAgICAgICdzY3JvbGwtbXknOiBbJ3Njcm9sbC1tdCcsICdzY3JvbGwtbWInXSxcbiAgICAgICdzY3JvbGwtcCc6IFsnc2Nyb2xsLXB4JywgJ3Njcm9sbC1weScsICdzY3JvbGwtcHMnLCAnc2Nyb2xsLXBlJywgJ3Njcm9sbC1wdCcsICdzY3JvbGwtcHInLCAnc2Nyb2xsLXBiJywgJ3Njcm9sbC1wbCddLFxuICAgICAgJ3Njcm9sbC1weCc6IFsnc2Nyb2xsLXByJywgJ3Njcm9sbC1wbCddLFxuICAgICAgJ3Njcm9sbC1weSc6IFsnc2Nyb2xsLXB0JywgJ3Njcm9sbC1wYiddLFxuICAgICAgdG91Y2g6IFsndG91Y2gteCcsICd0b3VjaC15JywgJ3RvdWNoLXB6J10sXG4gICAgICAndG91Y2gteCc6IFsndG91Y2gnXSxcbiAgICAgICd0b3VjaC15JzogWyd0b3VjaCddLFxuICAgICAgJ3RvdWNoLXB6JzogWyd0b3VjaCddXG4gICAgfSxcbiAgICBjb25mbGljdGluZ0NsYXNzR3JvdXBNb2RpZmllcnM6IHtcbiAgICAgICdmb250LXNpemUnOiBbJ2xlYWRpbmcnXVxuICAgIH1cbiAgfTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gYmFzZUNvbmZpZyBDb25maWcgd2hlcmUgb3RoZXIgY29uZmlnIHdpbGwgYmUgbWVyZ2VkIGludG8uIFRoaXMgb2JqZWN0IHdpbGwgYmUgbXV0YXRlZC5cbiAqIEBwYXJhbSBjb25maWdFeHRlbnNpb24gUGFydGlhbCBjb25maWcgdG8gbWVyZ2UgaW50byB0aGUgYGJhc2VDb25maWdgLlxuICovXG5mdW5jdGlvbiBtZXJnZUNvbmZpZ3MoYmFzZUNvbmZpZywge1xuICBjYWNoZVNpemUsXG4gIHByZWZpeCxcbiAgc2VwYXJhdG9yLFxuICBleHBlcmltZW50YWxQYXJzZUNsYXNzTmFtZSxcbiAgZXh0ZW5kID0ge30sXG4gIG92ZXJyaWRlID0ge31cbn0pIHtcbiAgb3ZlcnJpZGVQcm9wZXJ0eShiYXNlQ29uZmlnLCAnY2FjaGVTaXplJywgY2FjaGVTaXplKTtcbiAgb3ZlcnJpZGVQcm9wZXJ0eShiYXNlQ29uZmlnLCAncHJlZml4JywgcHJlZml4KTtcbiAgb3ZlcnJpZGVQcm9wZXJ0eShiYXNlQ29uZmlnLCAnc2VwYXJhdG9yJywgc2VwYXJhdG9yKTtcbiAgb3ZlcnJpZGVQcm9wZXJ0eShiYXNlQ29uZmlnLCAnZXhwZXJpbWVudGFsUGFyc2VDbGFzc05hbWUnLCBleHBlcmltZW50YWxQYXJzZUNsYXNzTmFtZSk7XG4gIGZvciAoY29uc3QgY29uZmlnS2V5IGluIG92ZXJyaWRlKSB7XG4gICAgb3ZlcnJpZGVDb25maWdQcm9wZXJ0aWVzKGJhc2VDb25maWdbY29uZmlnS2V5XSwgb3ZlcnJpZGVbY29uZmlnS2V5XSk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gZXh0ZW5kKSB7XG4gICAgbWVyZ2VDb25maWdQcm9wZXJ0aWVzKGJhc2VDb25maWdba2V5XSwgZXh0ZW5kW2tleV0pO1xuICB9XG4gIHJldHVybiBiYXNlQ29uZmlnO1xufVxuZnVuY3Rpb24gb3ZlcnJpZGVQcm9wZXJ0eShiYXNlT2JqZWN0LCBvdmVycmlkZUtleSwgb3ZlcnJpZGVWYWx1ZSkge1xuICBpZiAob3ZlcnJpZGVWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgYmFzZU9iamVjdFtvdmVycmlkZUtleV0gPSBvdmVycmlkZVZhbHVlO1xuICB9XG59XG5mdW5jdGlvbiBvdmVycmlkZUNvbmZpZ1Byb3BlcnRpZXMoYmFzZU9iamVjdCwgb3ZlcnJpZGVPYmplY3QpIHtcbiAgaWYgKG92ZXJyaWRlT2JqZWN0KSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3ZlcnJpZGVPYmplY3QpIHtcbiAgICAgIG92ZXJyaWRlUHJvcGVydHkoYmFzZU9iamVjdCwga2V5LCBvdmVycmlkZU9iamVjdFtrZXldKTtcbiAgICB9XG4gIH1cbn1cbmZ1bmN0aW9uIG1lcmdlQ29uZmlnUHJvcGVydGllcyhiYXNlT2JqZWN0LCBtZXJnZU9iamVjdCkge1xuICBpZiAobWVyZ2VPYmplY3QpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBtZXJnZU9iamVjdCkge1xuICAgICAgY29uc3QgbWVyZ2VWYWx1ZSA9IG1lcmdlT2JqZWN0W2tleV07XG4gICAgICBpZiAobWVyZ2VWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGJhc2VPYmplY3Rba2V5XSA9IChiYXNlT2JqZWN0W2tleV0gfHwgW10pLmNvbmNhdChtZXJnZVZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbmZ1bmN0aW9uIGV4dGVuZFRhaWx3aW5kTWVyZ2UoY29uZmlnRXh0ZW5zaW9uLCAuLi5jcmVhdGVDb25maWcpIHtcbiAgcmV0dXJuIHR5cGVvZiBjb25maWdFeHRlbnNpb24gPT09ICdmdW5jdGlvbicgPyBjcmVhdGVUYWlsd2luZE1lcmdlKGdldERlZmF1bHRDb25maWcsIGNvbmZpZ0V4dGVuc2lvbiwgLi4uY3JlYXRlQ29uZmlnKSA6IGNyZWF0ZVRhaWx3aW5kTWVyZ2UoKCkgPT4gbWVyZ2VDb25maWdzKGdldERlZmF1bHRDb25maWcoKSwgY29uZmlnRXh0ZW5zaW9uKSwgLi4uY3JlYXRlQ29uZmlnKTtcbn1cbmNvbnN0IHR3TWVyZ2UgPSAvKiNfX1BVUkVfXyovY3JlYXRlVGFpbHdpbmRNZXJnZShnZXREZWZhdWx0Q29uZmlnKTtcbmV4cG9ydCB7IGNyZWF0ZVRhaWx3aW5kTWVyZ2UsIGV4dGVuZFRhaWx3aW5kTWVyZ2UsIGZyb21UaGVtZSwgZ2V0RGVmYXVsdENvbmZpZywgbWVyZ2VDb25maWdzLCB0d0pvaW4sIHR3TWVyZ2UsIHZhbGlkYXRvcnMgfTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWJ1bmRsZS1tanMubWpzLm1hcFxuIiwiaW1wb3J0IHR5cGUgeyBDbGFzc1ZhbHVlIH0gZnJvbSBcImNsc3hcIjtcclxuaW1wb3J0IGNsc3ggZnJvbSBcImNsc3hcIjtcclxuaW1wb3J0IHsgdHdNZXJnZSB9IGZyb20gXCJ0YWlsd2luZC1tZXJnZVwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IGNuID0gKC4uLmNsYXNzTGlzdHM6IENsYXNzVmFsdWVbXSkgPT4gdHdNZXJnZShjbHN4KGNsYXNzTGlzdHMpKTtcclxuIiwiaW1wb3J0IHsgREVWLCBlcXVhbEZuLCB1bnRyYWNrLCBnZXRPd25lciwgb25DbGVhbnVwLCBjcmVhdGVTaWduYWwsIHNoYXJlZENvbmZpZywgb25Nb3VudCB9IGZyb20gJ3NvbGlkLWpzJztcbmltcG9ydCB7IGlzU2VydmVyIH0gZnJvbSAnc29saWQtanMvd2ViJztcbmV4cG9ydCB7IGlzU2VydmVyIH0gZnJvbSAnc29saWQtanMvd2ViJztcblxuLy8gc3JjL2luZGV4LnRzXG52YXIgaXNDbGllbnQgPSAhaXNTZXJ2ZXI7XG52YXIgaXNEZXYgPSBpc0NsaWVudCAmJiAhIURFVjtcbnZhciBpc1Byb2QgPSAhaXNEZXY7XG52YXIgbm9vcCA9ICgpID0+IHZvaWQgMDtcbnZhciB0cnVlRm4gPSAoKSA9PiB0cnVlO1xudmFyIGZhbHNlRm4gPSAoKSA9PiBmYWxzZTtcbnZhciBkZWZhdWx0RXF1YWxzID0gZXF1YWxGbjtcbnZhciBFUVVBTFNfRkFMU0VfT1BUSU9OUyA9IHsgZXF1YWxzOiBmYWxzZSB9O1xudmFyIElOVEVSTkFMX09QVElPTlMgPSB7IGludGVybmFsOiB0cnVlIH07XG52YXIgb2ZDbGFzcyA9ICh2LCBjKSA9PiB2IGluc3RhbmNlb2YgYyB8fCB2ICYmIHYuY29uc3RydWN0b3IgPT09IGM7XG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgIT09IG51bGwgJiYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiB8fCB0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIik7XG59XG52YXIgaXNOb25OdWxsYWJsZSA9IChpKSA9PiBpICE9IG51bGw7XG52YXIgZmlsdGVyTm9uTnVsbGFibGUgPSAoYXJyKSA9PiBhcnIuZmlsdGVyKGlzTm9uTnVsbGFibGUpO1xudmFyIGNvbXBhcmUgPSAoYSwgYikgPT4gYSA8IGIgPyAtMSA6IGEgPiBiID8gMSA6IDA7XG52YXIgYXJyYXlFcXVhbHMgPSAoYSwgYikgPT4gYSA9PT0gYiB8fCBhLmxlbmd0aCA9PT0gYi5sZW5ndGggJiYgYS5ldmVyeSgoZSwgaSkgPT4gZSA9PT0gYltpXSk7XG5mdW5jdGlvbiBjaGFpbihjYWxsYmFja3MpIHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgZm9yIChjb25zdCBjYWxsYmFjayBvZiBjYWxsYmFja3MpXG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayguLi5hcmdzKTtcbiAgfTtcbn1cbmZ1bmN0aW9uIHJldmVyc2VDaGFpbihjYWxsYmFja3MpIHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgZm9yIChsZXQgaSA9IGNhbGxiYWNrcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgY29uc3QgY2FsbGJhY2sgPSBjYWxsYmFja3NbaV07XG4gICAgICBjYWxsYmFjayAmJiBjYWxsYmFjayguLi5hcmdzKTtcbiAgICB9XG4gIH07XG59XG52YXIgY2xhbXAgPSAobiwgbWluLCBtYXgpID0+IE1hdGgubWluKE1hdGgubWF4KG4sIG1pbiksIG1heCk7XG52YXIgYWNjZXNzID0gKHYpID0+IHR5cGVvZiB2ID09PSBcImZ1bmN0aW9uXCIgJiYgIXYubGVuZ3RoID8gdigpIDogdjtcbnZhciBhc0FycmF5ID0gKHZhbHVlKSA9PiBBcnJheS5pc0FycmF5KHZhbHVlKSA/IHZhbHVlIDogdmFsdWUgPyBbdmFsdWVdIDogW107XG52YXIgYWNjZXNzQXJyYXkgPSAobGlzdCkgPT4gbGlzdC5tYXAoKHYpID0+IGFjY2Vzcyh2KSk7XG52YXIgd2l0aEFjY2VzcyA9ICh2YWx1ZSwgZm4pID0+IHtcbiAgY29uc3QgX3ZhbHVlID0gYWNjZXNzKHZhbHVlKTtcbiAgdHlwZW9mIF92YWx1ZSAhPSBudWxsICYmIGZuKF92YWx1ZSk7XG59O1xudmFyIGFzQWNjZXNzb3IgPSAodikgPT4gdHlwZW9mIHYgPT09IFwiZnVuY3Rpb25cIiA/IHYgOiAoKSA9PiB2O1xuZnVuY3Rpb24gYWNjZXNzV2l0aCh2YWx1ZU9yRm4sIC4uLmFyZ3MpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZU9yRm4gPT09IFwiZnVuY3Rpb25cIiA/IHZhbHVlT3JGbiguLi5hcmdzKSA6IHZhbHVlT3JGbjtcbn1cbmZ1bmN0aW9uIGRlZmVyKGRlcHMsIGZuLCBpbml0aWFsVmFsdWUpIHtcbiAgY29uc3QgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkoZGVwcyk7XG4gIGxldCBwcmV2SW5wdXQ7XG4gIGxldCBzaG91bGREZWZlciA9IHRydWU7XG4gIHJldHVybiAocHJldlZhbHVlKSA9PiB7XG4gICAgbGV0IGlucHV0O1xuICAgIGlmIChpc0FycmF5KSB7XG4gICAgICBpbnB1dCA9IEFycmF5KGRlcHMubGVuZ3RoKTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGVwcy5sZW5ndGg7IGkrKylcbiAgICAgICAgaW5wdXRbaV0gPSBkZXBzW2ldKCk7XG4gICAgfSBlbHNlXG4gICAgICBpbnB1dCA9IGRlcHMoKTtcbiAgICBpZiAoc2hvdWxkRGVmZXIpIHtcbiAgICAgIHNob3VsZERlZmVyID0gZmFsc2U7XG4gICAgICBwcmV2SW5wdXQgPSBpbnB1dDtcbiAgICAgIHJldHVybiBpbml0aWFsVmFsdWU7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IHVudHJhY2soKCkgPT4gZm4oaW5wdXQsIHByZXZJbnB1dCwgcHJldlZhbHVlKSk7XG4gICAgcHJldklucHV0ID0gaW5wdXQ7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcbn1cbnZhciBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXM7XG52YXIga2V5cyA9IE9iamVjdC5rZXlzO1xudmFyIHRyeU9uQ2xlYW51cCA9IGlzRGV2ID8gKGZuKSA9PiBnZXRPd25lcigpID8gb25DbGVhbnVwKGZuKSA6IGZuIDogb25DbGVhbnVwO1xudmFyIGNyZWF0ZUNhbGxiYWNrU3RhY2sgPSAoKSA9PiB7XG4gIGxldCBzdGFjayA9IFtdO1xuICBjb25zdCBjbGVhciA9ICgpID0+IHN0YWNrID0gW107XG4gIHJldHVybiB7XG4gICAgcHVzaDogKC4uLmNhbGxiYWNrcykgPT4gc3RhY2sucHVzaCguLi5jYWxsYmFja3MpLFxuICAgIGV4ZWN1dGUoYXJnMCwgYXJnMSwgYXJnMiwgYXJnMykge1xuICAgICAgc3RhY2suZm9yRWFjaCgoY2IpID0+IGNiKGFyZzAsIGFyZzEsIGFyZzIsIGFyZzMpKTtcbiAgICAgIGNsZWFyKCk7XG4gICAgfSxcbiAgICBjbGVhclxuICB9O1xufTtcbmZ1bmN0aW9uIGNyZWF0ZU1pY3JvdGFzayhmbikge1xuICBsZXQgY2FsbHMgPSAwO1xuICBsZXQgYXJncztcbiAgb25DbGVhbnVwKCgpID0+IGNhbGxzID0gMCk7XG4gIHJldHVybiAoLi4uYSkgPT4ge1xuICAgIGFyZ3MgPSBhLCBjYWxscysrO1xuICAgIHF1ZXVlTWljcm90YXNrKCgpID0+IC0tY2FsbHMgPT09IDAgJiYgZm4oLi4uYXJncykpO1xuICB9O1xufVxuZnVuY3Rpb24gY3JlYXRlSHlkcmF0YWJsZVNpZ25hbChzZXJ2ZXJWYWx1ZSwgdXBkYXRlLCBvcHRpb25zKSB7XG4gIGlmIChpc1NlcnZlcikge1xuICAgIHJldHVybiBjcmVhdGVTaWduYWwoc2VydmVyVmFsdWUsIG9wdGlvbnMpO1xuICB9XG4gIGlmIChzaGFyZWRDb25maWcuY29udGV4dCkge1xuICAgIGNvbnN0IFtzdGF0ZSwgc2V0U3RhdGVdID0gY3JlYXRlU2lnbmFsKHNlcnZlclZhbHVlLCBvcHRpb25zKTtcbiAgICBvbk1vdW50KCgpID0+IHNldFN0YXRlKCgpID0+IHVwZGF0ZSgpKSk7XG4gICAgcmV0dXJuIFtzdGF0ZSwgc2V0U3RhdGVdO1xuICB9XG4gIHJldHVybiBjcmVhdGVTaWduYWwodXBkYXRlKCksIG9wdGlvbnMpO1xufVxudmFyIGNyZWF0ZUh5ZHJhdGVTaWduYWwgPSBjcmVhdGVIeWRyYXRhYmxlU2lnbmFsO1xuZnVuY3Rpb24gaGFuZGxlRGlmZkFycmF5KGN1cnJlbnQsIHByZXYsIGhhbmRsZUFkZGVkLCBoYW5kbGVSZW1vdmVkKSB7XG4gIGNvbnN0IGN1cnJMZW5ndGggPSBjdXJyZW50Lmxlbmd0aDtcbiAgY29uc3QgcHJldkxlbmd0aCA9IHByZXYubGVuZ3RoO1xuICBsZXQgaSA9IDA7XG4gIGlmICghcHJldkxlbmd0aCkge1xuICAgIGZvciAoOyBpIDwgY3Vyckxlbmd0aDsgaSsrKVxuICAgICAgaGFuZGxlQWRkZWQoY3VycmVudFtpXSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghY3Vyckxlbmd0aCkge1xuICAgIGZvciAoOyBpIDwgcHJldkxlbmd0aDsgaSsrKVxuICAgICAgaGFuZGxlUmVtb3ZlZChwcmV2W2ldKTtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yICg7IGkgPCBwcmV2TGVuZ3RoOyBpKyspIHtcbiAgICBpZiAocHJldltpXSAhPT0gY3VycmVudFtpXSlcbiAgICAgIGJyZWFrO1xuICB9XG4gIGxldCBwcmV2RWw7XG4gIGxldCBjdXJyRWw7XG4gIHByZXYgPSBwcmV2LnNsaWNlKGkpO1xuICBjdXJyZW50ID0gY3VycmVudC5zbGljZShpKTtcbiAgZm9yIChwcmV2RWwgb2YgcHJldikge1xuICAgIGlmICghY3VycmVudC5pbmNsdWRlcyhwcmV2RWwpKVxuICAgICAgaGFuZGxlUmVtb3ZlZChwcmV2RWwpO1xuICB9XG4gIGZvciAoY3VyckVsIG9mIGN1cnJlbnQpIHtcbiAgICBpZiAoIXByZXYuaW5jbHVkZXMoY3VyckVsKSlcbiAgICAgIGhhbmRsZUFkZGVkKGN1cnJFbCk7XG4gIH1cbn1cblxuZXhwb3J0IHsgRVFVQUxTX0ZBTFNFX09QVElPTlMsIElOVEVSTkFMX09QVElPTlMsIGFjY2VzcywgYWNjZXNzQXJyYXksIGFjY2Vzc1dpdGgsIGFycmF5RXF1YWxzLCBhc0FjY2Vzc29yLCBhc0FycmF5LCBjaGFpbiwgY2xhbXAsIGNvbXBhcmUsIGNyZWF0ZUNhbGxiYWNrU3RhY2ssIGNyZWF0ZUh5ZHJhdGFibGVTaWduYWwsIGNyZWF0ZUh5ZHJhdGVTaWduYWwsIGNyZWF0ZU1pY3JvdGFzaywgZGVmYXVsdEVxdWFscywgZGVmZXIsIGVudHJpZXMsIGZhbHNlRm4sIGZpbHRlck5vbk51bGxhYmxlLCBoYW5kbGVEaWZmQXJyYXksIGlzQ2xpZW50LCBpc0RldiwgaXNOb25OdWxsYWJsZSwgaXNPYmplY3QsIGlzUHJvZCwga2V5cywgbm9vcCwgb2ZDbGFzcywgcmV2ZXJzZUNoYWluLCB0cnVlRm4sIHRyeU9uQ2xlYW51cCwgd2l0aEFjY2VzcyB9O1xuIiwiaW1wb3J0IHsgY2hhaW4sIGFycmF5RXF1YWxzIH0gZnJvbSAnQHNvbGlkLXByaW1pdGl2ZXMvdXRpbHMnO1xuaW1wb3J0IHsgY3JlYXRlTWVtbywgY2hpbGRyZW4sIGNyZWF0ZUNvbXB1dGVkLCB1bnRyYWNrLCBvbkNsZWFudXAgfSBmcm9tICdzb2xpZC1qcyc7XG5pbXBvcnQgeyBpc1NlcnZlciB9IGZyb20gJ3NvbGlkLWpzL3dlYic7XG5cbi8vIHNyYy9pbmRleC50c1xuZnVuY3Rpb24gbWVyZ2VSZWZzKC4uLnJlZnMpIHtcbiAgcmV0dXJuIGNoYWluKHJlZnMpO1xufVxudmFyIGRlZmF1bHRFbGVtZW50UHJlZGljYXRlID0gaXNTZXJ2ZXIgPyAoaXRlbSkgPT4gaXRlbSAhPSBudWxsICYmIHR5cGVvZiBpdGVtID09PSBcIm9iamVjdFwiICYmIFwidFwiIGluIGl0ZW0gOiAoaXRlbSkgPT4gaXRlbSBpbnN0YW5jZW9mIEVsZW1lbnQ7XG5mdW5jdGlvbiBnZXRSZXNvbHZlZEVsZW1lbnRzKHZhbHVlLCBwcmVkaWNhdGUpIHtcbiAgaWYgKHByZWRpY2F0ZSh2YWx1ZSkpXG4gICAgcmV0dXJuIHZhbHVlO1xuICBpZiAodHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCIgJiYgIXZhbHVlLmxlbmd0aClcbiAgICByZXR1cm4gZ2V0UmVzb2x2ZWRFbGVtZW50cyh2YWx1ZSgpLCBwcmVkaWNhdGUpO1xuICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICBjb25zdCByZXN1bHRzID0gW107XG4gICAgZm9yIChjb25zdCBpdGVtIG9mIHZhbHVlKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBnZXRSZXNvbHZlZEVsZW1lbnRzKGl0ZW0sIHByZWRpY2F0ZSk7XG4gICAgICBpZiAocmVzdWx0KVxuICAgICAgICBBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHRzLnB1c2guYXBwbHkocmVzdWx0cywgcmVzdWx0KSA6IHJlc3VsdHMucHVzaChyZXN1bHQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cy5sZW5ndGggPyByZXN1bHRzIDogbnVsbDtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cbmZ1bmN0aW9uIHJlc29sdmVFbGVtZW50cyhmbiwgcHJlZGljYXRlID0gZGVmYXVsdEVsZW1lbnRQcmVkaWNhdGUsIHNlcnZlclByZWRpY2F0ZSA9IGRlZmF1bHRFbGVtZW50UHJlZGljYXRlKSB7XG4gIGNvbnN0IGNoaWxkcmVuMiA9IGNyZWF0ZU1lbW8oZm4pO1xuICBjb25zdCBtZW1vID0gY3JlYXRlTWVtbyhcbiAgICAoKSA9PiBnZXRSZXNvbHZlZEVsZW1lbnRzKGNoaWxkcmVuMigpLCBpc1NlcnZlciA/IHNlcnZlclByZWRpY2F0ZSA6IHByZWRpY2F0ZSlcbiAgKTtcbiAgbWVtby50b0FycmF5ID0gKCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gbWVtbygpO1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KHZhbHVlKSA/IHZhbHVlIDogdmFsdWUgPyBbdmFsdWVdIDogW107XG4gIH07XG4gIHJldHVybiBtZW1vO1xufVxuZnVuY3Rpb24gZ2V0Rmlyc3RDaGlsZCh2YWx1ZSwgcHJlZGljYXRlKSB7XG4gIGlmIChwcmVkaWNhdGUodmFsdWUpKVxuICAgIHJldHVybiB2YWx1ZTtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiICYmICF2YWx1ZS5sZW5ndGgpXG4gICAgcmV0dXJuIGdldEZpcnN0Q2hpbGQodmFsdWUoKSwgcHJlZGljYXRlKTtcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgZm9yIChjb25zdCBpdGVtIG9mIHZhbHVlKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBnZXRGaXJzdENoaWxkKGl0ZW0sIHByZWRpY2F0ZSk7XG4gICAgICBpZiAocmVzdWx0KVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cbmZ1bmN0aW9uIHJlc29sdmVGaXJzdChmbiwgcHJlZGljYXRlID0gZGVmYXVsdEVsZW1lbnRQcmVkaWNhdGUsIHNlcnZlclByZWRpY2F0ZSA9IGRlZmF1bHRFbGVtZW50UHJlZGljYXRlKSB7XG4gIGNvbnN0IGNoaWxkcmVuMiA9IGNyZWF0ZU1lbW8oZm4pO1xuICByZXR1cm4gY3JlYXRlTWVtbygoKSA9PiBnZXRGaXJzdENoaWxkKGNoaWxkcmVuMigpLCBpc1NlcnZlciA/IHNlcnZlclByZWRpY2F0ZSA6IHByZWRpY2F0ZSkpO1xufVxuZnVuY3Rpb24gUmVmcyhwcm9wcykge1xuICBpZiAoaXNTZXJ2ZXIpIHtcbiAgICByZXR1cm4gcHJvcHMuY2hpbGRyZW47XG4gIH1cbiAgY29uc3QgY2IgPSBwcm9wcy5yZWYsIHJlc29sdmVkID0gY2hpbGRyZW4oKCkgPT4gcHJvcHMuY2hpbGRyZW4pO1xuICBsZXQgcHJldiA9IFtdO1xuICBjcmVhdGVDb21wdXRlZCgoKSA9PiB7XG4gICAgY29uc3QgZWxzID0gcmVzb2x2ZWQudG9BcnJheSgpLmZpbHRlcihkZWZhdWx0RWxlbWVudFByZWRpY2F0ZSk7XG4gICAgaWYgKCFhcnJheUVxdWFscyhwcmV2LCBlbHMpKVxuICAgICAgdW50cmFjaygoKSA9PiBjYihlbHMpKTtcbiAgICBwcmV2ID0gZWxzO1xuICB9LCBbXSk7XG4gIG9uQ2xlYW51cCgoKSA9PiBwcmV2Lmxlbmd0aCAmJiBjYihbXSkpO1xuICByZXR1cm4gcmVzb2x2ZWQ7XG59XG5mdW5jdGlvbiBSZWYocHJvcHMpIHtcbiAgaWYgKGlzU2VydmVyKSB7XG4gICAgcmV0dXJuIHByb3BzLmNoaWxkcmVuO1xuICB9XG4gIGNvbnN0IGNiID0gcHJvcHMucmVmLCByZXNvbHZlZCA9IGNoaWxkcmVuKCgpID0+IHByb3BzLmNoaWxkcmVuKTtcbiAgbGV0IHByZXY7XG4gIGNyZWF0ZUNvbXB1dGVkKCgpID0+IHtcbiAgICBjb25zdCBlbCA9IHJlc29sdmVkLnRvQXJyYXkoKS5maW5kKGRlZmF1bHRFbGVtZW50UHJlZGljYXRlKTtcbiAgICBpZiAoZWwgIT09IHByZXYpXG4gICAgICB1bnRyYWNrKCgpID0+IGNiKGVsKSk7XG4gICAgcHJldiA9IGVsO1xuICB9KTtcbiAgb25DbGVhbnVwKCgpID0+IHByZXYgJiYgY2Iodm9pZCAwKSk7XG4gIHJldHVybiByZXNvbHZlZDtcbn1cblxuZXhwb3J0IHsgUmVmLCBSZWZzLCBkZWZhdWx0RWxlbWVudFByZWRpY2F0ZSwgZ2V0Rmlyc3RDaGlsZCwgZ2V0UmVzb2x2ZWRFbGVtZW50cywgbWVyZ2VSZWZzLCByZXNvbHZlRWxlbWVudHMsIHJlc29sdmVGaXJzdCB9O1xuIiwiaW1wb3J0IHsgb25DbGVhbnVwLCBtZXJnZVByb3BzIH0gZnJvbSAnc29saWQtanMnO1xuZXhwb3J0IHsgY3JlYXRlRXZlbnRMaXN0ZW5lciB9IGZyb20gJ0Bzb2xpZC1wcmltaXRpdmVzL2V2ZW50LWxpc3RlbmVyJztcbmV4cG9ydCB7IEtleSB9IGZyb20gJ0Bzb2xpZC1wcmltaXRpdmVzL2tleWVkJztcbmV4cG9ydCB7IFJlYWN0aXZlTWFwIH0gZnJvbSAnQHNvbGlkLXByaW1pdGl2ZXMvbWFwJztcbmV4cG9ydCB7IGNyZWF0ZU1lZGlhUXVlcnkgfSBmcm9tICdAc29saWQtcHJpbWl0aXZlcy9tZWRpYSc7XG5leHBvcnQgeyBjb21iaW5lUHJvcHMgfSBmcm9tICdAc29saWQtcHJpbWl0aXZlcy9wcm9wcyc7XG5leHBvcnQgeyBtZXJnZVJlZnMgfSBmcm9tICdAc29saWQtcHJpbWl0aXZlcy9yZWZzJztcbmV4cG9ydCB7IGFjY2VzcywgYWNjZXNzV2l0aCwgY2hhaW4gfSBmcm9tICdAc29saWQtcHJpbWl0aXZlcy91dGlscyc7XG5cbi8vIHNyYy9hcnJheS50c1xuZnVuY3Rpb24gYWRkSXRlbVRvQXJyYXkoYXJyYXksIGl0ZW0sIGluZGV4ID0gLTEpIHtcbiAgaWYgKCEoaW5kZXggaW4gYXJyYXkpKSB7XG4gICAgcmV0dXJuIFsuLi5hcnJheSwgaXRlbV07XG4gIH1cbiAgcmV0dXJuIFsuLi5hcnJheS5zbGljZSgwLCBpbmRleCksIGl0ZW0sIC4uLmFycmF5LnNsaWNlKGluZGV4KV07XG59XG5mdW5jdGlvbiByZW1vdmVJdGVtRnJvbUFycmF5KGFycmF5LCBpdGVtKSB7XG4gIGNvbnN0IHVwZGF0ZWRBcnJheSA9IFsuLi5hcnJheV07XG4gIGNvbnN0IGluZGV4ID0gdXBkYXRlZEFycmF5LmluZGV4T2YoaXRlbSk7XG4gIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICB1cGRhdGVkQXJyYXkuc3BsaWNlKGluZGV4LCAxKTtcbiAgfVxuICByZXR1cm4gdXBkYXRlZEFycmF5O1xufVxuXG4vLyBzcmMvYXNzZXJ0aW9uLnRzXG5mdW5jdGlvbiBpc051bWJlcih2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiO1xufVxuZnVuY3Rpb24gaXNBcnJheSh2YWx1ZSkge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5mdW5jdGlvbiBpc1N0cmluZyh2YWx1ZSkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSA9PT0gXCJbb2JqZWN0IFN0cmluZ11cIjtcbn1cbmZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiO1xufVxuXG4vLyBzcmMvY3JlYXRlLWdlbmVyYXRlLWlkLnRzXG5mdW5jdGlvbiBjcmVhdGVHZW5lcmF0ZUlkKGJhc2VJZCkge1xuICByZXR1cm4gKHN1ZmZpeCkgPT4gYCR7YmFzZUlkKCl9LSR7c3VmZml4fWA7XG59XG5mdW5jdGlvbiBjcmVhdGVHbG9iYWxMaXN0ZW5lcnMoKSB7XG4gIGNvbnN0IGdsb2JhbExpc3RlbmVycyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgTWFwKCk7XG4gIGNvbnN0IGFkZEdsb2JhbExpc3RlbmVyID0gKGV2ZW50VGFyZ2V0LCB0eXBlLCBsaXN0ZW5lciwgb3B0aW9ucykgPT4ge1xuICAgIGNvbnN0IGZuID0gb3B0aW9ucz8ub25jZSA/ICguLi5hcmdzKSA9PiB7XG4gICAgICBnbG9iYWxMaXN0ZW5lcnMuZGVsZXRlKGxpc3RlbmVyKTtcbiAgICAgIGxpc3RlbmVyKC4uLmFyZ3MpO1xuICAgIH0gOiBsaXN0ZW5lcjtcbiAgICBnbG9iYWxMaXN0ZW5lcnMuc2V0KGxpc3RlbmVyLCB7IHR5cGUsIGV2ZW50VGFyZ2V0LCBmbiwgb3B0aW9ucyB9KTtcbiAgICBldmVudFRhcmdldC5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyLCBvcHRpb25zKTtcbiAgfTtcbiAgY29uc3QgcmVtb3ZlR2xvYmFsTGlzdGVuZXIgPSAoZXZlbnRUYXJnZXQsIHR5cGUsIGxpc3RlbmVyLCBvcHRpb25zKSA9PiB7XG4gICAgY29uc3QgZm4gPSBnbG9iYWxMaXN0ZW5lcnMuZ2V0KGxpc3RlbmVyKT8uZm4gfHwgbGlzdGVuZXI7XG4gICAgZXZlbnRUYXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlLCBmbiwgb3B0aW9ucyk7XG4gICAgZ2xvYmFsTGlzdGVuZXJzLmRlbGV0ZShsaXN0ZW5lcik7XG4gIH07XG4gIGNvbnN0IHJlbW92ZUFsbEdsb2JhbExpc3RlbmVycyA9ICgpID0+IHtcbiAgICBnbG9iYWxMaXN0ZW5lcnMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgcmVtb3ZlR2xvYmFsTGlzdGVuZXIodmFsdWUuZXZlbnRUYXJnZXQsIHZhbHVlLnR5cGUsIGtleSwgdmFsdWUub3B0aW9ucyk7XG4gICAgfSk7XG4gIH07XG4gIG9uQ2xlYW51cCgoKSA9PiB7XG4gICAgcmVtb3ZlQWxsR2xvYmFsTGlzdGVuZXJzKCk7XG4gIH0pO1xuICByZXR1cm4geyBhZGRHbG9iYWxMaXN0ZW5lciwgcmVtb3ZlR2xvYmFsTGlzdGVuZXIsIHJlbW92ZUFsbEdsb2JhbExpc3RlbmVycyB9O1xufVxuXG4vLyBzcmMvZG9tLnRzXG5mdW5jdGlvbiBjb250YWlucyhwYXJlbnQsIGNoaWxkKSB7XG4gIGlmICghcGFyZW50KSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiBwYXJlbnQgPT09IGNoaWxkIHx8IHBhcmVudC5jb250YWlucyhjaGlsZCk7XG59XG5mdW5jdGlvbiBnZXRBY3RpdmVFbGVtZW50KG5vZGUsIGFjdGl2ZURlc2NlbmRhbnQgPSBmYWxzZSkge1xuICBjb25zdCB7IGFjdGl2ZUVsZW1lbnQgfSA9IGdldERvY3VtZW50KG5vZGUpO1xuICBpZiAoIWFjdGl2ZUVsZW1lbnQ/Lm5vZGVOYW1lKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaWYgKGlzRnJhbWUoYWN0aXZlRWxlbWVudCkgJiYgYWN0aXZlRWxlbWVudC5jb250ZW50RG9jdW1lbnQpIHtcbiAgICByZXR1cm4gZ2V0QWN0aXZlRWxlbWVudChhY3RpdmVFbGVtZW50LmNvbnRlbnREb2N1bWVudC5ib2R5LCBhY3RpdmVEZXNjZW5kYW50KTtcbiAgfVxuICBpZiAoYWN0aXZlRGVzY2VuZGFudCkge1xuICAgIGNvbnN0IGlkID0gYWN0aXZlRWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJhcmlhLWFjdGl2ZWRlc2NlbmRhbnRcIik7XG4gICAgaWYgKGlkKSB7XG4gICAgICBjb25zdCBlbGVtZW50ID0gZ2V0RG9jdW1lbnQoYWN0aXZlRWxlbWVudCkuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgICAgaWYgKGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBhY3RpdmVFbGVtZW50O1xufVxuZnVuY3Rpb24gZ2V0V2luZG93KG5vZGUpIHtcbiAgcmV0dXJuIGdldERvY3VtZW50KG5vZGUpLmRlZmF1bHRWaWV3IHx8IHdpbmRvdztcbn1cbmZ1bmN0aW9uIGdldERvY3VtZW50KG5vZGUpIHtcbiAgcmV0dXJuIG5vZGUgPyBub2RlLm93bmVyRG9jdW1lbnQgfHwgbm9kZSA6IGRvY3VtZW50O1xufVxuZnVuY3Rpb24gaXNGcmFtZShlbGVtZW50KSB7XG4gIHJldHVybiBlbGVtZW50LnRhZ05hbWUgPT09IFwiSUZSQU1FXCI7XG59XG5cbi8vIHNyYy9lbnVtcy50c1xudmFyIEV2ZW50S2V5ID0gLyogQF9fUFVSRV9fICovICgoRXZlbnRLZXkyKSA9PiB7XG4gIEV2ZW50S2V5MltcIkVzY2FwZVwiXSA9IFwiRXNjYXBlXCI7XG4gIEV2ZW50S2V5MltcIkVudGVyXCJdID0gXCJFbnRlclwiO1xuICBFdmVudEtleTJbXCJUYWJcIl0gPSBcIlRhYlwiO1xuICBFdmVudEtleTJbXCJTcGFjZVwiXSA9IFwiIFwiO1xuICBFdmVudEtleTJbXCJBcnJvd0Rvd25cIl0gPSBcIkFycm93RG93blwiO1xuICBFdmVudEtleTJbXCJBcnJvd0xlZnRcIl0gPSBcIkFycm93TGVmdFwiO1xuICBFdmVudEtleTJbXCJBcnJvd1JpZ2h0XCJdID0gXCJBcnJvd1JpZ2h0XCI7XG4gIEV2ZW50S2V5MltcIkFycm93VXBcIl0gPSBcIkFycm93VXBcIjtcbiAgRXZlbnRLZXkyW1wiRW5kXCJdID0gXCJFbmRcIjtcbiAgRXZlbnRLZXkyW1wiSG9tZVwiXSA9IFwiSG9tZVwiO1xuICBFdmVudEtleTJbXCJQYWdlRG93blwiXSA9IFwiUGFnZURvd25cIjtcbiAgRXZlbnRLZXkyW1wiUGFnZVVwXCJdID0gXCJQYWdlVXBcIjtcbiAgcmV0dXJuIEV2ZW50S2V5Mjtcbn0pKEV2ZW50S2V5IHx8IHt9KTtcblxuLy8gc3JjL3BsYXRmb3JtLnRzXG5mdW5jdGlvbiB0ZXN0VXNlckFnZW50KHJlKSB7XG4gIGlmICh0eXBlb2Ygd2luZG93ID09PSBcInVuZGVmaW5lZFwiIHx8IHdpbmRvdy5uYXZpZ2F0b3IgPT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gKFxuICAgIC8vIEB0cy1pZ25vcmVcbiAgICB3aW5kb3cubmF2aWdhdG9yW1widXNlckFnZW50RGF0YVwiXT8uYnJhbmRzLnNvbWUoXG4gICAgICAoYnJhbmQpID0+IHJlLnRlc3QoYnJhbmQuYnJhbmQpXG4gICAgKSB8fCByZS50ZXN0KHdpbmRvdy5uYXZpZ2F0b3IudXNlckFnZW50KVxuICApO1xufVxuZnVuY3Rpb24gdGVzdFBsYXRmb3JtKHJlKSB7XG4gIHJldHVybiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIHdpbmRvdy5uYXZpZ2F0b3IgIT0gbnVsbCA/IChcbiAgICAvLyBAdHMtaWdub3JlXG4gICAgcmUudGVzdCh3aW5kb3cubmF2aWdhdG9yW1widXNlckFnZW50RGF0YVwiXT8ucGxhdGZvcm0gfHwgd2luZG93Lm5hdmlnYXRvci5wbGF0Zm9ybSlcbiAgKSA6IGZhbHNlO1xufVxuZnVuY3Rpb24gaXNNYWMoKSB7XG4gIHJldHVybiB0ZXN0UGxhdGZvcm0oL15NYWMvaSk7XG59XG5mdW5jdGlvbiBpc0lQaG9uZSgpIHtcbiAgcmV0dXJuIHRlc3RQbGF0Zm9ybSgvXmlQaG9uZS9pKTtcbn1cbmZ1bmN0aW9uIGlzSVBhZCgpIHtcbiAgcmV0dXJuIHRlc3RQbGF0Zm9ybSgvXmlQYWQvaSkgfHwgLy8gaVBhZE9TIDEzIGxpZXMgYW5kIHNheXMgaXQncyBhIE1hYywgYnV0IHdlIGNhbiBkaXN0aW5ndWlzaCBieSBkZXRlY3RpbmcgdG91Y2ggc3VwcG9ydC5cbiAgaXNNYWMoKSAmJiBuYXZpZ2F0b3IubWF4VG91Y2hQb2ludHMgPiAxO1xufVxuZnVuY3Rpb24gaXNJT1MoKSB7XG4gIHJldHVybiBpc0lQaG9uZSgpIHx8IGlzSVBhZCgpO1xufVxuZnVuY3Rpb24gaXNBcHBsZURldmljZSgpIHtcbiAgcmV0dXJuIGlzTWFjKCkgfHwgaXNJT1MoKTtcbn1cbmZ1bmN0aW9uIGlzV2ViS2l0KCkge1xuICByZXR1cm4gdGVzdFVzZXJBZ2VudCgvQXBwbGVXZWJLaXQvaSkgJiYgIWlzQ2hyb21lKCk7XG59XG5mdW5jdGlvbiBpc0Nocm9tZSgpIHtcbiAgcmV0dXJuIHRlc3RVc2VyQWdlbnQoL0Nocm9tZS9pKTtcbn1cbmZ1bmN0aW9uIGlzQW5kcm9pZCgpIHtcbiAgcmV0dXJuIHRlc3RVc2VyQWdlbnQoL0FuZHJvaWQvaSk7XG59XG5cbi8vIHNyYy9ldmVudHMudHNcbmZ1bmN0aW9uIGNhbGxIYW5kbGVyKGV2ZW50LCBoYW5kbGVyKSB7XG4gIGlmIChoYW5kbGVyKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24oaGFuZGxlcikpIHtcbiAgICAgIGhhbmRsZXIoZXZlbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBoYW5kbGVyWzBdKGhhbmRsZXJbMV0sIGV2ZW50KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGV2ZW50Py5kZWZhdWx0UHJldmVudGVkO1xufVxuZnVuY3Rpb24gY29tcG9zZUV2ZW50SGFuZGxlcnMoaGFuZGxlcnMpIHtcbiAgcmV0dXJuIChldmVudCkgPT4ge1xuICAgIGZvciAoY29uc3QgaGFuZGxlciBvZiBoYW5kbGVycykge1xuICAgICAgY2FsbEhhbmRsZXIoZXZlbnQsIGhhbmRsZXIpO1xuICAgIH1cbiAgfTtcbn1cbmZ1bmN0aW9uIGlzQ3RybEtleShlKSB7XG4gIGlmIChpc01hYygpKSB7XG4gICAgcmV0dXJuIGUubWV0YUtleSAmJiAhZS5jdHJsS2V5O1xuICB9XG4gIHJldHVybiBlLmN0cmxLZXkgJiYgIWUubWV0YUtleTtcbn1cblxuLy8gc3JjL2ZvY3VzLXdpdGhvdXQtc2Nyb2xsaW5nLnRzXG5mdW5jdGlvbiBmb2N1c1dpdGhvdXRTY3JvbGxpbmcoZWxlbWVudCkge1xuICBpZiAoIWVsZW1lbnQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHN1cHBvcnRzUHJldmVudFNjcm9sbCgpKSB7XG4gICAgZWxlbWVudC5mb2N1cyh7IHByZXZlbnRTY3JvbGw6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgc2Nyb2xsYWJsZUVsZW1lbnRzID0gZ2V0U2Nyb2xsYWJsZUVsZW1lbnRzKGVsZW1lbnQpO1xuICAgIGVsZW1lbnQuZm9jdXMoKTtcbiAgICByZXN0b3JlU2Nyb2xsUG9zaXRpb24oc2Nyb2xsYWJsZUVsZW1lbnRzKTtcbiAgfVxufVxudmFyIHN1cHBvcnRzUHJldmVudFNjcm9sbENhY2hlZCA9IG51bGw7XG5mdW5jdGlvbiBzdXBwb3J0c1ByZXZlbnRTY3JvbGwoKSB7XG4gIGlmIChzdXBwb3J0c1ByZXZlbnRTY3JvbGxDYWNoZWQgPT0gbnVsbCkge1xuICAgIHN1cHBvcnRzUHJldmVudFNjcm9sbENhY2hlZCA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmb2N1c0VsZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgZm9jdXNFbGVtLmZvY3VzKHtcbiAgICAgICAgZ2V0IHByZXZlbnRTY3JvbGwoKSB7XG4gICAgICAgICAgc3VwcG9ydHNQcmV2ZW50U2Nyb2xsQ2FjaGVkID0gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3VwcG9ydHNQcmV2ZW50U2Nyb2xsQ2FjaGVkO1xufVxuZnVuY3Rpb24gZ2V0U2Nyb2xsYWJsZUVsZW1lbnRzKGVsZW1lbnQpIHtcbiAgbGV0IHBhcmVudCA9IGVsZW1lbnQucGFyZW50Tm9kZTtcbiAgY29uc3Qgc2Nyb2xsYWJsZUVsZW1lbnRzID0gW107XG4gIGNvbnN0IHJvb3RTY3JvbGxpbmdFbGVtZW50ID0gZG9jdW1lbnQuc2Nyb2xsaW5nRWxlbWVudCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIHdoaWxlIChwYXJlbnQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCAmJiBwYXJlbnQgIT09IHJvb3RTY3JvbGxpbmdFbGVtZW50KSB7XG4gICAgaWYgKHBhcmVudC5vZmZzZXRIZWlnaHQgPCBwYXJlbnQuc2Nyb2xsSGVpZ2h0IHx8IHBhcmVudC5vZmZzZXRXaWR0aCA8IHBhcmVudC5zY3JvbGxXaWR0aCkge1xuICAgICAgc2Nyb2xsYWJsZUVsZW1lbnRzLnB1c2goe1xuICAgICAgICBlbGVtZW50OiBwYXJlbnQsXG4gICAgICAgIHNjcm9sbFRvcDogcGFyZW50LnNjcm9sbFRvcCxcbiAgICAgICAgc2Nyb2xsTGVmdDogcGFyZW50LnNjcm9sbExlZnRcbiAgICAgIH0pO1xuICAgIH1cbiAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50Tm9kZTtcbiAgfVxuICBpZiAocm9vdFNjcm9sbGluZ0VsZW1lbnQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgIHNjcm9sbGFibGVFbGVtZW50cy5wdXNoKHtcbiAgICAgIGVsZW1lbnQ6IHJvb3RTY3JvbGxpbmdFbGVtZW50LFxuICAgICAgc2Nyb2xsVG9wOiByb290U2Nyb2xsaW5nRWxlbWVudC5zY3JvbGxUb3AsXG4gICAgICBzY3JvbGxMZWZ0OiByb290U2Nyb2xsaW5nRWxlbWVudC5zY3JvbGxMZWZ0XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIHNjcm9sbGFibGVFbGVtZW50cztcbn1cbmZ1bmN0aW9uIHJlc3RvcmVTY3JvbGxQb3NpdGlvbihzY3JvbGxhYmxlRWxlbWVudHMpIHtcbiAgZm9yIChjb25zdCB7IGVsZW1lbnQsIHNjcm9sbFRvcCwgc2Nyb2xsTGVmdCB9IG9mIHNjcm9sbGFibGVFbGVtZW50cykge1xuICAgIGVsZW1lbnQuc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuICAgIGVsZW1lbnQuc2Nyb2xsTGVmdCA9IHNjcm9sbExlZnQ7XG4gIH1cbn1cblxuLy8gc3JjL3RhYmJhYmxlLnRzXG52YXIgZm9jdXNhYmxlRWxlbWVudHMgPSBbXG4gIFwiaW5wdXQ6bm90KFt0eXBlPSdoaWRkZW4nXSk6bm90KFtkaXNhYmxlZF0pXCIsXG4gIFwic2VsZWN0Om5vdChbZGlzYWJsZWRdKVwiLFxuICBcInRleHRhcmVhOm5vdChbZGlzYWJsZWRdKVwiLFxuICBcImJ1dHRvbjpub3QoW2Rpc2FibGVkXSlcIixcbiAgXCJhW2hyZWZdXCIsXG4gIFwiYXJlYVtocmVmXVwiLFxuICBcIlt0YWJpbmRleF1cIixcbiAgXCJpZnJhbWVcIixcbiAgXCJvYmplY3RcIixcbiAgXCJlbWJlZFwiLFxuICBcImF1ZGlvW2NvbnRyb2xzXVwiLFxuICBcInZpZGVvW2NvbnRyb2xzXVwiLFxuICBcIltjb250ZW50ZWRpdGFibGVdOm5vdChbY29udGVudGVkaXRhYmxlPSdmYWxzZSddKVwiXG5dO1xudmFyIHRhYmJhYmxlRWxlbWVudHMgPSBbLi4uZm9jdXNhYmxlRWxlbWVudHMsICdbdGFiaW5kZXhdOm5vdChbdGFiaW5kZXg9XCItMVwiXSk6bm90KFtkaXNhYmxlZF0pJ107XG52YXIgRk9DVVNBQkxFX0VMRU1FTlRfU0VMRUNUT1IgPSBmb2N1c2FibGVFbGVtZW50cy5qb2luKFwiOm5vdChbaGlkZGVuXSksXCIpICsgXCIsW3RhYmluZGV4XTpub3QoW2Rpc2FibGVkXSk6bm90KFtoaWRkZW5dKVwiO1xudmFyIFRBQkJBQkxFX0VMRU1FTlRfU0VMRUNUT1IgPSB0YWJiYWJsZUVsZW1lbnRzLmpvaW4oXG4gICc6bm90KFtoaWRkZW5dKTpub3QoW3RhYmluZGV4PVwiLTFcIl0pLCdcbik7XG5mdW5jdGlvbiBnZXRBbGxUYWJiYWJsZUluKGNvbnRhaW5lciwgaW5jbHVkZUNvbnRhaW5lcikge1xuICBjb25zdCBlbGVtZW50cyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoRk9DVVNBQkxFX0VMRU1FTlRfU0VMRUNUT1IpKTtcbiAgY29uc3QgdGFiYmFibGVFbGVtZW50czIgPSBlbGVtZW50cy5maWx0ZXIoaXNUYWJiYWJsZSk7XG4gIGlmIChpbmNsdWRlQ29udGFpbmVyICYmIGlzVGFiYmFibGUoY29udGFpbmVyKSkge1xuICAgIHRhYmJhYmxlRWxlbWVudHMyLnVuc2hpZnQoY29udGFpbmVyKTtcbiAgfVxuICB0YWJiYWJsZUVsZW1lbnRzMi5mb3JFYWNoKChlbGVtZW50LCBpKSA9PiB7XG4gICAgaWYgKGlzRnJhbWUoZWxlbWVudCkgJiYgZWxlbWVudC5jb250ZW50RG9jdW1lbnQpIHtcbiAgICAgIGNvbnN0IGZyYW1lQm9keSA9IGVsZW1lbnQuY29udGVudERvY3VtZW50LmJvZHk7XG4gICAgICBjb25zdCBhbGxGcmFtZVRhYmJhYmxlID0gZ2V0QWxsVGFiYmFibGVJbihmcmFtZUJvZHksIGZhbHNlKTtcbiAgICAgIHRhYmJhYmxlRWxlbWVudHMyLnNwbGljZShpLCAxLCAuLi5hbGxGcmFtZVRhYmJhYmxlKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gdGFiYmFibGVFbGVtZW50czI7XG59XG5mdW5jdGlvbiBpc1RhYmJhYmxlKGVsZW1lbnQpIHtcbiAgcmV0dXJuIGlzRm9jdXNhYmxlKGVsZW1lbnQpICYmICFoYXNOZWdhdGl2ZVRhYkluZGV4KGVsZW1lbnQpO1xufVxuZnVuY3Rpb24gaXNGb2N1c2FibGUoZWxlbWVudCkge1xuICByZXR1cm4gZWxlbWVudC5tYXRjaGVzKEZPQ1VTQUJMRV9FTEVNRU5UX1NFTEVDVE9SKSAmJiBpc0VsZW1lbnRWaXNpYmxlKGVsZW1lbnQpO1xufVxuZnVuY3Rpb24gaGFzTmVnYXRpdmVUYWJJbmRleChlbGVtZW50KSB7XG4gIGNvbnN0IHRhYkluZGV4ID0gcGFyc2VJbnQoZWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJ0YWJpbmRleFwiKSB8fCBcIjBcIiwgMTApO1xuICByZXR1cm4gdGFiSW5kZXggPCAwO1xufVxuZnVuY3Rpb24gaXNFbGVtZW50VmlzaWJsZShlbGVtZW50LCBjaGlsZEVsZW1lbnQpIHtcbiAgcmV0dXJuIGVsZW1lbnQubm9kZU5hbWUgIT09IFwiI2NvbW1lbnRcIiAmJiBpc1N0eWxlVmlzaWJsZShlbGVtZW50KSAmJiBpc0F0dHJpYnV0ZVZpc2libGUoZWxlbWVudCwgY2hpbGRFbGVtZW50KSAmJiAoIWVsZW1lbnQucGFyZW50RWxlbWVudCB8fCBpc0VsZW1lbnRWaXNpYmxlKGVsZW1lbnQucGFyZW50RWxlbWVudCwgZWxlbWVudCkpO1xufVxuZnVuY3Rpb24gaXNTdHlsZVZpc2libGUoZWxlbWVudCkge1xuICBpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpICYmICEoZWxlbWVudCBpbnN0YW5jZW9mIFNWR0VsZW1lbnQpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IHsgZGlzcGxheSwgdmlzaWJpbGl0eSB9ID0gZWxlbWVudC5zdHlsZTtcbiAgbGV0IGlzVmlzaWJsZSA9IGRpc3BsYXkgIT09IFwibm9uZVwiICYmIHZpc2liaWxpdHkgIT09IFwiaGlkZGVuXCIgJiYgdmlzaWJpbGl0eSAhPT0gXCJjb2xsYXBzZVwiO1xuICBpZiAoaXNWaXNpYmxlKSB7XG4gICAgaWYgKCFlbGVtZW50Lm93bmVyRG9jdW1lbnQuZGVmYXVsdFZpZXcpIHtcbiAgICAgIHJldHVybiBpc1Zpc2libGU7XG4gICAgfVxuICAgIGNvbnN0IHsgZ2V0Q29tcHV0ZWRTdHlsZSB9ID0gZWxlbWVudC5vd25lckRvY3VtZW50LmRlZmF1bHRWaWV3O1xuICAgIGNvbnN0IHsgZGlzcGxheTogY29tcHV0ZWREaXNwbGF5LCB2aXNpYmlsaXR5OiBjb21wdXRlZFZpc2liaWxpdHkgfSA9IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG4gICAgaXNWaXNpYmxlID0gY29tcHV0ZWREaXNwbGF5ICE9PSBcIm5vbmVcIiAmJiBjb21wdXRlZFZpc2liaWxpdHkgIT09IFwiaGlkZGVuXCIgJiYgY29tcHV0ZWRWaXNpYmlsaXR5ICE9PSBcImNvbGxhcHNlXCI7XG4gIH1cbiAgcmV0dXJuIGlzVmlzaWJsZTtcbn1cbmZ1bmN0aW9uIGlzQXR0cmlidXRlVmlzaWJsZShlbGVtZW50LCBjaGlsZEVsZW1lbnQpIHtcbiAgcmV0dXJuICFlbGVtZW50Lmhhc0F0dHJpYnV0ZShcImhpZGRlblwiKSAmJiAoZWxlbWVudC5ub2RlTmFtZSA9PT0gXCJERVRBSUxTXCIgJiYgY2hpbGRFbGVtZW50ICYmIGNoaWxkRWxlbWVudC5ub2RlTmFtZSAhPT0gXCJTVU1NQVJZXCIgPyBlbGVtZW50Lmhhc0F0dHJpYnV0ZShcIm9wZW5cIikgOiB0cnVlKTtcbn1cbmZ1bmN0aW9uIGhhc0ZvY3VzV2l0aGluKGVsZW1lbnQpIHtcbiAgY29uc3QgYWN0aXZlRWxlbWVudCA9IGdldEFjdGl2ZUVsZW1lbnQoZWxlbWVudCk7XG4gIGlmICghYWN0aXZlRWxlbWVudCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoIWNvbnRhaW5zKGVsZW1lbnQsIGFjdGl2ZUVsZW1lbnQpKSB7XG4gICAgY29uc3QgYWN0aXZlRGVzY2VuZGFudCA9IGFjdGl2ZUVsZW1lbnQuZ2V0QXR0cmlidXRlKFwiYXJpYS1hY3RpdmVkZXNjZW5kYW50XCIpO1xuICAgIGlmICghYWN0aXZlRGVzY2VuZGFudCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoIShcImlkXCIgaW4gZWxlbWVudCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGFjdGl2ZURlc2NlbmRhbnQgPT09IGVsZW1lbnQuaWQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gISFlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoYCMke0NTUy5lc2NhcGUoYWN0aXZlRGVzY2VuZGFudCl9YCk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuLy8gc3JjL2ZvY3VzLW1hbmFnZXIudHNcbmZ1bmN0aW9uIGNyZWF0ZUZvY3VzTWFuYWdlcihyZWYsIGRlZmF1bHRPcHRpb25zID0gKCkgPT4gKHt9KSkge1xuICBjb25zdCBmb2N1c05leHQgPSAob3B0cyA9IHt9KSA9PiB7XG4gICAgY29uc3Qgcm9vdCA9IHJlZigpO1xuICAgIGlmICghcm9vdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB7XG4gICAgICBmcm9tID0gZGVmYXVsdE9wdGlvbnMoKS5mcm9tIHx8IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQsXG4gICAgICB0YWJiYWJsZSA9IGRlZmF1bHRPcHRpb25zKCkudGFiYmFibGUsXG4gICAgICB3cmFwID0gZGVmYXVsdE9wdGlvbnMoKS53cmFwLFxuICAgICAgYWNjZXB0ID0gZGVmYXVsdE9wdGlvbnMoKS5hY2NlcHRcbiAgICB9ID0gb3B0cztcbiAgICBjb25zdCB3YWxrZXIgPSBnZXRGb2N1c2FibGVUcmVlV2Fsa2VyKHJvb3QsIHsgdGFiYmFibGUsIGFjY2VwdCB9KTtcbiAgICBpZiAoZnJvbSAmJiByb290LmNvbnRhaW5zKGZyb20pKSB7XG4gICAgICB3YWxrZXIuY3VycmVudE5vZGUgPSBmcm9tO1xuICAgIH1cbiAgICBsZXQgbmV4dE5vZGUgPSB3YWxrZXIubmV4dE5vZGUoKTtcbiAgICBpZiAoIW5leHROb2RlICYmIHdyYXApIHtcbiAgICAgIHdhbGtlci5jdXJyZW50Tm9kZSA9IHJvb3Q7XG4gICAgICBuZXh0Tm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpO1xuICAgIH1cbiAgICBpZiAobmV4dE5vZGUpIHtcbiAgICAgIGZvY3VzRWxlbWVudChuZXh0Tm9kZSwgdHJ1ZSk7XG4gICAgfVxuICAgIHJldHVybiBuZXh0Tm9kZTtcbiAgfTtcbiAgY29uc3QgZm9jdXNQcmV2aW91cyA9IChvcHRzID0ge30pID0+IHtcbiAgICBjb25zdCByb290ID0gcmVmKCk7XG4gICAgaWYgKCFyb290KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHtcbiAgICAgIGZyb20gPSBkZWZhdWx0T3B0aW9ucygpLmZyb20gfHwgZG9jdW1lbnQuYWN0aXZlRWxlbWVudCxcbiAgICAgIHRhYmJhYmxlID0gZGVmYXVsdE9wdGlvbnMoKS50YWJiYWJsZSxcbiAgICAgIHdyYXAgPSBkZWZhdWx0T3B0aW9ucygpLndyYXAsXG4gICAgICBhY2NlcHQgPSBkZWZhdWx0T3B0aW9ucygpLmFjY2VwdFxuICAgIH0gPSBvcHRzO1xuICAgIGNvbnN0IHdhbGtlciA9IGdldEZvY3VzYWJsZVRyZWVXYWxrZXIocm9vdCwgeyB0YWJiYWJsZSwgYWNjZXB0IH0pO1xuICAgIGlmIChmcm9tICYmIHJvb3QuY29udGFpbnMoZnJvbSkpIHtcbiAgICAgIHdhbGtlci5jdXJyZW50Tm9kZSA9IGZyb207XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IG5leHQgPSBsYXN0KHdhbGtlcik7XG4gICAgICBpZiAobmV4dCkge1xuICAgICAgICBmb2N1c0VsZW1lbnQobmV4dCwgdHJ1ZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmV4dDtcbiAgICB9XG4gICAgbGV0IHByZXZpb3VzTm9kZSA9IHdhbGtlci5wcmV2aW91c05vZGUoKTtcbiAgICBpZiAoIXByZXZpb3VzTm9kZSAmJiB3cmFwKSB7XG4gICAgICB3YWxrZXIuY3VycmVudE5vZGUgPSByb290O1xuICAgICAgcHJldmlvdXNOb2RlID0gbGFzdCh3YWxrZXIpO1xuICAgIH1cbiAgICBpZiAocHJldmlvdXNOb2RlKSB7XG4gICAgICBmb2N1c0VsZW1lbnQocHJldmlvdXNOb2RlLCB0cnVlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByZXZpb3VzTm9kZTtcbiAgfTtcbiAgY29uc3QgZm9jdXNGaXJzdCA9IChvcHRzID0ge30pID0+IHtcbiAgICBjb25zdCByb290ID0gcmVmKCk7XG4gICAgaWYgKCFyb290KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHsgdGFiYmFibGUgPSBkZWZhdWx0T3B0aW9ucygpLnRhYmJhYmxlLCBhY2NlcHQgPSBkZWZhdWx0T3B0aW9ucygpLmFjY2VwdCB9ID0gb3B0cztcbiAgICBjb25zdCB3YWxrZXIgPSBnZXRGb2N1c2FibGVUcmVlV2Fsa2VyKHJvb3QsIHsgdGFiYmFibGUsIGFjY2VwdCB9KTtcbiAgICBjb25zdCBuZXh0Tm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpO1xuICAgIGlmIChuZXh0Tm9kZSkge1xuICAgICAgZm9jdXNFbGVtZW50KG5leHROb2RlLCB0cnVlKTtcbiAgICB9XG4gICAgcmV0dXJuIG5leHROb2RlO1xuICB9O1xuICBjb25zdCBmb2N1c0xhc3QgPSAob3B0cyA9IHt9KSA9PiB7XG4gICAgY29uc3Qgcm9vdCA9IHJlZigpO1xuICAgIGlmICghcm9vdCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB7IHRhYmJhYmxlID0gZGVmYXVsdE9wdGlvbnMoKS50YWJiYWJsZSwgYWNjZXB0ID0gZGVmYXVsdE9wdGlvbnMoKS5hY2NlcHQgfSA9IG9wdHM7XG4gICAgY29uc3Qgd2Fsa2VyID0gZ2V0Rm9jdXNhYmxlVHJlZVdhbGtlcihyb290LCB7IHRhYmJhYmxlLCBhY2NlcHQgfSk7XG4gICAgY29uc3QgbmV4dCA9IGxhc3Qod2Fsa2VyKTtcbiAgICBpZiAobmV4dCkge1xuICAgICAgZm9jdXNFbGVtZW50KG5leHQsIHRydWUpO1xuICAgIH1cbiAgICByZXR1cm4gbmV4dDtcbiAgfTtcbiAgcmV0dXJuIHsgZm9jdXNOZXh0LCBmb2N1c1ByZXZpb3VzLCBmb2N1c0ZpcnN0LCBmb2N1c0xhc3QgfTtcbn1cbmZ1bmN0aW9uIGZvY3VzRWxlbWVudChlbGVtZW50LCBzY3JvbGwgPSBmYWxzZSkge1xuICBpZiAoZWxlbWVudCAhPSBudWxsICYmICFzY3JvbGwpIHtcbiAgICB0cnkge1xuICAgICAgZm9jdXNXaXRob3V0U2Nyb2xsaW5nKGVsZW1lbnQpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgIH1cbiAgfSBlbHNlIGlmIChlbGVtZW50ICE9IG51bGwpIHtcbiAgICB0cnkge1xuICAgICAgZWxlbWVudC5mb2N1cygpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgIH1cbiAgfVxufVxuZnVuY3Rpb24gbGFzdCh3YWxrZXIpIHtcbiAgbGV0IG5leHQ7XG4gIGxldCBsYXN0MjtcbiAgZG8ge1xuICAgIGxhc3QyID0gd2Fsa2VyLmxhc3RDaGlsZCgpO1xuICAgIGlmIChsYXN0Mikge1xuICAgICAgbmV4dCA9IGxhc3QyO1xuICAgIH1cbiAgfSB3aGlsZSAobGFzdDIpO1xuICByZXR1cm4gbmV4dDtcbn1cbmZ1bmN0aW9uIGlzRWxlbWVudEluU2NvcGUoZWxlbWVudCwgc2NvcGUpIHtcbiAgcmV0dXJuIHNjb3BlLnNvbWUoKG5vZGUpID0+IG5vZGUuY29udGFpbnMoZWxlbWVudCkpO1xufVxuZnVuY3Rpb24gZ2V0Rm9jdXNhYmxlVHJlZVdhbGtlcihyb290LCBvcHRzLCBzY29wZSkge1xuICBjb25zdCBzZWxlY3RvciA9IG9wdHM/LnRhYmJhYmxlID8gVEFCQkFCTEVfRUxFTUVOVF9TRUxFQ1RPUiA6IEZPQ1VTQUJMRV9FTEVNRU5UX1NFTEVDVE9SO1xuICBjb25zdCB3YWxrZXIgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKHJvb3QsIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5ULCB7XG4gICAgYWNjZXB0Tm9kZShub2RlKSB7XG4gICAgICBpZiAob3B0cz8uZnJvbT8uY29udGFpbnMobm9kZSkpIHtcbiAgICAgICAgcmV0dXJuIE5vZGVGaWx0ZXIuRklMVEVSX1JFSkVDVDtcbiAgICAgIH1cbiAgICAgIGlmIChub2RlLm1hdGNoZXMoc2VsZWN0b3IpICYmIGlzRWxlbWVudFZpc2libGUobm9kZSkgJiYgKCFzY29wZSB8fCBpc0VsZW1lbnRJblNjb3BlKG5vZGUsIHNjb3BlKSkgJiYgKCFvcHRzPy5hY2NlcHQgfHwgb3B0cy5hY2NlcHQobm9kZSkpKSB7XG4gICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9BQ0NFUFQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfU0tJUDtcbiAgICB9XG4gIH0pO1xuICBpZiAob3B0cz8uZnJvbSkge1xuICAgIHdhbGtlci5jdXJyZW50Tm9kZSA9IG9wdHMuZnJvbTtcbiAgfVxuICByZXR1cm4gd2Fsa2VyO1xufVxuXG4vLyBzcmMvZ2V0LXNjcm9sbC1wYXJlbnQudHNcbmZ1bmN0aW9uIGdldFNjcm9sbFBhcmVudChub2RlKSB7XG4gIHdoaWxlIChub2RlICYmICFpc1Njcm9sbGFibGUobm9kZSkpIHtcbiAgICBub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xuICB9XG4gIHJldHVybiBub2RlIHx8IGRvY3VtZW50LnNjcm9sbGluZ0VsZW1lbnQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xufVxuZnVuY3Rpb24gaXNTY3JvbGxhYmxlKG5vZGUpIHtcbiAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShub2RlKTtcbiAgcmV0dXJuIC8oYXV0b3xzY3JvbGwpLy50ZXN0KHN0eWxlLm92ZXJmbG93ICsgc3R5bGUub3ZlcmZsb3dYICsgc3R5bGUub3ZlcmZsb3dZKTtcbn1cblxuLy8gc3JjL2lzLXZpcnR1YWwtZXZlbnQudHNcbmZ1bmN0aW9uIGlzVmlydHVhbENsaWNrKGV2ZW50KSB7XG4gIGlmIChldmVudC5tb3pJbnB1dFNvdXJjZSA9PT0gMCAmJiBldmVudC5pc1RydXN0ZWQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBpZiAoaXNBbmRyb2lkKCkgJiYgZXZlbnQucG9pbnRlclR5cGUpIHtcbiAgICByZXR1cm4gZXZlbnQudHlwZSA9PT0gXCJjbGlja1wiICYmIGV2ZW50LmJ1dHRvbnMgPT09IDE7XG4gIH1cbiAgcmV0dXJuIGV2ZW50LmRldGFpbCA9PT0gMCAmJiAhZXZlbnQucG9pbnRlclR5cGU7XG59XG5mdW5jdGlvbiBpc1ZpcnR1YWxQb2ludGVyRXZlbnQoZXZlbnQpIHtcbiAgcmV0dXJuIGV2ZW50LndpZHRoID09PSAwICYmIGV2ZW50LmhlaWdodCA9PT0gMCB8fCBldmVudC53aWR0aCA9PT0gMSAmJiBldmVudC5oZWlnaHQgPT09IDEgJiYgZXZlbnQucHJlc3N1cmUgPT09IDAgJiYgZXZlbnQuZGV0YWlsID09PSAwICYmIGV2ZW50LnBvaW50ZXJUeXBlID09PSBcIm1vdXNlXCI7XG59XG5cbi8vIHNyYy9ub29wLnRzXG5mdW5jdGlvbiBub29wKCkge1xuICByZXR1cm47XG59XG5cbi8vIHNyYy9udW1iZXIudHNcbmZ1bmN0aW9uIGNsYW1wKHZhbHVlLCBtaW4gPSAtSW5maW5pdHksIG1heCA9IEluZmluaXR5KSB7XG4gIHJldHVybiBNYXRoLm1pbihNYXRoLm1heCh2YWx1ZSwgbWluKSwgbWF4KTtcbn1cbmZ1bmN0aW9uIHNuYXBWYWx1ZVRvU3RlcCh2YWx1ZSwgbWluLCBtYXgsIHN0ZXApIHtcbiAgY29uc3QgcmVtYWluZGVyID0gKHZhbHVlIC0gKGlzTmFOKG1pbikgPyAwIDogbWluKSkgJSBzdGVwO1xuICBsZXQgc25hcHBlZFZhbHVlID0gTWF0aC5hYnMocmVtYWluZGVyKSAqIDIgPj0gc3RlcCA/IHZhbHVlICsgTWF0aC5zaWduKHJlbWFpbmRlcikgKiAoc3RlcCAtIE1hdGguYWJzKHJlbWFpbmRlcikpIDogdmFsdWUgLSByZW1haW5kZXI7XG4gIGlmICghaXNOYU4obWluKSkge1xuICAgIGlmIChzbmFwcGVkVmFsdWUgPCBtaW4pIHtcbiAgICAgIHNuYXBwZWRWYWx1ZSA9IG1pbjtcbiAgICB9IGVsc2UgaWYgKCFpc05hTihtYXgpICYmIHNuYXBwZWRWYWx1ZSA+IG1heCkge1xuICAgICAgc25hcHBlZFZhbHVlID0gbWluICsgTWF0aC5mbG9vcigobWF4IC0gbWluKSAvIHN0ZXApICogc3RlcDtcbiAgICB9XG4gIH0gZWxzZSBpZiAoIWlzTmFOKG1heCkgJiYgc25hcHBlZFZhbHVlID4gbWF4KSB7XG4gICAgc25hcHBlZFZhbHVlID0gTWF0aC5mbG9vcihtYXggLyBzdGVwKSAqIHN0ZXA7XG4gIH1cbiAgY29uc3Qgc3RyaW5nID0gc3RlcC50b1N0cmluZygpO1xuICBjb25zdCBpbmRleCA9IHN0cmluZy5pbmRleE9mKFwiLlwiKTtcbiAgY29uc3QgcHJlY2lzaW9uID0gaW5kZXggPj0gMCA/IHN0cmluZy5sZW5ndGggLSBpbmRleCA6IDA7XG4gIGlmIChwcmVjaXNpb24gPiAwKSB7XG4gICAgY29uc3QgcG93ID0gTWF0aC5wb3coMTAsIHByZWNpc2lvbik7XG4gICAgc25hcHBlZFZhbHVlID0gTWF0aC5yb3VuZChzbmFwcGVkVmFsdWUgKiBwb3cpIC8gcG93O1xuICB9XG4gIHJldHVybiBzbmFwcGVkVmFsdWU7XG59XG5cbi8vIHNyYy9wb2x5Z29uLnRzXG5mdW5jdGlvbiBnZXRFdmVudFBvaW50KGV2ZW50KSB7XG4gIHJldHVybiBbZXZlbnQuY2xpZW50WCwgZXZlbnQuY2xpZW50WV07XG59XG5mdW5jdGlvbiBpc1BvaW50SW5Qb2x5Z29uKHBvaW50LCBwb2x5Z29uKSB7XG4gIGNvbnN0IFt4LCB5XSA9IHBvaW50O1xuICBsZXQgaW5zaWRlID0gZmFsc2U7XG4gIGNvbnN0IGxlbmd0aCA9IHBvbHlnb24ubGVuZ3RoO1xuICBmb3IgKGxldCBsID0gbGVuZ3RoLCBpID0gMCwgaiA9IGwgLSAxOyBpIDwgbDsgaiA9IGkrKykge1xuICAgIGNvbnN0IFt4aSwgeWldID0gcG9seWdvbltpXTtcbiAgICBjb25zdCBbeGosIHlqXSA9IHBvbHlnb25bal07XG4gICAgY29uc3QgWywgdnldID0gcG9seWdvbltqID09PSAwID8gbCAtIDEgOiBqIC0gMV0gfHwgWzAsIDBdO1xuICAgIGNvbnN0IHdoZXJlID0gKHlpIC0geWopICogKHggLSB4aSkgLSAoeGkgLSB4aikgKiAoeSAtIHlpKTtcbiAgICBpZiAoeWogPCB5aSkge1xuICAgICAgaWYgKHkgPj0geWogJiYgeSA8IHlpKSB7XG4gICAgICAgIGlmICh3aGVyZSA9PT0gMClcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKHdoZXJlID4gMCkge1xuICAgICAgICAgIGlmICh5ID09PSB5aikge1xuICAgICAgICAgICAgaWYgKHkgPiB2eSkge1xuICAgICAgICAgICAgICBpbnNpZGUgPSAhaW5zaWRlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbnNpZGUgPSAhaW5zaWRlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoeWkgPCB5aikge1xuICAgICAgaWYgKHkgPiB5aSAmJiB5IDw9IHlqKSB7XG4gICAgICAgIGlmICh3aGVyZSA9PT0gMClcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKHdoZXJlIDwgMCkge1xuICAgICAgICAgIGlmICh5ID09PSB5aikge1xuICAgICAgICAgICAgaWYgKHkgPCB2eSkge1xuICAgICAgICAgICAgICBpbnNpZGUgPSAhaW5zaWRlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbnNpZGUgPSAhaW5zaWRlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoeSA9PSB5aSAmJiAoeCA+PSB4aiAmJiB4IDw9IHhpIHx8IHggPj0geGkgJiYgeCA8PSB4aikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gaW5zaWRlO1xufVxuZnVuY3Rpb24gZ2V0UG9seWdvbigpIHtcbiAgY29uc3QgaWQgPSBcImRlYnVnLXBvbHlnb25cIjtcbiAgY29uc3QgZXhpc3RpbmdQb2x5Z29uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICBpZiAoZXhpc3RpbmdQb2x5Z29uKSB7XG4gICAgcmV0dXJuIGV4aXN0aW5nUG9seWdvbjtcbiAgfVxuICBjb25zdCBzdmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiLCBcInN2Z1wiKTtcbiAgc3ZnLnN0eWxlLnRvcCA9IFwiMFwiO1xuICBzdmcuc3R5bGUubGVmdCA9IFwiMFwiO1xuICBzdmcuc3R5bGUud2lkdGggPSBcIjEwMCVcIjtcbiAgc3ZnLnN0eWxlLmhlaWdodCA9IFwiMTAwJVwiO1xuICBzdmcuc3R5bGUuZmlsbCA9IFwiZ3JlZW5cIjtcbiAgc3ZnLnN0eWxlLm9wYWNpdHkgPSBcIjAuMlwiO1xuICBzdmcuc3R5bGUucG9zaXRpb24gPSBcImZpeGVkXCI7XG4gIHN2Zy5zdHlsZS5wb2ludGVyRXZlbnRzID0gXCJub25lXCI7XG4gIHN2Zy5zdHlsZS56SW5kZXggPSBcIjk5OTk5OVwiO1xuICBjb25zdCBwb2x5Z29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgXCJwb2x5Z29uXCIpO1xuICBwb2x5Z29uLnNldEF0dHJpYnV0ZShcImlkXCIsIGlkKTtcbiAgcG9seWdvbi5zZXRBdHRyaWJ1dGUoXCJwb2ludHNcIiwgXCIwLDAgMCwwXCIpO1xuICBzdmcuYXBwZW5kQ2hpbGQocG9seWdvbik7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc3ZnKTtcbiAgcmV0dXJuIHBvbHlnb247XG59XG5mdW5jdGlvbiBkZWJ1Z1BvbHlnb24ocG9seWdvbikge1xuICBjb25zdCBwb2x5Z29uRWxlbWVudCA9IGdldFBvbHlnb24oKTtcbiAgY29uc3QgcG9pbnRzID0gcG9seWdvbi5tYXAoKHBvaW50KSA9PiBwb2ludC5qb2luKFwiLFwiKSkuam9pbihcIiBcIik7XG4gIHBvbHlnb25FbGVtZW50LnNldEF0dHJpYnV0ZShcInBvaW50c1wiLCBwb2ludHMpO1xuICByZXR1cm4gcG9seWdvbkVsZW1lbnQucGFyZW50RWxlbWVudDtcbn1cbmZ1bmN0aW9uIG1lcmdlRGVmYXVsdFByb3BzKGRlZmF1bHRQcm9wcywgcHJvcHMpIHtcbiAgcmV0dXJuIG1lcmdlUHJvcHMoZGVmYXVsdFByb3BzLCBwcm9wcyk7XG59XG5cbi8vIHNyYy9ydW4tYWZ0ZXItdHJhbnNpdGlvbi50c1xudmFyIHRyYW5zaXRpb25zQnlFbGVtZW50ID0gLyogQF9fUFVSRV9fICovIG5ldyBNYXAoKTtcbnZhciB0cmFuc2l0aW9uQ2FsbGJhY2tzID0gLyogQF9fUFVSRV9fICovIG5ldyBTZXQoKTtcbmZ1bmN0aW9uIHNldHVwR2xvYmFsRXZlbnRzKCkge1xuICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBvblRyYW5zaXRpb25TdGFydCA9IChlKSA9PiB7XG4gICAgaWYgKCFlLnRhcmdldCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgdHJhbnNpdGlvbnMgPSB0cmFuc2l0aW9uc0J5RWxlbWVudC5nZXQoZS50YXJnZXQpO1xuICAgIGlmICghdHJhbnNpdGlvbnMpIHtcbiAgICAgIHRyYW5zaXRpb25zID0gLyogQF9fUFVSRV9fICovIG5ldyBTZXQoKTtcbiAgICAgIHRyYW5zaXRpb25zQnlFbGVtZW50LnNldChlLnRhcmdldCwgdHJhbnNpdGlvbnMpO1xuICAgICAgZS50YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcihcInRyYW5zaXRpb25jYW5jZWxcIiwgb25UcmFuc2l0aW9uRW5kKTtcbiAgICB9XG4gICAgdHJhbnNpdGlvbnMuYWRkKGUucHJvcGVydHlOYW1lKTtcbiAgfTtcbiAgY29uc3Qgb25UcmFuc2l0aW9uRW5kID0gKGUpID0+IHtcbiAgICBpZiAoIWUudGFyZ2V0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHByb3BlcnRpZXMgPSB0cmFuc2l0aW9uc0J5RWxlbWVudC5nZXQoZS50YXJnZXQpO1xuICAgIGlmICghcHJvcGVydGllcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBwcm9wZXJ0aWVzLmRlbGV0ZShlLnByb3BlcnR5TmFtZSk7XG4gICAgaWYgKHByb3BlcnRpZXMuc2l6ZSA9PT0gMCkge1xuICAgICAgZS50YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRyYW5zaXRpb25jYW5jZWxcIiwgb25UcmFuc2l0aW9uRW5kKTtcbiAgICAgIHRyYW5zaXRpb25zQnlFbGVtZW50LmRlbGV0ZShlLnRhcmdldCk7XG4gICAgfVxuICAgIGlmICh0cmFuc2l0aW9uc0J5RWxlbWVudC5zaXplID09PSAwKSB7XG4gICAgICBmb3IgKGNvbnN0IGNiIG9mIHRyYW5zaXRpb25DYWxsYmFja3MpIHtcbiAgICAgICAgY2IoKTtcbiAgICAgIH1cbiAgICAgIHRyYW5zaXRpb25DYWxsYmFja3MuY2xlYXIoKTtcbiAgICB9XG4gIH07XG4gIGRvY3VtZW50LmJvZHkuYWRkRXZlbnRMaXN0ZW5lcihcInRyYW5zaXRpb25ydW5cIiwgb25UcmFuc2l0aW9uU3RhcnQpO1xuICBkb2N1bWVudC5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoXCJ0cmFuc2l0aW9uZW5kXCIsIG9uVHJhbnNpdGlvbkVuZCk7XG59XG5pZiAodHlwZW9mIGRvY3VtZW50ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gIGlmIChkb2N1bWVudC5yZWFkeVN0YXRlICE9PSBcImxvYWRpbmdcIikge1xuICAgIHNldHVwR2xvYmFsRXZlbnRzKCk7XG4gIH0gZWxzZSB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIiwgc2V0dXBHbG9iYWxFdmVudHMpO1xuICB9XG59XG5mdW5jdGlvbiBydW5BZnRlclRyYW5zaXRpb24oZm4pIHtcbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICBpZiAodHJhbnNpdGlvbnNCeUVsZW1lbnQuc2l6ZSA9PT0gMCkge1xuICAgICAgZm4oKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdHJhbnNpdGlvbkNhbGxiYWNrcy5hZGQoZm4pO1xuICAgIH1cbiAgfSk7XG59XG5cbi8vIHNyYy9zY3JvbGwtaW50by12aWV3LnRzXG5mdW5jdGlvbiBzY3JvbGxJbnRvVmlldyhzY3JvbGxWaWV3LCBlbGVtZW50KSB7XG4gIGNvbnN0IG9mZnNldFggPSByZWxhdGl2ZU9mZnNldChzY3JvbGxWaWV3LCBlbGVtZW50LCBcImxlZnRcIik7XG4gIGNvbnN0IG9mZnNldFkgPSByZWxhdGl2ZU9mZnNldChzY3JvbGxWaWV3LCBlbGVtZW50LCBcInRvcFwiKTtcbiAgY29uc3Qgd2lkdGggPSBlbGVtZW50Lm9mZnNldFdpZHRoO1xuICBjb25zdCBoZWlnaHQgPSBlbGVtZW50Lm9mZnNldEhlaWdodDtcbiAgbGV0IHggPSBzY3JvbGxWaWV3LnNjcm9sbExlZnQ7XG4gIGxldCB5ID0gc2Nyb2xsVmlldy5zY3JvbGxUb3A7XG4gIGNvbnN0IG1heFggPSB4ICsgc2Nyb2xsVmlldy5vZmZzZXRXaWR0aDtcbiAgY29uc3QgbWF4WSA9IHkgKyBzY3JvbGxWaWV3Lm9mZnNldEhlaWdodDtcbiAgaWYgKG9mZnNldFggPD0geCkge1xuICAgIHggPSBvZmZzZXRYO1xuICB9IGVsc2UgaWYgKG9mZnNldFggKyB3aWR0aCA+IG1heFgpIHtcbiAgICB4ICs9IG9mZnNldFggKyB3aWR0aCAtIG1heFg7XG4gIH1cbiAgaWYgKG9mZnNldFkgPD0geSkge1xuICAgIHkgPSBvZmZzZXRZO1xuICB9IGVsc2UgaWYgKG9mZnNldFkgKyBoZWlnaHQgPiBtYXhZKSB7XG4gICAgeSArPSBvZmZzZXRZICsgaGVpZ2h0IC0gbWF4WTtcbiAgfVxuICBzY3JvbGxWaWV3LnNjcm9sbExlZnQgPSB4O1xuICBzY3JvbGxWaWV3LnNjcm9sbFRvcCA9IHk7XG59XG5mdW5jdGlvbiByZWxhdGl2ZU9mZnNldChhbmNlc3RvciwgY2hpbGQsIGF4aXMpIHtcbiAgY29uc3QgcHJvcCA9IGF4aXMgPT09IFwibGVmdFwiID8gXCJvZmZzZXRMZWZ0XCIgOiBcIm9mZnNldFRvcFwiO1xuICBsZXQgc3VtID0gMDtcbiAgd2hpbGUgKGNoaWxkLm9mZnNldFBhcmVudCkge1xuICAgIHN1bSArPSBjaGlsZFtwcm9wXTtcbiAgICBpZiAoY2hpbGQub2Zmc2V0UGFyZW50ID09PSBhbmNlc3Rvcikge1xuICAgICAgYnJlYWs7XG4gICAgfSBlbHNlIGlmIChjaGlsZC5vZmZzZXRQYXJlbnQuY29udGFpbnMoYW5jZXN0b3IpKSB7XG4gICAgICBzdW0gLT0gYW5jZXN0b3JbcHJvcF07XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2hpbGQgPSBjaGlsZC5vZmZzZXRQYXJlbnQ7XG4gIH1cbiAgcmV0dXJuIHN1bTtcbn1cbmZ1bmN0aW9uIHNjcm9sbEludG9WaWV3cG9ydCh0YXJnZXRFbGVtZW50LCBvcHRzKSB7XG4gIGlmIChkb2N1bWVudC5jb250YWlucyh0YXJnZXRFbGVtZW50KSkge1xuICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5zY3JvbGxpbmdFbGVtZW50IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgICBjb25zdCBpc1Njcm9sbFByZXZlbnRlZCA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHJvb3QpLm92ZXJmbG93ID09PSBcImhpZGRlblwiO1xuICAgIGlmICghaXNTY3JvbGxQcmV2ZW50ZWQpIHtcbiAgICAgIGNvbnN0IHsgbGVmdDogb3JpZ2luYWxMZWZ0LCB0b3A6IG9yaWdpbmFsVG9wIH0gPSB0YXJnZXRFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgdGFyZ2V0RWxlbWVudD8uc2Nyb2xsSW50b1ZpZXc/Lih7IGJsb2NrOiBcIm5lYXJlc3RcIiB9KTtcbiAgICAgIGNvbnN0IHsgbGVmdDogbmV3TGVmdCwgdG9wOiBuZXdUb3AgfSA9IHRhcmdldEVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBpZiAoTWF0aC5hYnMob3JpZ2luYWxMZWZ0IC0gbmV3TGVmdCkgPiAxIHx8IE1hdGguYWJzKG9yaWdpbmFsVG9wIC0gbmV3VG9wKSA+IDEpIHtcbiAgICAgICAgb3B0cz8uY29udGFpbmluZ0VsZW1lbnQ/LnNjcm9sbEludG9WaWV3Py4oeyBibG9jazogXCJjZW50ZXJcIiwgaW5saW5lOiBcImNlbnRlclwiIH0pO1xuICAgICAgICB0YXJnZXRFbGVtZW50LnNjcm9sbEludG9WaWV3Py4oeyBibG9jazogXCJuZWFyZXN0XCIgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGxldCBzY3JvbGxQYXJlbnQgPSBnZXRTY3JvbGxQYXJlbnQodGFyZ2V0RWxlbWVudCk7XG4gICAgICB3aGlsZSAodGFyZ2V0RWxlbWVudCAmJiBzY3JvbGxQYXJlbnQgJiYgdGFyZ2V0RWxlbWVudCAhPT0gcm9vdCAmJiBzY3JvbGxQYXJlbnQgIT09IHJvb3QpIHtcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXcoc2Nyb2xsUGFyZW50LCB0YXJnZXRFbGVtZW50KTtcbiAgICAgICAgdGFyZ2V0RWxlbWVudCA9IHNjcm9sbFBhcmVudDtcbiAgICAgICAgc2Nyb2xsUGFyZW50ID0gZ2V0U2Nyb2xsUGFyZW50KHRhcmdldEVsZW1lbnQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vLyBzcmMvc3R5bGVzLnRzXG52YXIgdmlzdWFsbHlIaWRkZW5TdHlsZXMgPSB7XG4gIGJvcmRlcjogXCIwXCIsXG4gIGNsaXA6IFwicmVjdCgwIDAgMCAwKVwiLFxuICBcImNsaXAtcGF0aFwiOiBcImluc2V0KDUwJSlcIixcbiAgaGVpZ2h0OiBcIjFweFwiLFxuICBtYXJnaW46IFwiMCAtMXB4IC0xcHggMFwiLFxuICBvdmVyZmxvdzogXCJoaWRkZW5cIixcbiAgcGFkZGluZzogXCIwXCIsXG4gIHBvc2l0aW9uOiBcImFic29sdXRlXCIsXG4gIHdpZHRoOiBcIjFweFwiLFxuICBcIndoaXRlLXNwYWNlXCI6IFwibm93cmFwXCJcbn07XG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIGFyaWFraXQuXG4gKiBNSVQgTGljZW5zZWQsIENvcHlyaWdodCAoYykgRGllZ28gSGF6LlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIEFyaWFraXQgdGVhbTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hcmlha2l0L2FyaWFraXQvYmxvYi9kYTE0MjY3MmVkZGVmYTk5MzY1NzczY2VkNzIxNzFmYWNjMDZmZGNiL3BhY2thZ2VzL2FyaWFraXQtdXRpbHMvc3JjL2FycmF5LnRzXG4gKi9cbi8qIVxuICogT3JpZ2luYWwgY29kZSBieSBDaGFrcmEgVUlcbiAqIE1JVCBMaWNlbnNlZCwgQ29weXJpZ2h0IChjKSAyMDE5IFNlZ3VuIEFkZWJheW8uXG4gKlxuICogQ3JlZGl0cyB0byB0aGUgQ2hha3JhIFVJIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vY2hha3JhLXVpL2NoYWtyYS11aS9ibG9iL21haW4vcGFja2FnZXMvdXRpbHMvc3JjL2Fzc2VydGlvbi50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vc29saWRqcy1jb21tdW5pdHkvc29saWQtYXJpYS9ibG9iLzJjNWY1NGZlYjVjZmVhNTE0YjFlZTBhNTJkMDQxNjg3OGY4ODIzNTEvcGFja2FnZXMvdXRpbHMvc3JjL2NyZWF0ZUdsb2JhbExpc3RlbmVycy50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIGFyaWFraXQuXG4gKiBNSVQgTGljZW5zZWQsIENvcHlyaWdodCAoYykgRGllZ28gSGF6LlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIEFyaWFraXQgdGVhbTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hcmlha2l0L2FyaWFraXQvYmxvYi8yMzJiYzc5MDE4ZWMyMDk2N2ZlYzFlMDk3YTk0NzRhYmEzYmI1YmU3L3BhY2thZ2VzL2FyaWFraXQtdXRpbHMvc3JjL2RvbS50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi9jZjlhYjI0ZjMyNTViZTE1MzBkMGY1ODQwNjFhMDFhYTFlODE4MGU2L3BhY2thZ2VzL0ByZWFjdC1hcmlhL3V0aWxzL3NyYy9wbGF0Zm9ybS50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi9hOWRlYThhMzY3MjE3OWU2YzM4YWFmZDE0MjlkYWY0NGM3ZWEyZmY2L3BhY2thZ2VzL0ByZWFjdC1hcmlhL3V0aWxzL3NyYy9mb2N1c1dpdGhvdXRTY3JvbGxpbmcudHNcbiAqL1xuLyohXG4gKiBQb3J0aW9ucyBvZiB0aGlzIGZpbGUgYXJlIGJhc2VkIG9uIGNvZGUgZnJvbSBhcmlha2l0LlxuICogTUlUIExpY2Vuc2VkLCBDb3B5cmlnaHQgKGMpIERpZWdvIEhhei5cbiAqXG4gKiBDcmVkaXRzIHRvIHRoZSBBcmlha2l0IHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYXJpYWtpdC9hcmlha2l0L2Jsb2IvbWFpbi9wYWNrYWdlcy9hcmlha2l0LXV0aWxzL3NyYy9mb2N1cy50c1xuICpcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi9tYWluL3BhY2thZ2VzLyU0MHJlYWN0LWFyaWEvZm9jdXMvc3JjL2lzRWxlbWVudFZpc2libGUudHNcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hZG9iZS9yZWFjdC1zcGVjdHJ1bS9ibG9iLzhmMmYyYWNiM2Q1ODUwMzgyZWJlNjMxZjA1NWY4OGM3MDRhYTdkMTcvcGFja2FnZXMvQHJlYWN0LWFyaWEvZm9jdXMvc3JjL0ZvY3VzU2NvcGUudHN4XG4gKi9cbi8qIVxuICogUG9ydGlvbnMgb2YgdGhpcyBmaWxlIGFyZSBiYXNlZCBvbiBjb2RlIGZyb20gcmVhY3Qtc3BlY3RydW0uXG4gKiBBcGFjaGUgTGljZW5zZSBWZXJzaW9uIDIuMCwgQ29weXJpZ2h0IDIwMjAgQWRvYmUuXG4gKlxuICogQ3JlZGl0cyB0byB0aGUgUmVhY3QgU3BlY3RydW0gdGVhbTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hZG9iZS9yZWFjdC1zcGVjdHJ1bS9ibG9iL2Y2ZTY4NmZlOWQzYjk4M2Q0ODY1MDk4MGMxZWNmZGRlMzIwYmM2MmYvcGFja2FnZXMvQHJlYWN0LWFyaWEvZm9jdXMvc3JjL0ZvY3VzU2NvcGUudHN4XG4gKi9cbi8qIVxuICogUG9ydGlvbnMgb2YgdGhpcyBmaWxlIGFyZSBiYXNlZCBvbiBjb2RlIGZyb20gcmVhY3Qtc3BlY3RydW0uXG4gKiBBcGFjaGUgTGljZW5zZSBWZXJzaW9uIDIuMCwgQ29weXJpZ2h0IDIwMjAgQWRvYmUuXG4gKlxuICogQ3JlZGl0cyB0byB0aGUgUmVhY3QgU3BlY3RydW0gdGVhbTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hZG9iZS9yZWFjdC1zcGVjdHJ1bS9ibG9iL2E5ZGVhOGEzNjcyMTc5ZTZjMzhhYWZkMTQyOWRhZjQ0YzdlYTJmZjYvcGFja2FnZXMvQHJlYWN0LWFyaWEvdXRpbHMvc3JjL2dldFNjcm9sbFBhcmVudC50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi9hOWRlYThhMzY3MjE3OWU2YzM4YWFmZDE0MjlkYWY0NGM3ZWEyZmY2L3BhY2thZ2VzL0ByZWFjdC1hcmlhL3V0aWxzL3NyYy9pc1ZpcnR1YWxFdmVudC50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi9mZjNlNjkwZmZmYzZjNTQzNjdiODA1N2UyOGEwZTViOTIxMWYzN2I1L3BhY2thZ2VzL0ByZWFjdC1zdGF0ZWx5L3V0aWxzL3NyYy9udW1iZXIudHNcbiAqL1xuLyohXG4gKiBQb3J0aW9ucyBvZiB0aGlzIGZpbGUgYXJlIGJhc2VkIG9uIGNvZGUgZnJvbSBhcmlha2l0LlxuICogTUlUIExpY2Vuc2VkLCBDb3B5cmlnaHQgKGMpIERpZWdvIEhhei5cbiAqXG4gKiBDcmVkaXRzIHRvIHRoZSBBcmlha2l0IHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYXJpYWtpdC9hcmlha2l0L2Jsb2IvODRlOTc5NDNhZDYzN2E1ODJjMDFjOWI1NmQ4ODBjZDk1ZjU5NTczNy9wYWNrYWdlcy9hcmlha2l0L3NyYy9ob3ZlcmNhcmQvX191dGlscy9wb2x5Z29uLnRzXG4gKiBodHRwczovL2dpdGh1Yi5jb20vYXJpYWtpdC9hcmlha2l0L2Jsb2IvZjJhOTY5NzNkZTUyM2Q2N2U0MWVlYzk4MzI2MzkzNmM0ODllZjNlMi9wYWNrYWdlcy9hcmlha2l0L3NyYy9ob3ZlcmNhcmQvX191dGlscy9kZWJ1Zy1wb2x5Z29uLnRzXG4gKi9cbi8qIVxuICogUG9ydGlvbnMgb2YgdGhpcyBmaWxlIGFyZSBiYXNlZCBvbiBjb2RlIGZyb20gcmVhY3Qtc3BlY3RydW0uXG4gKiBBcGFjaGUgTGljZW5zZSBWZXJzaW9uIDIuMCwgQ29weXJpZ2h0IDIwMjAgQWRvYmUuXG4gKlxuICogQ3JlZGl0cyB0byB0aGUgUmVhY3QgU3BlY3RydW0gdGVhbTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hZG9iZS9yZWFjdC1zcGVjdHJ1bS9ibG9iL2E5ZGVhOGEzNjcyMTc5ZTZjMzhhYWZkMTQyOWRhZjQ0YzdlYTJmZjYvcGFja2FnZXMvQHJlYWN0LWFyaWEvdXRpbHMvc3JjL3J1bkFmdGVyVHJhbnNpdGlvbi50c1xuICovXG4vKiFcbiAqIFBvcnRpb25zIG9mIHRoaXMgZmlsZSBhcmUgYmFzZWQgb24gY29kZSBmcm9tIHJlYWN0LXNwZWN0cnVtLlxuICogQXBhY2hlIExpY2Vuc2UgVmVyc2lvbiAyLjAsIENvcHlyaWdodCAyMDIwIEFkb2JlLlxuICpcbiAqIENyZWRpdHMgdG8gdGhlIFJlYWN0IFNwZWN0cnVtIHRlYW06XG4gKiBodHRwczovL2dpdGh1Yi5jb20vYWRvYmUvcmVhY3Qtc3BlY3RydW0vYmxvYi84ZjJmMmFjYjNkNTg1MDM4MmViZTYzMWYwNTVmODhjNzA0YWE3ZDE3L3BhY2thZ2VzL0ByZWFjdC1hcmlhL3V0aWxzL3NyYy9zY3JvbGxJbnRvVmlldy50c1xuICovXG5cbmV4cG9ydCB7IEV2ZW50S2V5LCBGT0NVU0FCTEVfRUxFTUVOVF9TRUxFQ1RPUiwgVEFCQkFCTEVfRUxFTUVOVF9TRUxFQ1RPUiwgYWRkSXRlbVRvQXJyYXksIGNhbGxIYW5kbGVyLCBjbGFtcCwgY29tcG9zZUV2ZW50SGFuZGxlcnMsIGNvbnRhaW5zLCBjcmVhdGVGb2N1c01hbmFnZXIsIGNyZWF0ZUdlbmVyYXRlSWQsIGNyZWF0ZUdsb2JhbExpc3RlbmVycywgZGVidWdQb2x5Z29uLCBmb2N1c1dpdGhvdXRTY3JvbGxpbmcsIGdldEFjdGl2ZUVsZW1lbnQsIGdldEFsbFRhYmJhYmxlSW4sIGdldERvY3VtZW50LCBnZXRFdmVudFBvaW50LCBnZXRGb2N1c2FibGVUcmVlV2Fsa2VyLCBnZXRTY3JvbGxQYXJlbnQsIGdldFdpbmRvdywgaGFzRm9jdXNXaXRoaW4sIGlzQW5kcm9pZCwgaXNBcHBsZURldmljZSwgaXNBcnJheSwgaXNDaHJvbWUsIGlzQ3RybEtleSwgaXNFbGVtZW50VmlzaWJsZSwgaXNGb2N1c2FibGUsIGlzRnJhbWUsIGlzRnVuY3Rpb24sIGlzSU9TLCBpc0lQYWQsIGlzSVBob25lLCBpc01hYywgaXNOdW1iZXIsIGlzUG9pbnRJblBvbHlnb24sIGlzU3RyaW5nLCBpc1RhYmJhYmxlLCBpc1ZpcnR1YWxDbGljaywgaXNWaXJ0dWFsUG9pbnRlckV2ZW50LCBpc1dlYktpdCwgbWVyZ2VEZWZhdWx0UHJvcHMsIG5vb3AsIHJlbW92ZUl0ZW1Gcm9tQXJyYXksIHJ1bkFmdGVyVHJhbnNpdGlvbiwgc2Nyb2xsSW50b1ZpZXcsIHNjcm9sbEludG9WaWV3cG9ydCwgc25hcFZhbHVlVG9TdGVwLCB2aXN1YWxseUhpZGRlblN0eWxlcyB9O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9b3V0LmpzLm1hcFxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9aW5kZXguanMubWFwIiwiLy8gc3JjL2Rpc21pc3NhYmxlLWxheWVyL2xheWVyLXN0YWNrLnRzeFxuaW1wb3J0IHsgZ2V0RG9jdW1lbnQgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbnZhciBEQVRBX1RPUF9MQVlFUl9BVFRSID0gXCJkYXRhLWtiLXRvcC1sYXllclwiO1xudmFyIG9yaWdpbmFsQm9keVBvaW50ZXJFdmVudHM7XG52YXIgaGFzRGlzYWJsZWRCb2R5UG9pbnRlckV2ZW50cyA9IGZhbHNlO1xudmFyIGxheWVycyA9IFtdO1xuZnVuY3Rpb24gaW5kZXhPZihub2RlKSB7XG4gIHJldHVybiBsYXllcnMuZmluZEluZGV4KChsYXllcikgPT4gbGF5ZXIubm9kZSA9PT0gbm9kZSk7XG59XG5mdW5jdGlvbiBmaW5kKG5vZGUpIHtcbiAgcmV0dXJuIGxheWVyc1tpbmRleE9mKG5vZGUpXTtcbn1cbmZ1bmN0aW9uIGlzVG9wTW9zdExheWVyKG5vZGUpIHtcbiAgcmV0dXJuIGxheWVyc1tsYXllcnMubGVuZ3RoIC0gMV0ubm9kZSA9PT0gbm9kZTtcbn1cbmZ1bmN0aW9uIGdldFBvaW50ZXJCbG9ja2luZ0xheWVycygpIHtcbiAgcmV0dXJuIGxheWVycy5maWx0ZXIoKGxheWVyKSA9PiBsYXllci5pc1BvaW50ZXJCbG9ja2luZyk7XG59XG5mdW5jdGlvbiBnZXRUb3BNb3N0UG9pbnRlckJsb2NraW5nTGF5ZXIoKSB7XG4gIHJldHVybiBbLi4uZ2V0UG9pbnRlckJsb2NraW5nTGF5ZXJzKCldLnNsaWNlKC0xKVswXTtcbn1cbmZ1bmN0aW9uIGhhc1BvaW50ZXJCbG9ja2luZ0xheWVyKCkge1xuICByZXR1cm4gZ2V0UG9pbnRlckJsb2NraW5nTGF5ZXJzKCkubGVuZ3RoID4gMDtcbn1cbmZ1bmN0aW9uIGlzQmVsb3dQb2ludGVyQmxvY2tpbmdMYXllcihub2RlKSB7XG4gIGNvbnN0IGhpZ2hlc3RCbG9ja2luZ0luZGV4ID0gaW5kZXhPZihnZXRUb3BNb3N0UG9pbnRlckJsb2NraW5nTGF5ZXIoKT8ubm9kZSk7XG4gIHJldHVybiBpbmRleE9mKG5vZGUpIDwgaGlnaGVzdEJsb2NraW5nSW5kZXg7XG59XG5mdW5jdGlvbiBhZGRMYXllcihsYXllcikge1xuICBsYXllcnMucHVzaChsYXllcik7XG59XG5mdW5jdGlvbiByZW1vdmVMYXllcihub2RlKSB7XG4gIGNvbnN0IGluZGV4ID0gaW5kZXhPZihub2RlKTtcbiAgaWYgKGluZGV4IDwgMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBsYXllcnMuc3BsaWNlKGluZGV4LCAxKTtcbn1cbmZ1bmN0aW9uIGFzc2lnblBvaW50ZXJFdmVudFRvTGF5ZXJzKCkge1xuICBmb3IgKGNvbnN0IHsgbm9kZSB9IG9mIGxheWVycykge1xuICAgIG5vZGUuc3R5bGUucG9pbnRlckV2ZW50cyA9IGlzQmVsb3dQb2ludGVyQmxvY2tpbmdMYXllcihub2RlKSA/IFwibm9uZVwiIDogXCJhdXRvXCI7XG4gIH1cbn1cbmZ1bmN0aW9uIGRpc2FibGVCb2R5UG9pbnRlckV2ZW50cyhub2RlKSB7XG4gIGlmIChoYXNQb2ludGVyQmxvY2tpbmdMYXllcigpICYmICFoYXNEaXNhYmxlZEJvZHlQb2ludGVyRXZlbnRzKSB7XG4gICAgY29uc3Qgb3duZXJEb2N1bWVudCA9IGdldERvY3VtZW50KG5vZGUpO1xuICAgIG9yaWdpbmFsQm9keVBvaW50ZXJFdmVudHMgPSBkb2N1bWVudC5ib2R5LnN0eWxlLnBvaW50ZXJFdmVudHM7XG4gICAgb3duZXJEb2N1bWVudC5ib2R5LnN0eWxlLnBvaW50ZXJFdmVudHMgPSBcIm5vbmVcIjtcbiAgICBoYXNEaXNhYmxlZEJvZHlQb2ludGVyRXZlbnRzID0gdHJ1ZTtcbiAgfVxufVxuZnVuY3Rpb24gcmVzdG9yZUJvZHlQb2ludGVyRXZlbnRzKG5vZGUpIHtcbiAgaWYgKGhhc1BvaW50ZXJCbG9ja2luZ0xheWVyKCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgb3duZXJEb2N1bWVudCA9IGdldERvY3VtZW50KG5vZGUpO1xuICBvd25lckRvY3VtZW50LmJvZHkuc3R5bGUucG9pbnRlckV2ZW50cyA9IG9yaWdpbmFsQm9keVBvaW50ZXJFdmVudHM7XG4gIGlmIChvd25lckRvY3VtZW50LmJvZHkuc3R5bGUubGVuZ3RoID09PSAwKSB7XG4gICAgb3duZXJEb2N1bWVudC5ib2R5LnJlbW92ZUF0dHJpYnV0ZShcInN0eWxlXCIpO1xuICB9XG4gIGhhc0Rpc2FibGVkQm9keVBvaW50ZXJFdmVudHMgPSBmYWxzZTtcbn1cbnZhciBsYXllclN0YWNrID0ge1xuICBsYXllcnMsXG4gIGlzVG9wTW9zdExheWVyLFxuICBoYXNQb2ludGVyQmxvY2tpbmdMYXllcixcbiAgaXNCZWxvd1BvaW50ZXJCbG9ja2luZ0xheWVyLFxuICBhZGRMYXllcixcbiAgcmVtb3ZlTGF5ZXIsXG4gIGluZGV4T2YsXG4gIGZpbmQsXG4gIGFzc2lnblBvaW50ZXJFdmVudFRvTGF5ZXJzLFxuICBkaXNhYmxlQm9keVBvaW50ZXJFdmVudHMsXG4gIHJlc3RvcmVCb2R5UG9pbnRlckV2ZW50c1xufTtcblxuZXhwb3J0IHtcbiAgREFUQV9UT1BfTEFZRVJfQVRUUixcbiAgbGF5ZXJTdGFja1xufTtcbiIsImltcG9ydCB7XG4gIERBVEFfVE9QX0xBWUVSX0FUVFJcbn0gZnJvbSBcIi4vM05JNkZUQTIuanN4XCI7XG5cbi8vIHNyYy9wcmltaXRpdmVzL2NyZWF0ZS1mb2N1cy1zY29wZS9jcmVhdGUtZm9jdXMtc2NvcGUudHN4XG5pbXBvcnQge1xuICBhY2Nlc3MsXG4gIGNvbnRhaW5zLFxuICBmb2N1c1dpdGhvdXRTY3JvbGxpbmcsXG4gIGdldEFjdGl2ZUVsZW1lbnQsXG4gIGdldEFsbFRhYmJhYmxlSW4sXG4gIGdldERvY3VtZW50LFxuICBpc0ZvY3VzYWJsZSxcbiAgcmVtb3ZlSXRlbUZyb21BcnJheSxcbiAgdmlzdWFsbHlIaWRkZW5TdHlsZXNcbn0gZnJvbSBcIkBrb2JhbHRlL3V0aWxzXCI7XG5pbXBvcnQgeyBjcmVhdGVFZmZlY3QsIGNyZWF0ZVNpZ25hbCwgb25DbGVhbnVwIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5pbXBvcnQgeyBpc1NlcnZlciB9IGZyb20gXCJzb2xpZC1qcy93ZWJcIjtcbnZhciBBVVRPRk9DVVNfT05fTU9VTlRfRVZFTlQgPSBcImZvY3VzU2NvcGUuYXV0b0ZvY3VzT25Nb3VudFwiO1xudmFyIEFVVE9GT0NVU19PTl9VTk1PVU5UX0VWRU5UID0gXCJmb2N1c1Njb3BlLmF1dG9Gb2N1c09uVW5tb3VudFwiO1xudmFyIEVWRU5UX09QVElPTlMgPSB7IGJ1YmJsZXM6IGZhbHNlLCBjYW5jZWxhYmxlOiB0cnVlIH07XG52YXIgZm9jdXNTY29wZVN0YWNrID0ge1xuICAvKiogQSBzdGFjayBvZiBmb2N1cyBzY29wZXMsIHdpdGggdGhlIGFjdGl2ZSBvbmUgYXQgdGhlIHRvcCAqL1xuICBzdGFjazogW10sXG4gIGFjdGl2ZSgpIHtcbiAgICByZXR1cm4gdGhpcy5zdGFja1swXTtcbiAgfSxcbiAgYWRkKHNjb3BlKSB7XG4gICAgaWYgKHNjb3BlICE9PSB0aGlzLmFjdGl2ZSgpKSB7XG4gICAgICB0aGlzLmFjdGl2ZSgpPy5wYXVzZSgpO1xuICAgIH1cbiAgICB0aGlzLnN0YWNrID0gcmVtb3ZlSXRlbUZyb21BcnJheSh0aGlzLnN0YWNrLCBzY29wZSk7XG4gICAgdGhpcy5zdGFjay51bnNoaWZ0KHNjb3BlKTtcbiAgfSxcbiAgcmVtb3ZlKHNjb3BlKSB7XG4gICAgdGhpcy5zdGFjayA9IHJlbW92ZUl0ZW1Gcm9tQXJyYXkodGhpcy5zdGFjaywgc2NvcGUpO1xuICAgIHRoaXMuYWN0aXZlKCk/LnJlc3VtZSgpO1xuICB9XG59O1xuZnVuY3Rpb24gY3JlYXRlRm9jdXNTY29wZShwcm9wcywgcmVmKSB7XG4gIGNvbnN0IFtpc1BhdXNlZCwgc2V0SXNQYXVzZWRdID0gY3JlYXRlU2lnbmFsKGZhbHNlKTtcbiAgY29uc3QgZm9jdXNTY29wZSA9IHtcbiAgICBwYXVzZSgpIHtcbiAgICAgIHNldElzUGF1c2VkKHRydWUpO1xuICAgIH0sXG4gICAgcmVzdW1lKCkge1xuICAgICAgc2V0SXNQYXVzZWQoZmFsc2UpO1xuICAgIH1cbiAgfTtcbiAgbGV0IGxhc3RGb2N1c2VkRWxlbWVudCA9IG51bGw7XG4gIGNvbnN0IG9uTW91bnRBdXRvRm9jdXMgPSAoZSkgPT4gcHJvcHMub25Nb3VudEF1dG9Gb2N1cz8uKGUpO1xuICBjb25zdCBvblVubW91bnRBdXRvRm9jdXMgPSAoZSkgPT4gcHJvcHMub25Vbm1vdW50QXV0b0ZvY3VzPy4oZSk7XG4gIGNvbnN0IG93bmVyRG9jdW1lbnQgPSAoKSA9PiBnZXREb2N1bWVudChyZWYoKSk7XG4gIGNvbnN0IGNyZWF0ZVNlbnRpbmVsID0gKCkgPT4ge1xuICAgIGNvbnN0IGVsZW1lbnQgPSBvd25lckRvY3VtZW50KCkuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJkYXRhLWZvY3VzLXRyYXBcIiwgXCJcIik7XG4gICAgZWxlbWVudC50YWJJbmRleCA9IDA7XG4gICAgT2JqZWN0LmFzc2lnbihlbGVtZW50LnN0eWxlLCB2aXN1YWxseUhpZGRlblN0eWxlcyk7XG4gICAgcmV0dXJuIGVsZW1lbnQ7XG4gIH07XG4gIGNvbnN0IHRhYmJhYmxlcyA9ICgpID0+IHtcbiAgICBjb25zdCBjb250YWluZXIgPSByZWYoKTtcbiAgICBpZiAoIWNvbnRhaW5lcikge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0QWxsVGFiYmFibGVJbihjb250YWluZXIsIHRydWUpLmZpbHRlcihcbiAgICAgIChlbCkgPT4gIWVsLmhhc0F0dHJpYnV0ZShcImRhdGEtZm9jdXMtdHJhcFwiKVxuICAgICk7XG4gIH07XG4gIGNvbnN0IGZpcnN0VGFiYmFibGUgPSAoKSA9PiB7XG4gICAgY29uc3QgaXRlbXMgPSB0YWJiYWJsZXMoKTtcbiAgICByZXR1cm4gaXRlbXMubGVuZ3RoID4gMCA/IGl0ZW1zWzBdIDogbnVsbDtcbiAgfTtcbiAgY29uc3QgbGFzdFRhYmJhYmxlID0gKCkgPT4ge1xuICAgIGNvbnN0IGl0ZW1zID0gdGFiYmFibGVzKCk7XG4gICAgcmV0dXJuIGl0ZW1zLmxlbmd0aCA+IDAgPyBpdGVtc1tpdGVtcy5sZW5ndGggLSAxXSA6IG51bGw7XG4gIH07XG4gIGNvbnN0IHNob3VsZFByZXZlbnRVbm1vdW50QXV0b0ZvY3VzID0gKCkgPT4ge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IHJlZigpO1xuICAgIGlmICghY29udGFpbmVyKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KGNvbnRhaW5lcik7XG4gICAgaWYgKCFhY3RpdmVFbGVtZW50KSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmIChjb250YWlucyhjb250YWluZXIsIGFjdGl2ZUVsZW1lbnQpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBpc0ZvY3VzYWJsZShhY3RpdmVFbGVtZW50KTtcbiAgfTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoaXNTZXJ2ZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29udGFpbmVyID0gcmVmKCk7XG4gICAgaWYgKCFjb250YWluZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9jdXNTY29wZVN0YWNrLmFkZChmb2N1c1Njb3BlKTtcbiAgICBjb25zdCBwcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KFxuICAgICAgY29udGFpbmVyXG4gICAgKTtcbiAgICBjb25zdCBoYXNGb2N1c2VkQ2FuZGlkYXRlID0gY29udGFpbnMoY29udGFpbmVyLCBwcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQpO1xuICAgIGlmICghaGFzRm9jdXNlZENhbmRpZGF0ZSkge1xuICAgICAgY29uc3QgbW91bnRFdmVudCA9IG5ldyBDdXN0b21FdmVudChcbiAgICAgICAgQVVUT0ZPQ1VTX09OX01PVU5UX0VWRU5ULFxuICAgICAgICBFVkVOVF9PUFRJT05TXG4gICAgICApO1xuICAgICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoQVVUT0ZPQ1VTX09OX01PVU5UX0VWRU5ULCBvbk1vdW50QXV0b0ZvY3VzKTtcbiAgICAgIGNvbnRhaW5lci5kaXNwYXRjaEV2ZW50KG1vdW50RXZlbnQpO1xuICAgICAgaWYgKCFtb3VudEV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQpIHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgZm9jdXNXaXRob3V0U2Nyb2xsaW5nKGZpcnN0VGFiYmFibGUoKSk7XG4gICAgICAgICAgaWYgKGdldEFjdGl2ZUVsZW1lbnQoY29udGFpbmVyKSA9PT0gcHJldmlvdXNseUZvY3VzZWRFbGVtZW50KSB7XG4gICAgICAgICAgICBmb2N1c1dpdGhvdXRTY3JvbGxpbmcoY29udGFpbmVyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIDApO1xuICAgICAgfVxuICAgIH1cbiAgICBvbkNsZWFudXAoKCkgPT4ge1xuICAgICAgY29udGFpbmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoQVVUT0ZPQ1VTX09OX01PVU5UX0VWRU5ULCBvbk1vdW50QXV0b0ZvY3VzKTtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCB1bm1vdW50RXZlbnQgPSBuZXcgQ3VzdG9tRXZlbnQoXG4gICAgICAgICAgQVVUT0ZPQ1VTX09OX1VOTU9VTlRfRVZFTlQsXG4gICAgICAgICAgRVZFTlRfT1BUSU9OU1xuICAgICAgICApO1xuICAgICAgICBpZiAoc2hvdWxkUHJldmVudFVubW91bnRBdXRvRm9jdXMoKSkge1xuICAgICAgICAgIHVubW91bnRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgICAgIEFVVE9GT0NVU19PTl9VTk1PVU5UX0VWRU5ULFxuICAgICAgICAgIG9uVW5tb3VudEF1dG9Gb2N1c1xuICAgICAgICApO1xuICAgICAgICBjb250YWluZXIuZGlzcGF0Y2hFdmVudCh1bm1vdW50RXZlbnQpO1xuICAgICAgICBpZiAoIXVubW91bnRFdmVudC5kZWZhdWx0UHJldmVudGVkKSB7XG4gICAgICAgICAgZm9jdXNXaXRob3V0U2Nyb2xsaW5nKFxuICAgICAgICAgICAgcHJldmlvdXNseUZvY3VzZWRFbGVtZW50ID8/IG93bmVyRG9jdW1lbnQoKS5ib2R5XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBjb250YWluZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcihcbiAgICAgICAgICBBVVRPRk9DVVNfT05fVU5NT1VOVF9FVkVOVCxcbiAgICAgICAgICBvblVubW91bnRBdXRvRm9jdXNcbiAgICAgICAgKTtcbiAgICAgICAgZm9jdXNTY29wZVN0YWNrLnJlbW92ZShmb2N1c1Njb3BlKTtcbiAgICAgIH0sIDApO1xuICAgIH0pO1xuICB9KTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoaXNTZXJ2ZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29udGFpbmVyID0gcmVmKCk7XG4gICAgaWYgKCFjb250YWluZXIgfHwgIWFjY2Vzcyhwcm9wcy50cmFwRm9jdXMpIHx8IGlzUGF1c2VkKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgb25Gb2N1c0luID0gKGV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG4gICAgICBpZiAodGFyZ2V0Py5jbG9zZXN0KGBbJHtEQVRBX1RPUF9MQVlFUl9BVFRSfV1gKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoY29udGFpbnMoY29udGFpbmVyLCB0YXJnZXQpKSB7XG4gICAgICAgIGxhc3RGb2N1c2VkRWxlbWVudCA9IHRhcmdldDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvY3VzV2l0aG91dFNjcm9sbGluZyhsYXN0Rm9jdXNlZEVsZW1lbnQpO1xuICAgICAgfVxuICAgIH07XG4gICAgY29uc3Qgb25Gb2N1c091dCA9IChldmVudCkgPT4ge1xuICAgICAgY29uc3QgcmVsYXRlZFRhcmdldCA9IGV2ZW50LnJlbGF0ZWRUYXJnZXQ7XG4gICAgICBjb25zdCB0YXJnZXQgPSByZWxhdGVkVGFyZ2V0ID8/IGdldEFjdGl2ZUVsZW1lbnQoY29udGFpbmVyKTtcbiAgICAgIGlmICh0YXJnZXQ/LmNsb3Nlc3QoYFske0RBVEFfVE9QX0xBWUVSX0FUVFJ9XWApKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmICghY29udGFpbnMoY29udGFpbmVyLCB0YXJnZXQpKSB7XG4gICAgICAgIGZvY3VzV2l0aG91dFNjcm9sbGluZyhsYXN0Rm9jdXNlZEVsZW1lbnQpO1xuICAgICAgfVxuICAgIH07XG4gICAgb3duZXJEb2N1bWVudCgpLmFkZEV2ZW50TGlzdGVuZXIoXCJmb2N1c2luXCIsIG9uRm9jdXNJbik7XG4gICAgb3duZXJEb2N1bWVudCgpLmFkZEV2ZW50TGlzdGVuZXIoXCJmb2N1c291dFwiLCBvbkZvY3VzT3V0KTtcbiAgICBvbkNsZWFudXAoKCkgPT4ge1xuICAgICAgb3duZXJEb2N1bWVudCgpLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJmb2N1c2luXCIsIG9uRm9jdXNJbik7XG4gICAgICBvd25lckRvY3VtZW50KCkucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImZvY3Vzb3V0XCIsIG9uRm9jdXNPdXQpO1xuICAgIH0pO1xuICB9KTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoaXNTZXJ2ZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29udGFpbmVyID0gcmVmKCk7XG4gICAgaWYgKCFjb250YWluZXIgfHwgIWFjY2Vzcyhwcm9wcy50cmFwRm9jdXMpIHx8IGlzUGF1c2VkKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc3RhcnRTZW50aW5lbCA9IGNyZWF0ZVNlbnRpbmVsKCk7XG4gICAgY29udGFpbmVyLmluc2VydEFkamFjZW50RWxlbWVudChcImFmdGVyYmVnaW5cIiwgc3RhcnRTZW50aW5lbCk7XG4gICAgY29uc3QgZW5kU2VudGluZWwgPSBjcmVhdGVTZW50aW5lbCgpO1xuICAgIGNvbnRhaW5lci5pbnNlcnRBZGphY2VudEVsZW1lbnQoXCJiZWZvcmVlbmRcIiwgZW5kU2VudGluZWwpO1xuICAgIGZ1bmN0aW9uIG9uRm9jdXMoZXZlbnQpIHtcbiAgICAgIGNvbnN0IGZpcnN0ID0gZmlyc3RUYWJiYWJsZSgpO1xuICAgICAgY29uc3QgbGFzdCA9IGxhc3RUYWJiYWJsZSgpO1xuICAgICAgaWYgKGV2ZW50LnJlbGF0ZWRUYXJnZXQgPT09IGZpcnN0KSB7XG4gICAgICAgIGZvY3VzV2l0aG91dFNjcm9sbGluZyhsYXN0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvY3VzV2l0aG91dFNjcm9sbGluZyhmaXJzdCk7XG4gICAgICB9XG4gICAgfVxuICAgIHN0YXJ0U2VudGluZWwuYWRkRXZlbnRMaXN0ZW5lcihcImZvY3VzaW5cIiwgb25Gb2N1cyk7XG4gICAgZW5kU2VudGluZWwuYWRkRXZlbnRMaXN0ZW5lcihcImZvY3VzaW5cIiwgb25Gb2N1cyk7XG4gICAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigobXV0YXRpb25zKSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IG11dGF0aW9uIG9mIG11dGF0aW9ucykge1xuICAgICAgICBpZiAobXV0YXRpb24ucHJldmlvdXNTaWJsaW5nID09PSBlbmRTZW50aW5lbCkge1xuICAgICAgICAgIGVuZFNlbnRpbmVsLnJlbW92ZSgpO1xuICAgICAgICAgIGNvbnRhaW5lci5pbnNlcnRBZGphY2VudEVsZW1lbnQoXCJiZWZvcmVlbmRcIiwgZW5kU2VudGluZWwpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChtdXRhdGlvbi5uZXh0U2libGluZyA9PT0gc3RhcnRTZW50aW5lbCkge1xuICAgICAgICAgIHN0YXJ0U2VudGluZWwucmVtb3ZlKCk7XG4gICAgICAgICAgY29udGFpbmVyLmluc2VydEFkamFjZW50RWxlbWVudChcImFmdGVyYmVnaW5cIiwgc3RhcnRTZW50aW5lbCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBvYnNlcnZlci5vYnNlcnZlKGNvbnRhaW5lciwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IGZhbHNlIH0pO1xuICAgIG9uQ2xlYW51cCgoKSA9PiB7XG4gICAgICBzdGFydFNlbnRpbmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJmb2N1c2luXCIsIG9uRm9jdXMpO1xuICAgICAgZW5kU2VudGluZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImZvY3VzaW5cIiwgb25Gb2N1cyk7XG4gICAgICBzdGFydFNlbnRpbmVsLnJlbW92ZSgpO1xuICAgICAgZW5kU2VudGluZWwucmVtb3ZlKCk7XG4gICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQge1xuICBjcmVhdGVGb2N1c1Njb3BlXG59O1xuIiwiLy8gc3JjL2xpdmUtYW5ub3VuY2VyL2xpdmUtYW5ub3VuY2VyLnRzeFxuaW1wb3J0IHsgdmlzdWFsbHlIaWRkZW5TdHlsZXMgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbnZhciBMSVZFUkVHSU9OX1RJTUVPVVRfREVMQVkgPSA3ZTM7XG52YXIgbGl2ZUFubm91bmNlciA9IG51bGw7XG52YXIgREFUQV9MSVZFX0FOTk9VTkNFUl9BVFRSID0gXCJkYXRhLWxpdmUtYW5ub3VuY2VyXCI7XG5mdW5jdGlvbiBhbm5vdW5jZShtZXNzYWdlLCBhc3NlcnRpdmVuZXNzID0gXCJhc3NlcnRpdmVcIiwgdGltZW91dCA9IExJVkVSRUdJT05fVElNRU9VVF9ERUxBWSkge1xuICBpZiAoIWxpdmVBbm5vdW5jZXIpIHtcbiAgICBsaXZlQW5ub3VuY2VyID0gbmV3IExpdmVBbm5vdW5jZXIoKTtcbiAgfVxuICBsaXZlQW5ub3VuY2VyLmFubm91bmNlKG1lc3NhZ2UsIGFzc2VydGl2ZW5lc3MsIHRpbWVvdXQpO1xufVxuZnVuY3Rpb24gY2xlYXJBbm5vdW5jZXIoYXNzZXJ0aXZlbmVzcykge1xuICBpZiAobGl2ZUFubm91bmNlcikge1xuICAgIGxpdmVBbm5vdW5jZXIuY2xlYXIoYXNzZXJ0aXZlbmVzcyk7XG4gIH1cbn1cbmZ1bmN0aW9uIGRlc3Ryb3lBbm5vdW5jZXIoKSB7XG4gIGlmIChsaXZlQW5ub3VuY2VyKSB7XG4gICAgbGl2ZUFubm91bmNlci5kZXN0cm95KCk7XG4gICAgbGl2ZUFubm91bmNlciA9IG51bGw7XG4gIH1cbn1cbnZhciBMaXZlQW5ub3VuY2VyID0gY2xhc3Mge1xuICBub2RlO1xuICBhc3NlcnRpdmVMb2c7XG4gIHBvbGl0ZUxvZztcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5ub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0aGlzLm5vZGUuZGF0YXNldC5saXZlQW5ub3VuY2VyID0gXCJ0cnVlXCI7XG4gICAgT2JqZWN0LmFzc2lnbih0aGlzLm5vZGUuc3R5bGUsIHZpc3VhbGx5SGlkZGVuU3R5bGVzKTtcbiAgICB0aGlzLmFzc2VydGl2ZUxvZyA9IHRoaXMuY3JlYXRlTG9nKFwiYXNzZXJ0aXZlXCIpO1xuICAgIHRoaXMubm9kZS5hcHBlbmRDaGlsZCh0aGlzLmFzc2VydGl2ZUxvZyk7XG4gICAgdGhpcy5wb2xpdGVMb2cgPSB0aGlzLmNyZWF0ZUxvZyhcInBvbGl0ZVwiKTtcbiAgICB0aGlzLm5vZGUuYXBwZW5kQ2hpbGQodGhpcy5wb2xpdGVMb2cpO1xuICAgIGRvY3VtZW50LmJvZHkucHJlcGVuZCh0aGlzLm5vZGUpO1xuICB9XG4gIGNyZWF0ZUxvZyhhcmlhTGl2ZSkge1xuICAgIGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG5vZGUuc2V0QXR0cmlidXRlKFwicm9sZVwiLCBcImxvZ1wiKTtcbiAgICBub2RlLnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBhcmlhTGl2ZSk7XG4gICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJhcmlhLXJlbGV2YW50XCIsIFwiYWRkaXRpb25zXCIpO1xuICAgIHJldHVybiBub2RlO1xuICB9XG4gIGRlc3Ryb3koKSB7XG4gICAgaWYgKCF0aGlzLm5vZGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0aGlzLm5vZGUpO1xuICAgIHRoaXMubm9kZSA9IG51bGw7XG4gIH1cbiAgYW5ub3VuY2UobWVzc2FnZSwgYXNzZXJ0aXZlbmVzcyA9IFwiYXNzZXJ0aXZlXCIsIHRpbWVvdXQgPSBMSVZFUkVHSU9OX1RJTUVPVVRfREVMQVkpIHtcbiAgICBpZiAoIXRoaXMubm9kZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBub2RlLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgICBpZiAoYXNzZXJ0aXZlbmVzcyA9PT0gXCJhc3NlcnRpdmVcIikge1xuICAgICAgdGhpcy5hc3NlcnRpdmVMb2cuYXBwZW5kQ2hpbGQobm9kZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucG9saXRlTG9nLmFwcGVuZENoaWxkKG5vZGUpO1xuICAgIH1cbiAgICBpZiAobWVzc2FnZSAhPT0gXCJcIikge1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIG5vZGUucmVtb3ZlKCk7XG4gICAgICB9LCB0aW1lb3V0KTtcbiAgICB9XG4gIH1cbiAgY2xlYXIoYXNzZXJ0aXZlbmVzcykge1xuICAgIGlmICghdGhpcy5ub2RlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghYXNzZXJ0aXZlbmVzcyB8fCBhc3NlcnRpdmVuZXNzID09PSBcImFzc2VydGl2ZVwiKSB7XG4gICAgICB0aGlzLmFzc2VydGl2ZUxvZy5pbm5lckhUTUwgPSBcIlwiO1xuICAgIH1cbiAgICBpZiAoIWFzc2VydGl2ZW5lc3MgfHwgYXNzZXJ0aXZlbmVzcyA9PT0gXCJwb2xpdGVcIikge1xuICAgICAgdGhpcy5wb2xpdGVMb2cuaW5uZXJIVE1MID0gXCJcIjtcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCB7XG4gIERBVEFfTElWRV9BTk5PVU5DRVJfQVRUUixcbiAgYW5ub3VuY2UsXG4gIGNsZWFyQW5ub3VuY2VyLFxuICBkZXN0cm95QW5ub3VuY2VyXG59O1xuIiwiaW1wb3J0IHtcbiAgREFUQV9MSVZFX0FOTk9VTkNFUl9BVFRSXG59IGZyb20gXCIuL0pITU5XT0xZLmpzeFwiO1xuaW1wb3J0IHtcbiAgREFUQV9UT1BfTEFZRVJfQVRUUlxufSBmcm9tIFwiLi8zTkk2RlRBMi5qc3hcIjtcblxuLy8gc3JjL3ByaW1pdGl2ZXMvY3JlYXRlLWhpZGUtb3V0c2lkZS9jcmVhdGUtaGlkZS1vdXRzaWRlLnRzXG5pbXBvcnQgeyBhY2Nlc3MgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7IGNyZWF0ZUVmZmVjdCwgb25DbGVhbnVwIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5mdW5jdGlvbiBjcmVhdGVIaWRlT3V0c2lkZShwcm9wcykge1xuICBjcmVhdGVFZmZlY3QoKCkgPT4ge1xuICAgIGlmIChhY2Nlc3MocHJvcHMuaXNEaXNhYmxlZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgb25DbGVhbnVwKGFyaWFIaWRlT3V0c2lkZShhY2Nlc3MocHJvcHMudGFyZ2V0cyksIGFjY2Vzcyhwcm9wcy5yb290KSkpO1xuICB9KTtcbn1cbnZhciByZWZDb3VudE1hcCA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgV2Vha01hcCgpO1xudmFyIG9ic2VydmVyU3RhY2sgPSBbXTtcbmZ1bmN0aW9uIGFyaWFIaWRlT3V0c2lkZSh0YXJnZXRzLCByb290ID0gZG9jdW1lbnQuYm9keSkge1xuICBjb25zdCB2aXNpYmxlTm9kZXMgPSBuZXcgU2V0KHRhcmdldHMpO1xuICBjb25zdCBoaWRkZW5Ob2RlcyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgU2V0KCk7XG4gIGNvbnN0IHdhbGsgPSAocm9vdDIpID0+IHtcbiAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2Ygcm9vdDIucXVlcnlTZWxlY3RvckFsbChcbiAgICAgIGBbJHtEQVRBX0xJVkVfQU5OT1VOQ0VSX0FUVFJ9XSwgWyR7REFUQV9UT1BfTEFZRVJfQVRUUn1dYFxuICAgICkpIHtcbiAgICAgIHZpc2libGVOb2Rlcy5hZGQoZWxlbWVudCk7XG4gICAgfVxuICAgIGNvbnN0IGFjY2VwdE5vZGUgPSAobm9kZSkgPT4ge1xuICAgICAgaWYgKHZpc2libGVOb2Rlcy5oYXMobm9kZSkgfHwgbm9kZS5wYXJlbnRFbGVtZW50ICYmIGhpZGRlbk5vZGVzLmhhcyhub2RlLnBhcmVudEVsZW1lbnQpICYmIG5vZGUucGFyZW50RWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJyb2xlXCIpICE9PSBcInJvd1wiKSB7XG4gICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9SRUpFQ1Q7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHRhcmdldCBvZiB2aXNpYmxlTm9kZXMpIHtcbiAgICAgICAgaWYgKG5vZGUuY29udGFpbnModGFyZ2V0KSkge1xuICAgICAgICAgIHJldHVybiBOb2RlRmlsdGVyLkZJTFRFUl9TS0lQO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gTm9kZUZpbHRlci5GSUxURVJfQUNDRVBUO1xuICAgIH07XG4gICAgY29uc3Qgd2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihyb290MiwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQsIHtcbiAgICAgIGFjY2VwdE5vZGVcbiAgICB9KTtcbiAgICBjb25zdCBhY2NlcHRSb290ID0gYWNjZXB0Tm9kZShyb290Mik7XG4gICAgaWYgKGFjY2VwdFJvb3QgPT09IE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVCkge1xuICAgICAgaGlkZShyb290Mik7XG4gICAgfVxuICAgIGlmIChhY2NlcHRSb290ICE9PSBOb2RlRmlsdGVyLkZJTFRFUl9SRUpFQ1QpIHtcbiAgICAgIGxldCBub2RlID0gd2Fsa2VyLm5leHROb2RlKCk7XG4gICAgICB3aGlsZSAobm9kZSAhPSBudWxsKSB7XG4gICAgICAgIGhpZGUobm9kZSk7XG4gICAgICAgIG5vZGUgPSB3YWxrZXIubmV4dE5vZGUoKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIGNvbnN0IGhpZGUgPSAobm9kZSkgPT4ge1xuICAgIGNvbnN0IHJlZkNvdW50ID0gcmVmQ291bnRNYXAuZ2V0KG5vZGUpID8/IDA7XG4gICAgaWYgKG5vZGUuZ2V0QXR0cmlidXRlKFwiYXJpYS1oaWRkZW5cIikgPT09IFwidHJ1ZVwiICYmIHJlZkNvdW50ID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChyZWZDb3VudCA9PT0gMCkge1xuICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJhcmlhLWhpZGRlblwiLCBcInRydWVcIik7XG4gICAgfVxuICAgIGhpZGRlbk5vZGVzLmFkZChub2RlKTtcbiAgICByZWZDb3VudE1hcC5zZXQobm9kZSwgcmVmQ291bnQgKyAxKTtcbiAgfTtcbiAgaWYgKG9ic2VydmVyU3RhY2subGVuZ3RoKSB7XG4gICAgb2JzZXJ2ZXJTdGFja1tvYnNlcnZlclN0YWNrLmxlbmd0aCAtIDFdLmRpc2Nvbm5lY3QoKTtcbiAgfVxuICB3YWxrKHJvb3QpO1xuICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKChjaGFuZ2VzKSA9PiB7XG4gICAgZm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuICAgICAgaWYgKGNoYW5nZS50eXBlICE9PSBcImNoaWxkTGlzdFwiIHx8IGNoYW5nZS5hZGRlZE5vZGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICghWy4uLnZpc2libGVOb2RlcywgLi4uaGlkZGVuTm9kZXNdLnNvbWUoXG4gICAgICAgIChub2RlKSA9PiBub2RlLmNvbnRhaW5zKGNoYW5nZS50YXJnZXQpXG4gICAgICApKSB7XG4gICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBjaGFuZ2UucmVtb3ZlZE5vZGVzKSB7XG4gICAgICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICB2aXNpYmxlTm9kZXMuZGVsZXRlKG5vZGUpO1xuICAgICAgICAgICAgaGlkZGVuTm9kZXMuZGVsZXRlKG5vZGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2YgY2hhbmdlLmFkZGVkTm9kZXMpIHtcbiAgICAgICAgICBpZiAoKG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCB8fCBub2RlIGluc3RhbmNlb2YgU1ZHRWxlbWVudCkgJiYgKG5vZGUuZGF0YXNldC5saXZlQW5ub3VuY2VyID09PSBcInRydWVcIiB8fCBub2RlLmRhdGFzZXQucmVhY3RBcmlhVG9wTGF5ZXIgPT09IFwidHJ1ZVwiKSkge1xuICAgICAgICAgICAgdmlzaWJsZU5vZGVzLmFkZChub2RlKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICB3YWxrKG5vZGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIG9ic2VydmVyLm9ic2VydmUocm9vdCwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG4gIGNvbnN0IG9ic2VydmVyV3JhcHBlciA9IHtcbiAgICBvYnNlcnZlKCkge1xuICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShyb290LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICB9LFxuICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgfVxuICB9O1xuICBvYnNlcnZlclN0YWNrLnB1c2gob2JzZXJ2ZXJXcmFwcGVyKTtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgZm9yIChjb25zdCBub2RlIG9mIGhpZGRlbk5vZGVzKSB7XG4gICAgICBjb25zdCBjb3VudCA9IHJlZkNvdW50TWFwLmdldChub2RlKTtcbiAgICAgIGlmIChjb3VudCA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChjb3VudCA9PT0gMSkge1xuICAgICAgICBub2RlLnJlbW92ZUF0dHJpYnV0ZShcImFyaWEtaGlkZGVuXCIpO1xuICAgICAgICByZWZDb3VudE1hcC5kZWxldGUobm9kZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZWZDb3VudE1hcC5zZXQobm9kZSwgY291bnQgLSAxKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG9ic2VydmVyV3JhcHBlciA9PT0gb2JzZXJ2ZXJTdGFja1tvYnNlcnZlclN0YWNrLmxlbmd0aCAtIDFdKSB7XG4gICAgICBvYnNlcnZlclN0YWNrLnBvcCgpO1xuICAgICAgaWYgKG9ic2VydmVyU3RhY2subGVuZ3RoKSB7XG4gICAgICAgIG9ic2VydmVyU3RhY2tbb2JzZXJ2ZXJTdGFjay5sZW5ndGggLSAxXS5vYnNlcnZlKCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG9ic2VydmVyU3RhY2suc3BsaWNlKG9ic2VydmVyU3RhY2suaW5kZXhPZihvYnNlcnZlcldyYXBwZXIpLCAxKTtcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCB7XG4gIGNyZWF0ZUhpZGVPdXRzaWRlLFxuICBhcmlhSGlkZU91dHNpZGVcbn07XG4iLCIvLyBzcmMvcHJpbWl0aXZlcy9jcmVhdGUtZXNjYXBlLWtleS1kb3duL2NyZWF0ZS1lc2NhcGUta2V5LWRvd24udHNcbmltcG9ydCB7IEV2ZW50S2V5LCBhY2Nlc3MsIGdldERvY3VtZW50IH0gZnJvbSBcIkBrb2JhbHRlL3V0aWxzXCI7XG5pbXBvcnQgeyBjcmVhdGVFZmZlY3QsIG9uQ2xlYW51cCB9IGZyb20gXCJzb2xpZC1qc1wiO1xuaW1wb3J0IHsgaXNTZXJ2ZXIgfSBmcm9tIFwic29saWQtanMvd2ViXCI7XG5mdW5jdGlvbiBjcmVhdGVFc2NhcGVLZXlEb3duKHByb3BzKSB7XG4gIGNvbnN0IGhhbmRsZUtleURvd24gPSAoZXZlbnQpID0+IHtcbiAgICBpZiAoZXZlbnQua2V5ID09PSBFdmVudEtleS5Fc2NhcGUpIHtcbiAgICAgIHByb3BzLm9uRXNjYXBlS2V5RG93bj8uKGV2ZW50KTtcbiAgICB9XG4gIH07XG4gIGNyZWF0ZUVmZmVjdCgoKSA9PiB7XG4gICAgaWYgKGlzU2VydmVyKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChhY2Nlc3MocHJvcHMuaXNEaXNhYmxlZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZG9jdW1lbnQgPSBwcm9wcy5vd25lckRvY3VtZW50Py4oKSA/PyBnZXREb2N1bWVudCgpO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUtleURvd24pO1xuICAgIG9uQ2xlYW51cCgoKSA9PiB7XG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVLZXlEb3duKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmV4cG9ydCB7XG4gIGNyZWF0ZUVzY2FwZUtleURvd25cbn07XG4iLCJpbXBvcnQge1xuICBEQVRBX1RPUF9MQVlFUl9BVFRSXG59IGZyb20gXCIuLzNOSTZGVEEyLmpzeFwiO1xuXG4vLyBzcmMvcHJpbWl0aXZlcy9jcmVhdGUtaW50ZXJhY3Qtb3V0c2lkZS9jcmVhdGUtaW50ZXJhY3Qtb3V0c2lkZS50c1xuaW1wb3J0IHtcbiAgYWNjZXNzLFxuICBjb21wb3NlRXZlbnRIYW5kbGVycyxcbiAgY29udGFpbnMsXG4gIGdldERvY3VtZW50LFxuICBpc0N0cmxLZXksXG4gIG5vb3Bcbn0gZnJvbSBcIkBrb2JhbHRlL3V0aWxzXCI7XG5pbXBvcnQgeyBjcmVhdGVFZmZlY3QsIG9uQ2xlYW51cCB9IGZyb20gXCJzb2xpZC1qc1wiO1xuaW1wb3J0IHsgaXNTZXJ2ZXIgfSBmcm9tIFwic29saWQtanMvd2ViXCI7XG52YXIgUE9JTlRFUl9ET1dOX09VVFNJREVfRVZFTlQgPSBcImludGVyYWN0T3V0c2lkZS5wb2ludGVyRG93bk91dHNpZGVcIjtcbnZhciBGT0NVU19PVVRTSURFX0VWRU5UID0gXCJpbnRlcmFjdE91dHNpZGUuZm9jdXNPdXRzaWRlXCI7XG5mdW5jdGlvbiBjcmVhdGVJbnRlcmFjdE91dHNpZGUocHJvcHMsIHJlZikge1xuICBsZXQgcG9pbnRlckRvd25UaW1lb3V0SWQ7XG4gIGxldCBjbGlja0hhbmRsZXIgPSBub29wO1xuICBjb25zdCBvd25lckRvY3VtZW50ID0gKCkgPT4gZ2V0RG9jdW1lbnQocmVmKCkpO1xuICBjb25zdCBvblBvaW50ZXJEb3duT3V0c2lkZSA9IChlKSA9PiBwcm9wcy5vblBvaW50ZXJEb3duT3V0c2lkZT8uKGUpO1xuICBjb25zdCBvbkZvY3VzT3V0c2lkZSA9IChlKSA9PiBwcm9wcy5vbkZvY3VzT3V0c2lkZT8uKGUpO1xuICBjb25zdCBvbkludGVyYWN0T3V0c2lkZSA9IChlKSA9PiBwcm9wcy5vbkludGVyYWN0T3V0c2lkZT8uKGUpO1xuICBjb25zdCBpc0V2ZW50T3V0c2lkZSA9IChlKSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQ7XG4gICAgaWYgKCEodGFyZ2V0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICh0YXJnZXQuY2xvc2VzdChgWyR7REFUQV9UT1BfTEFZRVJfQVRUUn1dYCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFjb250YWlucyhvd25lckRvY3VtZW50KCksIHRhcmdldCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGNvbnRhaW5zKHJlZigpLCB0YXJnZXQpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiAhcHJvcHMuc2hvdWxkRXhjbHVkZUVsZW1lbnQ/Lih0YXJnZXQpO1xuICB9O1xuICBjb25zdCBvblBvaW50ZXJEb3duID0gKGUpID0+IHtcbiAgICBmdW5jdGlvbiBoYW5kbGVyKCkge1xuICAgICAgY29uc3QgY29udGFpbmVyID0gcmVmKCk7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldDtcbiAgICAgIGlmICghY29udGFpbmVyIHx8ICF0YXJnZXQgfHwgIWlzRXZlbnRPdXRzaWRlKGUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGhhbmRsZXIyID0gY29tcG9zZUV2ZW50SGFuZGxlcnMoW1xuICAgICAgICBvblBvaW50ZXJEb3duT3V0c2lkZSxcbiAgICAgICAgb25JbnRlcmFjdE91dHNpZGVcbiAgICAgIF0pO1xuICAgICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoUE9JTlRFUl9ET1dOX09VVFNJREVfRVZFTlQsIGhhbmRsZXIyLCB7XG4gICAgICAgIG9uY2U6IHRydWVcbiAgICAgIH0pO1xuICAgICAgY29uc3QgcG9pbnRlckRvd25PdXRzaWRlRXZlbnQgPSBuZXcgQ3VzdG9tRXZlbnQoXG4gICAgICAgIFBPSU5URVJfRE9XTl9PVVRTSURFX0VWRU5ULFxuICAgICAgICB7XG4gICAgICAgICAgYnViYmxlczogZmFsc2UsXG4gICAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcbiAgICAgICAgICBkZXRhaWw6IHtcbiAgICAgICAgICAgIG9yaWdpbmFsRXZlbnQ6IGUsXG4gICAgICAgICAgICBpc0NvbnRleHRNZW51OiBlLmJ1dHRvbiA9PT0gMiB8fCBpc0N0cmxLZXkoZSkgJiYgZS5idXR0b24gPT09IDBcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgICB0YXJnZXQuZGlzcGF0Y2hFdmVudChwb2ludGVyRG93bk91dHNpZGVFdmVudCk7XG4gICAgfVxuICAgIGlmIChlLnBvaW50ZXJUeXBlID09PSBcInRvdWNoXCIpIHtcbiAgICAgIG93bmVyRG9jdW1lbnQoKS5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgaGFuZGxlcik7XG4gICAgICBjbGlja0hhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgb3duZXJEb2N1bWVudCgpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBoYW5kbGVyLCB7IG9uY2U6IHRydWUgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhbmRsZXIoKTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IG9uRm9jdXNJbiA9IChlKSA9PiB7XG4gICAgY29uc3QgY29udGFpbmVyID0gcmVmKCk7XG4gICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQ7XG4gICAgaWYgKCFjb250YWluZXIgfHwgIXRhcmdldCB8fCAhaXNFdmVudE91dHNpZGUoZSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaGFuZGxlciA9IGNvbXBvc2VFdmVudEhhbmRsZXJzKFtcbiAgICAgIG9uRm9jdXNPdXRzaWRlLFxuICAgICAgb25JbnRlcmFjdE91dHNpZGVcbiAgICBdKTtcbiAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcihGT0NVU19PVVRTSURFX0VWRU5ULCBoYW5kbGVyLCB7IG9uY2U6IHRydWUgfSk7XG4gICAgY29uc3QgZm9jdXNPdXRzaWRlRXZlbnQgPSBuZXcgQ3VzdG9tRXZlbnQoRk9DVVNfT1VUU0lERV9FVkVOVCwge1xuICAgICAgYnViYmxlczogZmFsc2UsXG4gICAgICBjYW5jZWxhYmxlOiB0cnVlLFxuICAgICAgZGV0YWlsOiB7XG4gICAgICAgIG9yaWdpbmFsRXZlbnQ6IGUsXG4gICAgICAgIGlzQ29udGV4dE1lbnU6IGZhbHNlXG4gICAgICB9XG4gICAgfSk7XG4gICAgdGFyZ2V0LmRpc3BhdGNoRXZlbnQoZm9jdXNPdXRzaWRlRXZlbnQpO1xuICB9O1xuICBjcmVhdGVFZmZlY3QoKCkgPT4ge1xuICAgIGlmIChpc1NlcnZlcikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoYWNjZXNzKHByb3BzLmlzRGlzYWJsZWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHBvaW50ZXJEb3duVGltZW91dElkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgb3duZXJEb2N1bWVudCgpLmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCBvblBvaW50ZXJEb3duLCB0cnVlKTtcbiAgICB9LCAwKTtcbiAgICBvd25lckRvY3VtZW50KCkuYWRkRXZlbnRMaXN0ZW5lcihcImZvY3VzaW5cIiwgb25Gb2N1c0luLCB0cnVlKTtcbiAgICBvbkNsZWFudXAoKCkgPT4ge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dChwb2ludGVyRG93blRpbWVvdXRJZCk7XG4gICAgICBvd25lckRvY3VtZW50KCkucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGNsaWNrSGFuZGxlcik7XG4gICAgICBvd25lckRvY3VtZW50KCkucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJkb3duXCIsIG9uUG9pbnRlckRvd24sIHRydWUpO1xuICAgICAgb3duZXJEb2N1bWVudCgpLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJmb2N1c2luXCIsIG9uRm9jdXNJbiwgdHJ1ZSk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQge1xuICBjcmVhdGVJbnRlcmFjdE91dHNpZGVcbn07XG4iLCIvLyBzcmMvcG9seW1vcnBoaWMvcG9seW1vcnBoaWMudHN4XG5pbXBvcnQgeyBzcGxpdFByb3BzIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5pbXBvcnQgeyBEeW5hbWljIH0gZnJvbSBcInNvbGlkLWpzL3dlYlwiO1xuZnVuY3Rpb24gUG9seW1vcnBoaWMocHJvcHMpIHtcbiAgY29uc3QgW2xvY2FsLCBvdGhlcnNdID0gc3BsaXRQcm9wcyhwcm9wcywgW1wiYXNcIl0pO1xuICBpZiAoIWxvY2FsLmFzKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJba29iYWx0ZV06IFBvbHltb3JwaGljIGlzIG1pc3NpbmcgdGhlIHJlcXVpcmVkIGBhc2AgcHJvcC5cIlxuICAgICk7XG4gIH1cbiAgcmV0dXJuIChcbiAgICAvLyBAdHMtaWdub3JlOiBQcm9wcyBhcmUgdmFsaWQgYnV0IG5vdCB3b3J0aCBjYWxjdWxhdGluZ1xuICAgIDxEeW5hbWljIGNvbXBvbmVudD17bG9jYWwuYXN9IHsuLi5vdGhlcnN9IC8+XG4gICk7XG59XG5cbmV4cG9ydCB7XG4gIFBvbHltb3JwaGljXG59O1xuIiwiaW1wb3J0IHtcbiAgY3JlYXRlRXNjYXBlS2V5RG93blxufSBmcm9tIFwiLi9XTlJBTjVHVi5qc3hcIjtcbmltcG9ydCB7XG4gIGNyZWF0ZUludGVyYWN0T3V0c2lkZVxufSBmcm9tIFwiLi9CTU1DUTdZSi5qc3hcIjtcbmltcG9ydCB7XG4gIGxheWVyU3RhY2tcbn0gZnJvbSBcIi4vM05JNkZUQTIuanN4XCI7XG5pbXBvcnQge1xuICBQb2x5bW9ycGhpY1xufSBmcm9tIFwiLi9FNzNQS0ZCMy5qc3hcIjtcblxuLy8gc3JjL2Rpc21pc3NhYmxlLWxheWVyL2Rpc21pc3NhYmxlLWxheWVyLnRzeFxuaW1wb3J0IHsgY29udGFpbnMsIGdldERvY3VtZW50LCBtZXJnZVJlZnMgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7XG4gIGNyZWF0ZUVmZmVjdCxcbiAgb24sXG4gIG9uQ2xlYW51cCxcbiAgb25Nb3VudCxcbiAgc3BsaXRQcm9wc1xufSBmcm9tIFwic29saWQtanNcIjtcblxuLy8gc3JjL2Rpc21pc3NhYmxlLWxheWVyL2Rpc21pc3NhYmxlLWxheWVyLWNvbnRleHQudHN4XG5pbXBvcnQgeyBjcmVhdGVDb250ZXh0LCB1c2VDb250ZXh0IH0gZnJvbSBcInNvbGlkLWpzXCI7XG52YXIgRGlzbWlzc2FibGVMYXllckNvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5mdW5jdGlvbiB1c2VPcHRpb25hbERpc21pc3NhYmxlTGF5ZXJDb250ZXh0KCkge1xuICByZXR1cm4gdXNlQ29udGV4dChEaXNtaXNzYWJsZUxheWVyQ29udGV4dCk7XG59XG5cbi8vIHNyYy9kaXNtaXNzYWJsZS1sYXllci9kaXNtaXNzYWJsZS1sYXllci50c3hcbmZ1bmN0aW9uIERpc21pc3NhYmxlTGF5ZXIocHJvcHMpIHtcbiAgbGV0IHJlZjtcbiAgY29uc3QgcGFyZW50Q29udGV4dCA9IHVzZU9wdGlvbmFsRGlzbWlzc2FibGVMYXllckNvbnRleHQoKTtcbiAgY29uc3QgW2xvY2FsLCBvdGhlcnNdID0gc3BsaXRQcm9wcyhwcm9wcywgW1xuICAgIFwicmVmXCIsXG4gICAgXCJkaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHNcIixcbiAgICBcImV4Y2x1ZGVkRWxlbWVudHNcIixcbiAgICBcIm9uRXNjYXBlS2V5RG93blwiLFxuICAgIFwib25Qb2ludGVyRG93bk91dHNpZGVcIixcbiAgICBcIm9uRm9jdXNPdXRzaWRlXCIsXG4gICAgXCJvbkludGVyYWN0T3V0c2lkZVwiLFxuICAgIFwib25EaXNtaXNzXCIsXG4gICAgXCJieXBhc3NUb3BNb3N0TGF5ZXJDaGVja1wiXG4gIF0pO1xuICBjb25zdCBuZXN0ZWRMYXllcnMgPSAvKiBAX19QVVJFX18gKi8gbmV3IFNldChbXSk7XG4gIGNvbnN0IHJlZ2lzdGVyTmVzdGVkTGF5ZXIgPSAoZWxlbWVudCkgPT4ge1xuICAgIG5lc3RlZExheWVycy5hZGQoZWxlbWVudCk7XG4gICAgY29uc3QgcGFyZW50VW5yZWdpc3RlciA9IHBhcmVudENvbnRleHQ/LnJlZ2lzdGVyTmVzdGVkTGF5ZXIoZWxlbWVudCk7XG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIG5lc3RlZExheWVycy5kZWxldGUoZWxlbWVudCk7XG4gICAgICBwYXJlbnRVbnJlZ2lzdGVyPy4oKTtcbiAgICB9O1xuICB9O1xuICBjb25zdCBzaG91bGRFeGNsdWRlRWxlbWVudCA9IChlbGVtZW50KSA9PiB7XG4gICAgaWYgKCFyZWYpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIGxvY2FsLmV4Y2x1ZGVkRWxlbWVudHM/LnNvbWUoKG5vZGUpID0+IGNvbnRhaW5zKG5vZGUoKSwgZWxlbWVudCkpIHx8IFsuLi5uZXN0ZWRMYXllcnNdLnNvbWUoKGxheWVyKSA9PiBjb250YWlucyhsYXllciwgZWxlbWVudCkpO1xuICB9O1xuICBjb25zdCBvblBvaW50ZXJEb3duT3V0c2lkZSA9IChlKSA9PiB7XG4gICAgaWYgKCFyZWYgfHwgbGF5ZXJTdGFjay5pc0JlbG93UG9pbnRlckJsb2NraW5nTGF5ZXIocmVmKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIWxvY2FsLmJ5cGFzc1RvcE1vc3RMYXllckNoZWNrICYmICFsYXllclN0YWNrLmlzVG9wTW9zdExheWVyKHJlZikpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbG9jYWwub25Qb2ludGVyRG93bk91dHNpZGU/LihlKTtcbiAgICBsb2NhbC5vbkludGVyYWN0T3V0c2lkZT8uKGUpO1xuICAgIGlmICghZS5kZWZhdWx0UHJldmVudGVkKSB7XG4gICAgICBsb2NhbC5vbkRpc21pc3M/LigpO1xuICAgIH1cbiAgfTtcbiAgY29uc3Qgb25Gb2N1c091dHNpZGUgPSAoZSkgPT4ge1xuICAgIGxvY2FsLm9uRm9jdXNPdXRzaWRlPy4oZSk7XG4gICAgbG9jYWwub25JbnRlcmFjdE91dHNpZGU/LihlKTtcbiAgICBpZiAoIWUuZGVmYXVsdFByZXZlbnRlZCkge1xuICAgICAgbG9jYWwub25EaXNtaXNzPy4oKTtcbiAgICB9XG4gIH07XG4gIGNyZWF0ZUludGVyYWN0T3V0c2lkZShcbiAgICB7XG4gICAgICBzaG91bGRFeGNsdWRlRWxlbWVudCxcbiAgICAgIG9uUG9pbnRlckRvd25PdXRzaWRlLFxuICAgICAgb25Gb2N1c091dHNpZGVcbiAgICB9LFxuICAgICgpID0+IHJlZlxuICApO1xuICBjcmVhdGVFc2NhcGVLZXlEb3duKHtcbiAgICBvd25lckRvY3VtZW50OiAoKSA9PiBnZXREb2N1bWVudChyZWYpLFxuICAgIG9uRXNjYXBlS2V5RG93bjogKGUpID0+IHtcbiAgICAgIGlmICghcmVmIHx8ICFsYXllclN0YWNrLmlzVG9wTW9zdExheWVyKHJlZikpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbG9jYWwub25Fc2NhcGVLZXlEb3duPy4oZSk7XG4gICAgICBpZiAoIWUuZGVmYXVsdFByZXZlbnRlZCAmJiBsb2NhbC5vbkRpc21pc3MpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBsb2NhbC5vbkRpc21pc3MoKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICBvbk1vdW50KCgpID0+IHtcbiAgICBpZiAoIXJlZikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsYXllclN0YWNrLmFkZExheWVyKHtcbiAgICAgIG5vZGU6IHJlZixcbiAgICAgIGlzUG9pbnRlckJsb2NraW5nOiBsb2NhbC5kaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHMsXG4gICAgICBkaXNtaXNzOiBsb2NhbC5vbkRpc21pc3NcbiAgICB9KTtcbiAgICBjb25zdCB1bnJlZ2lzdGVyRnJvbVBhcmVudExheWVyID0gcGFyZW50Q29udGV4dD8ucmVnaXN0ZXJOZXN0ZWRMYXllcihyZWYpO1xuICAgIGxheWVyU3RhY2suYXNzaWduUG9pbnRlckV2ZW50VG9MYXllcnMoKTtcbiAgICBsYXllclN0YWNrLmRpc2FibGVCb2R5UG9pbnRlckV2ZW50cyhyZWYpO1xuICAgIG9uQ2xlYW51cCgoKSA9PiB7XG4gICAgICBpZiAoIXJlZikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsYXllclN0YWNrLnJlbW92ZUxheWVyKHJlZik7XG4gICAgICB1bnJlZ2lzdGVyRnJvbVBhcmVudExheWVyPy4oKTtcbiAgICAgIGxheWVyU3RhY2suYXNzaWduUG9pbnRlckV2ZW50VG9MYXllcnMoKTtcbiAgICAgIGxheWVyU3RhY2sucmVzdG9yZUJvZHlQb2ludGVyRXZlbnRzKHJlZik7XG4gICAgfSk7XG4gIH0pO1xuICBjcmVhdGVFZmZlY3QoXG4gICAgb24oXG4gICAgICBbKCkgPT4gcmVmLCAoKSA9PiBsb2NhbC5kaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHNdLFxuICAgICAgKFtyZWYyLCBkaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHNdKSA9PiB7XG4gICAgICAgIGlmICghcmVmMikge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBsYXllciA9IGxheWVyU3RhY2suZmluZChyZWYyKTtcbiAgICAgICAgaWYgKGxheWVyICYmIGxheWVyLmlzUG9pbnRlckJsb2NraW5nICE9PSBkaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHMpIHtcbiAgICAgICAgICBsYXllci5pc1BvaW50ZXJCbG9ja2luZyA9IGRpc2FibGVPdXRzaWRlUG9pbnRlckV2ZW50cztcbiAgICAgICAgICBsYXllclN0YWNrLmFzc2lnblBvaW50ZXJFdmVudFRvTGF5ZXJzKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRpc2FibGVPdXRzaWRlUG9pbnRlckV2ZW50cykge1xuICAgICAgICAgIGxheWVyU3RhY2suZGlzYWJsZUJvZHlQb2ludGVyRXZlbnRzKHJlZjIpO1xuICAgICAgICB9XG4gICAgICAgIG9uQ2xlYW51cCgoKSA9PiB7XG4gICAgICAgICAgbGF5ZXJTdGFjay5yZXN0b3JlQm9keVBvaW50ZXJFdmVudHMocmVmMik7XG4gICAgICAgIH0pO1xuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgZGVmZXI6IHRydWVcbiAgICAgIH1cbiAgICApXG4gICk7XG4gIGNvbnN0IGNvbnRleHQgPSB7XG4gICAgcmVnaXN0ZXJOZXN0ZWRMYXllclxuICB9O1xuICByZXR1cm4gPERpc21pc3NhYmxlTGF5ZXJDb250ZXh0LlByb3ZpZGVyIHZhbHVlPXtjb250ZXh0fT48UG9seW1vcnBoaWNcbiAgICBhcz1cImRpdlwiXG4gICAgcmVmPXttZXJnZVJlZnMoKGVsKSA9PiByZWYgPSBlbCwgbG9jYWwucmVmKX1cbiAgICB7Li4ub3RoZXJzfVxuICAvPjwvRGlzbWlzc2FibGVMYXllckNvbnRleHQuUHJvdmlkZXI+O1xufVxuXG5leHBvcnQge1xuICBEaXNtaXNzYWJsZUxheWVyXG59O1xuIiwiLy8gc3JjL3ByaW1pdGl2ZXMvY3JlYXRlLWNvbnRyb2xsYWJsZS1zaWduYWwvY3JlYXRlLWNvbnRyb2xsYWJsZS1zaWduYWwudHNcbmltcG9ydCB7IGFjY2Vzc1dpdGggfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7IGNyZWF0ZU1lbW8sIGNyZWF0ZVNpZ25hbCwgdW50cmFjayB9IGZyb20gXCJzb2xpZC1qc1wiO1xuZnVuY3Rpb24gY3JlYXRlQ29udHJvbGxhYmxlU2lnbmFsKHByb3BzKSB7XG4gIGNvbnN0IFtfdmFsdWUsIF9zZXRWYWx1ZV0gPSBjcmVhdGVTaWduYWwocHJvcHMuZGVmYXVsdFZhbHVlPy4oKSk7XG4gIGNvbnN0IGlzQ29udHJvbGxlZCA9IGNyZWF0ZU1lbW8oKCkgPT4gcHJvcHMudmFsdWU/LigpICE9PSB2b2lkIDApO1xuICBjb25zdCB2YWx1ZSA9IGNyZWF0ZU1lbW8oKCkgPT4gaXNDb250cm9sbGVkKCkgPyBwcm9wcy52YWx1ZT8uKCkgOiBfdmFsdWUoKSk7XG4gIGNvbnN0IHNldFZhbHVlID0gKG5leHQpID0+IHtcbiAgICB1bnRyYWNrKCgpID0+IHtcbiAgICAgIGNvbnN0IG5leHRWYWx1ZSA9IGFjY2Vzc1dpdGgobmV4dCwgdmFsdWUoKSk7XG4gICAgICBpZiAoIU9iamVjdC5pcyhuZXh0VmFsdWUsIHZhbHVlKCkpKSB7XG4gICAgICAgIGlmICghaXNDb250cm9sbGVkKCkpIHtcbiAgICAgICAgICBfc2V0VmFsdWUobmV4dFZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICBwcm9wcy5vbkNoYW5nZT8uKG5leHRWYWx1ZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmV4dFZhbHVlO1xuICAgIH0pO1xuICB9O1xuICByZXR1cm4gW3ZhbHVlLCBzZXRWYWx1ZV07XG59XG5mdW5jdGlvbiBjcmVhdGVDb250cm9sbGFibGVCb29sZWFuU2lnbmFsKHByb3BzKSB7XG4gIGNvbnN0IFtfdmFsdWUsIHNldFZhbHVlXSA9IGNyZWF0ZUNvbnRyb2xsYWJsZVNpZ25hbChwcm9wcyk7XG4gIGNvbnN0IHZhbHVlID0gKCkgPT4gX3ZhbHVlKCkgPz8gZmFsc2U7XG4gIHJldHVybiBbdmFsdWUsIHNldFZhbHVlXTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRyb2xsYWJsZUFycmF5U2lnbmFsKHByb3BzKSB7XG4gIGNvbnN0IFtfdmFsdWUsIHNldFZhbHVlXSA9IGNyZWF0ZUNvbnRyb2xsYWJsZVNpZ25hbChwcm9wcyk7XG4gIGNvbnN0IHZhbHVlID0gKCkgPT4gX3ZhbHVlKCkgPz8gW107XG4gIHJldHVybiBbdmFsdWUsIHNldFZhbHVlXTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRyb2xsYWJsZVNldFNpZ25hbChwcm9wcykge1xuICBjb25zdCBbX3ZhbHVlLCBzZXRWYWx1ZV0gPSBjcmVhdGVDb250cm9sbGFibGVTaWduYWwocHJvcHMpO1xuICBjb25zdCB2YWx1ZSA9ICgpID0+IF92YWx1ZSgpID8/IC8qIEBfX1BVUkVfXyAqLyBuZXcgU2V0KCk7XG4gIHJldHVybiBbdmFsdWUsIHNldFZhbHVlXTtcbn1cblxuZXhwb3J0IHtcbiAgY3JlYXRlQ29udHJvbGxhYmxlU2lnbmFsLFxuICBjcmVhdGVDb250cm9sbGFibGVCb29sZWFuU2lnbmFsLFxuICBjcmVhdGVDb250cm9sbGFibGVBcnJheVNpZ25hbCxcbiAgY3JlYXRlQ29udHJvbGxhYmxlU2V0U2lnbmFsXG59O1xuIiwiaW1wb3J0IHtcbiAgY3JlYXRlQ29udHJvbGxhYmxlQm9vbGVhblNpZ25hbFxufSBmcm9tIFwiLi9GTjZFSUNHTy5qc3hcIjtcblxuLy8gc3JjL3ByaW1pdGl2ZXMvY3JlYXRlLWRpc2Nsb3N1cmUtc3RhdGUvY3JlYXRlLWRpc2Nsb3N1cmUtc3RhdGUudHNcbmltcG9ydCB7IGFjY2VzcyB9IGZyb20gXCJAa29iYWx0ZS91dGlsc1wiO1xuZnVuY3Rpb24gY3JlYXRlRGlzY2xvc3VyZVN0YXRlKHByb3BzID0ge30pIHtcbiAgY29uc3QgW2lzT3Blbiwgc2V0SXNPcGVuXSA9IGNyZWF0ZUNvbnRyb2xsYWJsZUJvb2xlYW5TaWduYWwoe1xuICAgIHZhbHVlOiAoKSA9PiBhY2Nlc3MocHJvcHMub3BlbiksXG4gICAgZGVmYXVsdFZhbHVlOiAoKSA9PiAhIWFjY2Vzcyhwcm9wcy5kZWZhdWx0T3BlbiksXG4gICAgb25DaGFuZ2U6ICh2YWx1ZSkgPT4gcHJvcHMub25PcGVuQ2hhbmdlPy4odmFsdWUpXG4gIH0pO1xuICBjb25zdCBvcGVuID0gKCkgPT4ge1xuICAgIHNldElzT3Blbih0cnVlKTtcbiAgfTtcbiAgY29uc3QgY2xvc2UgPSAoKSA9PiB7XG4gICAgc2V0SXNPcGVuKGZhbHNlKTtcbiAgfTtcbiAgY29uc3QgdG9nZ2xlID0gKCkgPT4ge1xuICAgIGlzT3BlbigpID8gY2xvc2UoKSA6IG9wZW4oKTtcbiAgfTtcbiAgcmV0dXJuIHtcbiAgICBpc09wZW4sXG4gICAgc2V0SXNPcGVuLFxuICAgIG9wZW4sXG4gICAgY2xvc2UsXG4gICAgdG9nZ2xlXG4gIH07XG59XG5cbmV4cG9ydCB7XG4gIGNyZWF0ZURpc2Nsb3N1cmVTdGF0ZVxufTtcbiIsIi8vIHNyYy9wcmltaXRpdmVzL2NyZWF0ZS10YWctbmFtZS9jcmVhdGUtdGFnLW5hbWUudHNcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSBcIkBrb2JhbHRlL3V0aWxzXCI7XG5pbXBvcnQgeyBjcmVhdGVFZmZlY3QsIGNyZWF0ZVNpZ25hbCB9IGZyb20gXCJzb2xpZC1qc1wiO1xuZnVuY3Rpb24gY3JlYXRlVGFnTmFtZShyZWYsIGZhbGxiYWNrKSB7XG4gIGNvbnN0IFt0YWdOYW1lLCBzZXRUYWdOYW1lXSA9IGNyZWF0ZVNpZ25hbChzdHJpbmdPclVuZGVmaW5lZChmYWxsYmFjaz8uKCkpKTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBzZXRUYWdOYW1lKHJlZigpPy50YWdOYW1lLnRvTG93ZXJDYXNlKCkgfHwgc3RyaW5nT3JVbmRlZmluZWQoZmFsbGJhY2s/LigpKSk7XG4gIH0pO1xuICByZXR1cm4gdGFnTmFtZTtcbn1cbmZ1bmN0aW9uIHN0cmluZ09yVW5kZWZpbmVkKHZhbHVlKSB7XG4gIHJldHVybiBpc1N0cmluZyh2YWx1ZSkgPyB2YWx1ZSA6IHZvaWQgMDtcbn1cblxuZXhwb3J0IHtcbiAgY3JlYXRlVGFnTmFtZVxufTtcbiIsInZhciBfX2RlZlByb3AgPSBPYmplY3QuZGVmaW5lUHJvcGVydHk7XG52YXIgX19leHBvcnQgPSAodGFyZ2V0LCBhbGwpID0+IHtcbiAgZm9yICh2YXIgbmFtZSBpbiBhbGwpXG4gICAgX19kZWZQcm9wKHRhcmdldCwgbmFtZSwgeyBnZXQ6IGFsbFtuYW1lXSwgZW51bWVyYWJsZTogdHJ1ZSB9KTtcbn07XG5cbmV4cG9ydCB7XG4gIF9fZXhwb3J0XG59O1xuIiwiaW1wb3J0IHtcbiAgY3JlYXRlVGFnTmFtZVxufSBmcm9tIFwiLi9DV0NCNDQ3Ri5qc3hcIjtcbmltcG9ydCB7XG4gIFBvbHltb3JwaGljXG59IGZyb20gXCIuL0U3M1BLRkIzLmpzeFwiO1xuaW1wb3J0IHtcbiAgX19leHBvcnRcbn0gZnJvbSBcIi4vNVdYSEpEQ1ouanN4XCI7XG5cbi8vIHNyYy9idXR0b24vaW5kZXgudHN4XG52YXIgYnV0dG9uX2V4cG9ydHMgPSB7fTtcbl9fZXhwb3J0KGJ1dHRvbl9leHBvcnRzLCB7XG4gIEJ1dHRvbjogKCkgPT4gQnV0dG9uLFxuICBSb290OiAoKSA9PiBCdXR0b25Sb290XG59KTtcblxuLy8gc3JjL2J1dHRvbi9idXR0b24tcm9vdC50c3hcbmltcG9ydCB7IG1lcmdlRGVmYXVsdFByb3BzLCBtZXJnZVJlZnMgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7IGNyZWF0ZU1lbW8sIHNwbGl0UHJvcHMgfSBmcm9tIFwic29saWQtanNcIjtcblxuLy8gc3JjL2J1dHRvbi9pcy1idXR0b24udHNcbnZhciBCVVRUT05fSU5QVVRfVFlQRVMgPSBbXG4gIFwiYnV0dG9uXCIsXG4gIFwiY29sb3JcIixcbiAgXCJmaWxlXCIsXG4gIFwiaW1hZ2VcIixcbiAgXCJyZXNldFwiLFxuICBcInN1Ym1pdFwiXG5dO1xuZnVuY3Rpb24gaXNCdXR0b24oZWxlbWVudCkge1xuICBjb25zdCB0YWdOYW1lID0gZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG4gIGlmICh0YWdOYW1lID09PSBcImJ1dHRvblwiKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKHRhZ05hbWUgPT09IFwiaW5wdXRcIiAmJiBlbGVtZW50LnR5cGUpIHtcbiAgICByZXR1cm4gQlVUVE9OX0lOUFVUX1RZUEVTLmluZGV4T2YoZWxlbWVudC50eXBlKSAhPT0gLTE7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vLyBzcmMvYnV0dG9uL2J1dHRvbi1yb290LnRzeFxuZnVuY3Rpb24gQnV0dG9uUm9vdChwcm9wcykge1xuICBsZXQgcmVmO1xuICBjb25zdCBtZXJnZWRQcm9wcyA9IG1lcmdlRGVmYXVsdFByb3BzKFxuICAgIHsgdHlwZTogXCJidXR0b25cIiB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IFtsb2NhbCwgb3RoZXJzXSA9IHNwbGl0UHJvcHMobWVyZ2VkUHJvcHMsIFtcInJlZlwiLCBcInR5cGVcIiwgXCJkaXNhYmxlZFwiXSk7XG4gIGNvbnN0IHRhZ05hbWUgPSBjcmVhdGVUYWdOYW1lKFxuICAgICgpID0+IHJlZixcbiAgICAoKSA9PiBcImJ1dHRvblwiXG4gICk7XG4gIGNvbnN0IGlzTmF0aXZlQnV0dG9uID0gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgY29uc3QgZWxlbWVudFRhZ05hbWUgPSB0YWdOYW1lKCk7XG4gICAgaWYgKGVsZW1lbnRUYWdOYW1lID09IG51bGwpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIGlzQnV0dG9uKHsgdGFnTmFtZTogZWxlbWVudFRhZ05hbWUsIHR5cGU6IGxvY2FsLnR5cGUgfSk7XG4gIH0pO1xuICBjb25zdCBpc05hdGl2ZUlucHV0ID0gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgcmV0dXJuIHRhZ05hbWUoKSA9PT0gXCJpbnB1dFwiO1xuICB9KTtcbiAgY29uc3QgaXNOYXRpdmVMaW5rID0gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgcmV0dXJuIHRhZ05hbWUoKSA9PT0gXCJhXCIgJiYgcmVmPy5nZXRBdHRyaWJ1dGUoXCJocmVmXCIpICE9IG51bGw7XG4gIH0pO1xuICByZXR1cm4gPFBvbHltb3JwaGljXG4gICAgYXM9XCJidXR0b25cIlxuICAgIHJlZj17bWVyZ2VSZWZzKChlbCkgPT4gcmVmID0gZWwsIGxvY2FsLnJlZil9XG4gICAgdHlwZT17aXNOYXRpdmVCdXR0b24oKSB8fCBpc05hdGl2ZUlucHV0KCkgPyBsb2NhbC50eXBlIDogdm9pZCAwfVxuICAgIHJvbGU9eyFpc05hdGl2ZUJ1dHRvbigpICYmICFpc05hdGl2ZUxpbmsoKSA/IFwiYnV0dG9uXCIgOiB2b2lkIDB9XG4gICAgdGFiSW5kZXg9eyFpc05hdGl2ZUJ1dHRvbigpICYmICFpc05hdGl2ZUxpbmsoKSAmJiAhbG9jYWwuZGlzYWJsZWQgPyAwIDogdm9pZCAwfVxuICAgIGRpc2FibGVkPXtpc05hdGl2ZUJ1dHRvbigpIHx8IGlzTmF0aXZlSW5wdXQoKSA/IGxvY2FsLmRpc2FibGVkIDogdm9pZCAwfVxuICAgIGFyaWEtZGlzYWJsZWQ9eyFpc05hdGl2ZUJ1dHRvbigpICYmICFpc05hdGl2ZUlucHV0KCkgJiYgbG9jYWwuZGlzYWJsZWQgPyB0cnVlIDogdm9pZCAwfVxuICAgIGRhdGEtZGlzYWJsZWQ9e2xvY2FsLmRpc2FibGVkID8gXCJcIiA6IHZvaWQgMH1cbiAgICB7Li4ub3RoZXJzfVxuICAvPjtcbn1cblxuLy8gc3JjL2J1dHRvbi9pbmRleC50c3hcbnZhciBCdXR0b24gPSBCdXR0b25Sb290O1xuXG5leHBvcnQge1xuICBCdXR0b25Sb290LFxuICBCdXR0b24sXG4gIGJ1dHRvbl9leHBvcnRzXG59O1xuIiwiLy8gc3JjL3ByaW1pdGl2ZXMvY3JlYXRlLXJlZ2lzdGVyLWlkL2NyZWF0ZS1yZWdpc3Rlci1pZC50c1xuZnVuY3Rpb24gY3JlYXRlUmVnaXN0ZXJJZChzZXR0ZXIpIHtcbiAgcmV0dXJuIChpZCkgPT4ge1xuICAgIHNldHRlcihpZCk7XG4gICAgcmV0dXJuICgpID0+IHNldHRlcih2b2lkIDApO1xuICB9O1xufVxuXG5leHBvcnQge1xuICBjcmVhdGVSZWdpc3RlcklkXG59O1xuIiwiLy8gc3JjL3JlYWN0aXZpdHkvbGliLnRzXG5pbXBvcnQgXCJzb2xpZC1qc1wiO1xudmFyIGFjY2VzcyA9ICh2KSA9PiB0eXBlb2YgdiA9PT0gXCJmdW5jdGlvblwiID8gdigpIDogdjtcbnZhciBjaGFpbiA9IChjYWxsYmFja3MpID0+IHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgZm9yIChjb25zdCBjYWxsYmFjayBvZiBjYWxsYmFja3MpIGNhbGxiYWNrICYmIGNhbGxiYWNrKC4uLmFyZ3MpO1xuICB9O1xufTtcbnZhciBtZXJnZVJlZnMgPSAoLi4ucmVmcykgPT4ge1xuICByZXR1cm4gY2hhaW4ocmVmcyk7XG59O1xudmFyIHNvbWUgPSAoLi4uc2lnbmFscykgPT4ge1xuICByZXR1cm4gc2lnbmFscy5zb21lKChzaWduYWwpID0+ICEhc2lnbmFsKCkpO1xufTtcblxuZXhwb3J0IHtcbiAgYWNjZXNzLFxuICBjaGFpbixcbiAgbWVyZ2VSZWZzLFxuICBzb21lXG59O1xuIiwiaW1wb3J0IHtcbiAgYWNjZXNzXG59IGZyb20gXCIuL1U0MkVDTU5ELmpzeFwiO1xuXG4vLyBzcmMvY3JlYXRlL3N0eWxlLnRzXG5pbXBvcnQgeyBjcmVhdGVFZmZlY3QsIG9uQ2xlYW51cCB9IGZyb20gXCJzb2xpZC1qc1wiO1xudmFyIGFjdGl2ZVN0eWxlcyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgTWFwKCk7XG52YXIgY3JlYXRlU3R5bGUgPSAocHJvcHMpID0+IHtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBjb25zdCBzdHlsZSA9IGFjY2Vzcyhwcm9wcy5zdHlsZSkgPz8ge307XG4gICAgY29uc3QgcHJvcGVydGllcyA9IGFjY2Vzcyhwcm9wcy5wcm9wZXJ0aWVzKSA/PyBbXTtcbiAgICBjb25zdCBvcmlnaW5hbFN0eWxlcyA9IHt9O1xuICAgIGZvciAoY29uc3Qga2V5IGluIHN0eWxlKSB7XG4gICAgICBvcmlnaW5hbFN0eWxlc1trZXldID0gcHJvcHMuZWxlbWVudC5zdHlsZVtrZXldO1xuICAgIH1cbiAgICBjb25zdCBhY3RpdmVTdHlsZSA9IGFjdGl2ZVN0eWxlcy5nZXQocHJvcHMua2V5KTtcbiAgICBpZiAoYWN0aXZlU3R5bGUpIHtcbiAgICAgIGFjdGl2ZVN0eWxlLmFjdGl2ZUNvdW50Kys7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFjdGl2ZVN0eWxlcy5zZXQocHJvcHMua2V5LCB7XG4gICAgICAgIGFjdGl2ZUNvdW50OiAxLFxuICAgICAgICBvcmlnaW5hbFN0eWxlcyxcbiAgICAgICAgcHJvcGVydGllczogcHJvcGVydGllcy5tYXAoKHByb3BlcnR5KSA9PiBwcm9wZXJ0eS5rZXkpXG4gICAgICB9KTtcbiAgICB9XG4gICAgT2JqZWN0LmFzc2lnbihwcm9wcy5lbGVtZW50LnN0eWxlLCBwcm9wcy5zdHlsZSk7XG4gICAgZm9yIChjb25zdCBwcm9wZXJ0eSBvZiBwcm9wZXJ0aWVzKSB7XG4gICAgICBwcm9wcy5lbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KHByb3BlcnR5LmtleSwgcHJvcGVydHkudmFsdWUpO1xuICAgIH1cbiAgICBvbkNsZWFudXAoKCkgPT4ge1xuICAgICAgY29uc3QgYWN0aXZlU3R5bGUyID0gYWN0aXZlU3R5bGVzLmdldChwcm9wcy5rZXkpO1xuICAgICAgaWYgKCFhY3RpdmVTdHlsZTIpIHJldHVybjtcbiAgICAgIGlmIChhY3RpdmVTdHlsZTIuYWN0aXZlQ291bnQgIT09IDEpIHtcbiAgICAgICAgYWN0aXZlU3R5bGUyLmFjdGl2ZUNvdW50LS07XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGFjdGl2ZVN0eWxlcy5kZWxldGUocHJvcHMua2V5KTtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGFjdGl2ZVN0eWxlMi5vcmlnaW5hbFN0eWxlcykpIHtcbiAgICAgICAgcHJvcHMuZWxlbWVudC5zdHlsZVtrZXldID0gdmFsdWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHByb3BlcnR5IG9mIGFjdGl2ZVN0eWxlMi5wcm9wZXJ0aWVzKSB7XG4gICAgICAgIHByb3BzLmVsZW1lbnQuc3R5bGUucmVtb3ZlUHJvcGVydHkocHJvcGVydHkpO1xuICAgICAgfVxuICAgICAgaWYgKHByb3BzLmVsZW1lbnQuc3R5bGUubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHByb3BzLmVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKFwic3R5bGVcIik7XG4gICAgICB9XG4gICAgICBwcm9wcy5jbGVhbnVwPy4oKTtcbiAgICB9KTtcbiAgfSk7XG59O1xudmFyIHN0eWxlX2RlZmF1bHQgPSBjcmVhdGVTdHlsZTtcblxuZXhwb3J0IHtcbiAgc3R5bGVfZGVmYXVsdFxufTtcbiIsIi8vIHNyYy9zY3JvbGwvbGliLnRzXG52YXIgZ2V0U2Nyb2xsRGltZW5zaW9ucyA9IChlbGVtZW50LCBheGlzKSA9PiB7XG4gIHN3aXRjaCAoYXhpcykge1xuICAgIGNhc2UgXCJ4XCI6XG4gICAgICByZXR1cm4gW2VsZW1lbnQuY2xpZW50V2lkdGgsIGVsZW1lbnQuc2Nyb2xsTGVmdCwgZWxlbWVudC5zY3JvbGxXaWR0aF07XG4gICAgY2FzZSBcInlcIjpcbiAgICAgIHJldHVybiBbZWxlbWVudC5jbGllbnRIZWlnaHQsIGVsZW1lbnQuc2Nyb2xsVG9wLCBlbGVtZW50LnNjcm9sbEhlaWdodF07XG4gIH1cbn07XG52YXIgaXNTY3JvbGxDb250YWluZXIgPSAoZWxlbWVudCwgYXhpcykgPT4ge1xuICBjb25zdCBzdHlsZXMgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuICBjb25zdCBvdmVyZmxvdyA9IGF4aXMgPT09IFwieFwiID8gc3R5bGVzLm92ZXJmbG93WCA6IHN0eWxlcy5vdmVyZmxvd1k7XG4gIHJldHVybiBvdmVyZmxvdyA9PT0gXCJhdXRvXCIgfHwgb3ZlcmZsb3cgPT09IFwic2Nyb2xsXCIgfHwgLy8gVGhlIEhUTUwgZWxlbWVudCBpcyBhIHNjcm9sbCBjb250YWluZXIgaWYgaXQgaGFzIG92ZXJmbG93IHZpc2libGVcbiAgZWxlbWVudC50YWdOYW1lID09PSBcIkhUTUxcIiAmJiBvdmVyZmxvdyA9PT0gXCJ2aXNpYmxlXCI7XG59O1xudmFyIGdldFNjcm9sbEF0TG9jYXRpb24gPSAobG9jYXRpb24sIGF4aXMsIHN0b3BBdCkgPT4ge1xuICBjb25zdCBkaXJlY3Rpb25GYWN0b3IgPSBheGlzID09PSBcInhcIiAmJiB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShsb2NhdGlvbikuZGlyZWN0aW9uID09PSBcInJ0bFwiID8gLTEgOiAxO1xuICBsZXQgY3VycmVudEVsZW1lbnQgPSBsb2NhdGlvbjtcbiAgbGV0IGF2YWlsYWJsZVNjcm9sbCA9IDA7XG4gIGxldCBhdmFpbGFibGVTY3JvbGxUb3AgPSAwO1xuICBsZXQgd3JhcHBlclJlYWNoZWQgPSBmYWxzZTtcbiAgZG8ge1xuICAgIGNvbnN0IFtjbGllbnRTaXplLCBzY3JvbGxPZmZzZXQsIHNjcm9sbFNpemVdID0gZ2V0U2Nyb2xsRGltZW5zaW9ucyhcbiAgICAgIGN1cnJlbnRFbGVtZW50LFxuICAgICAgYXhpc1xuICAgICk7XG4gICAgY29uc3Qgc2Nyb2xsZWQgPSBzY3JvbGxTaXplIC0gY2xpZW50U2l6ZSAtIGRpcmVjdGlvbkZhY3RvciAqIHNjcm9sbE9mZnNldDtcbiAgICBpZiAoKHNjcm9sbE9mZnNldCAhPT0gMCB8fCBzY3JvbGxlZCAhPT0gMCkgJiYgaXNTY3JvbGxDb250YWluZXIoY3VycmVudEVsZW1lbnQsIGF4aXMpKSB7XG4gICAgICBhdmFpbGFibGVTY3JvbGwgKz0gc2Nyb2xsZWQ7XG4gICAgICBhdmFpbGFibGVTY3JvbGxUb3AgKz0gc2Nyb2xsT2Zmc2V0O1xuICAgIH1cbiAgICBpZiAoY3VycmVudEVsZW1lbnQgPT09IChzdG9wQXQgPz8gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KSkge1xuICAgICAgd3JhcHBlclJlYWNoZWQgPSB0cnVlO1xuICAgIH0gZWxzZSB7XG4gICAgICBjdXJyZW50RWxlbWVudCA9IGN1cnJlbnRFbGVtZW50Ll8kaG9zdCA/PyBjdXJyZW50RWxlbWVudC5wYXJlbnRFbGVtZW50O1xuICAgIH1cbiAgfSB3aGlsZSAoY3VycmVudEVsZW1lbnQgJiYgIXdyYXBwZXJSZWFjaGVkKTtcbiAgcmV0dXJuIFthdmFpbGFibGVTY3JvbGwsIGF2YWlsYWJsZVNjcm9sbFRvcF07XG59O1xuZXhwb3J0IHtcbiAgZ2V0U2Nyb2xsQXRMb2NhdGlvblxufTtcbiIsIi8vIHNyYy9wcmV2ZW50U2Nyb2xsLnRzXG5pbXBvcnQgeyBhY2Nlc3MgfSBmcm9tIFwiQGNvcnZ1L3V0aWxzL3JlYWN0aXZpdHlcIjtcbmltcG9ydCB7XG4gIGNyZWF0ZUVmZmVjdCxcbiAgY3JlYXRlU2lnbmFsLFxuICBjcmVhdGVVbmlxdWVJZCxcbiAgbWVyZ2VQcm9wcyxcbiAgb25DbGVhbnVwXG59IGZyb20gXCJzb2xpZC1qc1wiO1xuaW1wb3J0IGNyZWF0ZVN0eWxlIGZyb20gXCJAY29ydnUvdXRpbHMvY3JlYXRlL3N0eWxlXCI7XG5pbXBvcnQgeyBnZXRTY3JvbGxBdExvY2F0aW9uIH0gZnJvbSBcIkBjb3J2dS91dGlscy9zY3JvbGxcIjtcbnZhciBbcHJldmVudFNjcm9sbFN0YWNrLCBzZXRQcmV2ZW50U2Nyb2xsU3RhY2tdID0gY3JlYXRlU2lnbmFsKFtdKTtcbnZhciBpc0FjdGl2ZSA9IChpZCkgPT4gcHJldmVudFNjcm9sbFN0YWNrKCkuaW5kZXhPZihpZCkgPT09IHByZXZlbnRTY3JvbGxTdGFjaygpLmxlbmd0aCAtIDE7XG52YXIgY3JlYXRlUHJldmVudFNjcm9sbCA9IChwcm9wcykgPT4ge1xuICBjb25zdCBkZWZhdWx0ZWRQcm9wcyA9IG1lcmdlUHJvcHMoXG4gICAge1xuICAgICAgZWxlbWVudDogbnVsbCxcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBoaWRlU2Nyb2xsYmFyOiB0cnVlLFxuICAgICAgcHJldmVudFNjcm9sbGJhclNoaWZ0OiB0cnVlLFxuICAgICAgcHJldmVudFNjcm9sbGJhclNoaWZ0TW9kZTogXCJwYWRkaW5nXCIsXG4gICAgICByZXN0b3JlU2Nyb2xsUG9zaXRpb246IHRydWUsXG4gICAgICBhbGxvd1BpbmNoWm9vbTogZmFsc2VcbiAgICB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IHByZXZlbnRTY3JvbGxJZCA9IGNyZWF0ZVVuaXF1ZUlkKCk7XG4gIGxldCBjdXJyZW50VG91Y2hTdGFydCA9IFswLCAwXTtcbiAgbGV0IGN1cnJlbnRUb3VjaFN0YXJ0QXhpcyA9IG51bGw7XG4gIGxldCBjdXJyZW50VG91Y2hTdGFydERlbHRhID0gbnVsbDtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoIWFjY2VzcyhkZWZhdWx0ZWRQcm9wcy5lbmFibGVkKSkgcmV0dXJuO1xuICAgIHNldFByZXZlbnRTY3JvbGxTdGFjaygoc3RhY2spID0+IFsuLi5zdGFjaywgcHJldmVudFNjcm9sbElkXSk7XG4gICAgb25DbGVhbnVwKCgpID0+IHtcbiAgICAgIHNldFByZXZlbnRTY3JvbGxTdGFjayhcbiAgICAgICAgKHN0YWNrKSA9PiBzdGFjay5maWx0ZXIoKGlkKSA9PiBpZCAhPT0gcHJldmVudFNjcm9sbElkKVxuICAgICAgKTtcbiAgICB9KTtcbiAgfSk7XG4gIGNyZWF0ZUVmZmVjdCgoKSA9PiB7XG4gICAgaWYgKCFhY2Nlc3MoZGVmYXVsdGVkUHJvcHMuZW5hYmxlZCkgfHwgIWFjY2VzcyhkZWZhdWx0ZWRQcm9wcy5oaWRlU2Nyb2xsYmFyKSlcbiAgICAgIHJldHVybjtcbiAgICBjb25zdCB7IGJvZHkgfSA9IGRvY3VtZW50O1xuICAgIGNvbnN0IHNjcm9sbGJhcldpZHRoID0gd2luZG93LmlubmVyV2lkdGggLSBib2R5Lm9mZnNldFdpZHRoO1xuICAgIGlmIChhY2Nlc3MoZGVmYXVsdGVkUHJvcHMucHJldmVudFNjcm9sbGJhclNoaWZ0KSkge1xuICAgICAgY29uc3Qgc3R5bGUgPSB7IG92ZXJmbG93OiBcImhpZGRlblwiIH07XG4gICAgICBjb25zdCBwcm9wZXJ0aWVzID0gW107XG4gICAgICBpZiAoc2Nyb2xsYmFyV2lkdGggPiAwKSB7XG4gICAgICAgIGlmIChhY2Nlc3MoZGVmYXVsdGVkUHJvcHMucHJldmVudFNjcm9sbGJhclNoaWZ0TW9kZSkgPT09IFwicGFkZGluZ1wiKSB7XG4gICAgICAgICAgc3R5bGUucGFkZGluZ1JpZ2h0ID0gYGNhbGMoJHt3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShib2R5KS5wYWRkaW5nUmlnaHR9ICsgJHtzY3JvbGxiYXJXaWR0aH1weClgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0eWxlLm1hcmdpblJpZ2h0ID0gYGNhbGMoJHt3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShib2R5KS5tYXJnaW5SaWdodH0gKyAke3Njcm9sbGJhcldpZHRofXB4KWA7XG4gICAgICAgIH1cbiAgICAgICAgcHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IFwiLS1zY3JvbGxiYXItd2lkdGhcIixcbiAgICAgICAgICB2YWx1ZTogYCR7c2Nyb2xsYmFyV2lkdGh9cHhgXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgY29uc3Qgb2Zmc2V0VG9wID0gd2luZG93LnNjcm9sbFk7XG4gICAgICBjb25zdCBvZmZzZXRMZWZ0ID0gd2luZG93LnNjcm9sbFg7XG4gICAgICBjcmVhdGVTdHlsZSh7XG4gICAgICAgIGtleTogXCJwcmV2ZW50LXNjcm9sbFwiLFxuICAgICAgICBlbGVtZW50OiBib2R5LFxuICAgICAgICBzdHlsZSxcbiAgICAgICAgcHJvcGVydGllcyxcbiAgICAgICAgY2xlYW51cDogKCkgPT4ge1xuICAgICAgICAgIGlmIChhY2Nlc3MoZGVmYXVsdGVkUHJvcHMucmVzdG9yZVNjcm9sbFBvc2l0aW9uKSAmJiBzY3JvbGxiYXJXaWR0aCA+IDApIHtcbiAgICAgICAgICAgIHdpbmRvdy5zY3JvbGxUbyhvZmZzZXRMZWZ0LCBvZmZzZXRUb3ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNyZWF0ZVN0eWxlKHtcbiAgICAgICAga2V5OiBcInByZXZlbnQtc2Nyb2xsXCIsXG4gICAgICAgIGVsZW1lbnQ6IGJvZHksXG4gICAgICAgIHN0eWxlOiB7XG4gICAgICAgICAgb3ZlcmZsb3c6IFwiaGlkZGVuXCJcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoIWlzQWN0aXZlKHByZXZlbnRTY3JvbGxJZCkgfHwgIWFjY2VzcyhkZWZhdWx0ZWRQcm9wcy5lbmFibGVkKSkgcmV0dXJuO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJ3aGVlbFwiLCBtYXliZVByZXZlbnRXaGVlbCwge1xuICAgICAgcGFzc2l2ZTogZmFsc2VcbiAgICB9KTtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCBsb2dUb3VjaFN0YXJ0LCB7XG4gICAgICBwYXNzaXZlOiBmYWxzZVxuICAgIH0pO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgbWF5YmVQcmV2ZW50VG91Y2gsIHtcbiAgICAgIHBhc3NpdmU6IGZhbHNlXG4gICAgfSk7XG4gICAgb25DbGVhbnVwKCgpID0+IHtcbiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ3aGVlbFwiLCBtYXliZVByZXZlbnRXaGVlbCk7XG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCBsb2dUb3VjaFN0YXJ0KTtcbiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgbWF5YmVQcmV2ZW50VG91Y2gpO1xuICAgIH0pO1xuICB9KTtcbiAgY29uc3QgbG9nVG91Y2hTdGFydCA9IChldmVudCkgPT4ge1xuICAgIGN1cnJlbnRUb3VjaFN0YXJ0ID0gZ2V0VG91Y2hYWShldmVudCk7XG4gICAgY3VycmVudFRvdWNoU3RhcnRBeGlzID0gbnVsbDtcbiAgICBjdXJyZW50VG91Y2hTdGFydERlbHRhID0gbnVsbDtcbiAgfTtcbiAgY29uc3QgbWF5YmVQcmV2ZW50V2hlZWwgPSAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG4gICAgY29uc3Qgd3JhcHBlciA9IGFjY2VzcyhkZWZhdWx0ZWRQcm9wcy5lbGVtZW50KTtcbiAgICBjb25zdCBkZWx0YSA9IGdldERlbHRhWFkoZXZlbnQpO1xuICAgIGNvbnN0IGF4aXMgPSBNYXRoLmFicyhkZWx0YVswXSkgPiBNYXRoLmFicyhkZWx0YVsxXSkgPyBcInhcIiA6IFwieVwiO1xuICAgIGNvbnN0IGF4aXNEZWx0YSA9IGF4aXMgPT09IFwieFwiID8gZGVsdGFbMF0gOiBkZWx0YVsxXTtcbiAgICBjb25zdCByZXN1bHRzSW5TY3JvbGwgPSB3b3VsZFNjcm9sbCh0YXJnZXQsIGF4aXMsIGF4aXNEZWx0YSwgd3JhcHBlcik7XG4gICAgbGV0IHNob3VsZENhbmNlbDtcbiAgICBpZiAod3JhcHBlciAmJiBjb250YWlucyh3cmFwcGVyLCB0YXJnZXQpKSB7XG4gICAgICBzaG91bGRDYW5jZWwgPSAhcmVzdWx0c0luU2Nyb2xsO1xuICAgIH0gZWxzZSB7XG4gICAgICBzaG91bGRDYW5jZWwgPSB0cnVlO1xuICAgIH1cbiAgICBpZiAoc2hvdWxkQ2FuY2VsICYmIGV2ZW50LmNhbmNlbGFibGUpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxuICB9O1xuICBjb25zdCBtYXliZVByZXZlbnRUb3VjaCA9IChldmVudCkgPT4ge1xuICAgIGNvbnN0IHdyYXBwZXIgPSBhY2Nlc3MoZGVmYXVsdGVkUHJvcHMuZWxlbWVudCk7XG4gICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0O1xuICAgIGxldCBzaG91bGRDYW5jZWw7XG4gICAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoID09PSAyKSB7XG4gICAgICBzaG91bGRDYW5jZWwgPSAhYWNjZXNzKGRlZmF1bHRlZFByb3BzLmFsbG93UGluY2hab29tKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGN1cnJlbnRUb3VjaFN0YXJ0QXhpcyA9PSBudWxsIHx8IGN1cnJlbnRUb3VjaFN0YXJ0RGVsdGEgPT09IG51bGwpIHtcbiAgICAgICAgY29uc3QgZGVsdGEgPSBnZXRUb3VjaFhZKGV2ZW50KS5tYXAoXG4gICAgICAgICAgKHRvdWNoLCBpKSA9PiBjdXJyZW50VG91Y2hTdGFydFtpXSAtIHRvdWNoXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IGF4aXMgPSBNYXRoLmFicyhkZWx0YVswXSkgPiBNYXRoLmFicyhkZWx0YVsxXSkgPyBcInhcIiA6IFwieVwiO1xuICAgICAgICBjdXJyZW50VG91Y2hTdGFydEF4aXMgPSBheGlzO1xuICAgICAgICBjdXJyZW50VG91Y2hTdGFydERlbHRhID0gYXhpcyA9PT0gXCJ4XCIgPyBkZWx0YVswXSA6IGRlbHRhWzFdO1xuICAgICAgfVxuICAgICAgaWYgKHRhcmdldC50eXBlID09PSBcInJhbmdlXCIpIHtcbiAgICAgICAgc2hvdWxkQ2FuY2VsID0gZmFsc2U7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCB3b3VsZFJlc3VsdEluU2Nyb2xsID0gd291bGRTY3JvbGwoXG4gICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgIGN1cnJlbnRUb3VjaFN0YXJ0QXhpcyxcbiAgICAgICAgICBjdXJyZW50VG91Y2hTdGFydERlbHRhLFxuICAgICAgICAgIHdyYXBwZXJcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHdyYXBwZXIgJiYgY29udGFpbnMod3JhcHBlciwgdGFyZ2V0KSkge1xuICAgICAgICAgIHNob3VsZENhbmNlbCA9ICF3b3VsZFJlc3VsdEluU2Nyb2xsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNob3VsZENhbmNlbCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHNob3VsZENhbmNlbCAmJiBldmVudC5jYW5jZWxhYmxlKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbiAgfTtcbn07XG52YXIgZ2V0RGVsdGFYWSA9IChldmVudCkgPT4gW1xuICBldmVudC5kZWx0YVgsXG4gIGV2ZW50LmRlbHRhWVxuXTtcbnZhciBnZXRUb3VjaFhZID0gKGV2ZW50KSA9PiBldmVudC5jaGFuZ2VkVG91Y2hlc1swXSA/IFtldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRYLCBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRZXSA6IFswLCAwXTtcbnZhciB3b3VsZFNjcm9sbCA9ICh0YXJnZXQsIGF4aXMsIGRlbHRhLCB3cmFwcGVyKSA9PiB7XG4gIGNvbnN0IHRhcmdldEluV3JhcHBlciA9IHdyYXBwZXIgIT09IG51bGwgJiYgY29udGFpbnMod3JhcHBlciwgdGFyZ2V0KTtcbiAgY29uc3QgW2F2YWlsYWJsZVNjcm9sbCwgYXZhaWxhYmxlU2Nyb2xsVG9wXSA9IGdldFNjcm9sbEF0TG9jYXRpb24oXG4gICAgdGFyZ2V0LFxuICAgIGF4aXMsXG4gICAgdGFyZ2V0SW5XcmFwcGVyID8gd3JhcHBlciA6IHZvaWQgMFxuICApO1xuICBpZiAoZGVsdGEgPiAwICYmIE1hdGguYWJzKGF2YWlsYWJsZVNjcm9sbCkgPD0gMSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZGVsdGEgPCAwICYmIE1hdGguYWJzKGF2YWlsYWJsZVNjcm9sbFRvcCkgPCAxKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufTtcbnZhciBjb250YWlucyA9ICh3cmFwcGVyLCB0YXJnZXQpID0+IHtcbiAgaWYgKHdyYXBwZXIuY29udGFpbnModGFyZ2V0KSkgcmV0dXJuIHRydWU7XG4gIGxldCBjdXJyZW50RWxlbWVudCA9IHRhcmdldDtcbiAgd2hpbGUgKGN1cnJlbnRFbGVtZW50KSB7XG4gICAgaWYgKGN1cnJlbnRFbGVtZW50ID09PSB3cmFwcGVyKSByZXR1cm4gdHJ1ZTtcbiAgICBjdXJyZW50RWxlbWVudCA9IGN1cnJlbnRFbGVtZW50Ll8kaG9zdCA/PyBjdXJyZW50RWxlbWVudC5wYXJlbnRFbGVtZW50O1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG52YXIgcHJldmVudFNjcm9sbF9kZWZhdWx0ID0gY3JlYXRlUHJldmVudFNjcm9sbDtcblxuLy8gc3JjL2luZGV4LnRzXG52YXIgc3JjX2RlZmF1bHQgPSBwcmV2ZW50U2Nyb2xsX2RlZmF1bHQ7XG5leHBvcnQge1xuICBzcmNfZGVmYXVsdCBhcyBkZWZhdWx0XG59O1xuIiwiLy8gc3JjL3ByZXNlbmNlLnRzXG5pbXBvcnQgeyBhY2Nlc3MgfSBmcm9tIFwiQGNvcnZ1L3V0aWxzL3JlYWN0aXZpdHlcIjtcbmltcG9ydCB7XG4gIGNyZWF0ZUVmZmVjdCxcbiAgY3JlYXRlTWVtbyxcbiAgY3JlYXRlU2lnbmFsLFxuICBvbkNsZWFudXAsXG4gIHVudHJhY2tcbn0gZnJvbSBcInNvbGlkLWpzXCI7XG52YXIgY3JlYXRlUHJlc2VuY2UgPSAocHJvcHMpID0+IHtcbiAgY29uc3QgcmVmU3R5bGVzID0gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgY29uc3QgZWxlbWVudCA9IGFjY2Vzcyhwcm9wcy5lbGVtZW50KTtcbiAgICBpZiAoIWVsZW1lbnQpIHJldHVybjtcbiAgICByZXR1cm4gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgfSk7XG4gIGNvbnN0IGdldEFuaW1hdGlvbk5hbWUgPSAoKSA9PiB7XG4gICAgcmV0dXJuIHJlZlN0eWxlcygpPy5hbmltYXRpb25OYW1lID8/IFwibm9uZVwiO1xuICB9O1xuICBjb25zdCBbcHJlc2VudFN0YXRlLCBzZXRQcmVzZW50U3RhdGVdID0gY3JlYXRlU2lnbmFsKGFjY2Vzcyhwcm9wcy5zaG93KSA/IFwicHJlc2VudFwiIDogXCJoaWRkZW5cIik7XG4gIGxldCBhbmltYXRpb25OYW1lID0gXCJub25lXCI7XG4gIGNyZWF0ZUVmZmVjdCgocHJldlNob3cpID0+IHtcbiAgICBjb25zdCBzaG93ID0gYWNjZXNzKHByb3BzLnNob3cpO1xuICAgIHVudHJhY2soKCkgPT4ge1xuICAgICAgaWYgKHByZXZTaG93ID09PSBzaG93KSByZXR1cm4gc2hvdztcbiAgICAgIGNvbnN0IHByZXZBbmltYXRpb25OYW1lID0gYW5pbWF0aW9uTmFtZTtcbiAgICAgIGNvbnN0IGN1cnJlbnRBbmltYXRpb25OYW1lID0gZ2V0QW5pbWF0aW9uTmFtZSgpO1xuICAgICAgaWYgKHNob3cpIHtcbiAgICAgICAgc2V0UHJlc2VudFN0YXRlKFwicHJlc2VudFwiKTtcbiAgICAgIH0gZWxzZSBpZiAoY3VycmVudEFuaW1hdGlvbk5hbWUgPT09IFwibm9uZVwiIHx8IHJlZlN0eWxlcygpPy5kaXNwbGF5ID09PSBcIm5vbmVcIikge1xuICAgICAgICBzZXRQcmVzZW50U3RhdGUoXCJoaWRkZW5cIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBpc0FuaW1hdGluZyA9IHByZXZBbmltYXRpb25OYW1lICE9PSBjdXJyZW50QW5pbWF0aW9uTmFtZTtcbiAgICAgICAgaWYgKHByZXZTaG93ID09PSB0cnVlICYmIGlzQW5pbWF0aW5nKSB7XG4gICAgICAgICAgc2V0UHJlc2VudFN0YXRlKFwiaGlkaW5nXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNldFByZXNlbnRTdGF0ZShcImhpZGRlblwiKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBzaG93O1xuICB9KTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICBjb25zdCBlbGVtZW50ID0gYWNjZXNzKHByb3BzLmVsZW1lbnQpO1xuICAgIGlmICghZWxlbWVudCkgcmV0dXJuO1xuICAgIGNvbnN0IGhhbmRsZUFuaW1hdGlvblN0YXJ0ID0gKGV2ZW50KSA9PiB7XG4gICAgICBpZiAoZXZlbnQudGFyZ2V0ID09PSBlbGVtZW50KSB7XG4gICAgICAgIGFuaW1hdGlvbk5hbWUgPSBnZXRBbmltYXRpb25OYW1lKCk7XG4gICAgICB9XG4gICAgfTtcbiAgICBjb25zdCBoYW5kbGVBbmltYXRpb25FbmQgPSAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRBbmltYXRpb25OYW1lID0gZ2V0QW5pbWF0aW9uTmFtZSgpO1xuICAgICAgY29uc3QgaXNDdXJyZW50QW5pbWF0aW9uID0gY3VycmVudEFuaW1hdGlvbk5hbWUuaW5jbHVkZXMoXG4gICAgICAgIGV2ZW50LmFuaW1hdGlvbk5hbWVcbiAgICAgICk7XG4gICAgICBpZiAoZXZlbnQudGFyZ2V0ID09PSBlbGVtZW50ICYmIGlzQ3VycmVudEFuaW1hdGlvbiAmJiBwcmVzZW50U3RhdGUoKSA9PT0gXCJoaWRpbmdcIikge1xuICAgICAgICBzZXRQcmVzZW50U3RhdGUoXCJoaWRkZW5cIik7XG4gICAgICB9XG4gICAgfTtcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJhbmltYXRpb25zdGFydFwiLCBoYW5kbGVBbmltYXRpb25TdGFydCk7XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKFwiYW5pbWF0aW9uY2FuY2VsXCIsIGhhbmRsZUFuaW1hdGlvbkVuZCk7XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKFwiYW5pbWF0aW9uZW5kXCIsIGhhbmRsZUFuaW1hdGlvbkVuZCk7XG4gICAgb25DbGVhbnVwKCgpID0+IHtcbiAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFuaW1hdGlvbnN0YXJ0XCIsIGhhbmRsZUFuaW1hdGlvblN0YXJ0KTtcbiAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFuaW1hdGlvbmNhbmNlbFwiLCBoYW5kbGVBbmltYXRpb25FbmQpO1xuICAgICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYW5pbWF0aW9uZW5kXCIsIGhhbmRsZUFuaW1hdGlvbkVuZCk7XG4gICAgfSk7XG4gIH0pO1xuICByZXR1cm4ge1xuICAgIHByZXNlbnQ6ICgpID0+IHByZXNlbnRTdGF0ZSgpID09PSBcInByZXNlbnRcIiB8fCBwcmVzZW50U3RhdGUoKSA9PT0gXCJoaWRpbmdcIixcbiAgICBzdGF0ZTogcHJlc2VudFN0YXRlXG4gIH07XG59O1xudmFyIHByZXNlbmNlX2RlZmF1bHQgPSBjcmVhdGVQcmVzZW5jZTtcblxuLy8gc3JjL2luZGV4LnRzXG52YXIgc3JjX2RlZmF1bHQgPSBwcmVzZW5jZV9kZWZhdWx0O1xuZXhwb3J0IHtcbiAgc3JjX2RlZmF1bHQgYXMgZGVmYXVsdFxufTtcbiIsImltcG9ydCB7XG4gIGNyZWF0ZUZvY3VzU2NvcGVcbn0gZnJvbSBcIi4vN0EzR0RGNFkuanN4XCI7XG5pbXBvcnQge1xuICBjcmVhdGVIaWRlT3V0c2lkZVxufSBmcm9tIFwiLi9QNlhVNzVaRy5qc3hcIjtcbmltcG9ydCB7XG4gIERpc21pc3NhYmxlTGF5ZXJcbn0gZnJvbSBcIi4vTk5HTVJZMk8uanN4XCI7XG5pbXBvcnQge1xuICBjcmVhdGVEaXNjbG9zdXJlU3RhdGVcbn0gZnJvbSBcIi4vRTUzREI3QlMuanN4XCI7XG5pbXBvcnQge1xuICBCdXR0b25Sb290XG59IGZyb20gXCIuL1NBMjdWNVlKLmpzeFwiO1xuaW1wb3J0IHtcbiAgY3JlYXRlUmVnaXN0ZXJJZFxufSBmcm9tIFwiLi9KTkNDRjZNUC5qc3hcIjtcbmltcG9ydCB7XG4gIFBvbHltb3JwaGljXG59IGZyb20gXCIuL0U3M1BLRkIzLmpzeFwiO1xuaW1wb3J0IHtcbiAgX19leHBvcnRcbn0gZnJvbSBcIi4vNVdYSEpEQ1ouanN4XCI7XG5cbi8vIHNyYy9kaWFsb2cvaW5kZXgudHN4XG52YXIgZGlhbG9nX2V4cG9ydHMgPSB7fTtcbl9fZXhwb3J0KGRpYWxvZ19leHBvcnRzLCB7XG4gIENsb3NlQnV0dG9uOiAoKSA9PiBEaWFsb2dDbG9zZUJ1dHRvbixcbiAgQ29udGVudDogKCkgPT4gRGlhbG9nQ29udGVudCxcbiAgRGVzY3JpcHRpb246ICgpID0+IERpYWxvZ0Rlc2NyaXB0aW9uLFxuICBEaWFsb2c6ICgpID0+IERpYWxvZyxcbiAgT3ZlcmxheTogKCkgPT4gRGlhbG9nT3ZlcmxheSxcbiAgUG9ydGFsOiAoKSA9PiBEaWFsb2dQb3J0YWwsXG4gIFJvb3Q6ICgpID0+IERpYWxvZ1Jvb3QsXG4gIFRpdGxlOiAoKSA9PiBEaWFsb2dUaXRsZSxcbiAgVHJpZ2dlcjogKCkgPT4gRGlhbG9nVHJpZ2dlclxufSk7XG5cbi8vIHNyYy9kaWFsb2cvZGlhbG9nLWNsb3NlLWJ1dHRvbi50c3hcbmltcG9ydCB7IGNhbGxIYW5kbGVyIH0gZnJvbSBcIkBrb2JhbHRlL3V0aWxzXCI7XG5pbXBvcnQgeyBzcGxpdFByb3BzIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5cbi8vIHNyYy9kaWFsb2cvZGlhbG9nLWNvbnRleHQudHN4XG5pbXBvcnQgeyBjcmVhdGVDb250ZXh0LCB1c2VDb250ZXh0IH0gZnJvbSBcInNvbGlkLWpzXCI7XG52YXIgRGlhbG9nQ29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcbmZ1bmN0aW9uIHVzZURpYWxvZ0NvbnRleHQoKSB7XG4gIGNvbnN0IGNvbnRleHQgPSB1c2VDb250ZXh0KERpYWxvZ0NvbnRleHQpO1xuICBpZiAoY29udGV4dCA9PT0gdm9pZCAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJba29iYWx0ZV06IGB1c2VEaWFsb2dDb250ZXh0YCBtdXN0IGJlIHVzZWQgd2l0aGluIGEgYERpYWxvZ2AgY29tcG9uZW50XCJcbiAgICApO1xuICB9XG4gIHJldHVybiBjb250ZXh0O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy1jbG9zZS1idXR0b24udHN4XG5mdW5jdGlvbiBEaWFsb2dDbG9zZUJ1dHRvbihwcm9wcykge1xuICBjb25zdCBjb250ZXh0ID0gdXNlRGlhbG9nQ29udGV4dCgpO1xuICBjb25zdCBbbG9jYWwsIG90aGVyc10gPSBzcGxpdFByb3BzKHByb3BzLCBbXG4gICAgXCJhcmlhLWxhYmVsXCIsXG4gICAgXCJvbkNsaWNrXCJcbiAgXSk7XG4gIGNvbnN0IG9uQ2xpY2sgPSAoZSkgPT4ge1xuICAgIGNhbGxIYW5kbGVyKGUsIGxvY2FsLm9uQ2xpY2spO1xuICAgIGNvbnRleHQuY2xvc2UoKTtcbiAgfTtcbiAgcmV0dXJuIDxCdXR0b25Sb290XG4gICAgYXJpYS1sYWJlbD17bG9jYWxbXCJhcmlhLWxhYmVsXCJdIHx8IGNvbnRleHQudHJhbnNsYXRpb25zKCkuZGlzbWlzc31cbiAgICBvbkNsaWNrPXtvbkNsaWNrfVxuICAgIHsuLi5vdGhlcnN9XG4gIC8+O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy1jb250ZW50LnRzeFxuaW1wb3J0IHtcbiAgY29udGFpbnMsXG4gIGZvY3VzV2l0aG91dFNjcm9sbGluZyxcbiAgbWVyZ2VEZWZhdWx0UHJvcHMsXG4gIG1lcmdlUmVmc1xufSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7XG4gIFNob3csXG4gIGNyZWF0ZUVmZmVjdCxcbiAgb25DbGVhbnVwLFxuICBzcGxpdFByb3BzIGFzIHNwbGl0UHJvcHMyXG59IGZyb20gXCJzb2xpZC1qc1wiO1xuaW1wb3J0IGNyZWF0ZVByZXZlbnRTY3JvbGwgZnJvbSBcInNvbGlkLXByZXZlbnQtc2Nyb2xsXCI7XG5mdW5jdGlvbiBEaWFsb2dDb250ZW50KHByb3BzKSB7XG4gIGxldCByZWY7XG4gIGNvbnN0IGNvbnRleHQgPSB1c2VEaWFsb2dDb250ZXh0KCk7XG4gIGNvbnN0IG1lcmdlZFByb3BzID0gbWVyZ2VEZWZhdWx0UHJvcHMoXG4gICAge1xuICAgICAgaWQ6IGNvbnRleHQuZ2VuZXJhdGVJZChcImNvbnRlbnRcIilcbiAgICB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IFtsb2NhbCwgb3RoZXJzXSA9IHNwbGl0UHJvcHMyKG1lcmdlZFByb3BzLCBbXG4gICAgXCJyZWZcIixcbiAgICBcIm9uT3BlbkF1dG9Gb2N1c1wiLFxuICAgIFwib25DbG9zZUF1dG9Gb2N1c1wiLFxuICAgIFwib25Qb2ludGVyRG93bk91dHNpZGVcIixcbiAgICBcIm9uRm9jdXNPdXRzaWRlXCIsXG4gICAgXCJvbkludGVyYWN0T3V0c2lkZVwiXG4gIF0pO1xuICBsZXQgaGFzSW50ZXJhY3RlZE91dHNpZGUgPSBmYWxzZTtcbiAgbGV0IGhhc1BvaW50ZXJEb3duT3V0c2lkZSA9IGZhbHNlO1xuICBjb25zdCBvblBvaW50ZXJEb3duT3V0c2lkZSA9IChlKSA9PiB7XG4gICAgbG9jYWwub25Qb2ludGVyRG93bk91dHNpZGU/LihlKTtcbiAgICBpZiAoY29udGV4dC5tb2RhbCgpICYmIGUuZGV0YWlsLmlzQ29udGV4dE1lbnUpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IG9uRm9jdXNPdXRzaWRlID0gKGUpID0+IHtcbiAgICBsb2NhbC5vbkZvY3VzT3V0c2lkZT8uKGUpO1xuICAgIGlmIChjb250ZXh0Lm1vZGFsKCkpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IG9uSW50ZXJhY3RPdXRzaWRlID0gKGUpID0+IHtcbiAgICBsb2NhbC5vbkludGVyYWN0T3V0c2lkZT8uKGUpO1xuICAgIGlmIChjb250ZXh0Lm1vZGFsKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFlLmRlZmF1bHRQcmV2ZW50ZWQpIHtcbiAgICAgIGhhc0ludGVyYWN0ZWRPdXRzaWRlID0gdHJ1ZTtcbiAgICAgIGlmIChlLmRldGFpbC5vcmlnaW5hbEV2ZW50LnR5cGUgPT09IFwicG9pbnRlcmRvd25cIikge1xuICAgICAgICBoYXNQb2ludGVyRG93bk91dHNpZGUgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoY29udGFpbnMoY29udGV4dC50cmlnZ2VyUmVmKCksIGUudGFyZ2V0KSkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbiAgICBpZiAoZS5kZXRhaWwub3JpZ2luYWxFdmVudC50eXBlID09PSBcImZvY3VzaW5cIiAmJiBoYXNQb2ludGVyRG93bk91dHNpZGUpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IG9uQ2xvc2VBdXRvRm9jdXMgPSAoZSkgPT4ge1xuICAgIGxvY2FsLm9uQ2xvc2VBdXRvRm9jdXM/LihlKTtcbiAgICBpZiAoY29udGV4dC5tb2RhbCgpKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBmb2N1c1dpdGhvdXRTY3JvbGxpbmcoY29udGV4dC50cmlnZ2VyUmVmKCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWUuZGVmYXVsdFByZXZlbnRlZCkge1xuICAgICAgICBpZiAoIWhhc0ludGVyYWN0ZWRPdXRzaWRlKSB7XG4gICAgICAgICAgZm9jdXNXaXRob3V0U2Nyb2xsaW5nKGNvbnRleHQudHJpZ2dlclJlZigpKTtcbiAgICAgICAgfVxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9XG4gICAgICBoYXNJbnRlcmFjdGVkT3V0c2lkZSA9IGZhbHNlO1xuICAgICAgaGFzUG9pbnRlckRvd25PdXRzaWRlID0gZmFsc2U7XG4gICAgfVxuICB9O1xuICBjcmVhdGVIaWRlT3V0c2lkZSh7XG4gICAgaXNEaXNhYmxlZDogKCkgPT4gIShjb250ZXh0LmlzT3BlbigpICYmIGNvbnRleHQubW9kYWwoKSksXG4gICAgdGFyZ2V0czogKCkgPT4gcmVmID8gW3JlZl0gOiBbXVxuICB9KTtcbiAgY3JlYXRlUHJldmVudFNjcm9sbCh7XG4gICAgZWxlbWVudDogKCkgPT4gcmVmID8/IG51bGwsXG4gICAgZW5hYmxlZDogKCkgPT4gY29udGV4dC5pc09wZW4oKSAmJiBjb250ZXh0LnByZXZlbnRTY3JvbGwoKVxuICB9KTtcbiAgY3JlYXRlRm9jdXNTY29wZShcbiAgICB7XG4gICAgICB0cmFwRm9jdXM6ICgpID0+IGNvbnRleHQuaXNPcGVuKCkgJiYgY29udGV4dC5tb2RhbCgpLFxuICAgICAgb25Nb3VudEF1dG9Gb2N1czogbG9jYWwub25PcGVuQXV0b0ZvY3VzLFxuICAgICAgb25Vbm1vdW50QXV0b0ZvY3VzOiBvbkNsb3NlQXV0b0ZvY3VzXG4gICAgfSxcbiAgICAoKSA9PiByZWZcbiAgKTtcbiAgY3JlYXRlRWZmZWN0KCgpID0+IG9uQ2xlYW51cChjb250ZXh0LnJlZ2lzdGVyQ29udGVudElkKG90aGVycy5pZCkpKTtcbiAgcmV0dXJuIDxTaG93IHdoZW49e2NvbnRleHQuY29udGVudFByZXNlbnQoKX0+PERpc21pc3NhYmxlTGF5ZXJcbiAgICByZWY9e21lcmdlUmVmcygoZWwpID0+IHtcbiAgICAgIGNvbnRleHQuc2V0Q29udGVudFJlZihlbCk7XG4gICAgICByZWYgPSBlbDtcbiAgICB9LCBsb2NhbC5yZWYpfVxuICAgIHJvbGU9XCJkaWFsb2dcIlxuICAgIHRhYkluZGV4PXstMX1cbiAgICBkaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHM9e2NvbnRleHQubW9kYWwoKSAmJiBjb250ZXh0LmlzT3BlbigpfVxuICAgIGV4Y2x1ZGVkRWxlbWVudHM9e1tjb250ZXh0LnRyaWdnZXJSZWZdfVxuICAgIGFyaWEtbGFiZWxsZWRieT17Y29udGV4dC50aXRsZUlkKCl9XG4gICAgYXJpYS1kZXNjcmliZWRieT17Y29udGV4dC5kZXNjcmlwdGlvbklkKCl9XG4gICAgZGF0YS1leHBhbmRlZD17Y29udGV4dC5pc09wZW4oKSA/IFwiXCIgOiB2b2lkIDB9XG4gICAgZGF0YS1jbG9zZWQ9eyFjb250ZXh0LmlzT3BlbigpID8gXCJcIiA6IHZvaWQgMH1cbiAgICBvblBvaW50ZXJEb3duT3V0c2lkZT17b25Qb2ludGVyRG93bk91dHNpZGV9XG4gICAgb25Gb2N1c091dHNpZGU9e29uRm9jdXNPdXRzaWRlfVxuICAgIG9uSW50ZXJhY3RPdXRzaWRlPXtvbkludGVyYWN0T3V0c2lkZX1cbiAgICBvbkRpc21pc3M9e2NvbnRleHQuY2xvc2V9XG4gICAgey4uLm90aGVyc31cbiAgLz48L1Nob3c+O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy1kZXNjcmlwdGlvbi50c3hcbmltcG9ydCB7IG1lcmdlRGVmYXVsdFByb3BzIGFzIG1lcmdlRGVmYXVsdFByb3BzMiB9IGZyb20gXCJAa29iYWx0ZS91dGlsc1wiO1xuaW1wb3J0IHsgY3JlYXRlRWZmZWN0IGFzIGNyZWF0ZUVmZmVjdDIsIG9uQ2xlYW51cCBhcyBvbkNsZWFudXAyLCBzcGxpdFByb3BzIGFzIHNwbGl0UHJvcHMzIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5mdW5jdGlvbiBEaWFsb2dEZXNjcmlwdGlvbihwcm9wcykge1xuICBjb25zdCBjb250ZXh0ID0gdXNlRGlhbG9nQ29udGV4dCgpO1xuICBjb25zdCBtZXJnZWRQcm9wcyA9IG1lcmdlRGVmYXVsdFByb3BzMihcbiAgICB7XG4gICAgICBpZDogY29udGV4dC5nZW5lcmF0ZUlkKFwiZGVzY3JpcHRpb25cIilcbiAgICB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IFtsb2NhbCwgb3RoZXJzXSA9IHNwbGl0UHJvcHMzKG1lcmdlZFByb3BzLCBbXCJpZFwiXSk7XG4gIGNyZWF0ZUVmZmVjdDIoKCkgPT4gb25DbGVhbnVwMihjb250ZXh0LnJlZ2lzdGVyRGVzY3JpcHRpb25JZChsb2NhbC5pZCkpKTtcbiAgcmV0dXJuIDxQb2x5bW9ycGhpY1xuICAgIGFzPVwicFwiXG4gICAgaWQ9e2xvY2FsLmlkfVxuICAgIHsuLi5vdGhlcnN9XG4gIC8+O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy1vdmVybGF5LnRzeFxuaW1wb3J0IHsgY2FsbEhhbmRsZXIgYXMgY2FsbEhhbmRsZXIyLCBtZXJnZVJlZnMgYXMgbWVyZ2VSZWZzMiB9IGZyb20gXCJAa29iYWx0ZS91dGlsc1wiO1xuaW1wb3J0IHsgU2hvdyBhcyBTaG93Miwgc3BsaXRQcm9wcyBhcyBzcGxpdFByb3BzNCB9IGZyb20gXCJzb2xpZC1qc1wiO1xuZnVuY3Rpb24gRGlhbG9nT3ZlcmxheShwcm9wcykge1xuICBjb25zdCBjb250ZXh0ID0gdXNlRGlhbG9nQ29udGV4dCgpO1xuICBjb25zdCBbbG9jYWwsIG90aGVyc10gPSBzcGxpdFByb3BzNChwcm9wcywgW1xuICAgIFwicmVmXCIsXG4gICAgXCJzdHlsZVwiLFxuICAgIFwib25Qb2ludGVyRG93blwiXG4gIF0pO1xuICBjb25zdCBvblBvaW50ZXJEb3duID0gKGUpID0+IHtcbiAgICBjYWxsSGFuZGxlcjIoZSwgbG9jYWwub25Qb2ludGVyRG93bik7XG4gICAgaWYgKGUudGFyZ2V0ID09PSBlLmN1cnJlbnRUYXJnZXQpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH07XG4gIHJldHVybiA8U2hvdzIgd2hlbj17Y29udGV4dC5vdmVybGF5UHJlc2VudCgpfT48UG9seW1vcnBoaWNcbiAgICBhcz1cImRpdlwiXG4gICAgcmVmPXttZXJnZVJlZnMyKGNvbnRleHQuc2V0T3ZlcmxheVJlZiwgbG9jYWwucmVmKX1cbiAgICBzdHlsZT17eyBcInBvaW50ZXItZXZlbnRzXCI6IFwiYXV0b1wiLCAuLi5sb2NhbC5zdHlsZSB9fVxuICAgIGRhdGEtZXhwYW5kZWQ9e2NvbnRleHQuaXNPcGVuKCkgPyBcIlwiIDogdm9pZCAwfVxuICAgIGRhdGEtY2xvc2VkPXshY29udGV4dC5pc09wZW4oKSA/IFwiXCIgOiB2b2lkIDB9XG4gICAgb25Qb2ludGVyRG93bj17b25Qb2ludGVyRG93bn1cbiAgICB7Li4ub3RoZXJzfVxuICAvPjwvU2hvdzI+O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy1wb3J0YWwudHN4XG5pbXBvcnQgeyBTaG93IGFzIFNob3czIH0gZnJvbSBcInNvbGlkLWpzXCI7XG5pbXBvcnQgeyBQb3J0YWwgfSBmcm9tIFwic29saWQtanMvd2ViXCI7XG5mdW5jdGlvbiBEaWFsb2dQb3J0YWwocHJvcHMpIHtcbiAgY29uc3QgY29udGV4dCA9IHVzZURpYWxvZ0NvbnRleHQoKTtcbiAgcmV0dXJuIDxTaG93MyB3aGVuPXtjb250ZXh0LmNvbnRlbnRQcmVzZW50KCkgfHwgY29udGV4dC5vdmVybGF5UHJlc2VudCgpfT48UG9ydGFsIHsuLi5wcm9wc30gLz48L1Nob3czPjtcbn1cblxuLy8gc3JjL2RpYWxvZy9kaWFsb2ctcm9vdC50c3hcbmltcG9ydCB7IGNyZWF0ZUdlbmVyYXRlSWQsIG1lcmdlRGVmYXVsdFByb3BzIGFzIG1lcmdlRGVmYXVsdFByb3BzMyB9IGZyb20gXCJAa29iYWx0ZS91dGlsc1wiO1xuaW1wb3J0IHsgY3JlYXRlU2lnbmFsLCBjcmVhdGVVbmlxdWVJZCB9IGZyb20gXCJzb2xpZC1qc1wiO1xuaW1wb3J0IGNyZWF0ZVByZXNlbmNlIGZyb20gXCJzb2xpZC1wcmVzZW5jZVwiO1xuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy5pbnRsLnRzXG52YXIgRElBTE9HX0lOVExfVFJBTlNMQVRJT05TID0ge1xuICAvLyBgYXJpYS1sYWJlbGAgb2YgRGlhbG9nLkNsb3NlQnV0dG9uLlxuICBkaXNtaXNzOiBcIkRpc21pc3NcIlxufTtcblxuLy8gc3JjL2RpYWxvZy9kaWFsb2ctcm9vdC50c3hcbmZ1bmN0aW9uIERpYWxvZ1Jvb3QocHJvcHMpIHtcbiAgY29uc3QgZGVmYXVsdElkID0gYGRpYWxvZy0ke2NyZWF0ZVVuaXF1ZUlkKCl9YDtcbiAgY29uc3QgbWVyZ2VkUHJvcHMgPSBtZXJnZURlZmF1bHRQcm9wczMoXG4gICAge1xuICAgICAgaWQ6IGRlZmF1bHRJZCxcbiAgICAgIG1vZGFsOiB0cnVlLFxuICAgICAgdHJhbnNsYXRpb25zOiBESUFMT0dfSU5UTF9UUkFOU0xBVElPTlNcbiAgICB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IFtjb250ZW50SWQsIHNldENvbnRlbnRJZF0gPSBjcmVhdGVTaWduYWwoKTtcbiAgY29uc3QgW3RpdGxlSWQsIHNldFRpdGxlSWRdID0gY3JlYXRlU2lnbmFsKCk7XG4gIGNvbnN0IFtkZXNjcmlwdGlvbklkLCBzZXREZXNjcmlwdGlvbklkXSA9IGNyZWF0ZVNpZ25hbCgpO1xuICBjb25zdCBbb3ZlcmxheVJlZiwgc2V0T3ZlcmxheVJlZl0gPSBjcmVhdGVTaWduYWwoKTtcbiAgY29uc3QgW2NvbnRlbnRSZWYsIHNldENvbnRlbnRSZWZdID0gY3JlYXRlU2lnbmFsKCk7XG4gIGNvbnN0IFt0cmlnZ2VyUmVmLCBzZXRUcmlnZ2VyUmVmXSA9IGNyZWF0ZVNpZ25hbCgpO1xuICBjb25zdCBkaXNjbG9zdXJlU3RhdGUgPSBjcmVhdGVEaXNjbG9zdXJlU3RhdGUoe1xuICAgIG9wZW46ICgpID0+IG1lcmdlZFByb3BzLm9wZW4sXG4gICAgZGVmYXVsdE9wZW46ICgpID0+IG1lcmdlZFByb3BzLmRlZmF1bHRPcGVuLFxuICAgIG9uT3BlbkNoYW5nZTogKGlzT3BlbikgPT4gbWVyZ2VkUHJvcHMub25PcGVuQ2hhbmdlPy4oaXNPcGVuKVxuICB9KTtcbiAgY29uc3Qgc2hvdWxkTW91bnQgPSAoKSA9PiBtZXJnZWRQcm9wcy5mb3JjZU1vdW50IHx8IGRpc2Nsb3N1cmVTdGF0ZS5pc09wZW4oKTtcbiAgY29uc3QgeyBwcmVzZW50OiBvdmVybGF5UHJlc2VudCB9ID0gY3JlYXRlUHJlc2VuY2Uoe1xuICAgIHNob3c6IHNob3VsZE1vdW50LFxuICAgIGVsZW1lbnQ6ICgpID0+IG92ZXJsYXlSZWYoKSA/PyBudWxsXG4gIH0pO1xuICBjb25zdCB7IHByZXNlbnQ6IGNvbnRlbnRQcmVzZW50IH0gPSBjcmVhdGVQcmVzZW5jZSh7XG4gICAgc2hvdzogc2hvdWxkTW91bnQsXG4gICAgZWxlbWVudDogKCkgPT4gY29udGVudFJlZigpID8/IG51bGxcbiAgfSk7XG4gIGNvbnN0IGNvbnRleHQgPSB7XG4gICAgdHJhbnNsYXRpb25zOiAoKSA9PiBtZXJnZWRQcm9wcy50cmFuc2xhdGlvbnMgPz8gRElBTE9HX0lOVExfVFJBTlNMQVRJT05TLFxuICAgIGlzT3BlbjogZGlzY2xvc3VyZVN0YXRlLmlzT3BlbixcbiAgICBtb2RhbDogKCkgPT4gbWVyZ2VkUHJvcHMubW9kYWwgPz8gdHJ1ZSxcbiAgICBwcmV2ZW50U2Nyb2xsOiAoKSA9PiBtZXJnZWRQcm9wcy5wcmV2ZW50U2Nyb2xsID8/IGNvbnRleHQubW9kYWwoKSxcbiAgICBjb250ZW50SWQsXG4gICAgdGl0bGVJZCxcbiAgICBkZXNjcmlwdGlvbklkLFxuICAgIHRyaWdnZXJSZWYsXG4gICAgb3ZlcmxheVJlZixcbiAgICBzZXRPdmVybGF5UmVmLFxuICAgIGNvbnRlbnRSZWYsXG4gICAgc2V0Q29udGVudFJlZixcbiAgICBvdmVybGF5UHJlc2VudCxcbiAgICBjb250ZW50UHJlc2VudCxcbiAgICBjbG9zZTogZGlzY2xvc3VyZVN0YXRlLmNsb3NlLFxuICAgIHRvZ2dsZTogZGlzY2xvc3VyZVN0YXRlLnRvZ2dsZSxcbiAgICBzZXRUcmlnZ2VyUmVmLFxuICAgIGdlbmVyYXRlSWQ6IGNyZWF0ZUdlbmVyYXRlSWQoKCkgPT4gbWVyZ2VkUHJvcHMuaWQpLFxuICAgIHJlZ2lzdGVyQ29udGVudElkOiBjcmVhdGVSZWdpc3RlcklkKHNldENvbnRlbnRJZCksXG4gICAgcmVnaXN0ZXJUaXRsZUlkOiBjcmVhdGVSZWdpc3RlcklkKHNldFRpdGxlSWQpLFxuICAgIHJlZ2lzdGVyRGVzY3JpcHRpb25JZDogY3JlYXRlUmVnaXN0ZXJJZChzZXREZXNjcmlwdGlvbklkKVxuICB9O1xuICByZXR1cm4gPERpYWxvZ0NvbnRleHQuUHJvdmlkZXIgdmFsdWU9e2NvbnRleHR9PnttZXJnZWRQcm9wcy5jaGlsZHJlbn08L0RpYWxvZ0NvbnRleHQuUHJvdmlkZXI+O1xufVxuXG4vLyBzcmMvZGlhbG9nL2RpYWxvZy10aXRsZS50c3hcbmltcG9ydCB7IG1lcmdlRGVmYXVsdFByb3BzIGFzIG1lcmdlRGVmYXVsdFByb3BzNCB9IGZyb20gXCJAa29iYWx0ZS91dGlsc1wiO1xuaW1wb3J0IHsgY3JlYXRlRWZmZWN0IGFzIGNyZWF0ZUVmZmVjdDMsIG9uQ2xlYW51cCBhcyBvbkNsZWFudXAzLCBzcGxpdFByb3BzIGFzIHNwbGl0UHJvcHM1IH0gZnJvbSBcInNvbGlkLWpzXCI7XG5mdW5jdGlvbiBEaWFsb2dUaXRsZShwcm9wcykge1xuICBjb25zdCBjb250ZXh0ID0gdXNlRGlhbG9nQ29udGV4dCgpO1xuICBjb25zdCBtZXJnZWRQcm9wcyA9IG1lcmdlRGVmYXVsdFByb3BzNChcbiAgICB7XG4gICAgICBpZDogY29udGV4dC5nZW5lcmF0ZUlkKFwidGl0bGVcIilcbiAgICB9LFxuICAgIHByb3BzXG4gICk7XG4gIGNvbnN0IFtsb2NhbCwgb3RoZXJzXSA9IHNwbGl0UHJvcHM1KG1lcmdlZFByb3BzLCBbXCJpZFwiXSk7XG4gIGNyZWF0ZUVmZmVjdDMoKCkgPT4gb25DbGVhbnVwMyhjb250ZXh0LnJlZ2lzdGVyVGl0bGVJZChsb2NhbC5pZCkpKTtcbiAgcmV0dXJuIDxQb2x5bW9ycGhpYyBhcz1cImgyXCIgaWQ9e2xvY2FsLmlkfSB7Li4ub3RoZXJzfSAvPjtcbn1cblxuLy8gc3JjL2RpYWxvZy9kaWFsb2ctdHJpZ2dlci50c3hcbmltcG9ydCB7IGNhbGxIYW5kbGVyIGFzIGNhbGxIYW5kbGVyMywgbWVyZ2VSZWZzIGFzIG1lcmdlUmVmczMgfSBmcm9tIFwiQGtvYmFsdGUvdXRpbHNcIjtcbmltcG9ydCB7IHNwbGl0UHJvcHMgYXMgc3BsaXRQcm9wczYgfSBmcm9tIFwic29saWQtanNcIjtcbmZ1bmN0aW9uIERpYWxvZ1RyaWdnZXIocHJvcHMpIHtcbiAgY29uc3QgY29udGV4dCA9IHVzZURpYWxvZ0NvbnRleHQoKTtcbiAgY29uc3QgW2xvY2FsLCBvdGhlcnNdID0gc3BsaXRQcm9wczYocHJvcHMsIFtcbiAgICBcInJlZlwiLFxuICAgIFwib25DbGlja1wiXG4gIF0pO1xuICBjb25zdCBvbkNsaWNrID0gKGUpID0+IHtcbiAgICBjYWxsSGFuZGxlcjMoZSwgbG9jYWwub25DbGljayk7XG4gICAgY29udGV4dC50b2dnbGUoKTtcbiAgfTtcbiAgcmV0dXJuIDxCdXR0b25Sb290XG4gICAgcmVmPXttZXJnZVJlZnMzKGNvbnRleHQuc2V0VHJpZ2dlclJlZiwgbG9jYWwucmVmKX1cbiAgICBhcmlhLWhhc3BvcHVwPVwiZGlhbG9nXCJcbiAgICBhcmlhLWV4cGFuZGVkPXtjb250ZXh0LmlzT3BlbigpfVxuICAgIGFyaWEtY29udHJvbHM9e2NvbnRleHQuaXNPcGVuKCkgPyBjb250ZXh0LmNvbnRlbnRJZCgpIDogdm9pZCAwfVxuICAgIGRhdGEtZXhwYW5kZWQ9e2NvbnRleHQuaXNPcGVuKCkgPyBcIlwiIDogdm9pZCAwfVxuICAgIGRhdGEtY2xvc2VkPXshY29udGV4dC5pc09wZW4oKSA/IFwiXCIgOiB2b2lkIDB9XG4gICAgb25DbGljaz17b25DbGlja31cbiAgICB7Li4ub3RoZXJzfVxuICAvPjtcbn1cblxuLy8gc3JjL2RpYWxvZy9pbmRleC50c3hcbnZhciBEaWFsb2cgPSBPYmplY3QuYXNzaWduKERpYWxvZ1Jvb3QsIHtcbiAgQ2xvc2VCdXR0b246IERpYWxvZ0Nsb3NlQnV0dG9uLFxuICBDb250ZW50OiBEaWFsb2dDb250ZW50LFxuICBEZXNjcmlwdGlvbjogRGlhbG9nRGVzY3JpcHRpb24sXG4gIE92ZXJsYXk6IERpYWxvZ092ZXJsYXksXG4gIFBvcnRhbDogRGlhbG9nUG9ydGFsLFxuICBUaXRsZTogRGlhbG9nVGl0bGUsXG4gIFRyaWdnZXI6IERpYWxvZ1RyaWdnZXJcbn0pO1xuXG5leHBvcnQge1xuICBEaWFsb2dDbG9zZUJ1dHRvbixcbiAgRGlhbG9nQ29udGVudCxcbiAgRGlhbG9nRGVzY3JpcHRpb24sXG4gIERpYWxvZ092ZXJsYXksXG4gIERpYWxvZ1BvcnRhbCxcbiAgRGlhbG9nUm9vdCxcbiAgRGlhbG9nVGl0bGUsXG4gIERpYWxvZ1RyaWdnZXIsXG4gIERpYWxvZyxcbiAgZGlhbG9nX2V4cG9ydHNcbn07XG4iLCJpbXBvcnQgeyBDb21wb25lbnRQcm9wcywgc3BsaXRQcm9wcyB9IGZyb20gXCJzb2xpZC1qc1wiO1xyXG5pbXBvcnQgeyB0d01lcmdlIH0gZnJvbSBcInRhaWx3aW5kLW1lcmdlXCI7XHJcblxyXG50eXBlIFZhcmlhbnQgPSBcImRlZmF1bHRcIiB8IFwiZ2hvc3RcIiB8IFwib3V0bGluZVwiIHwgXCJhY2NlbnRcIiB8IFwiZGVzdHJ1Y3RpdmVcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBidXR0b25WYXJpYW50czogUmVjb3JkPFZhcmlhbnQsIHN0cmluZz4gPSB7XHJcbiAgZGVmYXVsdDpcclxuICAgIFwiaW5saW5lLWZsZXggaC1bdmFyKC0taW5wdXQtaGVpZ2h0KV0gY3Vyc29yLVt2YXIoLS1jdXJzb3IpXSBzZWxlY3Qtbm9uZSBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgd2hpdGVzcGFjZS1ub3dyYXAgcm91bmRlZC1idXR0b24gYm9yZGVyLTAgcC1idXR0b24gdGV4dC1bbGVuZ3RoOnZhcigtLWZvbnQtdWktc21hbGwpXSBmb250LVt2YXIoLS1pbnB1dC1mb250LXdlaWdodCldIHRleHQtbm9ybWFsIG91dGxpbmUtbm9uZSBiZy1pbnRlcmFjdGl2ZS1ub3JtYWwgaG92ZXI6YmctaW50ZXJhY3RpdmUtaG92ZXIgc2hhZG93LVsndmFyKC0taW5wdXQtc2hhZG93KSddXCIsXHJcbiAgZ2hvc3Q6IFwiYmctdHJhbnNwYXJlbnQgc2hhZG93LW5vbmVcIixcclxuICAvLyBUT0RPIGZpbmQgYmV0dGVyIHdpZHRoIGhlcmVcclxuICBvdXRsaW5lOlxyXG4gICAgXCJiZy10cmFuc3BhcmVudCBzaGFkb3ctbm9uZSBib3JkZXItYm9yZGVyIGJvcmRlci1bbGVuZ3RoOnZhcigtLXByb21wdC1ib3JkZXItd2lkdGgpXVwiLFxyXG4gIGFjY2VudDpcclxuICAgIFwiYmctaW50ZXJhY3RpdmUtYWNjZW50IHRleHQtb24tYWNjZW50IGhvdmVyOmJnLWludGVyYWN0aXZlLWFjY2VudC1ob3ZlciBob3Zlcjp0ZXh0LWFjY2VudC1ob3ZlclwiLFxyXG4gIGRlc3RydWN0aXZlOiBcImJnLWVycm9yIGhvdmVyOmJnLWVycm9yIGhvdmVyOm9wYWNpdHktNzAgdGV4dC1vbi1lcnJvclwiLFxyXG59O1xyXG5cclxuLy8gY29uc3QgY2xhc3MgPSBcIlwiXHJcblxyXG50eXBlIEJ1dHRvbkxvY2FsUHJvcHMgPSB7XHJcbiAgdmFyaWFudD86IFZhcmlhbnQ7XHJcbn07XHJcbmV4cG9ydCB0eXBlIEJ1dHRvblByb3BzID0gQnV0dG9uTG9jYWxQcm9wcyAmIENvbXBvbmVudFByb3BzPFwiYnV0dG9uXCI+O1xyXG5leHBvcnQgY29uc3QgQnV0dG9uID0gKHByb3BzOiBCdXR0b25Qcm9wcykgPT4ge1xyXG4gIGNvbnN0IFtsb2NhbCwgcmVzdF0gPSBzcGxpdFByb3BzKHByb3BzLCBbXCJ2YXJpYW50XCIsIFwiY2xhc3NcIl0pO1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPGJ1dHRvblxyXG4gICAgICB7Li4ucmVzdH1cclxuICAgICAgY2xhc3M9e3R3TWVyZ2UoXHJcbiAgICAgICAgYnV0dG9uVmFyaWFudHNbXCJkZWZhdWx0XCJdLFxyXG4gICAgICAgIGxvY2FsLnZhcmlhbnQgJiYgYnV0dG9uVmFyaWFudHNbbG9jYWwudmFyaWFudF0sXHJcbiAgICAgICAgbG9jYWwuY2xhc3MsXHJcbiAgICAgICl9XHJcbiAgICAvPlxyXG4gICk7XHJcbn07XHJcblxyXG4vLyBpbXBvcnQgeyBjbiB9IGZyb20gXCJAL2xpYnMvY25cIjtcclxuLy8gaW1wb3J0IHR5cGUgeyBCdXR0b25Sb290UHJvcHMgfSBmcm9tIFwiQGtvYmFsdGUvY29yZS9idXR0b25cIjtcclxuLy8gaW1wb3J0IHsgQnV0dG9uIGFzIEJ1dHRvblByaW1pdGl2ZSB9IGZyb20gXCJAa29iYWx0ZS9jb3JlL2J1dHRvblwiO1xyXG4vLyBpbXBvcnQgdHlwZSB7IFBvbHltb3JwaGljUHJvcHMgfSBmcm9tIFwiQGtvYmFsdGUvY29yZS9wb2x5bW9ycGhpY1wiO1xyXG4vLyBpbXBvcnQgdHlwZSB7IFZhcmlhbnRQcm9wcyB9IGZyb20gXCJjbGFzcy12YXJpYW5jZS1hdXRob3JpdHlcIjtcclxuLy8gaW1wb3J0IHsgY3ZhIH0gZnJvbSBcImNsYXNzLXZhcmlhbmNlLWF1dGhvcml0eVwiO1xyXG4vLyBpbXBvcnQgdHlwZSB7IFZhbGlkQ29tcG9uZW50IH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcbi8vIGltcG9ydCB7IHNwbGl0UHJvcHMgfSBmcm9tIFwic29saWQtanNcIjtcclxuXHJcbi8vIGV4cG9ydCBjb25zdCBidXR0b25WYXJpYW50cyA9IGN2YShcclxuLy8gXHRcImlubGluZS1mbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciByb3VuZGVkLW1kIHRleHQtc20gZm9udC1tZWRpdW0gdHJhbnNpdGlvbi1bY29sb3IsYmFja2dyb3VuZC1jb2xvcixib3gtc2hhZG93XSBmb2N1cy12aXNpYmxlOm91dGxpbmUtbm9uZSBmb2N1cy12aXNpYmxlOnJpbmctWzEuNXB4XSBmb2N1cy12aXNpYmxlOnJpbmctcmluZyBkaXNhYmxlZDpwb2ludGVyLWV2ZW50cy1ub25lIGRpc2FibGVkOm9wYWNpdHktNTBcIixcclxuLy8gXHR7XHJcbi8vIFx0XHR2YXJpYW50czoge1xyXG4vLyBcdFx0XHR2YXJpYW50OiB7XHJcbi8vIFx0XHRcdFx0ZGVmYXVsdDpcclxuLy8gXHRcdFx0XHRcdFwiYmctcHJpbWFyeSB0ZXh0LXByaW1hcnktZm9yZWdyb3VuZCBzaGFkb3cgaG92ZXI6YmctcHJpbWFyeS85MFwiLFxyXG4vLyBcdFx0XHRcdGRlc3RydWN0aXZlOlxyXG4vLyBcdFx0XHRcdFx0XCJiZy1kZXN0cnVjdGl2ZSB0ZXh0LWRlc3RydWN0aXZlLWZvcmVncm91bmQgc2hhZG93LXNtIGhvdmVyOmJnLWRlc3RydWN0aXZlLzkwXCIsXHJcbi8vIFx0XHRcdFx0b3V0bGluZTpcclxuLy8gXHRcdFx0XHRcdFwiYm9yZGVyIGJvcmRlci1pbnB1dCBiZy1iYWNrZ3JvdW5kIHNoYWRvdy1zbSBob3ZlcjpiZy1hY2NlbnQgaG92ZXI6dGV4dC1hY2NlbnQtZm9yZWdyb3VuZFwiLFxyXG4vLyBcdFx0XHRcdHNlY29uZGFyeTpcclxuLy8gXHRcdFx0XHRcdFwiYmctc2Vjb25kYXJ5IHRleHQtc2Vjb25kYXJ5LWZvcmVncm91bmQgc2hhZG93LXNtIGhvdmVyOmJnLXNlY29uZGFyeS84MFwiLFxyXG4vLyBcdFx0XHRcdGdob3N0OiBcImhvdmVyOmJnLWFjY2VudCBob3Zlcjp0ZXh0LWFjY2VudC1mb3JlZ3JvdW5kXCIsXHJcbi8vIFx0XHRcdFx0bGluazogXCJ0ZXh0LXByaW1hcnkgdW5kZXJsaW5lLW9mZnNldC00IGhvdmVyOnVuZGVybGluZVwiLFxyXG4vLyBcdFx0XHR9LFxyXG4vLyBcdFx0XHRzaXplOiB7XHJcbi8vIFx0XHRcdFx0ZGVmYXVsdDogXCJoLTkgcHgtNCBweS0yXCIsXHJcbi8vIFx0XHRcdFx0c206IFwiaC04IHJvdW5kZWQtbWQgcHgtMyB0ZXh0LXhzXCIsXHJcbi8vIFx0XHRcdFx0bGc6IFwiaC0xMCByb3VuZGVkLW1kIHB4LThcIixcclxuLy8gXHRcdFx0XHRpY29uOiBcImgtOSB3LTlcIixcclxuLy8gXHRcdFx0fSxcclxuLy8gXHRcdH0sXHJcbi8vIFx0XHRkZWZhdWx0VmFyaWFudHM6IHtcclxuLy8gXHRcdFx0dmFyaWFudDogXCJkZWZhdWx0XCIsXHJcbi8vIFx0XHRcdHNpemU6IFwiZGVmYXVsdFwiLFxyXG4vLyBcdFx0fSxcclxuLy8gXHR9LFxyXG4vLyApO1xyXG5cclxuLy8gdHlwZSBidXR0b25Qcm9wczxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImJ1dHRvblwiPiA9IEJ1dHRvblJvb3RQcm9wczxUPiAmXHJcbi8vIFx0VmFyaWFudFByb3BzPHR5cGVvZiBidXR0b25WYXJpYW50cz4gJiB7XHJcbi8vIFx0XHRjbGFzcz86IHN0cmluZztcclxuLy8gXHR9O1xyXG5cclxuLy8gZXhwb3J0IGNvbnN0IEJ1dHRvbiA9IDxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImJ1dHRvblwiPihcclxuLy8gXHRwcm9wczogUG9seW1vcnBoaWNQcm9wczxULCBidXR0b25Qcm9wczxUPj4sXHJcbi8vICkgPT4ge1xyXG4vLyBcdGNvbnN0IFtsb2NhbCwgcmVzdF0gPSBzcGxpdFByb3BzKHByb3BzIGFzIGJ1dHRvblByb3BzLCBbXHJcbi8vIFx0XHRcImNsYXNzXCIsXHJcbi8vIFx0XHRcInZhcmlhbnRcIixcclxuLy8gXHRcdFwic2l6ZVwiLFxyXG4vLyBcdF0pO1xyXG5cclxuLy8gXHRyZXR1cm4gKFxyXG4vLyBcdFx0PEJ1dHRvblByaW1pdGl2ZVxyXG4vLyBcdFx0XHRjbGFzcz17Y24oXHJcbi8vIFx0XHRcdFx0YnV0dG9uVmFyaWFudHMoe1xyXG4vLyBcdFx0XHRcdFx0c2l6ZTogbG9jYWwuc2l6ZSxcclxuLy8gXHRcdFx0XHRcdHZhcmlhbnQ6IGxvY2FsLnZhcmlhbnQsXHJcbi8vIFx0XHRcdFx0fSksXHJcbi8vIFx0XHRcdFx0bG9jYWwuY2xhc3MsXHJcbi8vIFx0XHRcdCl9XHJcbi8vIFx0XHRcdHsuLi5yZXN0fVxyXG4vLyBcdFx0Lz5cclxuLy8gXHQpO1xyXG4vLyB9O1xyXG4iLCJpbXBvcnQgeyBjbiB9IGZyb20gXCJAL2xpYnMvY25cIjtcclxuaW1wb3J0IHR5cGUge1xyXG4gIERpYWxvZ0NvbnRlbnRQcm9wcyxcclxuICBEaWFsb2dEZXNjcmlwdGlvblByb3BzLFxyXG4gIERpYWxvZ1RpdGxlUHJvcHMsXHJcbiAgRGlhbG9nQ2xvc2VCdXR0b25Qcm9wcyxcclxufSBmcm9tIFwiQGtvYmFsdGUvY29yZS9kaWFsb2dcIjtcclxuaW1wb3J0IHsgRGlhbG9nIGFzIERpYWxvZ1ByaW1pdGl2ZSB9IGZyb20gXCJAa29iYWx0ZS9jb3JlL2RpYWxvZ1wiO1xyXG5pbXBvcnQgdHlwZSB7IFBvbHltb3JwaGljUHJvcHMgfSBmcm9tIFwiQGtvYmFsdGUvY29yZS9wb2x5bW9ycGhpY1wiO1xyXG5pbXBvcnQgdHlwZSB7IENvbXBvbmVudFByb3BzLCBQYXJlbnRQcm9wcywgVmFsaWRDb21wb25lbnQgfSBmcm9tIFwic29saWQtanNcIjtcclxuaW1wb3J0IHsgc3BsaXRQcm9wcyB9IGZyb20gXCJzb2xpZC1qc1wiO1xyXG5pbXBvcnQgeyBidXR0b25WYXJpYW50cyB9IGZyb20gXCIuL2J1dHRvblwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IERpYWxvZyA9IERpYWxvZ1ByaW1pdGl2ZTtcclxuZXhwb3J0IGNvbnN0IERpYWxvZ1RyaWdnZXIgPSBEaWFsb2dQcmltaXRpdmUuVHJpZ2dlcjtcclxuXHJcbnR5cGUgZGlhbG9nQ2xvc2VQcm9wczxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImJ1dHRvblwiPiA9IFBvbHltb3JwaGljUHJvcHM8XHJcbiAgVCxcclxuICBEaWFsb2dDbG9zZUJ1dHRvblByb3BzPFQ+XHJcbj47XHJcblxyXG5leHBvcnQgY29uc3QgRGlhbG9nQ2xvc2UgPSAocHJvcHM6IGRpYWxvZ0Nsb3NlUHJvcHMpID0+IHtcclxuICBjb25zdCBbbG9jYWwsIHJlc3RdID0gc3BsaXRQcm9wcyhwcm9wcywgW1wiY2xhc3NcIl0pO1xyXG4gIHJldHVybiAoXHJcbiAgICA8RGlhbG9nUHJpbWl0aXZlLkNsb3NlQnV0dG9uXHJcbiAgICAgIHsuLi5yZXN0fVxyXG4gICAgICBjbGFzcz17Y24oYnV0dG9uVmFyaWFudHMuZGVmYXVsdCwgbG9jYWwuY2xhc3MpfVxyXG4gICAgLz5cclxuICApO1xyXG59O1xyXG5leHBvcnQgY29uc3QgRGlhbG9nQ2xvc2VYID0gKCkgPT4gKFxyXG4gIDxEaWFsb2dQcmltaXRpdmUuQ2xvc2VCdXR0b24gY2xhc3M9XCJjbGlja2FibGUtaWNvbiBhYnNvbHV0ZSByaWdodC00IHRvcC00IHJvdW5kZWQtc20gcC0xIG9wYWNpdHktNzAgcmluZy1vZmZzZXQtYmFja2dyb3VuZCB0cmFuc2l0aW9uLVtvcGFjaXR5LGJveC1zaGFkb3ddIGhvdmVyOm9wYWNpdHktMTAwIGZvY3VzOm91dGxpbmUtbm9uZSBmb2N1czpyaW5nLVsxLjVweF0gZm9jdXM6cmluZy1zZWxlY3Rpb24gZm9jdXM6cmluZy1vZmZzZXQtMiBkaXNhYmxlZDpwb2ludGVyLWV2ZW50cy1ub25lXCI+XHJcbiAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgY2xhc3M9XCJoLTQgdy00XCI+XHJcbiAgICAgIDxwYXRoXHJcbiAgICAgICAgZmlsbD1cIm5vbmVcIlxyXG4gICAgICAgIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiXHJcbiAgICAgICAgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiXHJcbiAgICAgICAgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIlxyXG4gICAgICAgIHN0cm9rZS13aWR0aD1cIjJcIlxyXG4gICAgICAgIGQ9XCJNMTggNkw2IDE4TTYgNmwxMiAxMlwiXHJcbiAgICAgIC8+XHJcbiAgICAgIHsvKiA8dGl0bGU+Q2xvc2U8L3RpdGxlPiAqL31cclxuICAgIDwvc3ZnPlxyXG4gIDwvRGlhbG9nUHJpbWl0aXZlLkNsb3NlQnV0dG9uPlxyXG4pO1xyXG5cclxuLy8gb2JzaWRpYW4gbmF0aXZlbHkgZG9lc24ndCB1c2UgYW5pbWF0aW9ucyBmb3IgZGlhbG9nc1xyXG4vLyBidXQgSSBtaWdodCB3YW50IHRvIHVzZSB0aGlzIGF0IHNvbWUgcG9pbnRcclxuZXhwb3J0IGNvbnN0IGFuaW1hdGVPdmVybGF5Q2xhc3MgPVxyXG4gIFwiZGF0YS1bZXhwYW5kZWRdOmFuaW1hdGUtaW4gZGF0YS1bY2xvc2VkXTphbmltYXRlLW91dCBkYXRhLVtjbG9zZWRdOmZhZGUtb3V0LTAgZGF0YS1bZXhwYW5kZWRdOmZhZGUtaW4tMFwiO1xyXG5leHBvcnQgY29uc3QgYW5pbWF0ZUNvbnRlbnRDbGFzcyA9XHJcbiAgXCJkYXRhLVtjbG9zZWRdOmR1cmF0aW9uLTIwMCBkYXRhLVtleHBhbmRlZF06ZHVyYXRpb24tMjAwIGRhdGEtW2V4cGFuZGVkXTphbmltYXRlLWluIGRhdGEtW2Nsb3NlZF06YW5pbWF0ZS1vdXQgZGF0YS1bY2xvc2VkXTpmYWRlLW91dC0wIGRhdGEtW2V4cGFuZGVkXTpmYWRlLWluLTAgZGF0YS1bY2xvc2VkXTp6b29tLW91dC05NSBkYXRhLVtleHBhbmRlZF06em9vbS1pbi05NSBkYXRhLVtjbG9zZWRdOnNsaWRlLW91dC10by1sZWZ0LTEvMiBkYXRhLVtjbG9zZWRdOnNsaWRlLW91dC10by10b3AtWzQ4JV0gZGF0YS1bZXhwYW5kZWRdOnNsaWRlLWluLWZyb20tbGVmdC0xLzIgZGF0YS1bZXhwYW5kZWRdOnNsaWRlLWluLWZyb20tdG9wLVs0OCVdXCI7XHJcblxyXG50eXBlIGRpYWxvZ0NvbnRlbnRQcm9wczxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImRpdlwiPiA9IFBhcmVudFByb3BzPFxyXG4gIERpYWxvZ0NvbnRlbnRQcm9wczxUPiAmIHtcclxuICAgIGNsYXNzPzogc3RyaW5nO1xyXG4gIH1cclxuPjtcclxuXHJcbmV4cG9ydCBjb25zdCBEaWFsb2dDb250ZW50ID0gPFQgZXh0ZW5kcyBWYWxpZENvbXBvbmVudCA9IFwiZGl2XCI+KFxyXG4gIHByb3BzOiBQb2x5bW9ycGhpY1Byb3BzPFQsIGRpYWxvZ0NvbnRlbnRQcm9wczxUPj4sXHJcbikgPT4ge1xyXG4gIGNvbnN0IFtsb2NhbCwgcmVzdF0gPSBzcGxpdFByb3BzKHByb3BzIGFzIGRpYWxvZ0NvbnRlbnRQcm9wcywgW1xyXG4gICAgXCJjbGFzc1wiLFxyXG4gICAgXCJjaGlsZHJlblwiLFxyXG4gIF0pO1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPERpYWxvZ1ByaW1pdGl2ZS5Qb3J0YWw+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJ0d2Nzc1wiPlxyXG4gICAgICAgIDxEaWFsb2dQcmltaXRpdmUuT3ZlcmxheVxyXG4gICAgICAgICAgY2xhc3M9e2NuKFwibW9kYWwtYmcgei01MCBvcGFjaXR5LTg1XCIpfVxyXG4gICAgICAgICAgey4uLnJlc3R9XHJcbiAgICAgICAgLz5cclxuICAgICAgICA8RGlhbG9nUHJpbWl0aXZlLkNvbnRlbnRcclxuICAgICAgICAgIGNsYXNzPXtjbihcclxuICAgICAgICAgICAgXCJwcm9tcHQgbGVmdC0xLzIgei01MCB3LWZ1bGwgLXRyYW5zbGF0ZS14LTEvMiBnYXAtNCBib3JkZXItW2xlbmd0aDp2YXIoLS1wcm9tcHQtYm9yZGVyLXdpZHRoKV0gYm9yZGVyLW1vZGFsIHAtNlwiLFxyXG4gICAgICAgICAgICBsb2NhbC5jbGFzcyxcclxuICAgICAgICAgICl9XHJcbiAgICAgICAgICB7Li4ucmVzdH1cclxuICAgICAgICA+XHJcbiAgICAgICAgICB7bG9jYWwuY2hpbGRyZW59XHJcbiAgICAgICAgICA8RGlhbG9nQ2xvc2VYIC8+XHJcbiAgICAgICAgPC9EaWFsb2dQcmltaXRpdmUuQ29udGVudD5cclxuICAgICAgPC9kaXY+XHJcbiAgICA8L0RpYWxvZ1ByaW1pdGl2ZS5Qb3J0YWw+XHJcbiAgKTtcclxufTtcclxuXHJcbnR5cGUgZGlhbG9nVGl0bGVQcm9wczxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImgyXCI+ID0gRGlhbG9nVGl0bGVQcm9wczxUPiAmIHtcclxuICBjbGFzcz86IHN0cmluZztcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBEaWFsb2dUaXRsZSA9IDxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcImgyXCI+KFxyXG4gIHByb3BzOiBQb2x5bW9ycGhpY1Byb3BzPFQsIGRpYWxvZ1RpdGxlUHJvcHM8VD4+LFxyXG4pID0+IHtcclxuICBjb25zdCBbbG9jYWwsIHJlc3RdID0gc3BsaXRQcm9wcyhwcm9wcyBhcyBkaWFsb2dUaXRsZVByb3BzLCBbXCJjbGFzc1wiXSk7XHJcblxyXG4gIHJldHVybiAoXHJcbiAgICA8RGlhbG9nUHJpbWl0aXZlLlRpdGxlXHJcbiAgICAgIGNsYXNzPXtjbihcInRleHQtZm9yZWdyb3VuZCB0ZXh0LWxnIGZvbnQtc2VtaWJvbGRcIiwgbG9jYWwuY2xhc3MpfVxyXG4gICAgICB7Li4ucmVzdH1cclxuICAgIC8+XHJcbiAgKTtcclxufTtcclxuXHJcbnR5cGUgZGlhbG9nRGVzY3JpcHRpb25Qcm9wczxUIGV4dGVuZHMgVmFsaWRDb21wb25lbnQgPSBcInBcIj4gPVxyXG4gIERpYWxvZ0Rlc2NyaXB0aW9uUHJvcHM8VD4gJiB7XHJcbiAgICBjbGFzcz86IHN0cmluZztcclxuICB9O1xyXG5cclxuZXhwb3J0IGNvbnN0IERpYWxvZ0Rlc2NyaXB0aW9uID0gPFQgZXh0ZW5kcyBWYWxpZENvbXBvbmVudCA9IFwicFwiPihcclxuICBwcm9wczogUG9seW1vcnBoaWNQcm9wczxULCBkaWFsb2dEZXNjcmlwdGlvblByb3BzPFQ+PixcclxuKSA9PiB7XHJcbiAgY29uc3QgW2xvY2FsLCByZXN0XSA9IHNwbGl0UHJvcHMocHJvcHMgYXMgZGlhbG9nRGVzY3JpcHRpb25Qcm9wcywgW1wiY2xhc3NcIl0pO1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPERpYWxvZ1ByaW1pdGl2ZS5EZXNjcmlwdGlvblxyXG4gICAgICBjbGFzcz17Y24oXCJ0ZXh0LW11dGVkLWZvcmVncm91bmQgdGV4dC1zbVwiLCBsb2NhbC5jbGFzcyl9XHJcbiAgICAgIHsuLi5yZXN0fVxyXG4gICAgLz5cclxuICApO1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IERpYWxvZ0hlYWRlciA9IChwcm9wczogQ29tcG9uZW50UHJvcHM8XCJkaXZcIj4pID0+IHtcclxuICBjb25zdCBbbG9jYWwsIHJlc3RdID0gc3BsaXRQcm9wcyhwcm9wcywgW1wiY2xhc3NcIl0pO1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPGRpdlxyXG4gICAgICBjbGFzcz17Y24oXHJcbiAgICAgICAgXCJmbGV4IGZsZXgtY29sIHNwYWNlLXktMiB0ZXh0LWNlbnRlciBzbTp0ZXh0LWxlZnRcIixcclxuICAgICAgICBsb2NhbC5jbGFzcyxcclxuICAgICAgKX1cclxuICAgICAgey4uLnJlc3R9XHJcbiAgICAvPlxyXG4gICk7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgRGlhbG9nRm9vdGVyID0gKHByb3BzOiBDb21wb25lbnRQcm9wczxcImRpdlwiPikgPT4ge1xyXG4gIGNvbnN0IFtsb2NhbCwgcmVzdF0gPSBzcGxpdFByb3BzKHByb3BzLCBbXCJjbGFzc1wiXSk7XHJcblxyXG4gIHJldHVybiAoXHJcbiAgICA8ZGl2XHJcbiAgICAgIGNsYXNzPXtjbihcclxuICAgICAgICBcImZsZXggZmxleC1jb2wtcmV2ZXJzZSBzbTpmbGV4LXJvdyBzbTpqdXN0aWZ5LWVuZCBzbTpzcGFjZS14LTJcIixcclxuICAgICAgICBsb2NhbC5jbGFzcyxcclxuICAgICAgKX1cclxuICAgICAgey4uLnJlc3R9XHJcbiAgICAvPlxyXG4gICk7XHJcbn07XHJcbiIsImltcG9ydCB7IENvbXBvbmVudFByb3BzIH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcblxyXG5leHBvcnQgY29uc3QgRXh0ZXJuYWxMaW5rID0gKHByb3BzOiBDb21wb25lbnRQcm9wczxcImFcIj4pID0+IChcclxuICA8PlxyXG4gICAgPHNwYW4gY2xhc3M9XCJjbS1saW5rXCI+XHJcbiAgICAgIDxhIHsuLi5wcm9wc30gY2xhc3M9XCJ0ZXh0LWFjY2VudCB1bmRlcmxpbmUgaG92ZXI6dGV4dC1hY2NlbnQtaG92ZXJcIj48L2E+XHJcbiAgICA8L3NwYW4+XHJcbiAgICA8c3BhbiBjbGFzcz1cImV4dGVybmFsLWxpbmtcIj48L3NwYW4+XHJcbiAgPC8+XHJcbik7XHJcbiIsIi8qKlxuKiBAbGljZW5zZSBsdWNpZGUtc29saWQgdjAuNDEyLjAgLSBJU0NcbipcbiogVGhpcyBzb3VyY2UgY29kZSBpcyBsaWNlbnNlZCB1bmRlciB0aGUgSVNDIGxpY2Vuc2UuXG4qIFNlZSB0aGUgTElDRU5TRSBmaWxlIGluIHRoZSByb290IGRpcmVjdG9yeSBvZiB0aGlzIHNvdXJjZSB0cmVlLlxuKi9cblxuLy8gc3JjL2ljb25zL21pbnVzLnRzeFxuaW1wb3J0IEljb24gZnJvbSBcIi4uL0ljb25cIjtcbnZhciBpY29uTm9kZSA9IFtbXCJwYXRoXCIsIHsgZDogXCJNNSAxMmgxNFwiLCBrZXk6IFwiMWF5czBoXCIgfV1dO1xudmFyIE1pbnVzID0gKHByb3BzKSA9PiA8SWNvbiB7Li4ucHJvcHN9IG5hbWU9XCJNaW51c1wiIGljb25Ob2RlPXtpY29uTm9kZX0gLz47XG52YXIgbWludXNfZGVmYXVsdCA9IE1pbnVzO1xuZXhwb3J0IHtcbiAgbWludXNfZGVmYXVsdCBhcyBkZWZhdWx0XG59O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9bWludXMuanN4Lm1hcFxuIiwiLyoqXG4qIEBsaWNlbnNlIGx1Y2lkZS1zb2xpZCB2MC40MTIuMCAtIElTQ1xuKlxuKiBUaGlzIHNvdXJjZSBjb2RlIGlzIGxpY2Vuc2VkIHVuZGVyIHRoZSBJU0MgbGljZW5zZS5cbiogU2VlIHRoZSBMSUNFTlNFIGZpbGUgaW4gdGhlIHJvb3QgZGlyZWN0b3J5IG9mIHRoaXMgc291cmNlIHRyZWUuXG4qL1xuXG4vLyBzcmMvaWNvbnMvcGFyZW50aGVzZXMudHN4XG5pbXBvcnQgSWNvbiBmcm9tIFwiLi4vSWNvblwiO1xudmFyIGljb25Ob2RlID0gW1xuICBbXCJwYXRoXCIsIHsgZDogXCJNOCAyMXMtNC0zLTQtOSA0LTkgNC05XCIsIGtleTogXCJ1dG85dWRcIiB9XSxcbiAgW1wicGF0aFwiLCB7IGQ6IFwiTTE2IDNzNCAzIDQgOS00IDktNCA5XCIsIGtleTogXCI0dzJ2c3FcIiB9XVxuXTtcbnZhciBQYXJlbnRoZXNlcyA9IChwcm9wcykgPT4gPEljb24gey4uLnByb3BzfSBuYW1lPVwiUGFyZW50aGVzZXNcIiBpY29uTm9kZT17aWNvbk5vZGV9IC8+O1xudmFyIHBhcmVudGhlc2VzX2RlZmF1bHQgPSBQYXJlbnRoZXNlcztcbmV4cG9ydCB7XG4gIHBhcmVudGhlc2VzX2RlZmF1bHQgYXMgZGVmYXVsdFxufTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXBhcmVudGhlc2VzLmpzeC5tYXBcbiIsImltcG9ydCB7IHVwZGF0ZU1ldGFkYXRhUHJvcGVydHksIHRvTnVtYmVyIH0gZnJvbSBcIkAvbGliL3V0aWxcIjtcclxuaW1wb3J0IERhdGFFZGl0IGZyb20gXCJAL21haW5cIjtcclxuaW1wb3J0IHsgY3JlYXRlU2lnbmFsLCBTaG93IH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcbmltcG9ydCB7IFRhYmxlRGF0YUVkaXRQcm9wcywgVGFibGVEYXRhUHJvcHMgfSBmcm9tIFwiLi4vVGFibGUvVGFibGVEYXRhXCI7XHJcbmltcG9ydCB7XHJcbiAgRGlhbG9nLFxyXG4gIERpYWxvZ1RyaWdnZXIsXHJcbiAgRGlhbG9nQ29udGVudCxcclxuICBEaWFsb2dIZWFkZXIsXHJcbiAgRGlhbG9nVGl0bGUsXHJcbiAgRGlhbG9nRGVzY3JpcHRpb24sXHJcbiAgRGlhbG9nRm9vdGVyLFxyXG59IGZyb20gXCIuLi91aS9kaWFsb2dcIjtcclxuaW1wb3J0IHsgRXh0ZXJuYWxMaW5rIH0gZnJvbSBcIkAvY29tcG9uZW50cy91aS9leHRlcm5hbC1saW5rXCI7XHJcbmltcG9ydCBNaW51cyBmcm9tIFwibHVjaWRlLXNvbGlkL2ljb25zL01pbnVzXCI7XHJcbmltcG9ydCBQYXJlbnRoZXNlcyBmcm9tIFwibHVjaWRlLXNvbGlkL2ljb25zL1BhcmVudGhlc2VzXCI7XHJcbmltcG9ydCBQbHVzIGZyb20gXCJsdWNpZGUtc29saWQvaWNvbnMvUGx1c1wiO1xyXG5pbXBvcnQgeyBhdXRvZm9jdXMgfSBmcm9tIFwiQHNvbGlkLXByaW1pdGl2ZXMvYXV0b2ZvY3VzXCI7XHJcbmltcG9ydCB7IHVlc0NvZGVCbG9jayB9IGZyb20gXCJAL2hvb2tzL3VzZURhdGFFZGl0XCI7XHJcbi8vIFRvIHByZXZlbnQgdHJlZXNoYWtpbmdcclxuYXV0b2ZvY3VzO1xyXG5cclxuZXhwb3J0IGNvbnN0IE51bWJlcklucHV0ID0gKHByb3BzOiBUYWJsZURhdGFFZGl0UHJvcHMpID0+IHtcclxuICBjb25zdCBbc2l6ZSwgc2V0U2l6ZV0gPSBjcmVhdGVTaWduYWwocHJvcHMudmFsdWU/LnRvU3RyaW5nKCkubGVuZ3RoID8/IDUpO1xyXG4gIGNvbnN0IHsgcGx1Z2luIH0gPSB1ZXNDb2RlQmxvY2soKTtcclxuICByZXR1cm4gKFxyXG4gICAgPGlucHV0XHJcbiAgICAgIHVzZTphdXRvZm9jdXNcclxuICAgICAgYXV0b2ZvY3VzXHJcbiAgICAgIGNsYXNzPVwiaC1hdXRvIHJvdW5kZWQtbm9uZSBib3JkZXItbm9uZSBiZy10cmFuc3BhcmVudCBwLTAgIXNoYWRvdy1ub25lXCJcclxuICAgICAgLy8gc3R5bGU9e3sgXCJib3gtc2hhZG93XCI6IFwibm9uZVwiIH19XHJcbiAgICAgIHNpemU9e3NpemUoKX1cclxuICAgICAgdHlwZT1cIm51bWJlclwiXHJcbiAgICAgIHZhbHVlPXtwcm9wcy52YWx1ZT8udG9TdHJpbmcoKSA/PyBcIlwifVxyXG4gICAgICBvbkJsdXI9e2FzeW5jIChlKSA9PiB7XHJcbiAgICAgICAgYXdhaXQgdXBkYXRlTWV0YWRhdGFQcm9wZXJ0eShcclxuICAgICAgICAgIHByb3BzLnByb3BlcnR5LFxyXG4gICAgICAgICAgdG9OdW1iZXIoZS50YXJnZXQudmFsdWUpLFxyXG4gICAgICAgICAgcHJvcHMuZmlsZVBhdGgsXHJcbiAgICAgICAgICBwbHVnaW4sXHJcbiAgICAgICAgICBwcm9wcy52YWx1ZSxcclxuICAgICAgICApO1xyXG4gICAgICAgIHByb3BzLnNldEVkaXRpbmcoZmFsc2UpO1xyXG4gICAgICB9fVxyXG4gICAgICBvbklucHV0PXsoZSkgPT4ge1xyXG4gICAgICAgIHNldFNpemUoZS50YXJnZXQudmFsdWUubGVuZ3RoKTtcclxuICAgICAgfX1cclxuICAgIC8+XHJcbiAgKTtcclxufTtcclxuXHJcbnR5cGUgTnVtYmVyQnV0dG9uc1Byb3BzID0gVGFibGVEYXRhUHJvcHM8bnVtYmVyPiAmIHsgcGx1Z2luOiBEYXRhRWRpdCB9O1xyXG5leHBvcnQgY29uc3QgTnVtYmVyQnV0dG9ucyA9IChwcm9wczogTnVtYmVyQnV0dG9uc1Byb3BzKSA9PiAoXHJcbiAgPGRpdiBjbGFzcz1cImZsZXggdy1mdWxsIGl0ZW1zLWNlbnRlciBnYXAtMVwiPlxyXG4gICAgPGJ1dHRvblxyXG4gICAgICBjbGFzcz1cImNsaWNrYWJsZS1pY29uIHNpemUtZml0IHAtMVwiXHJcbiAgICAgIG9uQ2xpY2s9e2FzeW5jIChlKSA9PiB7XHJcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIGF3YWl0IHVwZGF0ZU1ldGFkYXRhUHJvcGVydHkoXHJcbiAgICAgICAgICBwcm9wcy5wcm9wZXJ0eSxcclxuICAgICAgICAgIHByb3BzLnZhbHVlIC0gMSxcclxuICAgICAgICAgIHByb3BzLmZpbGVQYXRoLFxyXG4gICAgICAgICAgcHJvcHMucGx1Z2luLFxyXG4gICAgICAgICAgcHJvcHMudmFsdWUsXHJcbiAgICAgICAgKTtcclxuICAgICAgfX1cclxuICAgID5cclxuICAgICAgPE1pbnVzIGNsYXNzPVwicG9pbnRlci1ldmVudHMtbm9uZSBzaXplLTNcIiAvPlxyXG4gICAgPC9idXR0b24+XHJcbiAgICA8TnVtYmVyRXhwcmVzc2lvbkJ1dHRvbiB7Li4ucHJvcHN9IC8+XHJcbiAgICA8YnV0dG9uXHJcbiAgICAgIGNsYXNzPVwiY2xpY2thYmxlLWljb24gc2l6ZS1maXQgcC0xXCJcclxuICAgICAgb25DbGljaz17YXN5bmMgKGUpID0+IHtcclxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgYXdhaXQgdXBkYXRlTWV0YWRhdGFQcm9wZXJ0eShcclxuICAgICAgICAgIHByb3BzLnByb3BlcnR5LFxyXG4gICAgICAgICAgcHJvcHMudmFsdWUgKyAxLFxyXG4gICAgICAgICAgcHJvcHMuZmlsZVBhdGgsXHJcbiAgICAgICAgICBwcm9wcy5wbHVnaW4sXHJcbiAgICAgICAgICBwcm9wcy52YWx1ZSxcclxuICAgICAgICApO1xyXG4gICAgICB9fVxyXG4gICAgPlxyXG4gICAgICA8UGx1cyBjbGFzcz1cInBvaW50ZXItZXZlbnRzLW5vbmUgc2l6ZS0zXCIgLz5cclxuICAgIDwvYnV0dG9uPlxyXG4gIDwvZGl2PlxyXG4pO1xyXG5cclxuY29uc3QgTnVtYmVyRXhwcmVzc2lvbkJ1dHRvbiA9IChwcm9wczogTnVtYmVyQnV0dG9uc1Byb3BzKSA9PiB7XHJcbiAgLy8gY29uc3Qge1xyXG4gIC8vICAgZGF0YXZpZXdBUEk6IHsgZXZhbHVhdGUgfSxcclxuICAvLyB9ID0gdXNlRGF0YUVkaXQoKTtcclxuICBjb25zdCBbaXNPcGVuLCBzZXRPcGVuXSA9IGNyZWF0ZVNpZ25hbChmYWxzZSk7XHJcbiAgY29uc3QgW2NhbGN1bGF0ZWQsIHNldENhbGN1bGF0ZWRdID0gY3JlYXRlU2lnbmFsKE51bWJlcihwcm9wcy52YWx1ZSkpO1xyXG5cclxuICBjb25zdCB1cGRhdGVQcm9wZXJ0eSA9IGFzeW5jICh2OiBudW1iZXIpID0+IHtcclxuICAgIGF3YWl0IHVwZGF0ZU1ldGFkYXRhUHJvcGVydHkoXHJcbiAgICAgIHByb3BzLnByb3BlcnR5LFxyXG4gICAgICB2LFxyXG4gICAgICBwcm9wcy5maWxlUGF0aCxcclxuICAgICAgcHJvcHMucGx1Z2luLFxyXG4gICAgICBwcm9wcy52YWx1ZSxcclxuICAgICk7XHJcbiAgfTtcclxuXHJcbiAgcmV0dXJuIChcclxuICAgIDxEaWFsb2cgbW9kYWwgb3Blbj17aXNPcGVuKCl9IG9uT3BlbkNoYW5nZT17KGIpID0+IHNldE9wZW4oYil9PlxyXG4gICAgICA8RGlhbG9nVHJpZ2dlciBjbGFzcz1cImNsaWNrYWJsZS1pY29uIHNpemUtZml0IHAtMVwiPlxyXG4gICAgICAgIDxQYXJlbnRoZXNlcyBjbGFzcz1cInBvaW50ZXItZXZlbnRzLW5vbmUgc2l6ZS0zXCIgLz5cclxuICAgICAgPC9EaWFsb2dUcmlnZ2VyPlxyXG4gICAgICA8RGlhbG9nQ29udGVudD5cclxuICAgICAgICA8RGlhbG9nSGVhZGVyPlxyXG4gICAgICAgICAgPERpYWxvZ1RpdGxlPlVwZGF0ZSBieSBleHByZXNzaW9uPC9EaWFsb2dUaXRsZT5cclxuICAgICAgICAgIDxEaWFsb2dEZXNjcmlwdGlvbj5cclxuICAgICAgICAgICAgRW50ZXIgYSB2YWxpZHtcIiBcIn1cclxuICAgICAgICAgICAgPEV4dGVybmFsTGluayBocmVmPVwiaHR0cHM6Ly9ibGFja3NtaXRoZ3UuZ2l0aHViLmlvL29ic2lkaWFuLWRhdGF2aWV3L3JlZmVyZW5jZS9leHByZXNzaW9ucy9cIj5cclxuICAgICAgICAgICAgICBEYXRhdmlldyBtYXRoZW1hdGljYWwgZXhwcmVzc2lvblxyXG4gICAgICAgICAgICA8L0V4dGVybmFsTGluaz5cclxuICAgICAgICAgICAgPGJyIC8+XHJcbiAgICAgICAgICAgIFlvdSBjYW4gdXNlIDxjb2RlPng8L2NvZGU+IGFzIHRoZSBjdXJyZW50IHZhbHVlLlxyXG4gICAgICAgICAgPC9EaWFsb2dEZXNjcmlwdGlvbj5cclxuICAgICAgICA8L0RpYWxvZ0hlYWRlcj5cclxuICAgICAgICA8aW5wdXRcclxuICAgICAgICAgIHVzZTphdXRvZm9jdXNcclxuICAgICAgICAgIGF1dG9mb2N1c1xyXG4gICAgICAgICAgY2xhc3M9XCJib3JkZXItYm9yZGVyIHB4LTFcIlxyXG4gICAgICAgICAgdHlwZT1cInRleHRcIlxyXG4gICAgICAgICAgcGxhY2Vob2xkZXI9XCJ4ICsgMiAvIHggKiAzXCJcclxuICAgICAgICAgIG9uS2V5RG93bj17YXN5bmMgKGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKGUua2V5ID09PSBcIkVudGVyXCIgJiYgIU51bWJlci5pc05hTihjYWxjdWxhdGVkKCkpKSB7XHJcbiAgICAgICAgICAgICAgYXdhaXQgdXBkYXRlUHJvcGVydHkoY2FsY3VsYXRlZCgpKTtcclxuICAgICAgICAgICAgICBzZXRPcGVuKGZhbHNlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfX1cclxuICAgICAgICAgIG9uSW5wdXQ9e2FzeW5jIChlKSA9PiB7XHJcbiAgICAgICAgICAgIC8qIFxyXG4gICAgICAgICAgICAgICAgICBUT0RPIG1ha2UgdGhpcyBiZXR0ZXJcclxuICAgICAgICAgICAgICAgICAgLSBldmFsOiBzb2xpZCBkb2Vzbid0IGxpa2UgaXQgd2hlbiBpbnRlcm9wcGVkIHdpdGggc2lnbmFscyBpdCBzZWVtc1xyXG4gICAgICAgICAgICAgICAgICAtIG1hdGhqczogc29saWQgYWxzbyBzZWVtcyB0byBub3QgbGlrZSBpdCdzIGV2YWx1YXRlIGZ1bmN0aW9uLiBJdCBhbHNvIGFkZHMgNTAwa2IgdG8gdGhlIGJ1bmRsZSA6L1xyXG4gICAgICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgY29uc3QgZXhwID0gZS50YXJnZXQudmFsdWVcclxuICAgICAgICAgICAgICAucmVwbGFjZUFsbChcInhcIiwgcHJvcHMudmFsdWUudG9TdHJpbmcoKSlcclxuICAgICAgICAgICAgICAudHJpbSgpO1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPVxyXG4gICAgICAgICAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3JcclxuICAgICAgICAgICAgICBhd2FpdCBhcHAucGx1Z2lucy5wbHVnaW5zLmRhdGF2aWV3LmFwaS5ldmFsdWF0ZShleHApO1xyXG5cclxuICAgICAgICAgICAgc2V0Q2FsY3VsYXRlZCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzZnVsKSByZXR1cm4gTnVtYmVyKHJlc3VsdC52YWx1ZSk7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIE5hTjtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9fVxyXG4gICAgICAgIC8+XHJcbiAgICAgICAgPHA+XHJcbiAgICAgICAgICA8c3Bhbj5DYWxjdWxhdGVkOiZuYnNwOzwvc3Bhbj5cclxuICAgICAgICAgIDxTaG93XHJcbiAgICAgICAgICAgIHdoZW49e051bWJlci5pc05hTihjYWxjdWxhdGVkKCkpfVxyXG4gICAgICAgICAgICBmYWxsYmFjaz17PHNwYW4gY2xhc3M9XCJ0ZXh0LXN1Y2Nlc3NcIj57Y2FsY3VsYXRlZCgpfTwvc3Bhbj59XHJcbiAgICAgICAgICA+XHJcbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidGV4dC1lcnJvclwiPmVycm9yPC9zcGFuPlxyXG4gICAgICAgICAgPC9TaG93PlxyXG4gICAgICAgIDwvcD5cclxuICAgICAgICA8RGlhbG9nRm9vdGVyPlxyXG4gICAgICAgICAgPGJ1dHRvblxyXG4gICAgICAgICAgICBjbGFzcz1cInJvdW5kZWQtYnV0dG9uIGJnLWludGVyYWN0aXZlLWFjY2VudCBwLWJ1dHRvbiB0ZXh0LW9uLWFjY2VudCBob3ZlcjpiZy1pbnRlcmFjdGl2ZS1hY2NlbnQtaG92ZXJcIlxyXG4gICAgICAgICAgICBkaXNhYmxlZD17TnVtYmVyLmlzTmFOKGNhbGN1bGF0ZWQoKSl9XHJcbiAgICAgICAgICAgIG9uQ2xpY2s9e2FzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICBhd2FpdCB1cGRhdGVQcm9wZXJ0eShjYWxjdWxhdGVkKCkpO1xyXG4gICAgICAgICAgICAgIHNldE9wZW4oZmFsc2UpO1xyXG4gICAgICAgICAgICB9fVxyXG4gICAgICAgICAgPlxyXG4gICAgICAgICAgICB1cGRhdGVcclxuICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgIDwvRGlhbG9nRm9vdGVyPlxyXG4gICAgICA8L0RpYWxvZ0NvbnRlbnQ+XHJcbiAgICA8L0RpYWxvZz5cclxuICApO1xyXG59O1xyXG4iLCJpbXBvcnQgeyBDT01QTEVYX1BST1BFUlRZX1BMQUNFSE9MREVSIH0gZnJvbSBcIkAvbGliL2NvbnN0YW50c1wiO1xyXG5pbXBvcnQge1xyXG4gIERhdGF2aWV3UHJvcGVydHlWYWx1ZSxcclxuICBEYXRhdmlld1Byb3BlcnR5VmFsdWVBcnJheSxcclxuICBQcm9wZXJ0eVZhbHVlVHlwZSxcclxufSBmcm9tIFwiQC9saWIvdHlwZXNcIjtcclxuaW1wb3J0IHtcclxuICBjaGVja0lmRGF0ZUhhc1RpbWUsXHJcbiAgZ2V0VmFsdWVUeXBlLFxyXG4gIHRyeURhdGF2aWV3TGlua1RvTWFya2Rvd24sXHJcbn0gZnJvbSBcIkAvbGliL3V0aWxcIjtcclxuaW1wb3J0IHsgY3JlYXRlU2lnbmFsLCBjcmVhdGVNZW1vLCBTaG93LCBTZXR0ZXIsIEpTWCB9IGZyb20gXCJzb2xpZC1qc1wiO1xyXG5pbXBvcnQgeyBNYXJrZG93biB9IGZyb20gXCJAL2NvbXBvbmVudHMvTWFya2Rvd25cIjtcclxuaW1wb3J0IHsgRGF0ZVRpbWUgfSBmcm9tIFwibHV4b25cIjtcclxuaW1wb3J0IHsgQ2hlY2tib3hJbnB1dCB9IGZyb20gXCJAL2NvbXBvbmVudHMvSW5wdXRzL2NoZWNrYm94XCI7XHJcbmltcG9ydCB7IERhdGVEYXRldGltZUlucHV0IH0gZnJvbSBcIkAvY29tcG9uZW50cy9JbnB1dHMvZGF0ZWRhdGV0aW1lXCI7XHJcbmltcG9ydCB7IExpc3RUYWJsZURhdGFXcmFwcGVyIH0gZnJvbSBcIkAvY29tcG9uZW50cy9JbnB1dHMvbGlzdFwiO1xyXG5pbXBvcnQgeyBOdW1iZXJCdXR0b25zLCBOdW1iZXJJbnB1dCB9IGZyb20gXCJAL2NvbXBvbmVudHMvSW5wdXRzL251bWJlclwiO1xyXG5pbXBvcnQgeyBUZXh0SW5wdXQgfSBmcm9tIFwiQC9jb21wb25lbnRzL0lucHV0cy90ZXh0XCI7XHJcbmltcG9ydCB7IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQsIE5vdGljZSB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5pbXBvcnQgeyB1ZXNDb2RlQmxvY2sgfSBmcm9tIFwiQC9ob29rcy91c2VEYXRhRWRpdFwiO1xyXG5pbXBvcnQgRGF0YUVkaXQgZnJvbSBcIkAvbWFpblwiO1xyXG5cclxuZXhwb3J0IHR5cGUgVGFibGVEYXRhUHJvcHM8VCA9IERhdGF2aWV3UHJvcGVydHlWYWx1ZT4gPSB7XHJcbiAgdmFsdWU6IFQ7XHJcbiAgaGVhZGVyOiBzdHJpbmc7XHJcbiAgcHJvcGVydHk6IHN0cmluZztcclxuICBmaWxlUGF0aDogc3RyaW5nO1xyXG4gIHN0eWxlOiBzdHJpbmcgfCBKU1guQ1NTUHJvcGVydGllcyB8IHVuZGVmaW5lZDtcclxuICBvbk1vdXNlTW92ZTogKGU6IE1vdXNlRXZlbnQpID0+IHZvaWQ7XHJcbn07XHJcbmV4cG9ydCBjb25zdCBUYWJsZURhdGEgPSAocHJvcHM6IFRhYmxlRGF0YVByb3BzKSA9PiB7XHJcbiAgY29uc3QgW2lzRWRpdGluZywgc2V0RWRpdGluZ10gPSBjcmVhdGVTaWduYWwoZmFsc2UpO1xyXG4gIGNvbnN0IHtcclxuICAgIHBsdWdpbixcclxuICAgIGRhdGF2aWV3QVBJOiB7XHJcbiAgICAgIHNldHRpbmdzOiB7IHRhYmxlSWRDb2x1bW5OYW1lLCBkZWZhdWx0RGF0ZUZvcm1hdCwgZGVmYXVsdERhdGVUaW1lRm9ybWF0IH0sXHJcbiAgICAgIGx1eG9uLFxyXG4gICAgfSxcclxuICAgIGNvbmZpZyxcclxuICAgIGN0eCxcclxuICB9ID0gdWVzQ29kZUJsb2NrKCk7XHJcbiAgY29uc3QgdmFsdWVUeXBlID0gY3JlYXRlTWVtbygoKSA9PiB7XHJcbiAgICByZXR1cm4gZ2V0VmFsdWVUeXBlKHByb3BzLnZhbHVlLCBwcm9wcy5oZWFkZXIsIGx1eG9uKTtcclxuICB9KTtcclxuICBjb25zdCBpc0VkaXRhYmxlUHJvcGVydHkgPSAocHJvcGVydHk6IHN0cmluZykgPT4ge1xyXG4gICAgLy8gY29uc29sZS5sb2coXCJwcm9wZXJ0eTogXCIsIHByb3BlcnR5KTtcclxuICAgIGNvbnN0IHN0ciA9IChwcm9wZXJ0eSA/PyBcIlwiKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKHN0ciA9PT0gQ09NUExFWF9QUk9QRVJUWV9QTEFDRUhPTERFUi50b0xvd2VyQ2FzZSgpKSByZXR1cm4gZmFsc2U7XHJcbiAgICBpZiAoc3RyID09PSB0YWJsZUlkQ29sdW1uTmFtZS50b0xvd2VyQ2FzZSgpKSByZXR1cm4gZmFsc2U7XHJcbiAgICBpZiAoc3RyLmluY2x1ZGVzKFwiZmlsZS5cIikpIHJldHVybiBmYWxzZTtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH07XHJcbiAgcmV0dXJuIChcclxuICAgIDx0ZFxyXG4gICAgICBjbGFzcz1cIndoaXRlc3BhY2Utbm9ybWFsIHRleHQtbm93cmFwXCJcclxuICAgICAgdGFiSW5kZXg9ezB9XHJcbiAgICAgIG9uQ2xpY2s9eyhlKSA9PiB7XHJcbiAgICAgICAgLy8gbmV3IE5vdGljZShlLnRhcmdldC50YWdOYW1lKTtcclxuICAgICAgICAvLyBpZiBudW1iZXIgYnV0dG9ucyBhcmUgY2xpY2tlZFxyXG4gICAgICAgIGlmIChlLnRhcmdldC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgPT09IFwiYnV0dG9uXCIpIHJldHVybjtcclxuICAgICAgICBpZiAodmFsdWVUeXBlKCkgPT09IFwibGlzdFwiKSByZXR1cm47XHJcbiAgICAgICAgc2V0RWRpdGluZyh0cnVlKTtcclxuICAgICAgfX1cclxuICAgICAgb25Nb3VzZU1vdmU9e3Byb3BzLm9uTW91c2VNb3ZlfVxyXG4gICAgICBzdHlsZT17cHJvcHMuc3R5bGV9XHJcbiAgICA+XHJcbiAgICAgIDxTaG93XHJcbiAgICAgICAgd2hlbj17dmFsdWVUeXBlKCkgIT09IFwibGlzdFwifVxyXG4gICAgICAgIGZhbGxiYWNrPXtcclxuICAgICAgICAgIDxMaXN0VGFibGVEYXRhV3JhcHBlclxyXG4gICAgICAgICAgICB7Li4uKHByb3BzIGFzIFRhYmxlRGF0YVByb3BzPERhdGF2aWV3UHJvcGVydHlWYWx1ZUFycmF5Pil9XHJcbiAgICAgICAgICAvPlxyXG4gICAgICAgIH1cclxuICAgICAgPlxyXG4gICAgICAgIDxTaG93XHJcbiAgICAgICAgICB3aGVuPXtcclxuICAgICAgICAgICAgIWNvbmZpZy5sb2NrRWRpdGluZyAmJlxyXG4gICAgICAgICAgICBpc0VkaXRpbmcoKSAmJlxyXG4gICAgICAgICAgICBpc0VkaXRhYmxlUHJvcGVydHkocHJvcHMucHJvcGVydHkpXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBmYWxsYmFjaz17XHJcbiAgICAgICAgICAgIDxkaXZcclxuICAgICAgICAgICAgICBvbkNsaWNrPXtcclxuICAgICAgICAgICAgICAgIGlzRWRpdGFibGVQcm9wZXJ0eShwcm9wcy5wcm9wZXJ0eSlcclxuICAgICAgICAgICAgICAgICAgPyB1bmRlZmluZWRcclxuICAgICAgICAgICAgICAgICAgOiBjb25maWcubG9ja0VkaXRpbmdcclxuICAgICAgICAgICAgICAgICAgICA/IHVuZGVmaW5lZFxyXG4gICAgICAgICAgICAgICAgICAgIDogKCkgPT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBcIlRoaXMgaXMgYSBjYWxjdWxhdGVkIHByb3BlcnR5LCBzbyB5b3UgY2FuJ3QgZWRpdCBpdCFcIixcclxuICAgICAgICAgICAgICAgICAgICAgICAgKVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgIDxUYWJsZURhdGFEaXNwbGF5XHJcbiAgICAgICAgICAgICAgICB7Li4ucHJvcHN9XHJcbiAgICAgICAgICAgICAgICBzZXRFZGl0aW5nPXtzZXRFZGl0aW5nfVxyXG4gICAgICAgICAgICAgICAgdmFsdWVUeXBlPXt2YWx1ZVR5cGUoKX1cclxuICAgICAgICAgICAgICAgIHBsdWdpbj17cGx1Z2lufVxyXG4gICAgICAgICAgICAgICAgY3R4PXtjdHh9XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0RGF0ZUZvcm1hdD17ZGVmYXVsdERhdGVGb3JtYXR9XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0RGF0ZVRpbWVGb3JtYXQ9e2RlZmF1bHREYXRlVGltZUZvcm1hdH1cclxuICAgICAgICAgICAgICAvPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgIH1cclxuICAgICAgICA+XHJcbiAgICAgICAgICA8VGFibGVEYXRhRWRpdFxyXG4gICAgICAgICAgICB7Li4ucHJvcHN9XHJcbiAgICAgICAgICAgIHNldEVkaXRpbmc9e3NldEVkaXRpbmd9XHJcbiAgICAgICAgICAgIHZhbHVlVHlwZT17dmFsdWVUeXBlKCl9XHJcbiAgICAgICAgICAvPlxyXG4gICAgICAgIDwvU2hvdz5cclxuICAgICAgICA8U2hvd1xyXG4gICAgICAgICAgd2hlbj17XHJcbiAgICAgICAgICAgIHZhbHVlVHlwZSgpID09PSBcIm51bWJlclwiICYmXHJcbiAgICAgICAgICAgIGlzRWRpdGFibGVQcm9wZXJ0eShwcm9wcy5wcm9wZXJ0eSkgJiZcclxuICAgICAgICAgICAgIWNvbmZpZy5sb2NrRWRpdGluZ1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgID5cclxuICAgICAgICAgIDxOdW1iZXJCdXR0b25zXHJcbiAgICAgICAgICAgIHsuLi4ocHJvcHMgYXMgVGFibGVEYXRhUHJvcHM8bnVtYmVyPil9XHJcbiAgICAgICAgICAgIHBsdWdpbj17cGx1Z2lufVxyXG4gICAgICAgICAgLz5cclxuICAgICAgICA8L1Nob3c+XHJcbiAgICAgIDwvU2hvdz5cclxuICAgIDwvdGQ+XHJcbiAgKTtcclxufTtcclxuXHJcbmV4cG9ydCB0eXBlIFRhYmxlRGF0YURpc3BsYXlQcm9wcyA9IFRhYmxlRGF0YVByb3BzICYge1xyXG4gIHNldEVkaXRpbmc6IFNldHRlcjxib29sZWFuPjtcclxuICB2YWx1ZVR5cGU6IFByb3BlcnR5VmFsdWVUeXBlO1xyXG4gIHBsdWdpbjogRGF0YUVkaXQ7XHJcbiAgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0O1xyXG4gIGRlZmF1bHREYXRlRm9ybWF0OiBzdHJpbmc7XHJcbiAgZGVmYXVsdERhdGVUaW1lRm9ybWF0OiBzdHJpbmc7XHJcbn07XHJcbmV4cG9ydCBjb25zdCBUYWJsZURhdGFEaXNwbGF5ID0gKHByb3BzOiBUYWJsZURhdGFEaXNwbGF5UHJvcHMpID0+IHtcclxuICByZXR1cm4gKFxyXG4gICAgPD5cclxuICAgICAgPFNob3cgd2hlbj17cHJvcHMudmFsdWVUeXBlID09PSBcInRleHRcIiB8fCBwcm9wcy52YWx1ZVR5cGUgPT09IFwibnVtYmVyXCJ9PlxyXG4gICAgICAgIDxNYXJrZG93blxyXG4gICAgICAgICAgY2xhc3M9XCJzaXplLWZ1bGxcIlxyXG4gICAgICAgICAgYXBwPXtwcm9wcy5wbHVnaW4uYXBwfVxyXG4gICAgICAgICAgbWFya2Rvd249e3RyeURhdGF2aWV3TGlua1RvTWFya2Rvd24ocHJvcHMudmFsdWUpfVxyXG4gICAgICAgICAgc291cmNlUGF0aD17cHJvcHMuY3R4LnNvdXJjZVBhdGh9XHJcbiAgICAgICAgLz5cclxuICAgICAgPC9TaG93PlxyXG4gICAgICA8U2hvdyB3aGVuPXtwcm9wcy52YWx1ZVR5cGUgPT09IFwiY2hlY2tib3hcIn0+XHJcbiAgICAgICAgPENoZWNrYm94SW5wdXQgey4uLnByb3BzfSAvPlxyXG4gICAgICA8L1Nob3c+XHJcbiAgICAgIDxTaG93IHdoZW49e3Byb3BzLnZhbHVlVHlwZSA9PT0gXCJkYXRlXCIgfHwgcHJvcHMudmFsdWVUeXBlID09PSBcImRhdGV0aW1lXCJ9PlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJzaXplLWZ1bGxcIj5cclxuICAgICAgICAgIHsocHJvcHMudmFsdWUgYXMgRGF0ZVRpbWUpLnRvRm9ybWF0KFxyXG4gICAgICAgICAgICBjaGVja0lmRGF0ZUhhc1RpbWUocHJvcHMudmFsdWUgYXMgRGF0ZVRpbWUpXHJcbiAgICAgICAgICAgICAgPyBwcm9wcy5kZWZhdWx0RGF0ZVRpbWVGb3JtYXRcclxuICAgICAgICAgICAgICA6IHByb3BzLmRlZmF1bHREYXRlRm9ybWF0LFxyXG4gICAgICAgICAgKX1cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgPC9TaG93PlxyXG4gICAgPC8+XHJcbiAgKTtcclxufTtcclxuXHJcbmV4cG9ydCB0eXBlIFRhYmxlRGF0YUVkaXRQcm9wczxUID0gdW5rbm93bj4gPSBUYWJsZURhdGFQcm9wczxUPiAmIHtcclxuICBzZXRFZGl0aW5nOiBTZXR0ZXI8Ym9vbGVhbj47XHJcbiAgdmFsdWVUeXBlOiBQcm9wZXJ0eVZhbHVlVHlwZTtcclxufTtcclxuZXhwb3J0IGNvbnN0IFRhYmxlRGF0YUVkaXQgPSAocHJvcHM6IFRhYmxlRGF0YUVkaXRQcm9wcykgPT4ge1xyXG4gIC8vIHJldHVybiA8VGV4dElucHV0IHsuLi5wcm9wc30gLz47XHJcblxyXG4gIHJldHVybiAoXHJcbiAgICA8PlxyXG4gICAgICA8U2hvdyB3aGVuPXtwcm9wcy52YWx1ZVR5cGUgPT09IFwidGV4dFwifT5cclxuICAgICAgICA8VGV4dElucHV0IHsuLi5wcm9wc30gLz5cclxuICAgICAgPC9TaG93PlxyXG4gICAgICA8U2hvdyB3aGVuPXtwcm9wcy52YWx1ZVR5cGUgPT09IFwibnVtYmVyXCJ9PlxyXG4gICAgICAgIDxOdW1iZXJJbnB1dCB7Li4ucHJvcHN9IC8+XHJcbiAgICAgIDwvU2hvdz5cclxuICAgICAgPFNob3cgd2hlbj17cHJvcHMudmFsdWVUeXBlID09PSBcImRhdGVcIiB8fCBwcm9wcy52YWx1ZVR5cGUgPT09IFwiZGF0ZXRpbWVcIn0+XHJcbiAgICAgICAgPERhdGVEYXRldGltZUlucHV0IHsuLi4ocHJvcHMgYXMgVGFibGVEYXRhRWRpdFByb3BzPERhdGVUaW1lPil9IC8+XHJcbiAgICAgIDwvU2hvdz5cclxuICAgIDwvPlxyXG4gICk7XHJcbn07XHJcbiIsImltcG9ydCB7XHJcbiAgRGF0YXZpZXdRdWVyeVJlc3VsdEhlYWRlcnMsXHJcbiAgRGF0YXZpZXdRdWVyeVJlc3VsdFZhbHVlcyxcclxuICBEYXRhdmlld0xpbmssXHJcbn0gZnJvbSBcIkAvbGliL3R5cGVzXCI7XHJcbmltcG9ydCB7IGdldElkQ29sdW1uSW5kZXggfSBmcm9tIFwiQC9saWIvdXRpbFwiO1xyXG5pbXBvcnQgeyBGb3IsIFNldHRlciB9IGZyb20gXCJzb2xpZC1qc1wiO1xyXG5pbXBvcnQgeyBUYWJsZURhdGEgfSBmcm9tIFwiLi4vVGFibGVEYXRhXCI7XHJcbmltcG9ydCB7IHVlc0NvZGVCbG9jayB9IGZyb20gXCJAL2hvb2tzL3VzZURhdGFFZGl0XCI7XHJcblxyXG5jb25zdCBoaWdobGlnaHRTdHlsZSA9IHtcclxuICBcImJvcmRlci1sZWZ0LXdpZHRoXCI6IFwiMnB4XCIsXHJcbiAgXCJib3JkZXItcmlnaHQtd2lkdGhcIjogXCIycHhcIixcclxuICBcImJvcmRlci1sZWZ0LWNvbG9yXCI6IFwiaHNsKHZhcigtLWFjY2VudC1oKSB2YXIoLS1hY2NlbnQtcykgdmFyKC0tYWNjZW50LWwpKVwiLFxyXG4gIFwiYm9yZGVyLXJpZ2h0LWNvbG9yXCI6IFwiaHNsKHZhcigtLWFjY2VudC1oKSB2YXIoLS1hY2NlbnQtcykgdmFyKC0tYWNjZW50LWwpKVwiLFxyXG4gIFwiYmFja2dyb3VuZC1jb2xvclwiOiBgaHNsKHZhcigtLWFjY2VudC1oKSB2YXIoLS1hY2NlbnQtcykgdmFyKC0tYWNjZW50LWwpIC8gMTAlKWAsXHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgZHJhZ2dlZE92ZXJSaWdodCA9IHtcclxuICBcImJvcmRlci1yaWdodC13aWR0aFwiOiBcIjJweFwiLFxyXG4gIFwiYm9yZGVyLXJpZ2h0LWNvbG9yXCI6IFwiaHNsKHZhcigtLWFjY2VudC1oKSB2YXIoLS1hY2NlbnQtcykgdmFyKC0tYWNjZW50LWwpKVwiLFxyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IGRyYWdnZWRPdmVyTGVmdCA9IHtcclxuICBcImJvcmRlci1sZWZ0LXdpZHRoXCI6IFwiMnB4XCIsXHJcbiAgXCJib3JkZXItbGVmdC1jb2xvclwiOiBcImhzbCh2YXIoLS1hY2NlbnQtaCkgdmFyKC0tYWNjZW50LXMpIHZhcigtLWFjY2VudC1sKSlcIixcclxufTtcclxuXHJcbmNvbnN0IGxhc3RDZWxsSGlnaGxpZ2h0ID0ge1xyXG4gIFwiYm9yZGVyLWJvdHRvbS13aWR0aFwiOiBcIjJweFwiLFxyXG4gIFwiYm9yZGVyLWJvdHRvbS1jb2xvclwiOiBcImhzbCh2YXIoLS1hY2NlbnQtaCkgdmFyKC0tYWNjZW50LXMpIHZhcigtLWFjY2VudC1sKSlcIixcclxufTtcclxuXHJcbnR5cGUgVGFibGVCb2R5UHJvcHMgPSB7XHJcbiAgaGVhZGVyczogRGF0YXZpZXdRdWVyeVJlc3VsdEhlYWRlcnM7XHJcbiAgcHJvcGVydGllczogc3RyaW5nW107XHJcbiAgcm93czogRGF0YXZpZXdRdWVyeVJlc3VsdFZhbHVlcztcclxuICBoaWdobGlnaHRJbmRleDogbnVtYmVyO1xyXG4gIHNldEhpZ2hsaWdodEluZGV4OiBTZXR0ZXI8bnVtYmVyPjtcclxuICBkcmFnZ2VkT3ZlckluZGV4OiBudW1iZXI7XHJcbiAgc2V0RHJhZ2dlZE92ZXJJbmRleDogU2V0dGVyPG51bWJlcj47XHJcbn07XHJcbmV4cG9ydCBjb25zdCBUYWJsZUJvZHkgPSAocHJvcHM6IFRhYmxlQm9keVByb3BzKSA9PiB7XHJcbiAgY29uc3Qge1xyXG4gICAgZGF0YXZpZXdBUEk6IHtcclxuICAgICAgc2V0dGluZ3M6IHsgdGFibGVJZENvbHVtbk5hbWUgfSxcclxuICAgIH0sXHJcbiAgfSA9IHVlc0NvZGVCbG9jaygpO1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPHRib2R5PlxyXG4gICAgICA8Rm9yIGVhY2g9e3Byb3BzLnJvd3N9PlxyXG4gICAgICAgIHsocm93LCByb3dJbmRleCkgPT4gKFxyXG4gICAgICAgICAgPHRyPlxyXG4gICAgICAgICAgICA8Rm9yIGVhY2g9e3Jvd30+XHJcbiAgICAgICAgICAgICAgeyh2YWx1ZSwgdmFsdWVJbmRleCkgPT4gKFxyXG4gICAgICAgICAgICAgICAgPFRhYmxlRGF0YVxyXG4gICAgICAgICAgICAgICAgICB2YWx1ZT17dmFsdWV9XHJcbiAgICAgICAgICAgICAgICAgIGhlYWRlcj17cHJvcHMuaGVhZGVyc1t2YWx1ZUluZGV4KCldfVxyXG4gICAgICAgICAgICAgICAgICBwcm9wZXJ0eT17cHJvcHMucHJvcGVydGllc1t2YWx1ZUluZGV4KCldfVxyXG4gICAgICAgICAgICAgICAgICBmaWxlUGF0aD17XHJcbiAgICAgICAgICAgICAgICAgICAgKFxyXG4gICAgICAgICAgICAgICAgICAgICAgcm93W1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBnZXRJZENvbHVtbkluZGV4KHByb3BzLmhlYWRlcnMsIHRhYmxlSWRDb2x1bW5OYW1lKVxyXG4gICAgICAgICAgICAgICAgICAgICAgXSBhcyBEYXRhdmlld0xpbmtcclxuICAgICAgICAgICAgICAgICAgICApLnBhdGggPz8gXCJcIlxyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIG9uTW91c2VNb3ZlPXsoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BzLmhpZ2hsaWdodEluZGV4ID09PSAtMSkgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIHByb3BzLnNldERyYWdnZWRPdmVySW5kZXgodmFsdWVJbmRleCgpKTtcclxuICAgICAgICAgICAgICAgICAgfX1cclxuICAgICAgICAgICAgICAgICAgc3R5bGU9e1xyXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlSW5kZXgoKSA9PT0gcHJvcHMuaGlnaGxpZ2h0SW5kZXhcclxuICAgICAgICAgICAgICAgICAgICAgID8gcm93SW5kZXgoKSA9PT0gcHJvcHMucm93cy5sZW5ndGggLSAxXHJcbiAgICAgICAgICAgICAgICAgICAgICAgID8geyAuLi5oaWdobGlnaHRTdHlsZSwgLi4ubGFzdENlbGxIaWdobGlnaHQgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICA6IGhpZ2hsaWdodFN0eWxlXHJcbiAgICAgICAgICAgICAgICAgICAgICA6IHZhbHVlSW5kZXgoKSA9PT0gcHJvcHMuZHJhZ2dlZE92ZXJJbmRleFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA/IHByb3BzLmhpZ2hsaWdodEluZGV4IDwgdmFsdWVJbmRleCgpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgPyBkcmFnZ2VkT3ZlclJpZ2h0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgOiBkcmFnZ2VkT3ZlckxlZnRcclxuICAgICAgICAgICAgICAgICAgICAgICAgOiB7fVxyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvPlxyXG4gICAgICAgICAgICAgICl9XHJcbiAgICAgICAgICAgIDwvRm9yPlxyXG4gICAgICAgICAgPC90cj5cclxuICAgICAgICApfVxyXG4gICAgICA8L0Zvcj5cclxuICAgIDwvdGJvZHk+XHJcbiAgKTtcclxufTtcclxuIiwiLyoqXG4qIEBsaWNlbnNlIGx1Y2lkZS1zb2xpZCB2MC40MTIuMCAtIElTQ1xuKlxuKiBUaGlzIHNvdXJjZSBjb2RlIGlzIGxpY2Vuc2VkIHVuZGVyIHRoZSBJU0MgbGljZW5zZS5cbiogU2VlIHRoZSBMSUNFTlNFIGZpbGUgaW4gdGhlIHJvb3QgZGlyZWN0b3J5IG9mIHRoaXMgc291cmNlIHRyZWUuXG4qL1xuXG4vLyBzcmMvaWNvbnMvZ3JpcC1ob3Jpem9udGFsLnRzeFxuaW1wb3J0IEljb24gZnJvbSBcIi4uL0ljb25cIjtcbnZhciBpY29uTm9kZSA9IFtcbiAgW1wiY2lyY2xlXCIsIHsgY3g6IFwiMTJcIiwgY3k6IFwiOVwiLCByOiBcIjFcIiwga2V5OiBcIjEyNG10eVwiIH1dLFxuICBbXCJjaXJjbGVcIiwgeyBjeDogXCIxOVwiLCBjeTogXCI5XCIsIHI6IFwiMVwiLCBrZXk6IFwiMXJ1em8yXCIgfV0sXG4gIFtcImNpcmNsZVwiLCB7IGN4OiBcIjVcIiwgY3k6IFwiOVwiLCByOiBcIjFcIiwga2V5OiBcIjFhOGIyOFwiIH1dLFxuICBbXCJjaXJjbGVcIiwgeyBjeDogXCIxMlwiLCBjeTogXCIxNVwiLCByOiBcIjFcIiwga2V5OiBcIjFlNTZ4Z1wiIH1dLFxuICBbXCJjaXJjbGVcIiwgeyBjeDogXCIxOVwiLCBjeTogXCIxNVwiLCByOiBcIjFcIiwga2V5OiBcIjFhOTJlcFwiIH1dLFxuICBbXCJjaXJjbGVcIiwgeyBjeDogXCI1XCIsIGN5OiBcIjE1XCIsIHI6IFwiMVwiLCBrZXk6IFwiNXIxand5XCIgfV1cbl07XG52YXIgR3JpcEhvcml6b250YWwgPSAocHJvcHMpID0+IDxJY29uIHsuLi5wcm9wc30gbmFtZT1cIkdyaXBIb3Jpem9udGFsXCIgaWNvbk5vZGU9e2ljb25Ob2RlfSAvPjtcbnZhciBncmlwX2hvcml6b250YWxfZGVmYXVsdCA9IEdyaXBIb3Jpem9udGFsO1xuZXhwb3J0IHtcbiAgZ3JpcF9ob3Jpem9udGFsX2RlZmF1bHQgYXMgZGVmYXVsdFxufTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWdyaXAtaG9yaXpvbnRhbC5qc3gubWFwXG4iLCJpbXBvcnQgeyBNYXJrZG93biB9IGZyb20gXCJAL2NvbXBvbmVudHMvTWFya2Rvd25cIjtcclxuaW1wb3J0IHsgRGF0YXZpZXdRdWVyeVJlc3VsdEhlYWRlcnMgfSBmcm9tIFwiQC9saWIvdHlwZXNcIjtcclxuaW1wb3J0IHsgY3JlYXRlU2lnbmFsLCBGb3IsIG9uQ2xlYW51cCwgU2V0dGVyIH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcbmltcG9ydCBHcmlwSG9yaXpvbnRhbCBmcm9tIFwibHVjaWRlLXNvbGlkL2ljb25zL0dyaXAtaG9yaXpvbnRhbFwiO1xyXG5pbXBvcnQgeyBkcmFnZ2VkT3ZlckxlZnQsIGRyYWdnZWRPdmVyUmlnaHQgfSBmcm9tIFwiLi4vVGFibGVCb2R5XCI7XHJcbmltcG9ydCB7IGdldFRhYmxlTGluZSB9IGZyb20gXCJAL2xpYi91dGlsXCI7XHJcbmltcG9ydCB7IE1hcmtkb3duVmlldyB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5pbXBvcnQgeyB1ZXNDb2RlQmxvY2sgfSBmcm9tIFwiQC9ob29rcy91c2VEYXRhRWRpdFwiO1xyXG5cclxuZXhwb3J0IHR5cGUgVGFibGVIZWFkUHJvcHMgPSB7XHJcbiAgaGVhZGVyczogRGF0YXZpZXdRdWVyeVJlc3VsdEhlYWRlcnM7XHJcbiAgcHJvcGVydGllczogc3RyaW5nW107XHJcbiAgaGlnaGxpZ2h0SW5kZXg6IG51bWJlcjtcclxuICBzZXRIaWdobGlnaHRJbmRleDogU2V0dGVyPG51bWJlcj47XHJcbiAgZHJhZ2dlZE92ZXJJbmRleDogbnVtYmVyO1xyXG4gIHNldERyYWdnZWRPdmVySW5kZXg6IFNldHRlcjxudW1iZXI+O1xyXG59O1xyXG5leHBvcnQgY29uc3QgVGFibGVIZWFkID0gKHByb3BzOiBUYWJsZUhlYWRQcm9wcykgPT4ge1xyXG4gIGNvbnN0IHtcclxuICAgIHBsdWdpbixcclxuICAgIGN0eCxcclxuICAgIGVsLFxyXG4gICAgcXVlcnksXHJcbiAgICBkYXRhdmlld0FQSToge1xyXG4gICAgICBzZXR0aW5nczogeyB0YWJsZUlkQ29sdW1uTmFtZSB9LFxyXG4gICAgfSxcclxuICB9ID0gdWVzQ29kZUJsb2NrKCk7XHJcbiAgY29uc3QgW3RyYW5zbGF0ZVgsIHNldFRyYW5zbGF0ZVhdID0gY3JlYXRlU2lnbmFsKDApO1xyXG4gIGxldCBsYXN0TW91c2VQb3MgPSAwO1xyXG5cclxuICBjb25zdCBvbk1vdXNlTW92ZSA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICAvLyBjb25zb2xlLmxvZyhcIm1vdXNlIG1vdmUgY2FsbGVkXCIpO1xyXG4gICAgaWYgKHByb3BzLmhpZ2hsaWdodEluZGV4ID09PSAtMSkgcmV0dXJuO1xyXG4gICAgc2V0VHJhbnNsYXRlWCgoKSA9PiBlLmNsaWVudFggLSBsYXN0TW91c2VQb3MpO1xyXG4gIH07XHJcblxyXG4gIC8vIGNvbnN0IG9uTW91c2VVcCA9IGFzeW5jICgpID0+IHtcclxuICAvLyAgIC8vIGlmIGRyYWdnZWQgb3ZlciBhIGNvbHVtbiBvdGhlciB0aGFuIHRoZSBoaWdobGlnaHRlZCAoZHJhZ2dpbmcpIG9uZVxyXG4gIC8vICAgaWYgKFxyXG4gIC8vICAgICBwcm9wcy5kcmFnZ2VkT3ZlckluZGV4ICE9PSAtMSAmJlxyXG4gIC8vICAgICBwcm9wcy5kcmFnZ2VkT3ZlckluZGV4ICE9PSBwcm9wcy5oaWdobGlnaHRJbmRleFxyXG4gIC8vICAgKSB7XHJcbiAgLy8gICAgIGNvbnN0IHtcclxuICAvLyAgICAgICBwbHVnaW4sXHJcbiAgLy8gICAgICAgY3R4LFxyXG4gIC8vICAgICAgIGVsLFxyXG4gIC8vICAgICAgIHF1ZXJ5LFxyXG4gIC8vICAgICAgIGRhdGF2aWV3QVBJOiB7XHJcbiAgLy8gICAgICAgICBzZXR0aW5nczogeyB0YWJsZUlkQ29sdW1uTmFtZSB9LFxyXG4gIC8vICAgICAgIH0sXHJcbiAgLy8gICAgIH0gPSBwcm9wcy5jb2RlQmxvY2tJbmZvO1xyXG4gIC8vICAgICBjb25zdCB7XHJcbiAgLy8gICAgICAgYXBwOiB7IHZhdWx0LCB3b3Jrc3BhY2UgfSxcclxuICAvLyAgICAgfSA9IHBsdWdpbjtcclxuICAvLyAgICAgY29uc3QgdmlldyA9IHdvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XHJcbiAgLy8gICAgIGNvbnN0IHNlY3Rpb25JbmZvID0gY3R4LmdldFNlY3Rpb25JbmZvKGVsKTtcclxuICAvLyAgICAgLy8geW91IHNob3VsZG4ndCBiZSBhYmxlIHRvIGdldCB0byB0aGlzIHBvaW50IGlmIGl0J3MgbnVsbFxyXG4gIC8vICAgICBpZiAoIXNlY3Rpb25JbmZvIHx8ICF2aWV3KSB7XHJcbiAgLy8gICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhpcyBzaG91bGQgYmUgaW1wb3NzaWJsZVwiKTtcclxuICAvLyAgICAgfVxyXG4gIC8vICAgICBjb25zdCB7IGxpbmVTdGFydCwgdGV4dDogY29udGVudCB9ID0gc2VjdGlvbkluZm87XHJcbiAgLy8gICAgIGNvbnN0IGZpbGUgPSB2YXVsdC5nZXRGaWxlQnlQYXRoKGN0eC5zb3VyY2VQYXRoKTtcclxuICAvLyAgICAgLy8geW91IHNob3VsZG4ndCBiZSBhYmxlIHRvIGdldCB0byB0aGlzIHBvaW50IGlmIGl0J3MgbnVsbFxyXG4gIC8vICAgICBpZiAoIWZpbGUpIHtcclxuICAvLyAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGlzIHNob3VsZCBiZSBpbXBvc3NpYmxlXCIpO1xyXG4gIC8vICAgICB9XHJcbiAgLy8gICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdChcIlxcblwiKTtcclxuICAvLyAgICAgY29uc3QgeyBsaW5lOiBwcmVUYWJsZUxpbmUsIGluZGV4IH0gPSBnZXRUYWJsZUxpbmUocXVlcnkpO1xyXG4gIC8vICAgICAvLyBpbmRleCBpcyByZWxhdGl2ZSB0byB0aGUgcHJvdmlkZWQgc291cmNlLCBzbyB0aGlzIG9mZnNldHMgdG8gYW4gaW5kZXggb2YgdGhlIHdob2xlIG5vdGVcclxuICAvLyAgICAgLy8gYWRkIG9uZSBiZWNhdXNlIGBzb3VyY2VgIGRvZXNuJ3QgaW5jbHVkZSBiYWNrdGlja3MsIGJ1dCBsaW5lU3RhcnQgaXMgdGhlIGZpcnN0IGJhY2t0aWNrc1xyXG4gIC8vICAgICBjb25zdCB0YWJsZUxpbmVJbmRleCA9IGxpbmVTdGFydCArIGluZGV4ICsgMTtcclxuICAvLyAgICAgY29uc3QgaXNXaXRob3V0SWQgPSBuZXcgUmVnRXhwKC9UQUJMRVxccytXSVRIT1VUXFxzK0lEL2dpbSkudGVzdChcclxuICAvLyAgICAgICBwcmVUYWJsZUxpbmUsXHJcbiAgLy8gICAgICk7XHJcbiAgLy8gICAgIGNvbnN0IGlzRHJhZ2dpbmdEZWZhdWx0SWQgPVxyXG4gIC8vICAgICAgIC8vIGlmIHF1ZXJ5IGhhcyAnV0lUSE9VVCBJRCcgd2UgZG9uJ3QgY2FyZVxyXG4gIC8vICAgICAgICFpc1dpdGhvdXRJZCAmJlxyXG4gIC8vICAgICAgIC8vIGRlZmF1bHQgaWQgY29sIGlzIGFsd2F5cyBmaXJzdFxyXG4gIC8vICAgICAgIHByb3BzLmhpZ2hsaWdodEluZGV4ID09PSAwICYmXHJcbiAgLy8gICAgICAgLy8gdGhlIGhlYWRlciB3aWxsIGFsd2F5cyBiZSB0aGUgbmFtZSBmcm9tIGRhdGF2aWV3IHNldHRpbmdzXHJcbiAgLy8gICAgICAgcHJvcHMuaGVhZGVyc1twcm9wcy5oaWdobGlnaHRJbmRleF0gPT09IHRhYmxlSWRDb2x1bW5OYW1lO1xyXG4gIC8vICAgICAvLyBuZWVkIHRvIGNoZWNrIHNlcGFyYXRlbHkgZm9yIGRyYWdnZWQgb3ZlciBiZWNhdXNlIGl0IHdpbGwgY2hhbmdlIGhvdyB3ZSBhZGp1c3QgdGhlIGhlYWRlcnNcclxuICAvLyAgICAgY29uc3QgaXNEcmFnZ2VkT3ZlckRlZmF1bHRJZCA9XHJcbiAgLy8gICAgICAgIWlzV2l0aG91dElkICYmXHJcbiAgLy8gICAgICAgcHJvcHMuZHJhZ2dlZE92ZXJJbmRleCA9PT0gMCAmJlxyXG4gIC8vICAgICAgIHByb3BzLmhlYWRlcnNbcHJvcHMuZHJhZ2dlZE92ZXJJbmRleF0gPT09IHRhYmxlSWRDb2x1bW5OYW1lO1xyXG4gIC8vICAgICBjb25zdCBpc1JlbGF0aW5nVG9EZWZhdWx0SWQgPVxyXG4gIC8vICAgICAgIGlzRHJhZ2dpbmdEZWZhdWx0SWQgfHwgaXNEcmFnZ2VkT3ZlckRlZmF1bHRJZDtcclxuICAvLyAgICAgY29uc3QgdGFibGVMaW5lID0gaXNSZWxhdGluZ1RvRGVmYXVsdElkXHJcbiAgLy8gICAgICAgPyAvLyB0byAnbW92ZScgdGhlIGRlZmF1bHQgaWQgY29sLCB3ZSBoYXZlIHRvIG1vZGlmeSB0aGUgcXVlcnkgdG8gaGF2ZSB0aGlzIGFuZCBhIGZpbGUubGluayBjb2xcclxuICAvLyAgICAgICAgIHByZVRhYmxlTGluZS5yZXBsYWNlKC90YWJsZS9pLCBcIlRBQkxFIFdJVEhPVVQgSURcIilcclxuICAvLyAgICAgICA6IHByZVRhYmxlTGluZTtcclxuICAvLyAgICAgLy8gVEFCTEUgdnMgVEFCTEUgV0lUSE9VVCBJRFxyXG4gIC8vICAgICBjb25zdCB0YWJsZUtleXdvcmQgPSB0YWJsZUxpbmVcclxuICAvLyAgICAgICAuc2xpY2UoMCwgaXNXaXRob3V0SWQgfHwgaXNSZWxhdGluZ1RvRGVmYXVsdElkID8gMTYgOiA1KVxyXG4gIC8vICAgICAgIC50cmltKCk7XHJcbiAgLy8gICAgIGNvbnN0IHByZUNvbHMgPSB0YWJsZUxpbmVcclxuICAvLyAgICAgICAuc2xpY2UoaXNXaXRob3V0SWQgfHwgaXNSZWxhdGluZ1RvRGVmYXVsdElkID8gMTcgOiA2KVxyXG4gIC8vICAgICAgIC8vIHNwbGl0IG9uIGNvbW1hIHVubGVzcyBzdXJyb3VuZGVkIGJ5IGRvdWJsZSBxdW90ZXNcclxuICAvLyAgICAgICAuc3BsaXQoLywoPz0oPzooPzpbXlwiXSpcIil7Mn0pKlteXCJdKiQpLylcclxuICAvLyAgICAgICAubWFwKChjKSA9PiBjLnRyaW0oKSk7XHJcbiAgLy8gICAgIGNvbnN0IGNvbHMgPSBpc1JlbGF0aW5nVG9EZWZhdWx0SWRcclxuICAvLyAgICAgICA/IC8vIHRoaXMgaXMgaG93IHdlIGFsbG93IHRoZSBkZWZhdWx0IGlkIGNvbCB0byBiZSAnbW92ZWQnXHJcbiAgLy8gICAgICAgICBbXCJmaWxlLmxpbmsgQVMgXCIgKyB0YWJsZUlkQ29sdW1uTmFtZSwgLi4ucHJlQ29sc11cclxuICAvLyAgICAgICA6IHByZUNvbHM7XHJcbiAgLy8gICAgIC8vIG5lZWQgdG8gb2Zmc2V0IGJvdGggYnkgMSBiZWNhdXNlIGlmIHF1ZXJ5IGRvZXNuJ3QgaGF2ZSAnV0lUSE9VVCBJRCcgdGhlbiB0aGUgZmlyc3QgY29sdW1uIGlzIHRoZSBkZWZhdWx0IGlkIGNvbFxyXG4gIC8vICAgICBjb25zdCBoaWdobGlnaHRJbmRleCA9XHJcbiAgLy8gICAgICAgcHJvcHMuaGlnaGxpZ2h0SW5kZXggLSAoaXNXaXRob3V0SWQgfHwgaXNSZWxhdGluZ1RvRGVmYXVsdElkID8gMCA6IDEpO1xyXG4gIC8vICAgICBjb25zdCBkcmFnZ2VkSW5kZXggPVxyXG4gIC8vICAgICAgIHByb3BzLmRyYWdnZWRPdmVySW5kZXggLSAoaXNXaXRob3V0SWQgfHwgaXNSZWxhdGluZ1RvRGVmYXVsdElkID8gMCA6IDEpO1xyXG4gIC8vICAgICBjb25zdCBjb2xzV2l0aG91dEhpZ2hsaWdodCA9IGNvbHMudG9TcGxpY2VkKGhpZ2hsaWdodEluZGV4LCAxKTtcclxuICAvLyAgICAgLy8gaW5zZXJ0IHRoZSBoaWdobGlnaHQgY29sIHdoZXJlIHRoZSBpbmRpY2F0b3IgaXNcclxuICAvLyAgICAgY29uc3QgbmV3Q29scyA9IGNvbHNXaXRob3V0SGlnaGxpZ2h0LnRvU3BsaWNlZChcclxuICAvLyAgICAgICBkcmFnZ2VkSW5kZXgsXHJcbiAgLy8gICAgICAgMCxcclxuICAvLyAgICAgICBjb2xzW2hpZ2hsaWdodEluZGV4XSxcclxuICAvLyAgICAgKTtcclxuICAvLyAgICAgLy8gcmVjb25zdHJ1Y3QgdGhlIHF1ZXJ5IGxpbmVcclxuICAvLyAgICAgbGluZXNbdGFibGVMaW5lSW5kZXhdID0gdGFibGVLZXl3b3JkICsgXCIgXCIgKyBuZXdDb2xzLmpvaW4oXCIsIFwiKTtcclxuICAvLyAgICAgY29uc3QgbmV3Q29udGVudCA9IGxpbmVzLmpvaW4oXCJcXG5cIik7XHJcbiAgLy8gICAgIC8vIHVwZGF0ZSB0aGUgZmlsZSB3aXRoIG5ldyBsaW5lXHJcbiAgLy8gICAgIGF3YWl0IHZhdWx0Lm1vZGlmeShmaWxlLCBuZXdDb250ZW50KTtcclxuICAvLyAgIH1cclxuXHJcbiAgLy8gICBwcm9wcy5zZXRIaWdobGlnaHRJbmRleCgtMSk7XHJcbiAgLy8gICBwcm9wcy5zZXREcmFnZ2VkT3ZlckluZGV4KC0xKTtcclxuICAvLyAgIHNldFRyYW5zbGF0ZVgoMCk7XHJcbiAgLy8gICBsYXN0TW91c2VQb3MgPSAwO1xyXG4gIC8vICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xyXG4gIC8vIH07XHJcblxyXG4gIC8vIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIG9uTW91c2VNb3ZlKTtcclxuXHJcbiAgY29uc3Qgb25Nb3VzZVVwID0gKCkgPT4ge1xyXG4gICAgLy8gaWYgZHJhZ2dlZCBvdmVyIGEgY29sdW1uIG90aGVyIHRoYW4gdGhlIGhpZ2hsaWdodGVkIChkcmFnZ2luZykgb25lXHJcbiAgICBpZiAoXHJcbiAgICAgIHByb3BzLmRyYWdnZWRPdmVySW5kZXggIT09IC0xICYmXHJcbiAgICAgIHByb3BzLmRyYWdnZWRPdmVySW5kZXggIT09IHByb3BzLmhpZ2hsaWdodEluZGV4XHJcbiAgICApIHtcclxuICAgICAgY29uc3Qge1xyXG4gICAgICAgIGFwcDogeyB3b3Jrc3BhY2UgfSxcclxuICAgICAgfSA9IHBsdWdpbjtcclxuICAgICAgY29uc3QgdmlldyA9IHdvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XHJcbiAgICAgIGNvbnN0IHNlY3Rpb25JbmZvID0gY3R4LmdldFNlY3Rpb25JbmZvKGVsKTtcclxuICAgICAgLy8geW91IHNob3VsZG4ndCBiZSBhYmxlIHRvIGdldCB0byB0aGlzIHBvaW50IGlmIGl0J3MgbnVsbFxyXG4gICAgICBpZiAoIXNlY3Rpb25JbmZvIHx8ICF2aWV3KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhpcyBzaG91bGQgYmUgaW1wb3NzaWJsZVwiKTtcclxuICAgICAgfVxyXG4gICAgICBjb25zdCB7IGxpbmVTdGFydCB9ID0gc2VjdGlvbkluZm87XHJcbiAgICAgIGNvbnN0IHsgbGluZTogcHJlVGFibGVMaW5lLCBpbmRleCB9ID0gZ2V0VGFibGVMaW5lKHF1ZXJ5KTtcclxuICAgICAgLy8gaW5kZXggaXMgcmVsYXRpdmUgdG8gdGhlIHByb3ZpZGVkIHNvdXJjZSwgc28gdGhpcyBvZmZzZXRzIHRvIGFuIGluZGV4IG9mIHRoZSB3aG9sZSBub3RlXHJcbiAgICAgIC8vIGFkZCBvbmUgYmVjYXVzZSBgc291cmNlYCBkb2Vzbid0IGluY2x1ZGUgYmFja3RpY2tzLCBidXQgbGluZVN0YXJ0IGlzIHRoZSBmaXJzdCBiYWNrdGlja3NcclxuICAgICAgY29uc3QgdGFibGVMaW5lSW5kZXggPSBsaW5lU3RhcnQgKyBpbmRleCArIDE7XHJcbiAgICAgIGNvbnN0IGlzV2l0aG91dElkID0gbmV3IFJlZ0V4cCgvVEFCTEVcXHMrV0lUSE9VVFxccytJRC9naW0pLnRlc3QoXHJcbiAgICAgICAgcHJlVGFibGVMaW5lLFxyXG4gICAgICApO1xyXG4gICAgICBjb25zdCBpc0RyYWdnaW5nRGVmYXVsdElkID1cclxuICAgICAgICAvLyBpZiBxdWVyeSBoYXMgJ1dJVEhPVVQgSUQnIHdlIGRvbid0IGNhcmVcclxuICAgICAgICAhaXNXaXRob3V0SWQgJiZcclxuICAgICAgICAvLyBkZWZhdWx0IGlkIGNvbCBpcyBhbHdheXMgZmlyc3RcclxuICAgICAgICBwcm9wcy5oaWdobGlnaHRJbmRleCA9PT0gMCAmJlxyXG4gICAgICAgIC8vIHRoZSBoZWFkZXIgd2lsbCBhbHdheXMgYmUgdGhlIG5hbWUgZnJvbSBkYXRhdmlldyBzZXR0aW5nc1xyXG4gICAgICAgIHByb3BzLmhlYWRlcnNbcHJvcHMuaGlnaGxpZ2h0SW5kZXhdID09PSB0YWJsZUlkQ29sdW1uTmFtZTtcclxuICAgICAgLy8gbmVlZCB0byBjaGVjayBzZXBhcmF0ZWx5IGZvciBkcmFnZ2VkIG92ZXIgYmVjYXVzZSBpdCB3aWxsIGNoYW5nZSBob3cgd2UgYWRqdXN0IHRoZSBoZWFkZXJzXHJcbiAgICAgIGNvbnN0IGlzRHJhZ2dlZE92ZXJEZWZhdWx0SWQgPVxyXG4gICAgICAgICFpc1dpdGhvdXRJZCAmJlxyXG4gICAgICAgIHByb3BzLmRyYWdnZWRPdmVySW5kZXggPT09IDAgJiZcclxuICAgICAgICBwcm9wcy5oZWFkZXJzW3Byb3BzLmRyYWdnZWRPdmVySW5kZXhdID09PSB0YWJsZUlkQ29sdW1uTmFtZTtcclxuICAgICAgY29uc3QgaXNSZWxhdGluZ1RvRGVmYXVsdElkID1cclxuICAgICAgICBpc0RyYWdnaW5nRGVmYXVsdElkIHx8IGlzRHJhZ2dlZE92ZXJEZWZhdWx0SWQ7XHJcbiAgICAgIGNvbnN0IHRhYmxlTGluZSA9IGlzUmVsYXRpbmdUb0RlZmF1bHRJZFxyXG4gICAgICAgID8gLy8gdG8gJ21vdmUnIHRoZSBkZWZhdWx0IGlkIGNvbCwgd2UgaGF2ZSB0byBtb2RpZnkgdGhlIHF1ZXJ5IHRvIGhhdmUgdGhpcyBhbmQgYSBmaWxlLmxpbmsgY29sXHJcbiAgICAgICAgICBwcmVUYWJsZUxpbmUucmVwbGFjZSgvdGFibGUvaSwgXCJUQUJMRSBXSVRIT1VUIElEXCIpXHJcbiAgICAgICAgOiBwcmVUYWJsZUxpbmU7XHJcbiAgICAgIC8vIFRBQkxFIHZzIFRBQkxFIFdJVEhPVVQgSURcclxuICAgICAgY29uc3QgdGFibGVLZXl3b3JkID0gdGFibGVMaW5lXHJcbiAgICAgICAgLnNsaWNlKDAsIGlzV2l0aG91dElkIHx8IGlzUmVsYXRpbmdUb0RlZmF1bHRJZCA/IDE2IDogNSlcclxuICAgICAgICAudHJpbSgpO1xyXG4gICAgICBjb25zdCBwcmVDb2xzID0gdGFibGVMaW5lXHJcbiAgICAgICAgLnNsaWNlKGlzV2l0aG91dElkIHx8IGlzUmVsYXRpbmdUb0RlZmF1bHRJZCA/IDE3IDogNilcclxuICAgICAgICAvLyBzcGxpdCBvbiBjb21tYSB1bmxlc3Mgc3Vycm91bmRlZCBieSBkb3VibGUgcXVvdGVzXHJcbiAgICAgICAgLnNwbGl0KC8sKD89KD86KD86W15cIl0qXCIpezJ9KSpbXlwiXSokKS8pXHJcbiAgICAgICAgLm1hcCgoYykgPT4gYy50cmltKCkpO1xyXG4gICAgICBjb25zdCBjb2xzID0gaXNSZWxhdGluZ1RvRGVmYXVsdElkXHJcbiAgICAgICAgPyAvLyB0aGlzIGlzIGhvdyB3ZSBhbGxvdyB0aGUgZGVmYXVsdCBpZCBjb2wgdG8gYmUgJ21vdmVkJ1xyXG4gICAgICAgICAgW1wiZmlsZS5saW5rIEFTIFwiICsgdGFibGVJZENvbHVtbk5hbWUsIC4uLnByZUNvbHNdXHJcbiAgICAgICAgOiBwcmVDb2xzO1xyXG4gICAgICAvLyBuZWVkIHRvIG9mZnNldCBib3RoIGJ5IDEgYmVjYXVzZSBpZiBxdWVyeSBkb2Vzbid0IGhhdmUgJ1dJVEhPVVQgSUQnIHRoZW4gdGhlIGZpcnN0IGNvbHVtbiBpcyB0aGUgZGVmYXVsdCBpZCBjb2xcclxuICAgICAgY29uc3QgaGlnaGxpZ2h0SW5kZXggPVxyXG4gICAgICAgIHByb3BzLmhpZ2hsaWdodEluZGV4IC0gKGlzV2l0aG91dElkIHx8IGlzUmVsYXRpbmdUb0RlZmF1bHRJZCA/IDAgOiAxKTtcclxuICAgICAgY29uc3QgZHJhZ2dlZEluZGV4ID1cclxuICAgICAgICBwcm9wcy5kcmFnZ2VkT3ZlckluZGV4IC0gKGlzV2l0aG91dElkIHx8IGlzUmVsYXRpbmdUb0RlZmF1bHRJZCA/IDAgOiAxKTtcclxuICAgICAgY29uc3QgY29sc1dpdGhvdXRIaWdobGlnaHQgPSBjb2xzLnRvU3BsaWNlZChoaWdobGlnaHRJbmRleCwgMSk7XHJcbiAgICAgIC8vIGluc2VydCB0aGUgaGlnaGxpZ2h0IGNvbCB3aGVyZSB0aGUgaW5kaWNhdG9yIGlzXHJcbiAgICAgIGNvbnN0IG5ld0NvbHMgPSBjb2xzV2l0aG91dEhpZ2hsaWdodC50b1NwbGljZWQoXHJcbiAgICAgICAgZHJhZ2dlZEluZGV4LFxyXG4gICAgICAgIDAsXHJcbiAgICAgICAgY29sc1toaWdobGlnaHRJbmRleF0sXHJcbiAgICAgICk7XHJcbiAgICAgIC8vIFRPRE8gdGhpcyBpcyBkZWZpbml0ZWx5IG5vdCB0aGUgcmlnaHQgd2F5IHRvIGRvIHRoaXNcclxuICAgICAgY29uc3Qgc2Nyb2xsRWxzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKFwiLmNtLXNjcm9sbGVyXCIpKTtcclxuICAgICAgLy8gVE9ETyB0aGUgZmluZCgpIG5ldmVyIHdvcmtzXHJcbiAgICAgIGNvbnN0IHNjcm9sbGVyID1cclxuICAgICAgICBzY3JvbGxFbHMuZmluZCgoZWwpID0+IGVsLmNvbnRhaW5zKHZpZXcuY29udGVudEVsKSkgPz8gc2Nyb2xsRWxzWzBdO1xyXG4gICAgICBjb25zdCBwcmV2U2Nyb2xsID0gc2Nyb2xsZXIuc2Nyb2xsVG9wO1xyXG5cclxuICAgICAgdmlldy5lZGl0b3Iuc2V0TGluZShcclxuICAgICAgICB0YWJsZUxpbmVJbmRleCxcclxuICAgICAgICB0YWJsZUtleXdvcmQgKyBcIiBcIiArIG5ld0NvbHMuam9pbihcIiwgXCIpLFxyXG4gICAgICApO1xyXG4gICAgICAvLyBjYWxsaW5nIHNldExpbmUoKSB3aWxsIHNjcm9sbCBkb3duIGEgYnVuY2ggaWYgdGhlIGJvdHRvbSBvZiB0aGUgY29kZSBibG9jayBpcyB2aXNpYmxlLi4uPz8/XHJcbiAgICAgIC8vIGRvaW5nIHRoaXMgcmVtZWRpZXMgdGhhdCwgYW5kIHllcyBpdCBvbmx5IHdvcmtzIG9uIHRoZSBuZXh0IHRpY2sgZm9yIHNvbWUgcmVhc29uXHJcbiAgICAgIHNldFRpbWVvdXQoXHJcbiAgICAgICAgKCkgPT4gc2Nyb2xsZXIuc2Nyb2xsVG8oeyB0b3A6IHByZXZTY3JvbGwsIGJlaGF2aW9yOiBcImluc3RhbnRcIiB9KSxcclxuICAgICAgICAwLFxyXG4gICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIHByb3BzLnNldEhpZ2hsaWdodEluZGV4KC0xKTtcclxuICAgIHByb3BzLnNldERyYWdnZWRPdmVySW5kZXgoLTEpO1xyXG4gICAgc2V0VHJhbnNsYXRlWCgwKTtcclxuICAgIGxhc3RNb3VzZVBvcyA9IDA7XHJcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XHJcbiAgfTtcclxuXHJcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIG9uTW91c2VVcCk7XHJcblxyXG4gIG9uQ2xlYW51cCgoKSA9PiB7XHJcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XHJcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIChcclxuICAgIDx0aGVhZD5cclxuICAgICAgPHRyPlxyXG4gICAgICAgIDxGb3IgZWFjaD17cHJvcHMuaGVhZGVyc30+XHJcbiAgICAgICAgICB7KF8sIGluZGV4KSA9PiAoXHJcbiAgICAgICAgICAgIDx0aFxyXG4gICAgICAgICAgICAgIG9uTW91c2VEb3duPXsoZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgcHJvcHMuc2V0SGlnaGxpZ2h0SW5kZXgoaW5kZXgoKSk7XHJcbiAgICAgICAgICAgICAgICBzZXRUcmFuc2xhdGVYKDApO1xyXG4gICAgICAgICAgICAgICAgbGFzdE1vdXNlUG9zID0gZS5jbGllbnRYO1xyXG4gICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xyXG4gICAgICAgICAgICAgIH19XHJcbiAgICAgICAgICAgICAgb25Nb3VzZU1vdmU9eygpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChwcm9wcy5oaWdobGlnaHRJbmRleCA9PT0gLTEpIHJldHVybjtcclxuICAgICAgICAgICAgICAgIHByb3BzLnNldERyYWdnZWRPdmVySW5kZXgoaW5kZXgoKSk7XHJcbiAgICAgICAgICAgICAgfX1cclxuICAgICAgICAgICAgICAvLyBvbk1vdXNlVXA9eygpID0+IHtcclxuICAgICAgICAgICAgICAvLyAgIHByb3BzLnNldEhpZ2hsaWdodEluZGV4KC0xKTtcclxuICAgICAgICAgICAgICAvLyAgIHNldFRyYW5zbGF0ZVgoMCk7XHJcbiAgICAgICAgICAgICAgLy8gICBsYXN0TW91c2VQb3MgPSAwO1xyXG4gICAgICAgICAgICAgIC8vIH19XHJcbiAgICAgICAgICAgICAgLy8gb25Nb3VzZU1vdmU9eyhlKSA9PiB7XHJcbiAgICAgICAgICAgICAgLy8gICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgICAgLy8gICBzZXRUcmFuc2xhdGVYKCgpID0+IGUuY2xpZW50WCAtIGxhc3RNb3VzZVBvcyk7XHJcbiAgICAgICAgICAgICAgLy8gfX1cclxuICAgICAgICAgICAgICBjbGFzcz17YHJlbGF0aXZlIG0tMCBjdXJzb3ItZ3JhYiBvdmVyZmxvdy12aXNpYmxlIGJvcmRlci14LXRyYW5zcGFyZW50IGJvcmRlci10LXRyYW5zcGFyZW50IHAtMCB0ZXh0LW11dGVkIGFjdGl2ZTpjdXJzb3ItZ3JhYmJpbmcgJHtpbmRleCgpID09PSBwcm9wcy5oaWdobGlnaHRJbmRleCA/IFwib3BhY2l0eS0xMDBcIiA6IFwib3BhY2l0eS0wXCJ9ICR7cHJvcHMuaGlnaGxpZ2h0SW5kZXggPT09IC0xID8gXCJob3ZlcjpvcGFjaXR5LTEwMFwiIDogXCJcIn1gfVxyXG4gICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgPGRpdlxyXG4gICAgICAgICAgICAgICAgYXJpYS1yb2xlZGVzY3JpcHRpb249XCJjb2x1bW4tZHJhZy1oYW5kbGVcIlxyXG4gICAgICAgICAgICAgICAgY2xhc3M9e2BmbGV4IHNpemUtZnVsbCBpdGVtcy1lbmQganVzdGlmeS1jZW50ZXJgfVxyXG4gICAgICAgICAgICAgICAgc3R5bGU9e1xyXG4gICAgICAgICAgICAgICAgICBpbmRleCgpID09PSBwcm9wcy5oaWdobGlnaHRJbmRleFxyXG4gICAgICAgICAgICAgICAgICAgID8ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFwiaHNsKHZhcigtLWFjY2VudC1oKSB2YXIoLS1hY2NlbnQtcykgdmFyKC0tYWNjZW50LWwpKVwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcImJvcmRlci1yYWRpdXNcIjogXCJ2YXIoLS1yYWRpdXMtcykgdmFyKC0tcmFkaXVzLXMpIDAgMFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2xhdGU6IHRyYW5zbGF0ZVgoKSArIFwicHggMFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcInBvaW50ZXItZXZlbnRzXCI6IFwibm9uZVwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIDogcHJvcHMuaGlnaGxpZ2h0SW5kZXggIT09IC0xXHJcbiAgICAgICAgICAgICAgICAgICAgICA/IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJzb3I6IFwiZ3JhYmJpbmdcIixcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgOiB7fVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgIDxHcmlwSG9yaXpvbnRhbCBzaXplPVwiMXJlbVwiIC8+XHJcbiAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDwvdGg+XHJcbiAgICAgICAgICApfVxyXG4gICAgICAgIDwvRm9yPlxyXG4gICAgICA8L3RyPlxyXG4gICAgICA8dHI+XHJcbiAgICAgICAgPEZvciBlYWNoPXtwcm9wcy5oZWFkZXJzfT5cclxuICAgICAgICAgIHsoaCwgaW5kZXgpID0+IChcclxuICAgICAgICAgICAgPHRoXHJcbiAgICAgICAgICAgICAgb25Nb3VzZU1vdmU9eygpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChwcm9wcy5oaWdobGlnaHRJbmRleCA9PT0gLTEpIHJldHVybjtcclxuICAgICAgICAgICAgICAgIHByb3BzLnNldERyYWdnZWRPdmVySW5kZXgoaW5kZXgoKSk7XHJcbiAgICAgICAgICAgICAgfX1cclxuICAgICAgICAgICAgICBjbGFzcz1cInJlbGF0aXZlIHRleHQtbm93cmFwXCJcclxuICAgICAgICAgICAgICBzdHlsZT17XHJcbiAgICAgICAgICAgICAgICBpbmRleCgpID09PSBwcm9wcy5oaWdobGlnaHRJbmRleFxyXG4gICAgICAgICAgICAgICAgICA/IHtcclxuICAgICAgICAgICAgICAgICAgICAgIFwiYm9yZGVyLXRvcC13aWR0aFwiOiBcIjJweFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgXCJib3JkZXItbGVmdC13aWR0aFwiOiBcIjJweFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgXCJib3JkZXItcmlnaHQtd2lkdGhcIjogXCIycHhcIixcclxuICAgICAgICAgICAgICAgICAgICAgIFwiYm9yZGVyLXRvcC1jb2xvclwiOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcImhzbCh2YXIoLS1hY2NlbnQtaCkgdmFyKC0tYWNjZW50LXMpIHZhcigtLWFjY2VudC1sKSlcIixcclxuICAgICAgICAgICAgICAgICAgICAgIFwiYm9yZGVyLWxlZnQtY29sb3JcIjpcclxuICAgICAgICAgICAgICAgICAgICAgICAgXCJoc2wodmFyKC0tYWNjZW50LWgpIHZhcigtLWFjY2VudC1zKSB2YXIoLS1hY2NlbnQtbCkpXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICBcImJvcmRlci1yaWdodC1jb2xvclwiOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcImhzbCh2YXIoLS1hY2NlbnQtaCkgdmFyKC0tYWNjZW50LXMpIHZhcigtLWFjY2VudC1sKSlcIixcclxuICAgICAgICAgICAgICAgICAgICAgIFwiYmFja2dyb3VuZC1jb2xvclwiOiBgaHNsKHZhcigtLWFjY2VudC1oKSB2YXIoLS1hY2NlbnQtcykgdmFyKC0tYWNjZW50LWwpIC8gMTAlKWAsXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICA6IHByb3BzLmhpZ2hsaWdodEluZGV4ICE9PSAtMSAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgaW5kZXgoKSA9PT0gcHJvcHMuZHJhZ2dlZE92ZXJJbmRleFxyXG4gICAgICAgICAgICAgICAgICAgID8gcHJvcHMuaGlnaGxpZ2h0SW5kZXggPCBpbmRleCgpXHJcbiAgICAgICAgICAgICAgICAgICAgICA/IGRyYWdnZWRPdmVyUmlnaHRcclxuICAgICAgICAgICAgICAgICAgICAgIDogZHJhZ2dlZE92ZXJMZWZ0XHJcbiAgICAgICAgICAgICAgICAgICAgOiB7fVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgIDxNYXJrZG93blxyXG4gICAgICAgICAgICAgICAgYXBwPXtwbHVnaW4uYXBwfVxyXG4gICAgICAgICAgICAgICAgbWFya2Rvd249e2h9XHJcbiAgICAgICAgICAgICAgICBzb3VyY2VQYXRoPXtjdHguc291cmNlUGF0aH1cclxuICAgICAgICAgICAgICAvPlxyXG4gICAgICAgICAgICA8L3RoPlxyXG4gICAgICAgICAgKX1cclxuICAgICAgICA8L0Zvcj5cclxuICAgICAgPC90cj5cclxuICAgIDwvdGhlYWQ+XHJcbiAgKTtcclxufTtcclxuIiwiaW1wb3J0IHtcclxuICBNb2RpZmllZERhdGF2aWV3UXVlcnlSZXN1bHQsXHJcbiAgRGF0YXZpZXdRdWVyeVJlc3VsdFN1Y2Nlc3MsXHJcbiAgRGF0YXZpZXdRdWVyeVJlc3VsdCxcclxuICBEYXRhdmlld1F1ZXJ5UmVzdWx0RmFpbCxcclxufSBmcm9tIFwiQC9saWIvdHlwZXNcIjtcclxuaW1wb3J0IHsgY3JlYXRlU2lnbmFsLCBGb3IsIFNob3csIGNyZWF0ZU1lbW8sIFNldHRlciB9IGZyb20gXCJzb2xpZC1qc1wiO1xyXG5pbXBvcnQgeyBUYWJsZUJvZHkgfSBmcm9tIFwiLi9UYWJsZUJvZHlcIjtcclxuaW1wb3J0IHsgVGFibGVIZWFkIH0gZnJvbSBcIi4vVGFibGVIZWFkXCI7XHJcbmltcG9ydCBQbHVzIGZyb20gXCJsdWNpZGUtc29saWQvaWNvbnMvUGx1c1wiO1xyXG5pbXBvcnQgeyBhdXRvZm9jdXMgfSBmcm9tIFwiQHNvbGlkLXByaW1pdGl2ZXMvYXV0b2ZvY3VzXCI7XHJcbmltcG9ydCB7XHJcbiAgRGlhbG9nLFxyXG4gIERpYWxvZ0NvbnRlbnQsXHJcbiAgRGlhbG9nVGl0bGUsXHJcbiAgRGlhbG9nVHJpZ2dlcixcclxufSBmcm9tIFwiLi4vdWkvZGlhbG9nXCI7XHJcbmltcG9ydCB7IGdldEV4aXN0aW5nUHJvcGVydGllcywgZ2V0VGFibGVMaW5lIH0gZnJvbSBcIkAvbGliL3V0aWxcIjtcclxuaW1wb3J0IHsgTWFya2Rvd24gfSBmcm9tIFwiLi4vTWFya2Rvd25cIjtcclxuaW1wb3J0IHsgTWFya2Rvd25WaWV3IH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7IHVlc0NvZGVCbG9jayB9IGZyb20gXCJAL2hvb2tzL3VzZURhdGFFZGl0XCI7XHJcbi8vIHByZXZlbnRzIGZyb20gYmVpbmcgdHJlZS1zaGFrZW4gYnkgVFNcclxuYXV0b2ZvY3VzO1xyXG5cclxudHlwZSBUYWJsZVByb3BzID0ge1xyXG4gIHF1ZXJ5UmVzdWx0czogTW9kaWZpZWREYXRhdmlld1F1ZXJ5UmVzdWx0O1xyXG59O1xyXG5leHBvcnQgY29uc3QgVGFibGUgPSAocHJvcHM6IFRhYmxlUHJvcHMpID0+IHtcclxuICBjb25zdCBbaGlnaGxpZ2h0SW5kZXgsIHNldEhpZ2hsaWdodEluZGV4XSA9IGNyZWF0ZVNpZ25hbCgtMSk7XHJcbiAgY29uc3QgW2RyYWdnZWRPdmVySW5kZXgsIHNldERyYWdnZWRPdmVySW5kZXhdID0gY3JlYXRlU2lnbmFsKC0xKTtcclxuICBjb25zdCBbaXNBZGRDb2x1bW5EaWFsb2dPcGVuLCBzZXRBZGRDb2x1bW5EaWFsb2dPcGVuXSA9IGNyZWF0ZVNpZ25hbChmYWxzZSk7XHJcbiAgcmV0dXJuIChcclxuICAgIDxTaG93XHJcbiAgICAgIHdoZW49e3Byb3BzLnF1ZXJ5UmVzdWx0cy5zdWNjZXNzZnVsfVxyXG4gICAgICBmYWxsYmFjaz17PFRhYmxlRmFsbGJhY2sgcXVlcnlSZXN1bHRzPXtwcm9wcy5xdWVyeVJlc3VsdHN9IC8+fVxyXG4gICAgPlxyXG4gICAgICA8ZGl2XHJcbiAgICAgICAgY2xhc3M9XCJyZWxhdGl2ZSBtYi00IG1yLTQgaC1maXQgdy1maXRcIlxyXG4gICAgICAgIC8vIHN0eWxlPXt7IFwib3ZlcmZsb3cteVwiOiBcInZpc2libGVcIiB9fVxyXG4gICAgICA+XHJcbiAgICAgICAgPHRhYmxlXHJcbiAgICAgICAgICAvLyBjbGFzcz1cImgtZml0IG92ZXJmbG93LXktdmlzaWJsZVwiXHJcbiAgICAgICAgICBzdHlsZT17XHJcbiAgICAgICAgICAgIGhpZ2hsaWdodEluZGV4KCkgIT09IC0xXHJcbiAgICAgICAgICAgICAgPyB7XHJcbiAgICAgICAgICAgICAgICAgIFwidXNlci1zZWxlY3RcIjogXCJub25lXCIsXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgOiB7fVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgID5cclxuICAgICAgICAgIDxUYWJsZUhlYWRcclxuICAgICAgICAgICAgaGVhZGVycz17XHJcbiAgICAgICAgICAgICAgKHByb3BzLnF1ZXJ5UmVzdWx0cyBhcyBEYXRhdmlld1F1ZXJ5UmVzdWx0U3VjY2VzcykudmFsdWUuaGVhZGVyc1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHByb3BlcnRpZXM9e3Byb3BzLnF1ZXJ5UmVzdWx0cy50cnVlUHJvcGVydHlOYW1lc31cclxuICAgICAgICAgICAgaGlnaGxpZ2h0SW5kZXg9e2hpZ2hsaWdodEluZGV4KCl9XHJcbiAgICAgICAgICAgIHNldEhpZ2hsaWdodEluZGV4PXtzZXRIaWdobGlnaHRJbmRleH1cclxuICAgICAgICAgICAgZHJhZ2dlZE92ZXJJbmRleD17ZHJhZ2dlZE92ZXJJbmRleCgpfVxyXG4gICAgICAgICAgICBzZXREcmFnZ2VkT3ZlckluZGV4PXtzZXREcmFnZ2VkT3ZlckluZGV4fVxyXG4gICAgICAgICAgLz5cclxuICAgICAgICAgIDxUYWJsZUJvZHlcclxuICAgICAgICAgICAgaGVhZGVycz17XHJcbiAgICAgICAgICAgICAgKHByb3BzLnF1ZXJ5UmVzdWx0cyBhcyBEYXRhdmlld1F1ZXJ5UmVzdWx0U3VjY2VzcykudmFsdWUuaGVhZGVyc1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHByb3BlcnRpZXM9e3Byb3BzLnF1ZXJ5UmVzdWx0cy50cnVlUHJvcGVydHlOYW1lc31cclxuICAgICAgICAgICAgcm93cz17XHJcbiAgICAgICAgICAgICAgKHByb3BzLnF1ZXJ5UmVzdWx0cyBhcyBEYXRhdmlld1F1ZXJ5UmVzdWx0U3VjY2VzcykudmFsdWUudmFsdWVzXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaGlnaGxpZ2h0SW5kZXg9e2hpZ2hsaWdodEluZGV4KCl9XHJcbiAgICAgICAgICAgIHNldEhpZ2hsaWdodEluZGV4PXtzZXRIaWdobGlnaHRJbmRleH1cclxuICAgICAgICAgICAgZHJhZ2dlZE92ZXJJbmRleD17ZHJhZ2dlZE92ZXJJbmRleCgpfVxyXG4gICAgICAgICAgICBzZXREcmFnZ2VkT3ZlckluZGV4PXtzZXREcmFnZ2VkT3ZlckluZGV4fVxyXG4gICAgICAgICAgLz5cclxuICAgICAgICA8L3RhYmxlPlxyXG4gICAgICAgIDxBZGRDb2x1bW5CdXR0b25cclxuICAgICAgICAgIG9wZW49e2lzQWRkQ29sdW1uRGlhbG9nT3BlbigpfVxyXG4gICAgICAgICAgc2V0T3Blbj17c2V0QWRkQ29sdW1uRGlhbG9nT3Blbn1cclxuICAgICAgICAvPlxyXG4gICAgICAgIDxzcGFuXHJcbiAgICAgICAgICBhcmlhLWxhYmVsPVwiQWRkIHJvdyBhZnRlclwiXHJcbiAgICAgICAgICBjbGFzcz1cImFic29sdXRlIGJvdHRvbS1bLTFyZW1dIGxlZnQtMCBmbGV4IHctZnVsbCBjdXJzb3ItbnMtcmVzaXplIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciByb3VuZGVkLVsxcHhdIGJvcmRlciBib3JkZXItdC0wIGJvcmRlci1ib3JkZXIgb3BhY2l0eS0wIGhvdmVyOm9wYWNpdHktNTBcIlxyXG4gICAgICAgID5cclxuICAgICAgICAgIDxQbHVzIHNpemU9XCIxcmVtXCIgLz5cclxuICAgICAgICA8L3NwYW4+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgPC9TaG93PlxyXG4gICk7XHJcbn07XHJcblxyXG50eXBlIFRhYmxlRmFsbGJhY2tQcm9wcyA9IHsgcXVlcnlSZXN1bHRzOiBEYXRhdmlld1F1ZXJ5UmVzdWx0IH07XHJcbmNvbnN0IFRhYmxlRmFsbGJhY2sgPSAocHJvcHM6IFRhYmxlRmFsbGJhY2tQcm9wcykgPT4ge1xyXG4gIC8vXHJcbiAgcmV0dXJuIChcclxuICAgIDxkaXY+XHJcbiAgICAgIDxoMj5EYXRhdmlldyBlcnJvcjwvaDI+XHJcbiAgICAgIDxwPnsocHJvcHMucXVlcnlSZXN1bHRzIGFzIERhdGF2aWV3UXVlcnlSZXN1bHRGYWlsKS5lcnJvcn08L3A+XHJcbiAgICA8L2Rpdj5cclxuICApO1xyXG59O1xyXG5cclxuY29uc3QgQWRkQ29sdW1uQnV0dG9uID0gKHByb3BzOiB7XHJcbiAgb3BlbjogYm9vbGVhbjtcclxuICBzZXRPcGVuOiBTZXR0ZXI8Ym9vbGVhbj47XHJcbn0pID0+IHtcclxuICBjb25zdCB7XHJcbiAgICBwbHVnaW46IHsgYXBwIH0sXHJcbiAgICBjdHgsXHJcbiAgICBlbCxcclxuICAgIHF1ZXJ5LFxyXG4gIH0gPSB1ZXNDb2RlQmxvY2soKTtcclxuXHJcbiAgY29uc3QgdmlldyA9IGFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xyXG5cclxuICBpZiAoIXZpZXcpIHtcclxuICAgIC8vIHRocm93IG5ldyBFcnJvcihcIlRoaXMgc2hvdWxkIGJlIGltcG9zc2libGVcIik7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCBzZWN0aW9uSW5mbyA9IGN0eC5nZXRTZWN0aW9uSW5mbyhlbCk7XHJcbiAgaWYgKCFzZWN0aW9uSW5mbykge1xyXG4gICAgLy8gdGhyb3cgbmV3IEVycm9yKFwiVGhpcyBzaG91bGQgYmUgaW1wb3NzaWJsZVwiKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgY29uc3QgeyBsaW5lU3RhcnQgfSA9IHNlY3Rpb25JbmZvO1xyXG5cclxuICBjb25zdCBbcHJvcGVydHlWYWx1ZSwgc2V0UHJvcGVydHlWYWx1ZV0gPSBjcmVhdGVTaWduYWwoXCJcIik7XHJcbiAgY29uc3QgW2FsaWFzVmFsdWUsIHNldEFsaWFzVmFsdWVdID0gY3JlYXRlU2lnbmFsKFwiXCIpO1xyXG5cclxuICBjb25zdCBtYXJrZG93biA9IGNyZWF0ZU1lbW8oKCkgPT4ge1xyXG4gICAgY29uc3QgcHJvcCA9IHByb3BlcnR5VmFsdWUoKS50cmltKCk7XHJcbiAgICBjb25zdCBsaW5lcyA9IChcImBgYGRhdGF2aWV3XFxuXCIgKyBxdWVyeSArIFwiXFxuYGBgXCIpLnNwbGl0KFwiXFxuXCIpO1xyXG4gICAgaWYgKCFwcm9wKSByZXR1cm4gbGluZXMuam9pbihcIlxcblwiKTtcclxuICAgIGNvbnN0IGFsaWFzID0gYWxpYXNWYWx1ZSgpO1xyXG4gICAgY29uc3QgYWxpYXNTdHIgPSBhbGlhc1xyXG4gICAgICA/IFwiIEFTIFwiICsgKGFsaWFzLmluY2x1ZGVzKFwiIFwiKSA/ICdcIicgKyBhbGlhcyArICdcIicgOiBhbGlhcylcclxuICAgICAgOiBcIlwiO1xyXG4gICAgY29uc3QgeyBpbmRleCB9ID0gZ2V0VGFibGVMaW5lKHF1ZXJ5KTtcclxuICAgIC8vIG9mZnNldCBieSAxIHNpbmNlIHNvdXJjZSBkb2Vzbid0IGluY2x1ZGUgYmFja3RpY2tzIHdlIGFkZGVkIHRvIGxpbmVzXHJcbiAgICBsaW5lc1tpbmRleCArIDFdICs9IFwiLCBcIiArIHByb3AgKyBhbGlhc1N0cjtcclxuICAgIHJldHVybiBsaW5lcy5qb2luKFwiXFxuXCIpO1xyXG4gIH0pO1xyXG5cclxuICAvLyBjb25zdCBhZGRDb2wgPSBhc3luYyAobWFya2Rvd246IHN0cmluZykgPT4ge1xyXG4gIC8vICAgY29uc3QgeyB2YXVsdCB9ID0gYXBwO1xyXG4gIC8vICAgY29uc3QgZmlsZSA9IHZhdWx0LmdldEZpbGVCeVBhdGgoY3R4LnNvdXJjZVBhdGgpO1xyXG4gIC8vICAgaWYgKCFmaWxlKSB7XHJcbiAgLy8gICAgIHRocm93IG5ldyBFcnJvcihcIlRoaXMgc2hvdWxkIGJlIGltcG9zc2libGVcIik7XHJcbiAgLy8gICB9XHJcbiAgLy8gICAvLyBjb25zdCBjb250ZW50ID0gYXdhaXQgdmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcclxuICAvLyAgIGNvbnN0IGNvbnRlbnQgPSB0ZXh0O1xyXG4gIC8vICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KFwiXFxuXCIpO1xyXG4gIC8vICAgbGluZXNbbGluZVN0YXJ0ICsgMV0gPSBtYXJrZG93bi5zcGxpdChcIlxcblwiKVsxXTtcclxuICAvLyAgIGNvbnN0IG5ld0NvbnRlbnQgPSBsaW5lcy5qb2luKFwiXFxuXCIpO1xyXG4gIC8vICAgYXdhaXQgdmF1bHQubW9kaWZ5KGZpbGUsIG5ld0NvbnRlbnQpO1xyXG4gIC8vIH07XHJcblxyXG4gIGNvbnN0IGFkZENvbCA9ICgpID0+IHtcclxuICAgIGNvbnN0IHByb3AgPSBwcm9wZXJ0eVZhbHVlKCkudHJpbSgpO1xyXG4gICAgY29uc3QgYWxpYXMgPSBhbGlhc1ZhbHVlKCk7XHJcbiAgICBjb25zdCBhbGlhc1N0ciA9IGFsaWFzXHJcbiAgICAgID8gXCIgQVMgXCIgKyAoYWxpYXMuaW5jbHVkZXMoXCIgXCIpID8gJ1wiJyArIGFsaWFzICsgJ1wiJyA6IGFsaWFzKVxyXG4gICAgICA6IFwiXCI7XHJcbiAgICBjb25zdCB7IGxpbmUsIGluZGV4IH0gPSBnZXRUYWJsZUxpbmUocXVlcnkpO1xyXG4gICAgLy8gb2Zmc2V0IGJ5IDEgc2luY2UgbGluZVN0YXJ0IGlzIHdpdGggYmFja3RpY2tzIGJ1dCBxdWVyeSBpcyB3aXRob3V0XHJcbiAgICBjb25zdCByZWxhdGl2ZUluZGV4ID0gbGluZVN0YXJ0ICsgaW5kZXggKyAxO1xyXG4gICAgdmlldy5lZGl0b3Iuc2V0TGluZShyZWxhdGl2ZUluZGV4LCBsaW5lICsgXCIsIFwiICsgcHJvcCArIGFsaWFzU3RyKTtcclxuICAgIC8vIGxpbmVzW2luZGV4ICsgMV0gKz0gXCIsIFwiICsgcHJvcCArIGFsaWFzU3RyO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IHByb3BlcnRpZXMgPSBnZXRFeGlzdGluZ1Byb3BlcnRpZXMoYXBwKTtcclxuICBjb25zdCBwcm9wZXJ0eU5hbWVzID0gT2JqZWN0LmtleXMocHJvcGVydGllcykuc29ydCgpO1xyXG4gIHJldHVybiAoXHJcbiAgICA8RGlhbG9nIG9wZW49e3Byb3BzLm9wZW59IG9uT3BlbkNoYW5nZT17KGIpID0+IHByb3BzLnNldE9wZW4oYil9PlxyXG4gICAgICA8RGlhbG9nVHJpZ2dlclxyXG4gICAgICAgIGFyaWEtbGFiZWw9XCJBZGQgY29sdW1uIGFmdGVyXCJcclxuICAgICAgICBjbGFzcz1cImFic29sdXRlIHJpZ2h0LVstMXJlbV0gdG9wLVtjYWxjKDFyZW0rdmFyKC0tYm9yZGVyLXdpZHRoKSldIG0tMCBmbGV4IHNpemUtZml0IGgtW2NhbGMoMTAwJS0xcmVtLXZhcigtLWJvcmRlci13aWR0aCkpXSBjdXJzb3ItZXctcmVzaXplIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciByb3VuZGVkLW5vbmUgYm9yZGVyIGJvcmRlci1sLTAgYm9yZGVyLWJvcmRlciBiZy10cmFuc3BhcmVudCBwLTAgb3BhY2l0eS0wIHNoYWRvdy1ub25lIGhvdmVyOm9wYWNpdHktNTBcIlxyXG4gICAgICA+XHJcbiAgICAgICAgey8qIDxzcGFuXHJcbiAgICAgICAgICBjbGFzcz1cImFic29sdXRlIHJpZ2h0LVstMXJlbV0gdG9wLVtjYWxjKDFyZW0rdmFyKC0tYm9yZGVyLXdpZHRoKSldIGZsZXggaC1bY2FsYygxMDAlLTFyZW0tdmFyKC0tYm9yZGVyLXdpZHRoKSldIGN1cnNvci1ldy1yZXNpemUgaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIGJvcmRlciBib3JkZXItbC0wIGJvcmRlci1ib3JkZXIgb3BhY2l0eS0wIGhvdmVyOm9wYWNpdHktNTBcIlxyXG4gICAgICAgID4gKi99XHJcbiAgICAgICAgPFBsdXMgc2l6ZT1cIjFyZW1cIiAvPlxyXG4gICAgICAgIHsvKiA8L3NwYW4+ICovfVxyXG4gICAgICA8L0RpYWxvZ1RyaWdnZXI+XHJcbiAgICAgIDxEaWFsb2dDb250ZW50PlxyXG4gICAgICAgIDxEaWFsb2dUaXRsZT5BZGQgY29sdW1uPC9EaWFsb2dUaXRsZT5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiZmxleCB3LWZ1bGwgaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlblwiPlxyXG4gICAgICAgICAgPGxhYmVsIGZvcj1cInByb3BlcnR5LWlucHV0XCI+UHJvcGVydHk6IDwvbGFiZWw+XHJcbiAgICAgICAgICA8aW5wdXRcclxuICAgICAgICAgICAgdXNlOmF1dG9mb2N1c1xyXG4gICAgICAgICAgICBhdXRvZm9jdXNcclxuICAgICAgICAgICAgbmFtZT1cInByb3BlcnR5LWlucHV0XCJcclxuICAgICAgICAgICAgaWQ9XCJwcm9wZXJ0eS1pbnB1dFwiXHJcbiAgICAgICAgICAgIHR5cGU9XCJ0ZXh0XCJcclxuICAgICAgICAgICAgbGlzdD1cInByb3BlcnRpZXMtZGF0YWxpc3RcIlxyXG4gICAgICAgICAgICB2YWx1ZT17cHJvcGVydHlWYWx1ZSgpfVxyXG4gICAgICAgICAgICBvbklucHV0PXsoZSkgPT4gc2V0UHJvcGVydHlWYWx1ZShlLnRhcmdldC52YWx1ZSl9XHJcbiAgICAgICAgICAvPlxyXG4gICAgICAgICAgPGRhdGFsaXN0IGlkPVwicHJvcGVydGllcy1kYXRhbGlzdFwiPlxyXG4gICAgICAgICAgICA8Rm9yIGVhY2g9e3Byb3BlcnR5TmFtZXN9PlxyXG4gICAgICAgICAgICAgIHsocHJvcCkgPT4gPG9wdGlvbiB2YWx1ZT17cHJvcH0+e3Byb3BlcnRpZXNbcHJvcF0udHlwZX08L29wdGlvbj59XHJcbiAgICAgICAgICAgIDwvRm9yPlxyXG4gICAgICAgICAgPC9kYXRhbGlzdD5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiZmxleCB3LWZ1bGwgaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlblwiPlxyXG4gICAgICAgICAgPGxhYmVsIGZvcj1cImFsaWFzLWlucHV0XCI+QWxpYXMgKG9wdGlvbmFsKTogPC9sYWJlbD5cclxuICAgICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgICBuYW1lPVwiYWxpYXMtaW5wdXRcIlxyXG4gICAgICAgICAgICBpZD1cImFsaWFzLWlucHV0XCJcclxuICAgICAgICAgICAgdHlwZT1cInRleHRcIlxyXG4gICAgICAgICAgICB2YWx1ZT17YWxpYXNWYWx1ZSgpfVxyXG4gICAgICAgICAgICBvbklucHV0PXsoZSkgPT4gc2V0QWxpYXNWYWx1ZShlLnRhcmdldC52YWx1ZSl9XHJcbiAgICAgICAgICAvPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDxNYXJrZG93biBhcHA9e2FwcH0gbWFya2Rvd249e21hcmtkb3duKCl9IHNvdXJjZVBhdGg9e2N0eC5zb3VyY2VQYXRofSAvPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJ3LWZ1bGxcIj5cclxuICAgICAgICAgIDxidXR0b25cclxuICAgICAgICAgICAgZGlzYWJsZWQ9eyFwcm9wZXJ0eVZhbHVlKCl9XHJcbiAgICAgICAgICAgIG9uQ2xpY2s9e2FzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICBhZGRDb2woKTtcclxuICAgICAgICAgICAgICBwcm9wcy5zZXRPcGVuKGZhbHNlKTtcclxuICAgICAgICAgICAgfX1cclxuICAgICAgICAgICAgY2xhc3M9XCJmbG9hdC1yaWdodCBiZy1pbnRlcmFjdGl2ZS1hY2NlbnQgcC1idXR0b24gdGV4dC1vbi1hY2NlbnQgaG92ZXI6YmctaW50ZXJhY3RpdmUtYWNjZW50LWhvdmVyIGhvdmVyOnRleHQtYWNjZW50LWhvdmVyIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZFwiXHJcbiAgICAgICAgICA+XHJcbiAgICAgICAgICAgIGFkZFxyXG4gICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgIDwvRGlhbG9nQ29udGVudD5cclxuICAgIDwvRGlhbG9nPlxyXG4gICk7XHJcbn07XHJcblxyXG5jb25zdCBBZGRSb3dCdXR0b24gPSAocHJvcHM6IHsgb3BlbjogYm9vbGVhbjsgc2V0T3BlbjogU2V0dGVyPGJvb2xlYW4+IH0pID0+IHtcclxuICBjb25zdCB7XHJcbiAgICBwbHVnaW46IHsgYXBwIH0sXHJcbiAgfSA9IHVlc0NvZGVCbG9jaygpO1xyXG5cclxuICBjb25zdCBbdGl0bGVWYWx1ZSwgc2V0VGl0bGVWYWx1ZV0gPSBjcmVhdGVTaWduYWwoXCJcIik7XHJcbiAgY29uc3QgW3RlbXBsYXRlVmFsdWUsIHNldFRlbXBsYXRlVmFsdWVdID0gY3JlYXRlU2lnbmFsKFwiXCIpO1xyXG5cclxuICBjb25zdCBwcm9wZXJ0aWVzID0gZ2V0RXhpc3RpbmdQcm9wZXJ0aWVzKGFwcCk7XHJcbiAgY29uc3QgcHJvcGVydHlOYW1lcyA9IE9iamVjdC5rZXlzKHByb3BlcnRpZXMpLnNvcnQoKTtcclxuICByZXR1cm4gKFxyXG4gICAgPERpYWxvZyBvcGVuPXtwcm9wcy5vcGVufSBvbk9wZW5DaGFuZ2U9eyhiKSA9PiBwcm9wcy5zZXRPcGVuKGIpfT5cclxuICAgICAgPERpYWxvZ1RyaWdnZXJcclxuICAgICAgICBhcmlhLWxhYmVsPVwiQWRkIGNvbHVtbiBhZnRlclwiXHJcbiAgICAgICAgY2xhc3M9XCJhYnNvbHV0ZSByaWdodC1bLTFyZW1dIHRvcC1bY2FsYygxcmVtK3ZhcigtLWJvcmRlci13aWR0aCkpXSBtLTAgZmxleCBzaXplLWZpdCBoLVtjYWxjKDEwMCUtMXJlbS12YXIoLS1ib3JkZXItd2lkdGgpKV0gY3Vyc29yLWV3LXJlc2l6ZSBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgcm91bmRlZC1ub25lIGJvcmRlciBib3JkZXItbC0wIGJvcmRlci1ib3JkZXIgYmctdHJhbnNwYXJlbnQgcC0wIG9wYWNpdHktMCBzaGFkb3ctbm9uZSBob3ZlcjpvcGFjaXR5LTUwXCJcclxuICAgICAgPlxyXG4gICAgICAgIHsvKiA8c3BhblxyXG4gICAgICAgICAgY2xhc3M9XCJhYnNvbHV0ZSByaWdodC1bLTFyZW1dIHRvcC1bY2FsYygxcmVtK3ZhcigtLWJvcmRlci13aWR0aCkpXSBmbGV4IGgtW2NhbGMoMTAwJS0xcmVtLXZhcigtLWJvcmRlci13aWR0aCkpXSBjdXJzb3ItZXctcmVzaXplIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBib3JkZXIgYm9yZGVyLWwtMCBib3JkZXItYm9yZGVyIG9wYWNpdHktMCBob3ZlcjpvcGFjaXR5LTUwXCJcclxuICAgICAgICA+ICovfVxyXG4gICAgICAgIDxQbHVzIHNpemU9XCIxcmVtXCIgLz5cclxuICAgICAgICB7LyogPC9zcGFuPiAqL31cclxuICAgICAgPC9EaWFsb2dUcmlnZ2VyPlxyXG4gICAgICA8RGlhbG9nQ29udGVudD5cclxuICAgICAgICA8RGlhbG9nVGl0bGU+QWRkIGNvbHVtbjwvRGlhbG9nVGl0bGU+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImZsZXggdy1mdWxsIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW5cIj5cclxuICAgICAgICAgIDxsYWJlbCBmb3I9XCJwcm9wZXJ0eS1pbnB1dFwiPlByb3BlcnR5OiA8L2xhYmVsPlxyXG4gICAgICAgICAgPGlucHV0XHJcbiAgICAgICAgICAgIHVzZTphdXRvZm9jdXNcclxuICAgICAgICAgICAgYXV0b2ZvY3VzXHJcbiAgICAgICAgICAgIG5hbWU9XCJwcm9wZXJ0eS1pbnB1dFwiXHJcbiAgICAgICAgICAgIGlkPVwicHJvcGVydHktaW5wdXRcIlxyXG4gICAgICAgICAgICB0eXBlPVwidGV4dFwiXHJcbiAgICAgICAgICAgIGxpc3Q9XCJwcm9wZXJ0aWVzLWRhdGFsaXN0XCJcclxuICAgICAgICAgICAgdmFsdWU9e3RpdGxlVmFsdWUoKX1cclxuICAgICAgICAgICAgb25JbnB1dD17KGUpID0+IHNldFRpdGxlVmFsdWUoZS50YXJnZXQudmFsdWUpfVxyXG4gICAgICAgICAgLz5cclxuICAgICAgICAgIDxkYXRhbGlzdCBpZD1cInByb3BlcnRpZXMtZGF0YWxpc3RcIj5cclxuICAgICAgICAgICAgPEZvciBlYWNoPXtwcm9wZXJ0eU5hbWVzfT5cclxuICAgICAgICAgICAgICB7KHByb3ApID0+IDxvcHRpb24gdmFsdWU9e3Byb3B9Pntwcm9wZXJ0aWVzW3Byb3BdLnR5cGV9PC9vcHRpb24+fVxyXG4gICAgICAgICAgICA8L0Zvcj5cclxuICAgICAgICAgIDwvZGF0YWxpc3Q+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImZsZXggdy1mdWxsIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW5cIj5cclxuICAgICAgICAgIDxsYWJlbCBmb3I9XCJhbGlhcy1pbnB1dFwiPkFsaWFzIChvcHRpb25hbCk6IDwvbGFiZWw+XHJcbiAgICAgICAgICA8aW5wdXRcclxuICAgICAgICAgICAgbmFtZT1cImFsaWFzLWlucHV0XCJcclxuICAgICAgICAgICAgaWQ9XCJhbGlhcy1pbnB1dFwiXHJcbiAgICAgICAgICAgIHR5cGU9XCJ0ZXh0XCJcclxuICAgICAgICAgICAgdmFsdWU9e3RlbXBsYXRlVmFsdWUoKX1cclxuICAgICAgICAgICAgb25JbnB1dD17KGUpID0+IHNldFRlbXBsYXRlVmFsdWUoZS50YXJnZXQudmFsdWUpfVxyXG4gICAgICAgICAgLz5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgICB7LyogPE1hcmtkb3duIGFwcD17YXBwfSBtYXJrZG93bj17bWFya2Rvd24oKX0gc291cmNlUGF0aD17Y3R4LnNvdXJjZVBhdGh9IC8+ICovfVxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJ3LWZ1bGxcIj5cclxuICAgICAgICAgIDxidXR0b25cclxuICAgICAgICAgICAgZGlzYWJsZWQ9eyF0aXRsZVZhbHVlKCl9XHJcbiAgICAgICAgICAgIG9uQ2xpY2s9e2FzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAvLyBhd2FpdCBhZGRDb2wobWFya2Rvd24oKSk7XHJcbiAgICAgICAgICAgICAgcHJvcHMuc2V0T3BlbihmYWxzZSk7XHJcbiAgICAgICAgICAgIH19XHJcbiAgICAgICAgICAgIGNsYXNzPVwiZmxvYXQtcmlnaHQgYmctaW50ZXJhY3RpdmUtYWNjZW50IHAtYnV0dG9uIHRleHQtb24tYWNjZW50IGhvdmVyOmJnLWludGVyYWN0aXZlLWFjY2VudC1ob3ZlciBob3Zlcjp0ZXh0LWFjY2VudC1ob3ZlciBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWRcIlxyXG4gICAgICAgICAgPlxyXG4gICAgICAgICAgICBhZGRcclxuICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICA8L0RpYWxvZ0NvbnRlbnQ+XHJcbiAgICA8L0RpYWxvZz5cclxuICApO1xyXG59O1xyXG5cclxuLy8gVE9ETyBmaXggbmVzdGVkXHJcbiIsImltcG9ydCB7IENvbXBvbmVudFByb3BzLCBjcmVhdGVTaWduYWwsIHNwbGl0UHJvcHMgfSBmcm9tIFwic29saWQtanNcIjtcclxuXHJcbmV4cG9ydCB0eXBlIFRvZ2dsZVByb3BzID0gT21pdDxcclxuICBDb21wb25lbnRQcm9wczxcImlucHV0XCI+LFxyXG4gIFwib25DbGlja1wiIHwgXCJ0eXBlXCIgfCBcInZhbHVlXCJcclxuPiAmIHtcclxuICBvbkNoZWNrZWRDaGFuZ2U/OiAoYjogYm9vbGVhbikgPT4gdm9pZDtcclxuICBjb250YWluZXJDbGFzcz86IHN0cmluZztcclxufTtcclxuZXhwb3J0IGNvbnN0IFRvZ2dsZSA9IChwcm9wczogVG9nZ2xlUHJvcHMpID0+IHtcclxuICBjb25zdCBbbG9jYWwsIHJlc3RdID0gc3BsaXRQcm9wcyhwcm9wcywgW1xyXG4gICAgXCJjb250YWluZXJDbGFzc1wiLFxyXG4gICAgXCJvbkNoZWNrZWRDaGFuZ2VcIixcclxuICBdKTtcclxuICBjb25zdCBbaXNDaGVja2VkLCBzZXRDaGVja2VkXSA9IGNyZWF0ZVNpZ25hbCghIXJlc3QuY2hlY2tlZCk7XHJcbiAgcmV0dXJuIChcclxuICAgIDxkaXZcclxuICAgICAgY2xhc3M9e2BjaGVja2JveC1jb250YWluZXIgJHtpc0NoZWNrZWQoKSA/IFwiaXMtZW5hYmxlZFwiIDogXCIgXCJ9YH1cclxuICAgICAgb25DbGljaz17KCkgPT4ge1xyXG4gICAgICAgIHNldENoZWNrZWQoKHByZXYpID0+IHtcclxuICAgICAgICAgIGlmIChsb2NhbC5vbkNoZWNrZWRDaGFuZ2UpIGxvY2FsLm9uQ2hlY2tlZENoYW5nZSghcHJldik7XHJcbiAgICAgICAgICByZXR1cm4gIXByZXY7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH19XHJcbiAgICA+XHJcbiAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiB7Li4ucmVzdH0gY2hlY2tlZD17aXNDaGVja2VkKCl9IC8+XHJcbiAgICA8L2Rpdj5cclxuICApO1xyXG59O1xyXG4iLCJpbXBvcnQge1xyXG4gIEFjY2Vzc29yLFxyXG4gIGNyZWF0ZU1lbW8sXHJcbiAgY3JlYXRlU2lnbmFsLFxyXG4gIEZvcixcclxuICBKU1hFbGVtZW50LFxyXG4gIE1hdGNoLFxyXG4gIG9uQ2xlYW51cCxcclxuICBvbk1vdW50LFxyXG4gIFNldHRlcixcclxuICBTaG93LFxyXG4gIHNwbGl0UHJvcHMsXHJcbiAgU3dpdGNoLFxyXG59IGZyb20gXCJzb2xpZC1qc1wiO1xyXG5pbXBvcnQgXCJAL0FwcC5jc3NcIjtcclxuaW1wb3J0IHsgTW9kaWZpZWREYXRhdmlld1F1ZXJ5UmVzdWx0IH0gZnJvbSBcIkAvbGliL3R5cGVzXCI7XHJcbmltcG9ydCB7IGNyZWF0ZVN0b3JlLCBTZXRTdG9yZUZ1bmN0aW9uIH0gZnJvbSBcInNvbGlkLWpzL3N0b3JlXCI7XHJcbmltcG9ydCB7XHJcbiAgRGF0YUVkaXRCbG9ja0NvbmZpZyxcclxuICBEYXRhRWRpdEJsb2NrQ29uZmlnS2V5LFxyXG4gIGRlZmF1bHREYXRhRWRpdEJsb2NrQ29uZmlnLFxyXG4gIGdldENvbHVtblByb3BlcnR5TmFtZXMsXHJcbiAgcmVnaXN0ZXJEYXRhdmlld0V2ZW50cyxcclxuICBzZXRCbG9ja0NvbmZpZyxcclxuICB0cnlEYXRhdmlld0FycmF5VG9BcnJheSxcclxuICB1bnJlZ2lzdGVyRGF0YXZpZXdFdmVudHMsXHJcbiAgdXBkYXRlQmxvY2tDb25maWcsXHJcbn0gZnJvbSBcIkAvbGliL3V0aWxcIjtcclxuLy8gaW1wb3J0IHsgTWludXMsIFBsdXMgfSBmcm9tIFwibHVjaWRlLXNvbGlkXCI7XHJcbmltcG9ydCBMb2NrIGZyb20gXCJsdWNpZGUtc29saWQvaWNvbnMvTG9ja1wiO1xyXG5pbXBvcnQgTG9ja09wZW4gZnJvbSBcImx1Y2lkZS1zb2xpZC9pY29ucy9Mb2NrLW9wZW5cIjtcclxuaW1wb3J0IEdlYXIgZnJvbSBcImx1Y2lkZS1zb2xpZC9pY29ucy9TZXR0aW5nc1wiO1xyXG4vKlxyXG4gIFRPRE9cclxuICAtIHByb2JsZW06IGJ1aWxkIHByb2Nlc3MgYnVuZGxlcyAqYWxsKiBsdWNpZGUgaWNvbnMsIGJ1dCAqZG9lcyogY29ycmVjdGx5IHRyZWVzaGFrZSBmb3IgZmluYWwgYnVuZGxlLiBUaGlzIGNhdXNlcyA1MDAlIGluY3JlYXNlIHRvIGJ1aWxkIHRpbWUgZGVzcGl0ZSBidW5kbGUgYmVpbmcgY29ycmVjdC5cclxuICAtIHdvcmthcm91bmQ6XHJcbiAgICAtIGVmZmVjdDogY29ycmVjdHMgYnVpbGQgcHJvY2VzcyB0aW1lIFxyXG4gICAgLSBmcm9tIGh0dHBzOi8vY2hyaXN0b3BoZXIuZW5naW5lZXJpbmcvZW4vYmxvZy9sdWNpZGUtaWNvbnMtd2l0aC12aXRlLWRldi1zZXJ2ZXIvXHJcbiAgICAtIGlzc3VlOiBubyBhdXRvY29tcGxldGVcclxuKi9cclxuaW1wb3J0IHsgZGVmYXVsdFF1ZXJ5UmVzdWx0IH0gZnJvbSBcIkAvbGliL2NvbnN0YW50c1wiO1xyXG5pbXBvcnQgeyBUYWJsZSB9IGZyb20gXCJAL2NvbXBvbmVudHMvVGFibGVcIjtcclxuaW1wb3J0IHtcclxuICBEaWFsb2csXHJcbiAgRGlhbG9nQ2xvc2UsXHJcbiAgRGlhbG9nQ29udGVudCxcclxuICBEaWFsb2dEZXNjcmlwdGlvbixcclxuICBEaWFsb2dGb290ZXIsXHJcbiAgRGlhbG9nVGl0bGUsXHJcbiAgRGlhbG9nVHJpZ2dlcixcclxufSBmcm9tIFwiLi9jb21wb25lbnRzL3VpL2RpYWxvZ1wiO1xyXG5pbXBvcnQgeyBFeHRlcm5hbExpbmsgfSBmcm9tIFwiLi9jb21wb25lbnRzL3VpL2V4dGVybmFsLWxpbmtcIjtcclxuaW1wb3J0IHsgYnV0dG9uVmFyaWFudHMgfSBmcm9tIFwiLi9jb21wb25lbnRzL3VpL2J1dHRvblwiO1xyXG5pbXBvcnQgeyBUb2dnbGUgfSBmcm9tIFwiLi9jb21wb25lbnRzL3VpL3RvZ2dsZVwiO1xyXG5pbXBvcnQge1xyXG4gIENvZGVCbG9ja0NvbnRleHQsXHJcbiAgQ29kZUJsb2NrSW5mbyxcclxuICB1ZXNDb2RlQmxvY2ssXHJcbn0gZnJvbSBcIi4vaG9va3MvdXNlRGF0YUVkaXRcIjtcclxuaW1wb3J0IHsgTWFya2Rvd25WaWV3IH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcblxyXG5leHBvcnQgdHlwZSBBcHBQcm9wcyA9IENvZGVCbG9ja0luZm8gJiB7XHJcbiAgdWlkOiBzdHJpbmc7XHJcbiAgcXVlcnlSZXN1bHRTdG9yZTogUmVjb3JkPHN0cmluZywgTW9kaWZpZWREYXRhdmlld1F1ZXJ5UmVzdWx0PjtcclxuICBzZXRRdWVyeVJlc3VsdFN0b3JlOiBTZXRTdG9yZUZ1bmN0aW9uPFxyXG4gICAgUmVjb3JkPHN0cmluZywgTW9kaWZpZWREYXRhdmlld1F1ZXJ5UmVzdWx0PlxyXG4gID47XHJcbn07XHJcblxyXG5mdW5jdGlvbiBBcHAocHJvcHM6IEFwcFByb3BzKSB7XHJcbiAgY29uc3QgW2xvY2FsLCBjb2RlQmxvY2tJbmZvXSA9IHNwbGl0UHJvcHMocHJvcHMsIFtcclxuICAgIFwidWlkXCIsXHJcbiAgICBcInF1ZXJ5UmVzdWx0U3RvcmVcIixcclxuICAgIFwic2V0UXVlcnlSZXN1bHRTdG9yZVwiLFxyXG4gIF0pO1xyXG4gIGNvbnN0IHsgcGx1Z2luLCBxdWVyeSwgY29uZmlnLCBkYXRhdmlld0FQSSB9ID0gY29kZUJsb2NrSW5mbztcclxuICBjb25zdCBxdWVyeVJlc3VsdHM6IEFjY2Vzc29yPE1vZGlmaWVkRGF0YXZpZXdRdWVyeVJlc3VsdD4gPSBjcmVhdGVNZW1vKCgpID0+IHtcclxuICAgIHJldHVybiBwcm9wcy5xdWVyeVJlc3VsdFN0b3JlW3Byb3BzLnVpZF0gPz8gZGVmYXVsdFF1ZXJ5UmVzdWx0O1xyXG4gIH0sIGRlZmF1bHRRdWVyeVJlc3VsdCk7XHJcblxyXG4gIGNvbnN0IHVwZGF0ZVF1ZXJ5UmVzdWx0cyA9IGFzeW5jICgpID0+IHtcclxuICAgIC8vIGNvbnNvbGUubG9nKFwid2Ugb3V0IGhlcmVcIiwgcHJvcHMucXVlcnkpO1xyXG4gICAgY29uc3QgdHJ1ZVByb3BlcnR5TmFtZXMgPSBnZXRDb2x1bW5Qcm9wZXJ0eU5hbWVzKHF1ZXJ5KTtcclxuICAgIC8vIGNvbnNvbGUubG9nKFwidHJ1ZSBwcm9wczsgXCIsIHRydWVQcm9wZXJ0eU5hbWVzKTtcclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRhdGF2aWV3QVBJLnF1ZXJ5KHF1ZXJ5KTtcclxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3NmdWwpIHtcclxuICAgICAgbG9jYWwuc2V0UXVlcnlSZXN1bHRTdG9yZShsb2NhbC51aWQsIHsgLi4ucmVzdWx0LCB0cnVlUHJvcGVydHlOYW1lcyB9KTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgcmVzdWx0LnZhbHVlLnZhbHVlcyA9IHJlc3VsdC52YWx1ZS52YWx1ZXMubWFwKChhcnIpID0+XHJcbiAgICAgIGFyci5tYXAoKHYpID0+IHRyeURhdGF2aWV3QXJyYXlUb0FycmF5KHYpKSxcclxuICAgICk7XHJcbiAgICBsb2NhbC5zZXRRdWVyeVJlc3VsdFN0b3JlKGxvY2FsLnVpZCwgeyAuLi5yZXN1bHQsIHRydWVQcm9wZXJ0eU5hbWVzIH0pO1xyXG4gIH07XHJcblxyXG4gIHVwZGF0ZVF1ZXJ5UmVzdWx0cygpO1xyXG4gIHJlZ2lzdGVyRGF0YXZpZXdFdmVudHMocGx1Z2luLCB1cGRhdGVRdWVyeVJlc3VsdHMpO1xyXG5cclxuICAvKlxyXG4gICAgVE9ETyBJIHdvdWxkIGxpa2UgdG8gbG9jayBlZGl0aW5nIHdoZW4gaW4gcmVhZGluZyBtb2RlXHJcbiAgICBEb2luZyBiZWxvdyBkb2VzIGNvcnJlY3RseSBpZGVudGlmeSB0aGUgbGVhZiBhIGNvZGUgYmxvY2sgaXMgY3VycmVudGx5IGluXHJcbiAgICBBbmQgZ2V0TW9kZSgpIGRvZXMgZ2V0IHRoZSBtb2RlIGNvcnJlY3RseSAncHJldmlldycgfHwgJ3NvdXJjZSdcclxuICAgIElmIHRoZSBub3RlIGlzIG9wZW5lZCBpbiBlZGl0aW5nIG1vZGUsIHRoZW4gc3dpdGNoaW5nIHRvIHJlYWRpbmcgbW9kZSAqd2lsbCogcmVyZW5kZXIgYW5kIGNhdXNlIHRoaXMgdG8gcnVuIGFnYWluICh3aGljaCBpcyBnb29kKVxyXG4gICAgSG93ZXZlciBpcyBvcGVuZWQgaW4gcmVhZGluZyBtb2RlLCBzd2l0Y2hpbmcgdG8gZWRpdCBtb2RlIHdpbGwgKm5vdCogY2F1ZXMgdGhpcyB0byBydW4gYWdhaW4gKGJhZClcclxuICAgIElkZWFsbHkgd2UgbmVlZCB0aGlzIHRvIHJ1biBldmVyeSB0aW1lIHRoZSBtYXRjaGVkIGxlYWZzIHZpZXcgbW9kZSBpcyBjaGFuZ2VkLCBidXQgSSBkb24ndCB0aGluayB0aGlzIGlzIHBvc3NpYmxlXHJcbiAgKi9cclxuICAvLyBvbk1vdW50KCgpID0+IHtcclxuICAvLyAgIChhc3luYyAoKSA9PiB7XHJcbiAgLy8gICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXMpID0+IHNldFRpbWVvdXQocmVzLCA1MDApKTtcclxuICAvLyAgICAgY29kZUJsb2NrSW5mby5wbHVnaW4uYXBwLndvcmtzcGFjZS5pdGVyYXRlUm9vdExlYXZlcygobGVhZikgPT4ge1xyXG4gIC8vICAgICAgIGlmICghbGVhZi52aWV3LmNvbnRhaW5lckVsLmNvbnRhaW5zKGNvZGVCbG9ja0luZm8uZWwpKSByZXR1cm47XHJcbiAgLy8gICAgICAgY29uc29sZS5sb2coXCJkb2VzIGNvbnRhaW5cIik7XHJcbiAgLy8gICAgICAgaWYgKCEobGVhZi52aWV3IGluc3RhbmNlb2YgTWFya2Rvd25WaWV3KSkgcmV0dXJuO1xyXG4gIC8vICAgICAgIGNvbnNvbGUubG9nKFwiaXMgbWFya2Rvd25cIik7XHJcbiAgLy8gICAgICAgY29uc29sZS5sb2coXCJlZGl0b3I6IFwiLCBsZWFmLnZpZXcuZ2V0TW9kZSgpKTtcclxuICAvLyAgICAgICBpZiAobGVhZi52aWV3LmVkaXRvcikgcmV0dXJuO1xyXG4gIC8vICAgICAgIGNvbnNvbGUubG9nKFwibm8gZWRpdG9yXCIpO1xyXG4gIC8vICAgICAgIC8vIGlzUmVhZGluZ01vZGUgPSB0cnVlO1xyXG4gIC8vICAgICAgIHVwZGF0ZUJsb2NrQ29uZmlnKFwibG9ja0VkaXRpbmdcIiwgdHJ1ZSwgY29kZUJsb2NrSW5mbyk7XHJcbiAgLy8gICAgIH0pO1xyXG4gIC8vICAgfSkoKTtcclxuICAvLyB9KTtcclxuXHJcbiAgb25DbGVhbnVwKCgpID0+IHtcclxuICAgIHVucmVnaXN0ZXJEYXRhdmlld0V2ZW50cyhwbHVnaW4sIHVwZGF0ZVF1ZXJ5UmVzdWx0cyk7XHJcbiAgfSk7XHJcblxyXG4gIHJldHVybiAoXHJcbiAgICA8Q29kZUJsb2NrQ29udGV4dC5Qcm92aWRlciB2YWx1ZT17Y29kZUJsb2NrSW5mb30+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJoLWZpdCB3LWZ1bGwgb3ZlcmZsb3cteC1zY3JvbGxcIj5cclxuICAgICAgICA8VGFibGUgcXVlcnlSZXN1bHRzPXtxdWVyeVJlc3VsdHMoKX0gLz5cclxuICAgICAgPC9kaXY+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiPlxyXG4gICAgICAgIDxUb29sYmFyIGNvbmZpZz17Y29uZmlnfSAvPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIDwvQ29kZUJsb2NrQ29udGV4dC5Qcm92aWRlcj5cclxuICApO1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBBcHA7XHJcblxyXG5leHBvcnQgY29uc3QgVG9vbGJhciA9IChwcm9wczogeyBjb25maWc6IERhdGFFZGl0QmxvY2tDb25maWcgfSkgPT4ge1xyXG4gIGNvbnN0IGNvZGVCbG9ja0luZm8gPSB1ZXNDb2RlQmxvY2soKTtcclxuICBjb25zdCBbaXNDb25maWdPcGVuLCBzZXRDb25maWdPcGVuXSA9IGNyZWF0ZVNpZ25hbChmYWxzZSk7XHJcbiAgY29uc3QgdXBkYXRlQ29uZmlnID0gYXN5bmMgKFxyXG4gICAga2V5OiBEYXRhRWRpdEJsb2NrQ29uZmlnS2V5LFxyXG4gICAgdmFsdWU6IERhdGFFZGl0QmxvY2tDb25maWdbdHlwZW9mIGtleV0sXHJcbiAgKSA9PiB7XHJcbiAgICBhd2FpdCB1cGRhdGVCbG9ja0NvbmZpZyhrZXksIHZhbHVlLCBjb2RlQmxvY2tJbmZvKTtcclxuICB9O1xyXG4gIHJldHVybiAoXHJcbiAgICA8PlxyXG4gICAgICA8QmxvY2tDb25maWdNb2RhbFxyXG4gICAgICAgIGNvbmZpZz17cHJvcHMuY29uZmlnfVxyXG4gICAgICAgIGNvZGVCbG9ja0luZm89e2NvZGVCbG9ja0luZm99XHJcbiAgICAgICAgb3Blbj17aXNDb25maWdPcGVuKCl9XHJcbiAgICAgICAgc2V0T3Blbj17c2V0Q29uZmlnT3Blbn1cclxuICAgICAgLz5cclxuICAgICAgPGRpdlxyXG4gICAgICAgIGNsYXNzPVwiY2xpY2thYmxlLWljb25cIlxyXG4gICAgICAgIG9uQ2xpY2s9eygpID0+IHNldENvbmZpZ09wZW4oKHByZXYpID0+ICFwcmV2KX1cclxuICAgICAgPlxyXG4gICAgICAgIDxHZWFyIHNpemU9XCIxcmVtXCIgLz5cclxuICAgICAgPC9kaXY+XHJcbiAgICAgIDxGb3IgZWFjaD17T2JqZWN0LmtleXMocHJvcHMuY29uZmlnKSBhcyBEYXRhRWRpdEJsb2NrQ29uZmlnS2V5W119PlxyXG4gICAgICAgIHsoa2V5KSA9PiB7XHJcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb3BzLmNvbmZpZ1trZXldO1xyXG4gICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgPFN3aXRjaD5cclxuICAgICAgICAgICAgICA8TWF0Y2ggd2hlbj17a2V5ID09PSBcImxvY2tFZGl0aW5nXCJ9PlxyXG4gICAgICAgICAgICAgICAgPGRpdlxyXG4gICAgICAgICAgICAgICAgICBjbGFzcz1cImNsaWNrYWJsZS1pY29uXCJcclxuICAgICAgICAgICAgICAgICAgb25DbGljaz17YXN5bmMgKCkgPT4gYXdhaXQgdXBkYXRlQ29uZmlnKGtleSwgIXZhbHVlKX1cclxuICAgICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgICAgPFNob3dcclxuICAgICAgICAgICAgICAgICAgICB3aGVuPXt2YWx1ZSA9PT0gdHJ1ZX1cclxuICAgICAgICAgICAgICAgICAgICBmYWxsYmFjaz17PExvY2tPcGVuIHNpemU9e1wiMXJlbVwifSAvPn1cclxuICAgICAgICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgICAgICAgIDxMb2NrIHNpemU9e1wiMXJlbVwifSAvPlxyXG4gICAgICAgICAgICAgICAgICA8L1Nob3c+XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICA8L01hdGNoPlxyXG4gICAgICAgICAgICA8L1N3aXRjaD5cclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfX1cclxuICAgICAgPC9Gb3I+XHJcbiAgICA8Lz5cclxuICApO1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IEJsb2NrQ29uZmlnTW9kYWwgPSAocHJvcHM6IHtcclxuICBjb25maWc6IERhdGFFZGl0QmxvY2tDb25maWc7XHJcbiAgY29kZUJsb2NrSW5mbzogQ29kZUJsb2NrSW5mbztcclxuICBvcGVuPzogYm9vbGVhbjtcclxuICBzZXRPcGVuPzogU2V0dGVyPGJvb2xlYW4+O1xyXG4gIHRyaWdnZXI/OiBKU1hFbGVtZW50O1xyXG59KSA9PiB7XHJcbiAgY29uc3QgW2Zvcm0sIHNldEZvcm1dID0gY3JlYXRlU3RvcmUocHJvcHMuY29uZmlnKTtcclxuXHJcbiAgY29uc3QgdXBkYXRlRm9ybSA9IChcclxuICAgIGtleToga2V5b2YgRGF0YUVkaXRCbG9ja0NvbmZpZyxcclxuICAgIHZhbHVlOiBEYXRhRWRpdEJsb2NrQ29uZmlnW3R5cGVvZiBrZXldLFxyXG4gICkgPT4ge1xyXG4gICAgc2V0Rm9ybSgocHJldikgPT4gKHsgLi4ucHJldiwgW2tleV06IHZhbHVlIH0pKTtcclxuICB9O1xyXG5cclxuICByZXR1cm4gKFxyXG4gICAgPERpYWxvZyBvcGVuPXtwcm9wcy5vcGVufSBvbk9wZW5DaGFuZ2U9e3Byb3BzLnNldE9wZW59PlxyXG4gICAgICA8U2hvdyB3aGVuPXtwcm9wcy50cmlnZ2VyfT5cclxuICAgICAgICA8RGlhbG9nVHJpZ2dlcj57cHJvcHMudHJpZ2dlciF9PC9EaWFsb2dUcmlnZ2VyPlxyXG4gICAgICA8L1Nob3c+XHJcbiAgICAgIDxEaWFsb2dDb250ZW50PlxyXG4gICAgICAgIDxEaWFsb2dUaXRsZT5CbG9jayBjb25maWd1cmF0aW9uPC9EaWFsb2dUaXRsZT5cclxuICAgICAgICA8RGlhbG9nRGVzY3JpcHRpb24+XHJcbiAgICAgICAgICBzZWUgdGhlIGRvY3N7XCIgXCJ9XHJcbiAgICAgICAgICA8RXh0ZXJuYWxMaW5rIGhyZWY9XCJodHRwczovL2dpdGh1Yi5jb20vdW54b2svb2JzaWRpYW4tZGF0YWVkaXRcIj5cclxuICAgICAgICAgICAgaGVyZVxyXG4gICAgICAgICAgPC9FeHRlcm5hbExpbms+e1wiIFwifVxyXG4gICAgICAgICAgZm9yIG1vcmUgaW5mb3JtYXRpb25cclxuICAgICAgICA8L0RpYWxvZ0Rlc2NyaXB0aW9uPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJmbGV4IHNpemUtZnVsbCBtYXgtaC1bOTAlXSBmbGV4LWNvbCBnYXAtMiBvdmVyZmxvdy15LWF1dG8gcHItMlwiPlxyXG4gICAgICAgICAgPFNldHRpbmdcclxuICAgICAgICAgICAgdGl0bGU9XCJMb2NrIGVkaXRpbmdcIlxyXG4gICAgICAgICAgICBkZXNjcmlwdGlvbj1cInByZXZlbnRzIGVkaXRpbmcgaW4gYWxsIGNlbGxzIHdoaWNoIG1ha2VzIGxpbmtzIGFuZCB0YWdzXHJcbiAgICAgICAgICAgICAgICBjbGlja2FibGUuXCJcclxuICAgICAgICAgID5cclxuICAgICAgICAgICAgPFRvZ2dsZVxyXG4gICAgICAgICAgICAgIGNoZWNrZWQ9e2Zvcm0ubG9ja0VkaXRpbmd9XHJcbiAgICAgICAgICAgICAgb25DaGVja2VkQ2hhbmdlPXsoYikgPT4gdXBkYXRlRm9ybShcImxvY2tFZGl0aW5nXCIsIGIpfVxyXG4gICAgICAgICAgICAvPlxyXG4gICAgICAgICAgPC9TZXR0aW5nPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDxEaWFsb2dGb290ZXI+XHJcbiAgICAgICAgICA8RGlhbG9nQ2xvc2VcclxuICAgICAgICAgICAgLy8gdmFyaWFudD1cIm91dGxpbmVcIlxyXG4gICAgICAgICAgICBjbGFzcz17YnV0dG9uVmFyaWFudHMub3V0bGluZX1cclxuICAgICAgICAgICAgb25DbGljaz17YXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgIGF3YWl0IHNldEJsb2NrQ29uZmlnKFxyXG4gICAgICAgICAgICAgICAgZGVmYXVsdERhdGFFZGl0QmxvY2tDb25maWcsXHJcbiAgICAgICAgICAgICAgICBwcm9wcy5jb2RlQmxvY2tJbmZvLFxyXG4gICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH19XHJcbiAgICAgICAgICA+XHJcbiAgICAgICAgICAgIHJlc2V0XHJcbiAgICAgICAgICA8L0RpYWxvZ0Nsb3NlPlxyXG4gICAgICAgICAgPERpYWxvZ0Nsb3NlXHJcbiAgICAgICAgICAgIC8vIHZhcmlhbnQ9XCJnaG9zdFwiXHJcbiAgICAgICAgICAgIGNsYXNzPXtidXR0b25WYXJpYW50cy5naG9zdH1cclxuICAgICAgICAgICAgb25DbGljaz17KCkgPT4gcHJvcHMuc2V0T3BlbiAmJiBwcm9wcy5zZXRPcGVuKGZhbHNlKX1cclxuICAgICAgICAgID5cclxuICAgICAgICAgICAgY2FuY2VsXHJcbiAgICAgICAgICA8L0RpYWxvZ0Nsb3NlPlxyXG4gICAgICAgICAgPERpYWxvZ0Nsb3NlXHJcbiAgICAgICAgICAgIC8vIHZhcmlhbnQ9XCJhY2NlbnRcIlxyXG4gICAgICAgICAgICBjbGFzcz17YnV0dG9uVmFyaWFudHMuYWNjZW50fVxyXG4gICAgICAgICAgICBvbkNsaWNrPXthc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgYXdhaXQgc2V0QmxvY2tDb25maWcoZm9ybSwgcHJvcHMuY29kZUJsb2NrSW5mbyk7XHJcbiAgICAgICAgICAgICAgaWYgKCFwcm9wcy5zZXRPcGVuKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgcHJvcHMuc2V0T3BlbihmYWxzZSk7XHJcbiAgICAgICAgICAgIH19XHJcbiAgICAgICAgICA+XHJcbiAgICAgICAgICAgIHNhdmVcclxuICAgICAgICAgIDwvRGlhbG9nQ2xvc2U+XHJcbiAgICAgICAgPC9EaWFsb2dGb290ZXI+XHJcbiAgICAgIDwvRGlhbG9nQ29udGVudD5cclxuICAgIDwvRGlhbG9nPlxyXG4gICk7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgU2V0dGluZyA9IChwcm9wczoge1xyXG4gIHRpdGxlOiBzdHJpbmc7XHJcbiAgZGVzY3JpcHRpb246IHN0cmluZztcclxuICBjaGlsZHJlbjogSlNYRWxlbWVudDtcclxufSkgPT4gKFxyXG4gIDxkaXYgY2xhc3M9XCJmbGV4IHctZnVsbCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGJvcmRlci0wIGJvcmRlci10LVsxcHhdIGJvcmRlci1zb2xpZCBib3JkZXItdC1bdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXIpXSBwdC0yXCI+XHJcbiAgICA8ZGl2PlxyXG4gICAgICA8ZGl2IGNsYXNzPVwic2V0dGluZy1pdGVtLW5hbWVcIj57cHJvcHMudGl0bGV9PC9kaXY+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb25cIj57cHJvcHMuZGVzY3JpcHRpb259PC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuICAgIHtwcm9wcy5jaGlsZHJlbn1cclxuICA8L2Rpdj5cclxuKTtcclxuIiwiLy8gQHJlZnJlc2ggcmVsb2FkXHJcblxyXG5pbXBvcnQgeyByZW5kZXIgfSBmcm9tIFwic29saWQtanMvd2ViXCI7XHJcbmltcG9ydCBBcHAgZnJvbSBcIi4vQXBwLnRzeFwiO1xyXG5pbXBvcnQgXCIuL2luZGV4LmNzc1wiO1xyXG5pbXBvcnQge1xyXG4gIEFwcCBhcyBPYnNpZGlhbkFwcCxcclxuICBOb3RpY2UsXHJcbiAgUGx1Z2luLFxyXG4gIE1hcmtkb3duUmVuZGVyQ2hpbGQsXHJcbiAgTWFya2Rvd25WaWV3LFxyXG59IGZyb20gXCJvYnNpZGlhblwiO1xyXG5pbXBvcnQgeyBEYXRhdmlld0FQSSwgTW9kaWZpZWREYXRhdmlld1F1ZXJ5UmVzdWx0IH0gZnJvbSBcIi4vbGliL3R5cGVzLnRzXCI7XHJcbmltcG9ydCB7IHNwbGl0UXVlcnlPbkNvbmZpZyB9IGZyb20gXCIuL2xpYi91dGlsLnRzXCI7XHJcbmltcG9ydCB7IGNyZWF0ZVN0b3JlIH0gZnJvbSBcInNvbGlkLWpzL3N0b3JlXCI7XHJcbmltcG9ydCB7IGNyZWF0ZVVuaXF1ZUlkIH0gZnJvbSBcInNvbGlkLWpzXCI7XHJcblxyXG5jb25zdCBnZXREYXRhdmlld0FQSSA9IChwQXBwPzogT2JzaWRpYW5BcHApID0+IHtcclxuICBpZiAocEFwcCkge1xyXG4gICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgY29uc3QgeyBwbHVnaW5zIH0gPSBwQXBwLnBsdWdpbnM7XHJcbiAgICBpZiAocGx1Z2lucy5oYXNPd25Qcm9wZXJ0eShcImRhdGF2aWV3XCIpKSB7XHJcbiAgICAgIHJldHVybiBwbHVnaW5zLmRhdGF2aWV3LmFwaSBhcyBEYXRhdmlld0FQSTtcclxuICAgIH1cclxuICB9XHJcbiAgLy8gQHRzLWlnbm9yZVxyXG4gIGNvbnN0IGdQbHVnaW5zID0gYXBwLnBsdWdpbnMucGx1Z2lucztcclxuICBpZiAoZ1BsdWdpbnMuaGFzT3duUHJvcGVydHkoXCJkYXRhdmlld1wiKSkge1xyXG4gICAgcmV0dXJuIGdQbHVnaW5zLmRhdGF2aWV3LmFwaSBhcyBEYXRhdmlld0FQSTtcclxuICB9XHJcbiAgY29uc3QgbXNnID0gXCJGYWlsZWQgdG8gZ2V0IERhdGF2aWV3IEFQSS4gSXMgRGF0YXZpZXcgaW5zdGFsbGVkICYgZW5hYmxlZD9cIjtcclxuICBuZXcgTm90aWNlKG1zZyk7XHJcbiAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEYXRhRWRpdCBleHRlbmRzIFBsdWdpbiB7XHJcbiAgYXN5bmMgb25sb2FkKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgYXdhaXQgYXBwLnBsdWdpbnMubG9hZFBsdWdpbihcImRhdGF2aWV3XCIpO1xyXG4gICAgLy8gY29uc3QgZGF0YXZpZXdBUEkgPSBnZXRBUEkodGhpcy5hcHApIGFzIERhdGF2aWV3QVBJO1xyXG5cclxuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcclxuICAgICAgXCJkYXRhZWRpdFwiLFxyXG4gICAgICBhc3luYyAoc291cmNlLCBlbCwgY3R4KSA9PiB7XHJcbiAgICAgICAgY29uc3QgZGF0YXZpZXdBUEkgPSBnZXREYXRhdmlld0FQSSh0aGlzLmFwcCkgYXMgRGF0YXZpZXdBUEk7XHJcbiAgICAgICAgLy8gYmVzdCBwcmFjdGljZSB0byBlbXB0eSB3aGVuIHJlZ2lzdGVyaW5nXHJcbiAgICAgICAgZWwuZW1wdHkoKTtcclxuICAgICAgICAvLyBhbGxvd3MgYWxsIGRlc2NlbmRlbnRzIHRvIHVzZSB0dyB1dGlseSBjbGFzc2VzXHJcbiAgICAgICAgZWwuY2xhc3NMaXN0LnRvZ2dsZShcInR3Y3NzXCIsIHRydWUpO1xyXG4gICAgICAgIC8vIGJlY2F1c2UgdXNlcnMgd2lsbCBzcGVuZCBhIGxvdCBvZiB0aW1lIGhvdmVyaW5nIHdpdGhpblxyXG4gICAgICAgIC8vIEkgZGVjaWRlZCB0byByZW1vdmUgdGhlIHNoYWRvdyB0aGF0IGFwcGVhcnMgb24gaG92ZXJcclxuICAgICAgICBlbC5wYXJlbnRFbGVtZW50IS5zdHlsZS5ib3hTaGFkb3cgPSBcIm5vbmVcIjtcclxuICAgICAgICBjb25zdCB7IHF1ZXJ5LCBjb25maWcgfSA9IHNwbGl0UXVlcnlPbkNvbmZpZyhzb3VyY2UpO1xyXG4gICAgICAgIC8vIGxldCBpc0luUmVhZGluZ01vZGUgPSB0cnVlO1xyXG4gICAgICAgIC8vIHRoaXMuYXBwLndvcmtzcGFjZS5pdGVyYXRlUm9vdExlYXZlcyhhc3luYyAobGVhZikgPT4ge1xyXG4gICAgICAgIC8vICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlcykgPT4gc2V0VGltZW91dChyZXMsIDApKTtcclxuICAgICAgICAvLyAgIGNvbnNvbGUubG9nKFwiY2hlY2tpbmcgbGVhZlwiKTtcclxuICAgICAgICAvLyAgIGlmICghbGVhZi52aWV3LmNvbnRhaW5lckVsLmNvbnRhaW5zKGVsKSkgcmV0dXJuO1xyXG4gICAgICAgIC8vICAgY29uc29sZS5sb2coXCJkb2VzIGNvbnRhaW5cIik7XHJcbiAgICAgICAgLy8gICBpZiAoIShsZWFmLnZpZXcgaW5zdGFuY2VvZiBNYXJrZG93blZpZXcpKSByZXR1cm47XHJcbiAgICAgICAgLy8gICBjb25zb2xlLmxvZyhcImlzIG1hcmtkb3duXCIpO1xyXG4gICAgICAgIC8vICAgaWYgKCFsZWFmLnZpZXcuZWRpdG9yKSByZXR1cm47XHJcbiAgICAgICAgLy8gICBjb25zb2xlLmxvZyhcImhhcyBlZGl0b3JcIik7XHJcbiAgICAgICAgLy8gICBpc0luUmVhZGluZ01vZGUgPSBmYWxzZTtcclxuICAgICAgICAvLyB9KTtcclxuICAgICAgICAvLyBpZiAoaXNJblJlYWRpbmdNb2RlKSB7XHJcbiAgICAgICAgLy8gICBjb25maWcubG9ja0VkaXRpbmcgPSB0cnVlO1xyXG4gICAgICAgIC8vIH1cclxuICAgICAgICBjb25zdCB1aWQgPSBjcmVhdGVVbmlxdWVJZCgpO1xyXG4gICAgICAgIC8vIGZvciBzb21lIHJlYXNvbiwgZG9pbmcgdGhpcyBhcyBhIHNpZ25hbCBpbnNpZGUgZWFjaCA8QXBwIC8+IGNhdXNlcyBnbGl0Y2hlcyB3aGVuIHVwZGF0aW5nIGZyb20gZGF0YXZpZXcgZXZlbnRzXHJcbiAgICAgICAgLy8gYnV0IHRoaXMgd29ya3MganVzdCBmaW5lXHJcbiAgICAgICAgY29uc3QgW3F1ZXJ5UmVzdWx0U3RvcmUsIHNldFF1ZXJ5UmVzdWx0U3RvcmVdID0gY3JlYXRlU3RvcmU8XHJcbiAgICAgICAgICBSZWNvcmQ8c3RyaW5nLCBNb2RpZmllZERhdGF2aWV3UXVlcnlSZXN1bHQ+XHJcbiAgICAgICAgPih7fSk7XHJcbiAgICAgICAgY29uc3QgZGlzcG9zZSA9IHJlbmRlcigoKSA9PiB7XHJcbiAgICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICA8QXBwXHJcbiAgICAgICAgICAgICAgcGx1Z2luPXt0aGlzfVxyXG4gICAgICAgICAgICAgIGVsPXtlbH1cclxuICAgICAgICAgICAgICBzb3VyY2U9e3NvdXJjZX1cclxuICAgICAgICAgICAgICBxdWVyeT17cXVlcnl9XHJcbiAgICAgICAgICAgICAgY29uZmlnPXtjb25maWd9XHJcbiAgICAgICAgICAgICAgY3R4PXtjdHh9XHJcbiAgICAgICAgICAgICAgZGF0YXZpZXdBUEk9e2RhdGF2aWV3QVBJfVxyXG4gICAgICAgICAgICAgIHVpZD17dWlkfVxyXG4gICAgICAgICAgICAgIHF1ZXJ5UmVzdWx0U3RvcmU9e3F1ZXJ5UmVzdWx0U3RvcmV9XHJcbiAgICAgICAgICAgICAgc2V0UXVlcnlSZXN1bHRTdG9yZT17c2V0UXVlcnlSZXN1bHRTdG9yZX1cclxuICAgICAgICAgICAgLz5cclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfSwgZWwpO1xyXG4gICAgICAgIC8qIFxyXG4gICAgICB0aGUgcmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvciBjYWxsYmFjayBpcyBjYWxsZWRcclxuICAgICAgZXZlcnkgdGltZSB0aGUgY29kZSBibG9jayBpcyByZW5kZXJlZC4gRG9pbmcgdGhlIGJlbG93XHJcbiAgICAgIHdpbGwgY2F1c2UgdGhlIGFzc29jaWF0ZWQgbWRDaGlsZCB0byB0ZWxsIHNvbGlkIHRvIGRpc3Bvc2VcclxuICAgICAgb2YgdGhpcyByb290IGFuZCBub3QgdHJhY2sgaXRzIGNvbnRleHQuXHJcbiAgICAgICovXHJcbiAgICAgICAgY29uc3QgbWRDaGlsZCA9IG5ldyBNYXJrZG93blJlbmRlckNoaWxkKGVsKTtcclxuICAgICAgICBtZENoaWxkLnJlZ2lzdGVyKCgpID0+IHtcclxuICAgICAgICAgIGRpc3Bvc2UoKTtcclxuICAgICAgICAgIHNldFF1ZXJ5UmVzdWx0U3RvcmUoKHByZXYpID0+IHtcclxuICAgICAgICAgICAgZGVsZXRlIHByZXZbdWlkXTtcclxuICAgICAgICAgICAgcmV0dXJuIHByZXY7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjdHguYWRkQ2hpbGQobWRDaGlsZCk7XHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG4gIH1cclxufVxyXG4iXSwibmFtZXMiOlsidmFsdWUiLCJjaGlsZHJlbiIsImkiLCJzb3VyY2VzIiwiZGlzcG9zZSIsImRvY3VtZW50IiwidW53cmFwIiwiTm90aWNlIiwiYXBwIiwicGFyc2VZYW1sIiwic3RyaW5naWZ5WWFtbCIsImRlZmF1bHRBdHRyaWJ1dGVzIiwieG1sbnMiLCJ3aWR0aCIsImhlaWdodCIsInZpZXdCb3giLCJmaWxsIiwic3Ryb2tlIiwiZGVmYXVsdEF0dHJpYnV0ZXNfZGVmYXVsdCIsIkljb24iLCJwcm9wcyIsImxvY2FsUHJvcHMiLCJyZXN0Iiwic3BsaXRQcm9wcyIsIl9lbCQiLCJfdG1wbCQiLCJfJG1lcmdlUHJvcHMiLCJzaXplIiwiY29sb3IiLCJfJG1lbW8iLCJhYnNvbHV0ZVN0cm9rZVdpZHRoIiwiTnVtYmVyIiwic3Ryb2tlV2lkdGgiLCJtZXJnZUNsYXNzZXMiLCJuYW1lIiwidG9LZWJhYkNhc2UiLCJjbGFzcyIsIl8kY3JlYXRlQ29tcG9uZW50IiwiRm9yIiwiZWFjaCIsImljb25Ob2RlIiwiZWxlbWVudE5hbWUiLCJhdHRycyIsIkR5bmFtaWMiLCJjb21wb25lbnQiLCJJY29uX2RlZmF1bHQiLCJ4IiwieSIsInJ4IiwicnkiLCJrZXkiLCJkIiwiTG9jayIsImxvY2tfZGVmYXVsdCIsIkxvY2tPcGVuIiwibG9ja19vcGVuX2RlZmF1bHQiLCJjeCIsImN5IiwiciIsIlNldHRpbmdzIiwic2V0dGluZ3NfZGVmYXVsdCIsIk1hcmtkb3duIiwicmVmIiwiZGl2UHJvcHMiLCJtZCIsImNyZWF0ZU1lbW8iLCJzdHIiLCJtYXJrZG93biIsIkFycmF5IiwiaXNBcnJheSIsImpvaW4iLCJ0b1N0cmluZyIsIkNvbXBvbmVudCIsImNyZWF0ZUVmZmVjdCIsImVtcHR5IiwicmVuZGVyIiwic291cmNlUGF0aCIsIkNvZGVCbG9ja0NvbnRleHQiLCJjcmVhdGVDb250ZXh0IiwicGx1Z2luIiwiZWwiLCJzb3VyY2UiLCJxdWVyeSIsImNvbmZpZyIsImN0eCIsImRhdGF2aWV3QVBJIiwidWVzQ29kZUJsb2NrIiwidXNlQ29udGV4dCIsIkNoZWNrYm94SW5wdXQiLCIkJGNsaWNrIiwiZSIsInVwZGF0ZU1ldGFkYXRhUHJvcGVydHkiLCJwcm9wZXJ0eSIsImN1cnJlbnRUYXJnZXQiLCJjaGVja2VkIiwiZmlsZVBhdGgiLCJfJGVmZmVjdCIsImRpc2FibGVkIiwibG9ja0VkaXRpbmciLCJfJGRlbGVnYXRlRXZlbnRzIiwiRGF0ZURhdGV0aW1lSW5wdXQiLCJsdXhvbiIsIkRhdGVUaW1lIiwiaXNUaW1lIiwiY2hlY2tJZkRhdGVIYXNUaW1lIiwiYWRkRXZlbnRMaXN0ZW5lciIsImlzVmFsaWQiLCJ0YXJnZXQiLCJ2YWxpZGl0eSIsInNldEVkaXRpbmciLCJmb3JtYXQiLCJkdCIsImZyb21Gb3JtYXQiLCJuZXdWYWx1ZSIsInRvRm9ybWF0IiwiZm9ybWF0dGVkT2xkIiwiYXV0b2ZvY3VzIiwiXyRzZXRBdHRyaWJ1dGUiLCJQbHVzIiwicGx1c19kZWZhdWx0IiwiVGV4dElucHV0Iiwic2V0U2l6ZSIsImNyZWF0ZVNpZ25hbCIsImxlbmd0aCIsIiQkaW5wdXQiLCJ1cGRhdGVQcm9wZXJ0eSIsIkxpc3RUYWJsZURhdGFXcmFwcGVyIiwiX2VsJDIiLCJmaXJzdENoaWxkIiwidmFsIiwiaW5kZXgiLCJMaXN0VGFibGVEYXRhSXRlbSIsIml0ZW1WYWx1ZSIsIml0ZW1JbmRleCIsInByZXZlbnREZWZhdWx0IiwiaXNFZGl0aW5nIiwiX2VsJDMiLCJfdG1wbCQyIiwiU2hvdyIsIndoZW4iLCJmYWxsYmFjayIsInRyeURhdGF2aWV3TGlua1RvTWFya2Rvd24iLCJvbkNsaWNrIiwidW5kZWZpbmVkIiwiTGlzdElucHV0IiwidmFsdWVUeXBlIiwibmV3VmFsIiwiYXJyIiwiZmlsdGVyIiwiXyIsImNsYXNzTmFtZSIsImNsYXNzR3JvdXAiLCJjbGFzc0xpc3QiLCJhY2Nlc3MiLCJjb250YWlucyIsImdldENvbXB1dGVkU3R5bGUiLCJEQVRBX1RPUF9MQVlFUl9BVFRSIiwib3JpZ2luYWxCb2R5UG9pbnRlckV2ZW50cyIsImhhc0Rpc2FibGVkQm9keVBvaW50ZXJFdmVudHMiLCJsYXllcnMiLCJpbmRleE9mIiwibm9kZSIsImZpbmRJbmRleCIsImxheWVyIiwiZmluZCIsImlzVG9wTW9zdExheWVyIiwiZ2V0UG9pbnRlckJsb2NraW5nTGF5ZXJzIiwiaXNQb2ludGVyQmxvY2tpbmciLCJnZXRUb3BNb3N0UG9pbnRlckJsb2NraW5nTGF5ZXIiLCJzbGljZSIsImhhc1BvaW50ZXJCbG9ja2luZ0xheWVyIiwiaXNCZWxvd1BvaW50ZXJCbG9ja2luZ0xheWVyIiwiaGlnaGVzdEJsb2NraW5nSW5kZXgiLCJhZGRMYXllciIsInB1c2giLCJyZW1vdmVMYXllciIsInNwbGljZSIsImFzc2lnblBvaW50ZXJFdmVudFRvTGF5ZXJzIiwic3R5bGUiLCJwb2ludGVyRXZlbnRzIiwiZGlzYWJsZUJvZHlQb2ludGVyRXZlbnRzIiwib3duZXJEb2N1bWVudCIsImdldERvY3VtZW50IiwiYm9keSIsInJlc3RvcmVCb2R5UG9pbnRlckV2ZW50cyIsInJlbW92ZUF0dHJpYnV0ZSIsImxheWVyU3RhY2siLCJBVVRPRk9DVVNfT05fTU9VTlRfRVZFTlQiLCJBVVRPRk9DVVNfT05fVU5NT1VOVF9FVkVOVCIsIkVWRU5UX09QVElPTlMiLCJidWJibGVzIiwiY2FuY2VsYWJsZSIsImZvY3VzU2NvcGVTdGFjayIsInN0YWNrIiwiYWN0aXZlIiwiYWRkIiwic2NvcGUiLCJwYXVzZSIsInJlbW92ZUl0ZW1Gcm9tQXJyYXkiLCJ1bnNoaWZ0IiwicmVtb3ZlIiwicmVzdW1lIiwiY3JlYXRlRm9jdXNTY29wZSIsImlzUGF1c2VkIiwic2V0SXNQYXVzZWQiLCJmb2N1c1Njb3BlIiwibGFzdEZvY3VzZWRFbGVtZW50Iiwib25Nb3VudEF1dG9Gb2N1cyIsIm9uVW5tb3VudEF1dG9Gb2N1cyIsImNyZWF0ZVNlbnRpbmVsIiwiZWxlbWVudCIsImNyZWF0ZUVsZW1lbnQiLCJzZXRBdHRyaWJ1dGUiLCJ0YWJJbmRleCIsImFzc2lnbiIsInZpc3VhbGx5SGlkZGVuU3R5bGVzIiwidGFiYmFibGVzIiwiY29udGFpbmVyIiwiZ2V0QWxsVGFiYmFibGVJbiIsImhhc0F0dHJpYnV0ZSIsImZpcnN0VGFiYmFibGUiLCJpdGVtcyIsImxhc3RUYWJiYWJsZSIsInNob3VsZFByZXZlbnRVbm1vdW50QXV0b0ZvY3VzIiwiYWN0aXZlRWxlbWVudCIsImdldEFjdGl2ZUVsZW1lbnQiLCJpc0ZvY3VzYWJsZSIsInByZXZpb3VzbHlGb2N1c2VkRWxlbWVudCIsImhhc0ZvY3VzZWRDYW5kaWRhdGUiLCJtb3VudEV2ZW50IiwiQ3VzdG9tRXZlbnQiLCJkaXNwYXRjaEV2ZW50IiwiZGVmYXVsdFByZXZlbnRlZCIsInNldFRpbWVvdXQiLCJmb2N1c1dpdGhvdXRTY3JvbGxpbmciLCJvbkNsZWFudXAiLCJyZW1vdmVFdmVudExpc3RlbmVyIiwidW5tb3VudEV2ZW50IiwidHJhcEZvY3VzIiwib25Gb2N1c0luIiwiZXZlbnQiLCJjbG9zZXN0Iiwib25Gb2N1c091dCIsInJlbGF0ZWRUYXJnZXQiLCJzdGFydFNlbnRpbmVsIiwiaW5zZXJ0QWRqYWNlbnRFbGVtZW50IiwiZW5kU2VudGluZWwiLCJvbkZvY3VzIiwiZmlyc3QiLCJsYXN0Iiwib2JzZXJ2ZXIiLCJNdXRhdGlvbk9ic2VydmVyIiwibXV0YXRpb25zIiwibXV0YXRpb24iLCJwcmV2aW91c1NpYmxpbmciLCJuZXh0U2libGluZyIsIm9ic2VydmUiLCJjaGlsZExpc3QiLCJzdWJ0cmVlIiwiZGlzY29ubmVjdCIsIkRBVEFfTElWRV9BTk5PVU5DRVJfQVRUUiIsImNyZWF0ZUhpZGVPdXRzaWRlIiwiaXNEaXNhYmxlZCIsImFyaWFIaWRlT3V0c2lkZSIsInRhcmdldHMiLCJyb290IiwicmVmQ291bnRNYXAiLCJXZWFrTWFwIiwib2JzZXJ2ZXJTdGFjayIsInZpc2libGVOb2RlcyIsIlNldCIsImhpZGRlbk5vZGVzIiwid2FsayIsInJvb3QyIiwicXVlcnlTZWxlY3RvckFsbCIsImFjY2VwdE5vZGUiLCJoYXMiLCJwYXJlbnRFbGVtZW50IiwiZ2V0QXR0cmlidXRlIiwiTm9kZUZpbHRlciIsIkZJTFRFUl9SRUpFQ1QiLCJGSUxURVJfU0tJUCIsIkZJTFRFUl9BQ0NFUFQiLCJ3YWxrZXIiLCJjcmVhdGVUcmVlV2Fsa2VyIiwiU0hPV19FTEVNRU5UIiwiYWNjZXB0Um9vdCIsImhpZGUiLCJuZXh0Tm9kZSIsInJlZkNvdW50IiwiZ2V0Iiwic2V0IiwiY2hhbmdlcyIsImNoYW5nZSIsInR5cGUiLCJhZGRlZE5vZGVzIiwic29tZSIsInJlbW92ZWROb2RlcyIsIkVsZW1lbnQiLCJkZWxldGUiLCJIVE1MRWxlbWVudCIsIlNWR0VsZW1lbnQiLCJkYXRhc2V0IiwibGl2ZUFubm91bmNlciIsInJlYWN0QXJpYVRvcExheWVyIiwib2JzZXJ2ZXJXcmFwcGVyIiwiY291bnQiLCJwb3AiLCJjcmVhdGVFc2NhcGVLZXlEb3duIiwiaGFuZGxlS2V5RG93biIsIkV2ZW50S2V5IiwiRXNjYXBlIiwib25Fc2NhcGVLZXlEb3duIiwiUE9JTlRFUl9ET1dOX09VVFNJREVfRVZFTlQiLCJGT0NVU19PVVRTSURFX0VWRU5UIiwiY3JlYXRlSW50ZXJhY3RPdXRzaWRlIiwicG9pbnRlckRvd25UaW1lb3V0SWQiLCJjbGlja0hhbmRsZXIiLCJub29wIiwib25Qb2ludGVyRG93bk91dHNpZGUiLCJvbkZvY3VzT3V0c2lkZSIsIm9uSW50ZXJhY3RPdXRzaWRlIiwiaXNFdmVudE91dHNpZGUiLCJzaG91bGRFeGNsdWRlRWxlbWVudCIsIm9uUG9pbnRlckRvd24iLCJoYW5kbGVyIiwiaGFuZGxlcjIiLCJjb21wb3NlRXZlbnRIYW5kbGVycyIsIm9uY2UiLCJwb2ludGVyRG93bk91dHNpZGVFdmVudCIsImRldGFpbCIsIm9yaWdpbmFsRXZlbnQiLCJpc0NvbnRleHRNZW51IiwiYnV0dG9uIiwiaXNDdHJsS2V5IiwicG9pbnRlclR5cGUiLCJmb2N1c091dHNpZGVFdmVudCIsIndpbmRvdyIsImNsZWFyVGltZW91dCIsIlBvbHltb3JwaGljIiwibG9jYWwiLCJvdGhlcnMiLCJhcyIsIkVycm9yIiwiRGlzbWlzc2FibGVMYXllckNvbnRleHQiLCJ1c2VPcHRpb25hbERpc21pc3NhYmxlTGF5ZXJDb250ZXh0IiwiRGlzbWlzc2FibGVMYXllciIsInBhcmVudENvbnRleHQiLCJuZXN0ZWRMYXllcnMiLCJyZWdpc3Rlck5lc3RlZExheWVyIiwicGFyZW50VW5yZWdpc3RlciIsImV4Y2x1ZGVkRWxlbWVudHMiLCJieXBhc3NUb3BNb3N0TGF5ZXJDaGVjayIsIm9uRGlzbWlzcyIsIm9uTW91bnQiLCJkaXNhYmxlT3V0c2lkZVBvaW50ZXJFdmVudHMiLCJkaXNtaXNzIiwidW5yZWdpc3RlckZyb21QYXJlbnRMYXllciIsIm9uIiwicmVmMiIsImRlZmVyIiwiY29udGV4dCIsIlByb3ZpZGVyIiwiciQiLCJfcmVmJCIsIm1lcmdlUmVmcyIsImNyZWF0ZUNvbnRyb2xsYWJsZVNpZ25hbCIsIl92YWx1ZSIsIl9zZXRWYWx1ZSIsImRlZmF1bHRWYWx1ZSIsImlzQ29udHJvbGxlZCIsInNldFZhbHVlIiwibmV4dCIsInVudHJhY2siLCJuZXh0VmFsdWUiLCJhY2Nlc3NXaXRoIiwiT2JqZWN0IiwiaXMiLCJvbkNoYW5nZSIsImNyZWF0ZUNvbnRyb2xsYWJsZUJvb2xlYW5TaWduYWwiLCJjcmVhdGVEaXNjbG9zdXJlU3RhdGUiLCJpc09wZW4iLCJzZXRJc09wZW4iLCJvcGVuIiwiZGVmYXVsdE9wZW4iLCJvbk9wZW5DaGFuZ2UiLCJjbG9zZSIsInRvZ2dsZSIsImNyZWF0ZVRhZ05hbWUiLCJ0YWdOYW1lIiwic2V0VGFnTmFtZSIsInN0cmluZ09yVW5kZWZpbmVkIiwidG9Mb3dlckNhc2UiLCJpc1N0cmluZyIsIl9fZGVmUHJvcCIsImRlZmluZVByb3BlcnR5IiwiX19leHBvcnQiLCJhbGwiLCJlbnVtZXJhYmxlIiwiYnV0dG9uX2V4cG9ydHMiLCJCdXR0b24iLCJSb290IiwiQnV0dG9uUm9vdCIsIkJVVFRPTl9JTlBVVF9UWVBFUyIsImlzQnV0dG9uIiwibWVyZ2VkUHJvcHMiLCJtZXJnZURlZmF1bHRQcm9wcyIsImlzTmF0aXZlQnV0dG9uIiwiZWxlbWVudFRhZ05hbWUiLCJpc05hdGl2ZUlucHV0IiwiaXNOYXRpdmVMaW5rIiwicm9sZSIsImNyZWF0ZVJlZ2lzdGVySWQiLCJzZXR0ZXIiLCJpZCIsInYiLCJhY3RpdmVTdHlsZXMiLCJNYXAiLCJjcmVhdGVTdHlsZSIsInByb3BlcnRpZXMiLCJvcmlnaW5hbFN0eWxlcyIsImFjdGl2ZVN0eWxlIiwiYWN0aXZlQ291bnQiLCJtYXAiLCJzZXRQcm9wZXJ0eSIsImFjdGl2ZVN0eWxlMiIsImVudHJpZXMiLCJyZW1vdmVQcm9wZXJ0eSIsImNsZWFudXAiLCJzdHlsZV9kZWZhdWx0IiwiZ2V0U2Nyb2xsRGltZW5zaW9ucyIsImF4aXMiLCJjbGllbnRXaWR0aCIsInNjcm9sbExlZnQiLCJzY3JvbGxXaWR0aCIsImNsaWVudEhlaWdodCIsInNjcm9sbFRvcCIsInNjcm9sbEhlaWdodCIsImlzU2Nyb2xsQ29udGFpbmVyIiwic3R5bGVzIiwib3ZlcmZsb3ciLCJvdmVyZmxvd1giLCJvdmVyZmxvd1kiLCJnZXRTY3JvbGxBdExvY2F0aW9uIiwibG9jYXRpb24iLCJzdG9wQXQiLCJkaXJlY3Rpb25GYWN0b3IiLCJkaXJlY3Rpb24iLCJjdXJyZW50RWxlbWVudCIsImF2YWlsYWJsZVNjcm9sbCIsImF2YWlsYWJsZVNjcm9sbFRvcCIsIndyYXBwZXJSZWFjaGVkIiwiY2xpZW50U2l6ZSIsInNjcm9sbE9mZnNldCIsInNjcm9sbFNpemUiLCJzY3JvbGxlZCIsImRvY3VtZW50RWxlbWVudCIsIl8kaG9zdCIsInByZXZlbnRTY3JvbGxTdGFjayIsInNldFByZXZlbnRTY3JvbGxTdGFjayIsImlzQWN0aXZlIiwiY3JlYXRlUHJldmVudFNjcm9sbCIsImRlZmF1bHRlZFByb3BzIiwibWVyZ2VQcm9wcyIsImVuYWJsZWQiLCJoaWRlU2Nyb2xsYmFyIiwicHJldmVudFNjcm9sbGJhclNoaWZ0IiwicHJldmVudFNjcm9sbGJhclNoaWZ0TW9kZSIsInJlc3RvcmVTY3JvbGxQb3NpdGlvbiIsImFsbG93UGluY2hab29tIiwicHJldmVudFNjcm9sbElkIiwiY3JlYXRlVW5pcXVlSWQiLCJjdXJyZW50VG91Y2hTdGFydCIsImN1cnJlbnRUb3VjaFN0YXJ0QXhpcyIsImN1cnJlbnRUb3VjaFN0YXJ0RGVsdGEiLCJzY3JvbGxiYXJXaWR0aCIsImlubmVyV2lkdGgiLCJvZmZzZXRXaWR0aCIsInBhZGRpbmdSaWdodCIsIm1hcmdpblJpZ2h0Iiwib2Zmc2V0VG9wIiwic2Nyb2xsWSIsIm9mZnNldExlZnQiLCJzY3JvbGxYIiwic2Nyb2xsVG8iLCJtYXliZVByZXZlbnRXaGVlbCIsInBhc3NpdmUiLCJsb2dUb3VjaFN0YXJ0IiwibWF5YmVQcmV2ZW50VG91Y2giLCJnZXRUb3VjaFhZIiwid3JhcHBlciIsImRlbHRhIiwiZ2V0RGVsdGFYWSIsIk1hdGgiLCJhYnMiLCJheGlzRGVsdGEiLCJyZXN1bHRzSW5TY3JvbGwiLCJ3b3VsZFNjcm9sbCIsInNob3VsZENhbmNlbCIsInRvdWNoZXMiLCJ0b3VjaCIsIndvdWxkUmVzdWx0SW5TY3JvbGwiLCJkZWx0YVgiLCJkZWx0YVkiLCJjaGFuZ2VkVG91Y2hlcyIsImNsaWVudFgiLCJjbGllbnRZIiwidGFyZ2V0SW5XcmFwcGVyIiwicHJldmVudFNjcm9sbF9kZWZhdWx0Iiwic3JjX2RlZmF1bHQiLCJjcmVhdGVQcmVzZW5jZSIsInJlZlN0eWxlcyIsImdldEFuaW1hdGlvbk5hbWUiLCJhbmltYXRpb25OYW1lIiwicHJlc2VudFN0YXRlIiwic2V0UHJlc2VudFN0YXRlIiwic2hvdyIsInByZXZTaG93IiwicHJldkFuaW1hdGlvbk5hbWUiLCJjdXJyZW50QW5pbWF0aW9uTmFtZSIsImRpc3BsYXkiLCJpc0FuaW1hdGluZyIsImhhbmRsZUFuaW1hdGlvblN0YXJ0IiwiaGFuZGxlQW5pbWF0aW9uRW5kIiwiaXNDdXJyZW50QW5pbWF0aW9uIiwiaW5jbHVkZXMiLCJwcmVzZW50Iiwic3RhdGUiLCJwcmVzZW5jZV9kZWZhdWx0IiwiZGlhbG9nX2V4cG9ydHMiLCJDbG9zZUJ1dHRvbiIsIkRpYWxvZ0Nsb3NlQnV0dG9uIiwiQ29udGVudCIsIkRpYWxvZ0NvbnRlbnQiLCJEZXNjcmlwdGlvbiIsIkRpYWxvZ0Rlc2NyaXB0aW9uIiwiRGlhbG9nIiwiT3ZlcmxheSIsIkRpYWxvZ092ZXJsYXkiLCJQb3J0YWwiLCJEaWFsb2dQb3J0YWwiLCJEaWFsb2dSb290IiwiVGl0bGUiLCJEaWFsb2dUaXRsZSIsIlRyaWdnZXIiLCJEaWFsb2dUcmlnZ2VyIiwiRGlhbG9nQ29udGV4dCIsInVzZURpYWxvZ0NvbnRleHQiLCJ0cmFuc2xhdGlvbnMiLCJnZW5lcmF0ZUlkIiwic3BsaXRQcm9wczIiLCJoYXNJbnRlcmFjdGVkT3V0c2lkZSIsImhhc1BvaW50ZXJEb3duT3V0c2lkZSIsIm1vZGFsIiwidHJpZ2dlclJlZiIsIm9uQ2xvc2VBdXRvRm9jdXMiLCJwcmV2ZW50U2Nyb2xsIiwib25PcGVuQXV0b0ZvY3VzIiwicmVnaXN0ZXJDb250ZW50SWQiLCJjb250ZW50UHJlc2VudCIsInNldENvbnRlbnRSZWYiLCJ0aXRsZUlkIiwiZGVzY3JpcHRpb25JZCIsIm1lcmdlRGVmYXVsdFByb3BzMiIsInNwbGl0UHJvcHMzIiwiY3JlYXRlRWZmZWN0MiIsIm9uQ2xlYW51cDIiLCJyZWdpc3RlckRlc2NyaXB0aW9uSWQiLCJzcGxpdFByb3BzNCIsIlNob3cyIiwib3ZlcmxheVByZXNlbnQiLCJfcmVmJDIiLCJtZXJnZVJlZnMyIiwic2V0T3ZlcmxheVJlZiIsIlNob3czIiwiRElBTE9HX0lOVExfVFJBTlNMQVRJT05TIiwiZGVmYXVsdElkIiwibWVyZ2VEZWZhdWx0UHJvcHMzIiwiY29udGVudElkIiwic2V0Q29udGVudElkIiwic2V0VGl0bGVJZCIsInNldERlc2NyaXB0aW9uSWQiLCJvdmVybGF5UmVmIiwiY29udGVudFJlZiIsInNldFRyaWdnZXJSZWYiLCJkaXNjbG9zdXJlU3RhdGUiLCJzaG91bGRNb3VudCIsImZvcmNlTW91bnQiLCJjcmVhdGVHZW5lcmF0ZUlkIiwicmVnaXN0ZXJUaXRsZUlkIiwibWVyZ2VEZWZhdWx0UHJvcHM0Iiwic3BsaXRQcm9wczUiLCJjcmVhdGVFZmZlY3QzIiwib25DbGVhbnVwMyIsInNwbGl0UHJvcHM2IiwiX3JlZiQzIiwibWVyZ2VSZWZzMyIsImJ1dHRvblZhcmlhbnRzIiwiZGVmYXVsdCIsImdob3N0Iiwib3V0bGluZSIsImFjY2VudCIsImRlc3RydWN0aXZlIiwiRGlhbG9nUHJpbWl0aXZlIiwiRGlhbG9nQ2xvc2UiLCJjbiIsIkRpYWxvZ0Nsb3NlWCIsIl8kaW5zZXJ0IiwiRGlhbG9nSGVhZGVyIiwiX3RtcGwkMyIsIl8kc3ByZWFkIiwiRGlhbG9nRm9vdGVyIiwiX2VsJDQiLCJFeHRlcm5hbExpbmsiLCJNaW51cyIsIm1pbnVzX2RlZmF1bHQiLCJQYXJlbnRoZXNlcyIsInBhcmVudGhlc2VzX2RlZmF1bHQiLCJOdW1iZXJJbnB1dCIsInRvTnVtYmVyIiwiTnVtYmVyQnV0dG9ucyIsIk51bWJlckV4cHJlc3Npb25CdXR0b24iLCJzZXRPcGVuIiwiY2FsY3VsYXRlZCIsInNldENhbGN1bGF0ZWQiLCJiIiwiaHJlZiIsIl90bXBsJDQiLCJfZWwkNyIsIl90bXBsJDUiLCJleHAiLCJyZXBsYWNlQWxsIiwidHJpbSIsInJlc3VsdCIsInBsdWdpbnMiLCJkYXRhdmlldyIsImFwaSIsImV2YWx1YXRlIiwic3VjY2Vzc2Z1bCIsIk5hTiIsIiQka2V5ZG93biIsImlzTmFOIiwiX2VsJDgiLCJfdG1wbCQ3IiwiX2VsJDEyIiwiX3RtcGwkOSIsIl90bXBsJDYiLCJfZWwkMTEiLCJfdG1wbCQ4IiwiVGFibGVEYXRhIiwic2V0dGluZ3MiLCJ0YWJsZUlkQ29sdW1uTmFtZSIsImRlZmF1bHREYXRlRm9ybWF0IiwiZGVmYXVsdERhdGVUaW1lRm9ybWF0IiwiZ2V0VmFsdWVUeXBlIiwiaGVhZGVyIiwiaXNFZGl0YWJsZVByb3BlcnR5IiwiQ09NUExFWF9QUk9QRVJUWV9QTEFDRUhPTERFUiIsIl8kYWRkRXZlbnRMaXN0ZW5lciIsIm9uTW91c2VNb3ZlIiwiVGFibGVEYXRhRGlzcGxheSIsIlRhYmxlRGF0YUVkaXQiLCJfJHAiLCJfJHN0eWxlIiwiaGlnaGxpZ2h0U3R5bGUiLCJkcmFnZ2VkT3ZlclJpZ2h0IiwiZHJhZ2dlZE92ZXJMZWZ0IiwibGFzdENlbGxIaWdobGlnaHQiLCJUYWJsZUJvZHkiLCJyb3dzIiwicm93Iiwicm93SW5kZXgiLCJ2YWx1ZUluZGV4IiwiaGVhZGVycyIsImdldElkQ29sdW1uSW5kZXgiLCJwYXRoIiwiaGlnaGxpZ2h0SW5kZXgiLCJzZXREcmFnZ2VkT3ZlckluZGV4IiwiZHJhZ2dlZE92ZXJJbmRleCIsIkdyaXBIb3Jpem9udGFsIiwiZ3JpcF9ob3Jpem9udGFsX2RlZmF1bHQiLCJUYWJsZUhlYWQiLCJ0cmFuc2xhdGVYIiwic2V0VHJhbnNsYXRlWCIsImxhc3RNb3VzZVBvcyIsIm9uTW91c2VVcCIsIndvcmtzcGFjZSIsInZpZXciLCJnZXRBY3RpdmVWaWV3T2ZUeXBlIiwiTWFya2Rvd25WaWV3Iiwic2VjdGlvbkluZm8iLCJnZXRTZWN0aW9uSW5mbyIsImxpbmVTdGFydCIsImxpbmUiLCJwcmVUYWJsZUxpbmUiLCJnZXRUYWJsZUxpbmUiLCJ0YWJsZUxpbmVJbmRleCIsImlzV2l0aG91dElkIiwiUmVnRXhwIiwidGVzdCIsImlzRHJhZ2dpbmdEZWZhdWx0SWQiLCJpc0RyYWdnZWRPdmVyRGVmYXVsdElkIiwiaXNSZWxhdGluZ1RvRGVmYXVsdElkIiwidGFibGVMaW5lIiwicmVwbGFjZSIsInRhYmxlS2V5d29yZCIsInByZUNvbHMiLCJzcGxpdCIsImMiLCJjb2xzIiwiZHJhZ2dlZEluZGV4IiwiY29sc1dpdGhvdXRIaWdobGlnaHQiLCJ0b1NwbGljZWQiLCJuZXdDb2xzIiwic2Nyb2xsRWxzIiwiZnJvbSIsInNjcm9sbGVyIiwiY29udGVudEVsIiwicHJldlNjcm9sbCIsImVkaXRvciIsInNldExpbmUiLCJ0b3AiLCJiZWhhdmlvciIsInNldEhpZ2hsaWdodEluZGV4IiwiX2VsJDUiLCIkJG1vdXNlbW92ZSIsIiQkbW91c2Vkb3duIiwiX3AkIiwiX3YkIiwiX3YkMiIsImJhY2tncm91bmQiLCJ0cmFuc2xhdGUiLCJjdXJzb3IiLCJfJGNsYXNzTmFtZSIsInQiLCJoIiwiX2VsJDYiLCJUYWJsZSIsImlzQWRkQ29sdW1uRGlhbG9nT3BlbiIsInNldEFkZENvbHVtbkRpYWxvZ09wZW4iLCJxdWVyeVJlc3VsdHMiLCJUYWJsZUZhbGxiYWNrIiwidHJ1ZVByb3BlcnR5TmFtZXMiLCJ2YWx1ZXMiLCJBZGRDb2x1bW5CdXR0b24iLCJlcnJvciIsInByb3BlcnR5VmFsdWUiLCJzZXRQcm9wZXJ0eVZhbHVlIiwiYWxpYXNWYWx1ZSIsInNldEFsaWFzVmFsdWUiLCJwcm9wIiwibGluZXMiLCJhbGlhcyIsImFsaWFzU3RyIiwiYWRkQ29sIiwicmVsYXRpdmVJbmRleCIsImdldEV4aXN0aW5nUHJvcGVydGllcyIsInByb3BlcnR5TmFtZXMiLCJrZXlzIiwic29ydCIsIl9lbCQ5IiwiX2VsJDEwIiwiX2VsJDE2IiwiX2VsJDEzIiwiX2VsJDE0IiwiX2VsJDE1IiwiVG9nZ2xlIiwiaXNDaGVja2VkIiwic2V0Q2hlY2tlZCIsInByZXYiLCJvbkNoZWNrZWRDaGFuZ2UiLCJBcHAiLCJjb2RlQmxvY2tJbmZvIiwicXVlcnlSZXN1bHRTdG9yZSIsInVpZCIsImRlZmF1bHRRdWVyeVJlc3VsdCIsInVwZGF0ZVF1ZXJ5UmVzdWx0cyIsImdldENvbHVtblByb3BlcnR5TmFtZXMiLCJzZXRRdWVyeVJlc3VsdFN0b3JlIiwidHJ5RGF0YXZpZXdBcnJheVRvQXJyYXkiLCJyZWdpc3RlckRhdGF2aWV3RXZlbnRzIiwidW5yZWdpc3RlckRhdGF2aWV3RXZlbnRzIiwiVG9vbGJhciIsImlzQ29uZmlnT3BlbiIsInNldENvbmZpZ09wZW4iLCJ1cGRhdGVDb25maWciLCJ1cGRhdGVCbG9ja0NvbmZpZyIsIkJsb2NrQ29uZmlnTW9kYWwiLCJHZWFyIiwiU3dpdGNoIiwiTWF0Y2giLCJmb3JtIiwic2V0Rm9ybSIsImNyZWF0ZVN0b3JlIiwidXBkYXRlRm9ybSIsInRyaWdnZXIiLCJTZXR0aW5nIiwidGl0bGUiLCJkZXNjcmlwdGlvbiIsInNldEJsb2NrQ29uZmlnIiwiZGVmYXVsdERhdGFFZGl0QmxvY2tDb25maWciLCJnZXREYXRhdmlld0FQSSIsInBBcHAiLCJoYXNPd25Qcm9wZXJ0eSIsImdQbHVnaW5zIiwibXNnIiwiRGF0YUVkaXQiLCJQbHVnaW4iLCJvbmxvYWQiLCJsb2FkUGx1Z2luIiwicmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvciIsImJveFNoYWRvdyIsInNwbGl0UXVlcnlPbkNvbmZpZyIsIl9zZWxmJCIsIm1k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O0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0YsQ0FBQztBQUNELE1BQU0sY0FBNEIsb0JBQUksSUFBSTtBQUFBLEVBQ3hDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtB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SSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsR0FBRyxDQUFDO0FBQUEsUUFDRixHQUFHLENBQUMsTUFBTTtBQUFBLE1BQ2xCLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsTUFBTTtBQUFBLE1BQ25CLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsTUFBTTtBQUFBLE1BQ25CLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsTUFBTTtBQUFBLE1BQ25CLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsTUFBTTtBQUFBLE1BQ25CLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsTUFBTTtBQUFBLE1BQ25CLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FBQUEsUUFDSCxJQUFJLENBQUMsTUFBTTtBQUFBLE1BQ25CLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsSUFBSSxDQUFDO0FB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QUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLGNBQWMsQ0FBQyxZQUFZO0FBQUEsTUFDbkMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxZQUFZLENBQUM7QUFBQSxRQUNYLFFBQVEsQ0FBQyxXQUFXO0FBQUEsTUFDNUIsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLFlBQVksQ0FBQyxXQUFXO0FBQUEsTUFDaEMsQ0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxjQUFjLENBQUM7QUFBQSxRQUNiLFlBQVksQ0FBQyxXQUFXO0FBQUEsTUFDaEMsQ0FBTztBQUFBO0FBQUE7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YSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsWUFBWSxDQUFDO0FBQUEsUUFDWCxZQUFZLHdCQUF5QjtBQUFBLE1BQzdDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixhQUFhLHdCQUF5QjtBQUFBLE1BQzlDLENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsY0FBYyxDQUFDO0FBQUEsUUFDYixNQUFNLENBQUMsU0FBUyxPQUFPLFVBQVUsWUFBWTtBQUFBLE1BQ3JELENBQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0QsYUFBYSxDQUFDO0FBQUEsUUFDWixNQUFNLENB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ZUFBZSxLQUFLenhCLEdBQUc7QUFFM0N3RSxTQUFHTixNQUFNO0FBRU44RSxTQUFBQSxVQUFVMk8sT0FBTyxTQUFTLElBQUk7QUFHOUI5RyxTQUFBQSxjQUFlbkcsTUFBTXluQixZQUFZO0FBQzlCLFlBQUE7QUFBQSxRQUFFenRCO0FBQUFBLFFBQU9DO0FBQUFBLE1BQUFBLElBQVd5dEIsbUJBQW1CM3RCLE1BQU07QUFnQm5ELFlBQU1xckIsTUFBTS9TO0FBR1osWUFBTSxDQUFDOFMsa0JBQWtCSyxtQkFBbUIsSUFBSWUsWUFFOUMsQ0FBRSxDQUFBO0FBQ0VyeEIsWUFBQUEsV0FBVXVFLE9BQU8sTUFBTTtBQUFBLGNBQUFrdUIsU0FBQTtBQUMzQixlQUFBeHdCLGdCQUNHOHRCLEtBQUc7QUFBQSxVQUNGcHJCLFFBQU04dEI7QUFBQUEsVUFDTjd0QjtBQUFBQSxVQUNBQztBQUFBQSxVQUNBQztBQUFBQSxVQUNBQztBQUFBQSxVQUNBQztBQUFBQSxVQUNBQztBQUFBQSxVQUNBaXJCO0FBQUFBLFVBQ0FEO0FBQUFBLFVBQ0FLO0FBQUFBLFFBQUFBLENBQXdDO0FBQUEsU0FHM0MxckIsRUFBRTtBQU9DOHRCLFlBQUFBLFVBQVUsSUFBSUMsNkJBQW9CL3RCLEVBQUU7QUFDMUM4dEIsY0FBUUUsU0FBUyxNQUFNO0FBQ2IsUUFBQTV5QjtBQUNSc3dCLDRCQUFxQlQsQ0FBUyxTQUFBO0FBQzVCLGlCQUFPQSxLQUFLSyxHQUFHO0FBQ1JMLGlCQUFBQTtBQUFBQSxRQUFBQSxDQUNSO0FBQUEsTUFBQSxDQUNGO0FBQ0Q3cUIsVUFBSTZ0QixTQUFTSCxPQUFPO0FBQUEsSUFBQSxDQUV4QjtBQUFBLEVBQ0Y7QUFDRjs7IiwieF9nb29nbGVfaWdub3JlTGlzdCI6WzAsMSwyLDUsNiw3LDgsOSwxMywxNSwxOCwxOSwyMSwyMiwyMywyNCwyNSwyNiwyNywyOCwyOSwzMCwzMSwzMiwzMywzNCwzNSwzNiwzNywzOCwzOSw0MCw0MSw0Miw0Myw0Nyw0OCw1Ml19
