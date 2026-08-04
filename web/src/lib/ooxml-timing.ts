import type { AnimationEffect, ElementAnimation, TransitionType } from "@/types/slides"

/**
 * `p:transition` and `p:timing`, the two things a slide needs for its transition and its
 * per-element animations to survive export.
 *
 * pptxgenjs writes neither, so everything set in the animation panel used to stop at the
 * editor's own presenter: the .pptx opened with the elements in place and nothing moving.
 *
 * The behaviour trees below are PowerPoint's own — an effect is not one filter but a small
 * ordered program of `p:set`, `p:anim`, `p:animScale` and `p:animRot` nodes, and a shape
 * that reaches PowerPoint with the wrong program plays a different effect from the one the
 * animation pane names. They were cross-checked against the effect registry published in
 * ppt-master (https://github.com/hugohe3/ppt-master, MIT), which captures the exact row
 * PowerPoint authors for each native preset.
 */

// ------------------------------------------------------------------- transitions

/**
 * The editor's transitions are CSS keyframes on the incoming slide; each maps to the
 * PresentationML effect that does the same thing. `slideX` and `slideY` bring the new
 * slide in from the right and from below, which is a push rather than a wipe — a wipe
 * would uncover the new slide in place instead of moving it.
 */
const TRANSITIONS: Record<Exclude<TransitionType, "none">, string> = {
  fade: "<p:fade/>",
  slideX: '<p:push dir="l"/>',
  slideY: '<p:push dir="u"/>',
  zoom: '<p:zoom dir="in"/>',
}

export function transitionXml(transition: TransitionType | undefined): string | null {
  if (!transition || transition === "none") return null
  const effect = TRANSITIONS[transition]
  if (!effect) return null
  return `<p:transition spd="med">${effect}</p:transition>`
}

// -------------------------------------------------------------------- animations

interface EffectContext {
  spid: number
  /** the effect's whole duration in milliseconds */
  dur: number
  /** allocates the next free `p:cTn` id in the slide's timing tree */
  id: () => number
}

interface EffectDef {
  presetId: number
  presetClass: "entr" | "exit" | "emph"
  presetSubtype: number
  /** extra attributes on the effect's own `p:cTn`, such as a deceleration ramp */
  attrs?: string
  body: (ctx: EffectContext) => string
}

const target = (spid: number) => `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`

/**
 * The visibility flip every entrance opens with: until it runs, the shape is not drawn at
 * all, which is what makes an entrance an entrance rather than a shape that fades in from
 * an already-visible state.
 */
const appear = ({ spid, id }: EffectContext) =>
  `<p:set><p:cBhvr><p:cTn id="${id()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>` +
  `${target(spid)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>` +
  `<p:to><p:strVal val="visible"/></p:to></p:set>`

/** The mirror image, hiding the shape one tick before an exit finishes. */
const disappear = ({ spid, dur, id }: EffectContext) =>
  `<p:set><p:cBhvr><p:cTn id="${id()}" dur="1" fill="hold">` +
  `<p:stCondLst><p:cond delay="${Math.max(0, dur - 1)}"/></p:stCondLst></p:cTn>` +
  `${target(spid)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>` +
  `<p:to><p:strVal val="hidden"/></p:to></p:set>`

const fadeFilter = (direction: "in" | "out", { spid, dur, id }: EffectContext) =>
  `<p:animEffect transition="${direction}" filter="fade"><p:cBhvr>` +
  `<p:cTn id="${id()}" dur="${dur}"/>${target(spid)}</p:cBhvr></p:animEffect>`

/**
 * One animated property. Values are PowerPoint's own expression language rather than
 * numbers: `#ppt_x` is the shape's authored position, `ppt_w` its width, and `1+#ppt_h/2`
 * is half a shape's height past the bottom edge of the slide — which is how an effect can
 * be written once and still work for a shape of any size, anywhere on the slide.
 */
function animate(
  attribute: string,
  from: string,
  to: string,
  { spid, dur, id }: EffectContext,
  additive = false,
) {
  const value = (expression: string) =>
    /^-?[\d.]+$/.test(expression)
      ? `<p:fltVal val="${expression}"/>`
      : `<p:strVal val="${expression}"/>`
  return (
    '<p:anim calcmode="lin" valueType="num">' +
    `<p:cBhvr${additive ? ' additive="base"' : ""}><p:cTn id="${id()}" dur="${dur}" fill="hold"/>` +
    `${target(spid)}<p:attrNameLst><p:attrName>${attribute}</p:attrName></p:attrNameLst></p:cBhvr>` +
    `<p:tavLst><p:tav tm="0"><p:val>${value(from)}</p:val></p:tav>` +
    `<p:tav tm="100000"><p:val>${value(to)}</p:val></p:tav></p:tavLst></p:anim>`
  )
}

/**
 * Fly In, one definition per edge. The subtype is OOXML's compass bitmask — 1 top,
 * 2 right, 4 bottom, 8 left — and names the edge the shape comes *from*, so the editor's
 * `slideInUp`, which starts below and travels upwards, is the bottom edge.
 */
function flyIn(subtype: number, fromX: string, fromY: string): EffectDef {
  return {
    presetId: 2,
    presetClass: "entr",
    presetSubtype: subtype,
    body: (ctx) =>
      appear(ctx) +
      animate("ppt_x", fromX, "#ppt_x", ctx, true) +
      animate("ppt_y", fromY, "#ppt_y", ctx, true),
  }
}

const EFFECTS: Record<AnimationEffect, EffectDef> = {
  fadeIn: {
    presetId: 10,
    presetClass: "entr",
    presetSubtype: 0,
    body: (ctx) => appear(ctx) + fadeFilter("in", ctx),
  },
  slideInUp: flyIn(4, "#ppt_x", "1+#ppt_h/2"),
  slideInDown: flyIn(1, "#ppt_x", "0-#ppt_h/2"),
  slideInLeft: flyIn(8, "0-#ppt_w/2", "#ppt_y"),
  slideInRight: flyIn(2, "1+#ppt_w/2", "#ppt_y"),
  zoomIn: {
    presetId: 23,
    presetClass: "entr",
    presetSubtype: 16,
    body: (ctx) =>
      appear(ctx) + animate("ppt_w", "0", "#ppt_w", ctx) + animate("ppt_h", "0", "#ppt_h", ctx),
  },
  /**
   * Spinner — grows from nothing while unwinding a full turn, and fades as it goes. The
   * editor's `rotateIn` comes in from a half turn rather than a whole one; PowerPoint has
   * no entrance that turns by an arbitrary angle, and this is the one whose motion reads
   * the same.
   */
  rotateIn: {
    presetId: 49,
    presetClass: "entr",
    presetSubtype: 0,
    attrs: ' decel="100000"',
    body: (ctx) =>
      appear(ctx) +
      animate("ppt_w", "0", "#ppt_w", ctx) +
      animate("ppt_h", "0", "#ppt_h", ctx) +
      animate("style.rotation", "360", "0", ctx) +
      fadeFilter("in", ctx),
  },
  fadeOut: {
    presetId: 10,
    presetClass: "exit",
    presetSubtype: 0,
    body: (ctx) => fadeFilter("out", ctx) + disappear(ctx),
  },
  /** Zoom out shrinks the shape away; the entrance's subtype 16 is its opposite. */
  zoomOut: {
    presetId: 23,
    presetClass: "exit",
    presetSubtype: 32,
    body: (ctx) =>
      animate("ppt_w", "ppt_w", "0", ctx) + animate("ppt_h", "ppt_h", "0", ctx) + disappear(ctx),
  },
  /**
   * Grow/Shrink, reversing at the halfway point so it returns to its own size — that is
   * PowerPoint's nearest thing to a pulse, and the amount is the editor's own 112% rather
   * than the preset's default 150%.
   */
  pulse: {
    presetId: 6,
    presetClass: "emph",
    presetSubtype: 0,
    body: ({ spid, dur, id }) =>
      `<p:animScale><p:cBhvr><p:cTn id="${id()}" dur="${Math.max(1, Math.round(dur / 2))}" fill="hold" autoRev="1"/>` +
      `${target(spid)}</p:cBhvr><p:by x="112000" y="112000"/></p:animScale>`,
  },
  /**
   * Teeter. The editor's `shake` slides side to side, which no PowerPoint emphasis does;
   * teeter rocks about the shape's centre, and is the one that reads as the same gesture.
   * Its five turns are stated as a fraction of the whole so a longer effect rocks slower
   * rather than rocking once and waiting.
   */
  shake: {
    presetId: 32,
    presetClass: "emph",
    presetSubtype: 0,
    body: ({ spid, dur, id }) => {
      const rock = (by: number, at: number, span: number) =>
        `<p:animRot by="${by}"><p:cBhvr><p:cTn id="${id()}" dur="${Math.max(1, Math.round(dur * span))}" fill="hold">` +
        `<p:stCondLst><p:cond delay="${Math.round(dur * at)}"/></p:stCondLst></p:cTn>` +
        `${target(spid)}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`
      return (
        rock(120000, 0, 0.1) +
        rock(-240000, 0.2, 0.2) +
        rock(240000, 0.4, 0.2) +
        rock(-240000, 0.6, 0.2) +
        rock(120000, 0.8, 0.2)
      )
    },
  },
}

/** A resolved animation: the editor's row plus the shape id the exporter gave its element. */
export interface TimedAnimation {
  animation: ElementAnimation
  spid: number
}

/**
 * The slide's whole timing tree, or `null` when nothing on it animates.
 *
 * `steps` is the editor's own grouping — one entry per click, each holding the animation
 * that click starts plus any that run alongside it — so the shape of the tree follows the
 * shape of the animation panel.
 */
export function timingXml(steps: TimedAnimation[][]): string | null {
  const runnable = steps.filter((step) => step.length)
  if (!runnable.length) return null

  // ids 1 and 2 belong to the root and the main sequence, which every slide's tree has
  let nextId = 3
  const id = () => nextId++

  const clicks = runnable
    .map((step) => {
      // claimed before the effects below so the tree reads outside-in, the way PowerPoint
      // numbers its own
      const clickId = id()
      const groupId = id()
      const effects = step
        .map(({ animation, spid }, index) => {
          const def = EFFECTS[animation.effect]
          if (!def) return ""
          const dur = Math.max(1, Math.round(animation.duration))
          const effectId = id()
          const body = def.body({ spid, dur, id })
          return (
            `<p:par><p:cTn id="${effectId}" presetID="${def.presetId}" presetClass="${def.presetClass}"` +
            ` presetSubtype="${def.presetSubtype}"${def.attrs ?? ""} fill="hold" grpId="0"` +
            // the first effect of a step is what the click starts; the rest ride along with it
            ` nodeType="${index === 0 ? "clickEffect" : "withEffect"}">` +
            `<p:stCondLst><p:cond delay="0"/></p:stCondLst>` +
            `<p:childTnLst>${body}</p:childTnLst></p:cTn></p:par>`
          )
        })
        .join("")
      if (!effects) return ""

      return (
        `<p:par><p:cTn id="${clickId}" fill="hold">` +
        // an indefinite delay is what makes the step wait for a click rather than run on
        `<p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>` +
        `<p:par><p:cTn id="${groupId}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst>` +
        `<p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par>` +
        `</p:childTnLst></p:cTn></p:par>`
      )
    })
    .join("")

  if (!clicks) return null

  return (
    "<p:timing><p:tnLst>" +
    '<p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>' +
    '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq">' +
    `<p:childTnLst>${clicks}</p:childTnLst></p:cTn>` +
    '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>' +
    '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>' +
    "</p:seq></p:childTnLst></p:cTn></p:par>" +
    "</p:tnLst></p:timing>"
  )
}
