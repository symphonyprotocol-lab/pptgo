"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  Combine,
  FlipHorizontal,
  FlipVertical,
  Italic,
  Link2,
  Lock,
  Rows3,
  Split,
  Strikethrough,
  Trash2,
  Underline,
  Unlock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { parseChart, serializeChart } from "@/lib/chart-data"
import { ANIMATIONS, CHART_TYPES, FONT_FAMILIES, FONT_SIZES, TRANSITIONS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n/client"
import type { MessageKey } from "@/lib/i18n/messages"
import { useEditor } from "@/store/editor"
import type {
  AnimationEffect,
  ChartElement,
  FormulaElement,
  ImageElement,
  MediaElement,
  LineElement,
  ShapeElement,
  SlideElement,
  TableElement,
  TextElement,
  TransitionType,
} from "@/types/slides"
import { ColorPicker } from "./color-picker"
import { LayerPanel } from "./layer-panel"

const record = () => useEditor.getState().commit()

function Row({ label, children }: { label: MessageKey; children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="shrink-0 text-xs font-normal text-muted-foreground">{t(label)}</Label>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  )
}

/**
 * Commits to history on the first edit after focus rather than on focus itself, so merely
 * tabbing through the panel does not fill the undo stack with no-op entries.
 */
function NumberField({
  value,
  onChange,
  step = 1,
  min,
  className = "h-8 w-20",
}: {
  value: number
  onChange: (value: number) => void
  step?: number
  /** floor applied to what the user typed, for fields where zero is not a size */
  min?: number
  className?: string
}) {
  const dirty = useRef(false)
  return (
    <Input
      type="number"
      step={step}
      min={min}
      value={Math.round(value * 100) / 100}
      onFocus={() => {
        dirty.current = false
      }}
      onChange={(e) => {
        // An emptied box, or one holding "-" mid-typing, parses as NaN — and `Number("")`
        // is 0, which is how deleting the contents of the width field collapsed the
        // element to nothing and left it unselectable. Neither is an edit yet: the field
        // keeps what it had until a real number arrives.
        const next = Number(e.target.value)
        if (e.target.value === "" || !Number.isFinite(next)) return
        if (!dirty.current) {
          dirty.current = true
          record()
        }
        onChange(min === undefined ? next : Math.max(min, next))
      }}
      className={className}
    />
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: MessageKey
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  const t = useT()
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t(label)}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onPointerDown={record}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  )
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: MessageKey
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Row label={label}>
      <Switch
        checked={checked}
        onCheckedChange={(next) => {
          record()
          onChange(next)
        }}
      />
    </Row>
  )
}

export function PropertyPanel({ className }: { className?: string } = {}) {
  const t = useT()
  const slides = useEditor((s) => s.slides)
  const slideIndex = useEditor((s) => s.slideIndex)
  const activeIds = useEditor((s) => s.activeIds)
  const theme = useEditor((s) => s.theme)

  const slide = slides[Math.min(slideIndex, slides.length - 1)]
  const selected = useMemo(
    () => slide.elements.filter((el) => activeIds.includes(el.id)),
    [slide.elements, activeIds],
  )
  const single = selected.length === 1 ? selected[0] : null

  const patch = (p: Partial<SlideElement>) =>
    useEditor.getState().updateElements(selected.map((el) => ({ id: el.id, patch: p })))

  return (
    <aside className={cn("flex w-72 shrink-0 flex-col border-l bg-background", className)}>
      <Tabs
        key={selected.length ? "element" : "empty"}
        defaultValue={selected.length ? "style" : "slide"}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-3 mt-3 grid grid-cols-4">
          <TabsTrigger value="style" disabled={!selected.length}>
            {t("panel.tabStyle")}
          </TabsTrigger>
          <TabsTrigger value="position" disabled={!selected.length}>
            {t("panel.tabPosition")}
          </TabsTrigger>
          <TabsTrigger value="animation">{t("panel.tabAnimation")}</TabsTrigger>
          <TabsTrigger value="slide">{t("panel.tabSlide")}</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TabsContent value="style" className="mt-0 space-y-4">
            {single?.type === "text" && <TextPanel el={single} patch={patch} />}
            {single?.type === "shape" && <ShapePanel el={single} patch={patch} />}
            {single?.type === "image" && <ImagePanel el={single} patch={patch} />}
            {single?.type === "line" && <LinePanel el={single} patch={patch} />}
            {single?.type === "table" && <TablePanel el={single} patch={patch} />}
            {single?.type === "chart" && <ChartPanel el={single} patch={patch} />}
            {(single?.type === "video" || single?.type === "audio") && (
              <MediaPanel el={single} patch={patch} />
            )}
            {single?.type === "formula" && <FormulaPanel el={single} patch={patch} />}
            {!single && selected.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {t("panel.multiSelection", { count: selected.length })}
              </p>
            )}
            {!!selected.length && (
              <>
                <Separator />
                <SliderRow
                  label="panel.opacity"
                  value={Math.round((single?.opacity ?? 1) * 100)}
                  min={0}
                  max={100}
                  onChange={(v) => patch({ opacity: v / 100 })}
                />
                {single && <LinkRow el={single} />}
              </>
            )}
          </TabsContent>

          <TabsContent value="position" className="mt-0 space-y-3">
            {single && (
              <>
                <Row label="panel.position">
                  <NumberField value={single.left} onChange={(v) => patch({ left: v })} />
                  <NumberField value={single.top} onChange={(v) => patch({ top: v })} />
                </Row>
                <Row label="panel.size">
                  <NumberField value={single.width} onChange={(v) => patch({ width: v })} />
                  <NumberField value={single.height} onChange={(v) => patch({ height: v })} />
                </Row>
                <Row label="panel.rotation">
                  <NumberField value={single.rotate} onChange={(v) => patch({ rotate: v })} />
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    title={single.lock ? t("panel.unlock") : t("panel.lock")}
                    onClick={() => useEditor.getState().toggleLock([single.id])}
                  >
                    {single.lock ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                  </Button>
                </Row>
              </>
            )}
            <Separator />
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["left", "editor.alignLeft"],
                  ["center", "editor.alignCenter"],
                  ["right", "editor.alignRight"],
                  ["top", "editor.alignTop"],
                  ["middle", "editor.alignMiddle"],
                  ["bottom", "editor.alignBottom"],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => useEditor.getState().alignElements(key)}
                >
                  {t(label)}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={selected.length < 3}
                onClick={() => useEditor.getState().distributeElements("h")}
              >
                {t("panel.distributeH")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={selected.length < 3}
                onClick={() => useEditor.getState().distributeElements("v")}
              >
                {t("panel.distributeV")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="animation" className="mt-0 space-y-3">
            <AnimationPanel />
          </TabsContent>

          <TabsContent value="slide" className="mt-0 space-y-4">
            <Row label="panel.backgroundType">
              <Select
                value={slide.background.type}
                onValueChange={(value) =>
                  useEditor.getState().setBackground({
                    ...slide.background,
                    type: value as "solid" | "gradient" | "image",
                    gradient:
                      value === "gradient"
                        ? (slide.background.gradient ?? {
                            type: "linear",
                            rotate: 180,
                            stops: [
                              { pos: 0, color: theme.themeColors[0] },
                              { pos: 100, color: "#ffffff" },
                            ],
                          })
                        : slide.background.gradient,
                  })
                }
              >
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">{t("panel.solid")}</SelectItem>
                  <SelectItem value="gradient">{t("panel.gradient")}</SelectItem>
                  <SelectItem value="image">{t("panel.image")}</SelectItem>
                </SelectContent>
              </Select>
            </Row>

            {slide.background.type === "solid" && (
              <Row label="panel.color">
                <ColorPicker
                  value={slide.background.color}
                  onChange={(color) =>
                    useEditor.getState().setBackground({ ...slide.background, color })
                  }
                />
              </Row>
            )}

            {slide.background.type === "gradient" && slide.background.gradient && (
              <>
                <Row label="panel.gradientStops">
                  <ColorPicker
                    value={slide.background.gradient.stops[0].color}
                    onChange={(color) =>
                      useEditor.getState().setBackground({
                        ...slide.background,
                        gradient: {
                          ...slide.background.gradient!,
                          stops: [{ pos: 0, color }, slide.background.gradient!.stops[1]],
                        },
                      })
                    }
                  />
                  <ColorPicker
                    value={slide.background.gradient.stops[1].color}
                    onChange={(color) =>
                      useEditor.getState().setBackground({
                        ...slide.background,
                        gradient: {
                          ...slide.background.gradient!,
                          stops: [slide.background.gradient!.stops[0], { pos: 100, color }],
                        },
                      })
                    }
                  />
                </Row>
                <SliderRow
                  label="panel.angle"
                  value={slide.background.gradient.rotate}
                  min={0}
                  max={360}
                  onChange={(rotate) =>
                    useEditor.getState().setBackground({
                      ...slide.background,
                      gradient: { ...slide.background.gradient!, rotate },
                    })
                  }
                />
              </>
            )}

            {slide.background.type === "image" && (
              <div className="space-y-2">
                <Input
                  type="file"
                  accept="image/*"
                  className="h-8 text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () =>
                      useEditor.getState().setBackground({
                        ...slide.background,
                        image: String(reader.result),
                        imageSize: slide.background.imageSize ?? "cover",
                      })
                    reader.readAsDataURL(file)
                  }}
                />
                <Row label="panel.imageFit">
                  <Select
                    value={slide.background.imageSize ?? "cover"}
                    onValueChange={(value) =>
                      useEditor.getState().setBackground({
                        ...slide.background,
                        imageSize: value as "cover" | "contain" | "repeat",
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cover">{t("panel.fitCover")}</SelectItem>
                      <SelectItem value="contain">{t("panel.fitContain")}</SelectItem>
                      <SelectItem value="repeat">{t("panel.fitRepeat")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => useEditor.getState().applyBackgroundToAll()}
            >
              {t("panel.applyToAll")}
            </Button>

            <Separator />
            <Row label="panel.transition">
              <Select
                value={slide.transition ?? "none"}
                onValueChange={(value) => useEditor.getState().setTransition(value as TransitionType)}
              >
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSITIONS.map((transition) => (
                    <SelectItem key={transition.value} value={transition.value}>
                      {t(transition.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>

            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">{t("panel.sectionTitle")}</Label>
              <Input
                value={slide.section ?? ""}
                placeholder={t("panel.sectionPlaceholder")}
                className="h-8 text-xs"
                onChange={(e) => useEditor.getState().setSection(e.target.value || undefined)}
              />
            </div>

            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">{t("panel.notes")}</Label>
              <textarea
                value={slide.notes}
                onChange={(e) => useEditor.getState().setNotes(e.target.value)}
                rows={5}
                className="w-full resize-none rounded-md border bg-transparent p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder={t("panel.notesPlaceholder")}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <LayerPanel />
    </aside>
  )
}

type Patch = (p: Partial<SlideElement>) => void

function LinkRow({ el }: { el: SlideElement }) {
  const t = useT()
  const slides = useEditor((s) => s.slides)
  const stored = el.link?.type === "web" ? el.link.target : ""
  const [draft, setDraft] = useState<{ id: string; target: string } | null>(null)
  const target = draft?.id === el.id ? draft.target : stored
  /** the typed address, kept where an unmount cannot take it — see `ChartPanel.apply` */
  const pending = useRef<{ id: string; target: string } | null>(null)

  const apply = useCallback(() => {
    const edit = pending.current
    pending.current = null
    if (!edit) return
    // the box is only shown for a web link, so it also disappears when the link is turned
    // off or switched to a slide — writing the address back then would resurrect it
    const current = useEditor
      .getState()
      .currentSlide()
      .elements.find((e) => e.id === edit.id)
    if (current?.link?.type !== "web" || current.link.target === edit.target) return
    useEditor.getState().setLink(edit.id, { type: "web", target: edit.target })
  }, [])

  useEffect(() => () => apply(), [apply])

  return (
    <div className="space-y-2">
      <Row label="panel.hyperlink">
        <Select
          value={el.link?.type ?? "none"}
          onValueChange={(value) => {
            if (value === "none") return useEditor.getState().setLink(el.id, undefined)
            if (value === "web")
              return useEditor.getState().setLink(el.id, { type: "web", target })
            useEditor.getState().setLink(el.id, { type: "slide", target: slides[0].id })
          }}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("panel.linkNone")}</SelectItem>
            <SelectItem value="web">{t("panel.linkWeb")}</SelectItem>
            <SelectItem value="slide">{t("panel.linkSlide")}</SelectItem>
          </SelectContent>
        </Select>
        <Link2 className="size-4 text-muted-foreground" />
      </Row>

      {el.link?.type === "web" && (
        <Input
          value={target}
          placeholder="https://"
          className="h-8 text-xs"
          onChange={(e) => {
            const edit = { id: el.id, target: e.target.value }
            pending.current = edit
            setDraft(edit)
          }}
          onBlur={() => {
            apply()
            setDraft(null)
          }}
        />
      )}
      {el.link?.type === "slide" && (
        <Select
          value={el.link.target}
          onValueChange={(target) => useEditor.getState().setLink(el.id, { type: "slide", target })}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {slides.map((s, i) => (
              <SelectItem key={s.id} value={s.id}>
                {t("panel.slideNumber", { index: i + 1 })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

function AlignButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        if (!v) return
        record()
        onChange(v)
      }}
      variant="outline"
      size="sm"
    >
      <ToggleGroupItem value="left">
        <AlignLeft className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center">
        <AlignCenter className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right">
        <AlignRight className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="justify">
        <AlignJustify className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

function ShadowControls({
  shadow,
  onChange,
}: {
  shadow: { h: number; v: number; blur: number; color: string } | undefined
  onChange: (shadow: { h: number; v: number; blur: number; color: string } | undefined) => void
}) {
  const current = shadow ?? { h: 3, v: 3, blur: 6, color: "rgba(0,0,0,0.35)" }
  return (
    <div className="space-y-2">
      <SwitchRow
        label="panel.shadow"
        checked={!!shadow}
        onChange={(on) => onChange(on ? current : undefined)}
      />
      {shadow && (
        <>
          <Row label="panel.shadowOffset">
            <NumberField value={shadow.h} onChange={(h) => onChange({ ...shadow, h })} className="h-8 w-16" />
            <NumberField value={shadow.v} onChange={(v) => onChange({ ...shadow, v })} className="h-8 w-16" />
            <ColorPicker value={shadow.color} onChange={(color) => onChange({ ...shadow, color })} />
          </Row>
          <SliderRow
            label="panel.blur"
            value={shadow.blur}
            min={0}
            max={40}
            onChange={(blur) => onChange({ ...shadow, blur })}
          />
        </>
      )}
    </div>
  )
}

function OutlineControls({
  outline,
  onChange,
}: {
  outline: { style: "solid" | "dashed" | "dotted"; width: number; color: string } | undefined
  onChange: (
    outline: { style: "solid" | "dashed" | "dotted"; width: number; color: string } | undefined,
  ) => void
}) {
  const t = useT()
  const style = outline?.style ?? "solid"
  const color = outline?.color ?? "#111827"
  return (
    <>
      <Row label="panel.border">
        <ColorPicker
          value={color}
          onChange={(next) => {
            record()
            onChange({ style, width: outline?.width || 2, color: next })
          }}
        />
        <Select
          value={style}
          onValueChange={(next) => {
            record()
            onChange({
              style: next as "solid" | "dashed" | "dotted",
              width: outline?.width || 2,
              color,
            })
          }}
        >
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">{t("panel.styleSolid")}</SelectItem>
            <SelectItem value="dashed">{t("panel.styleDashed")}</SelectItem>
            <SelectItem value="dotted">{t("panel.styleDotted")}</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <SliderRow
        label="panel.borderWidth"
        value={outline?.width ?? 0}
        min={0}
        max={20}
        onChange={(width) => onChange(width ? { style, color, width } : undefined)}
      />
    </>
  )
}

function TextPanel({ el, patch }: { el: TextElement; patch: Patch }) {
  const t = useT()
  const toggle = (key: "bold" | "italic" | "underline" | "strikethrough") => {
    record()
    patch({ [key]: !el[key] } as Partial<TextElement>)
  }

  return (
    <div className="space-y-3">
      <Select
        value={el.fontFamily}
        onValueChange={(fontFamily) => {
          record()
          patch({ fontFamily } as Partial<TextElement>)
        }}
      >
        <SelectTrigger className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>
              {f.labelKey ? t(f.labelKey) : f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Row label="panel.sizeAndColour">
        <Select
          value={String(el.fontSize)}
          onValueChange={(v) => {
            record()
            patch({ fontSize: Number(v) } as Partial<TextElement>)
          }}
        >
          <SelectTrigger className="h-8 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ColorPicker
          value={el.color}
          onChange={(color) => {
            record()
            patch({ color } as Partial<TextElement>)
          }}
        />
        <ColorPicker
          value={el.fill ?? "#ffffff"}
          title={t("panel.fillBackground")}
          onChange={(fill) => {
            record()
            patch({ fill } as Partial<TextElement>)
          }}
        />
      </Row>

      <div className="flex gap-1.5">
        {(
          [
            ["bold", <Bold key="b" className="size-4" />],
            ["italic", <Italic key="i" className="size-4" />],
            ["underline", <Underline key="u" className="size-4" />],
            ["strikethrough", <Strikethrough key="s" className="size-4" />],
          ] as const
        ).map(([key, icon]) => (
          <Button
            key={key}
            variant={el[key] ? "secondary" : "outline"}
            size="icon"
            className="size-8"
            onClick={() => toggle(key)}
          >
            {icon}
          </Button>
        ))}
      </div>

      <AlignButtons value={el.align} onChange={(align) => patch({ align } as Partial<TextElement>)} />

      <Row label="panel.vertical">
        <Select
          value={el.vertical}
          onValueChange={(v) => {
            record()
            patch({ vertical: v } as Partial<TextElement>)
          }}
        >
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="top">{t("panel.vTop")}</SelectItem>
            <SelectItem value="middle">{t("panel.vMiddle")}</SelectItem>
            <SelectItem value="bottom">{t("panel.vBottom")}</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      <SliderRow
        label="panel.lineHeight"
        value={el.lineHeight}
        min={0.8}
        max={3}
        step={0.1}
        onChange={(lineHeight) => patch({ lineHeight } as Partial<TextElement>)}
      />
      <SliderRow
        label="panel.letterSpacing"
        value={el.letterSpacing}
        min={-4}
        max={20}
        onChange={(letterSpacing) => patch({ letterSpacing } as Partial<TextElement>)}
      />
      <SliderRow
        label="panel.paragraphSpacing"
        value={el.paragraphSpacing ?? 0}
        min={0}
        max={40}
        onChange={(paragraphSpacing) => patch({ paragraphSpacing } as Partial<TextElement>)}
      />
      <SliderRow
        label="panel.padding"
        value={el.padding ?? 8}
        min={0}
        max={40}
        onChange={(padding) => patch({ padding } as Partial<TextElement>)}
      />
      <Separator />
      <OutlineControls
        outline={el.outline}
        onChange={(outline) => patch({ outline } as Partial<TextElement>)}
      />
      <ShadowControls
        shadow={el.shadow}
        onChange={(shadow) => patch({ shadow } as Partial<TextElement>)}
      />
    </div>
  )
}

function ShapePanel({ el, patch }: { el: ShapeElement; patch: Patch }) {
  const t = useT()
  const theme = useEditor((s) => s.theme)
  return (
    <div className="space-y-3">
      <SwitchRow
        label="panel.gradientFill"
        checked={!!el.gradient}
        onChange={(on) =>
          patch({
            gradient: on
              ? {
                  type: "linear",
                  rotate: 90,
                  stops: [
                    { pos: 0, color: el.fill },
                    { pos: 100, color: theme.themeColors[1] ?? "#ffffff" },
                  ],
                }
              : undefined,
          } as Partial<ShapeElement>)
        }
      />
      {el.gradient ? (
        <>
          <Row label="panel.gradientStops">
            <ColorPicker
              value={el.gradient.stops[0].color}
              onChange={(color) => {
                record()
                patch({
                  gradient: {
                    ...el.gradient!,
                    stops: [{ pos: 0, color }, el.gradient!.stops[1]],
                  },
                } as Partial<ShapeElement>)
              }}
            />
            <ColorPicker
              value={el.gradient.stops[1].color}
              onChange={(color) => {
                record()
                patch({
                  gradient: {
                    ...el.gradient!,
                    stops: [el.gradient!.stops[0], { pos: 100, color }],
                  },
                } as Partial<ShapeElement>)
              }}
            />
            <Select
              value={el.gradient.type}
              onValueChange={(type) => {
                record()
                patch({
                  gradient: { ...el.gradient!, type: type as "linear" | "radial" },
                } as Partial<ShapeElement>)
              }}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="linear">{t("panel.gradientLinear")}</SelectItem>
                <SelectItem value="radial">{t("panel.gradientRadial")}</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <SliderRow
            label="panel.gradientAngle"
            value={el.gradient.rotate}
            min={0}
            max={360}
            onChange={(rotate) =>
              patch({ gradient: { ...el.gradient!, rotate } } as Partial<ShapeElement>)
            }
          />
        </>
      ) : (
        <Row label="panel.fill">
          <ColorPicker
            value={el.fill}
            onChange={(fill) => {
              record()
              patch({ fill } as Partial<ShapeElement>)
            }}
          />
        </Row>
      )}

      <OutlineControls
        outline={el.outline}
        onChange={(outline) => patch({ outline } as Partial<ShapeElement>)}
      />
      <ShadowControls
        shadow={el.shadow}
        onChange={(shadow) => patch({ shadow } as Partial<ShapeElement>)}
      />

      <div className="flex gap-1.5">
        <Button
          variant={el.flipH ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            record()
            patch({ flipH: !el.flipH } as Partial<ShapeElement>)
          }}
        >
          <FlipHorizontal className="size-4" /> {t("panel.flipH")}
        </Button>
        <Button
          variant={el.flipV ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            record()
            patch({ flipV: !el.flipV } as Partial<ShapeElement>)
          }}
        >
          <FlipVertical className="size-4" /> {t("panel.flipV")}
        </Button>
      </div>

      <Separator />
      <p className="text-xs text-muted-foreground">{t("panel.shapeTextHint")}</p>
      <Row label="panel.sizeAndColour">
        <Select
          value={String(el.text.fontSize)}
          onValueChange={(v) => {
            record()
            patch({ text: { ...el.text, fontSize: Number(v) } } as Partial<ShapeElement>)
          }}
        >
          <SelectTrigger className="h-8 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ColorPicker
          value={el.text.color}
          onChange={(color) => {
            record()
            patch({ text: { ...el.text, color } } as Partial<ShapeElement>)
          }}
        />
      </Row>
      <AlignButtons
        value={el.text.align}
        onChange={(align) =>
          patch({
            text: { ...el.text, align: align as ShapeElement["text"]["align"] },
          } as Partial<ShapeElement>)
        }
      />
    </div>
  )
}

const CROP_PRESETS: { key: string; labelKey?: MessageKey; ratio: number | null }[] = [
  { key: "reset", labelKey: "panel.cropReset", ratio: null },
  { key: "1:1", ratio: 1 },
  { key: "4:3", ratio: 4 / 3 },
  { key: "16:9", ratio: 16 / 9 },
]

function ImagePanel({ el, patch }: { el: ImageElement; patch: Patch }) {
  const t = useT()
  const setFilter = (key: keyof ImageElement["filter"], value: number) =>
    patch({ filter: { ...el.filter, [key]: value } } as Partial<ImageElement>)

  /** Centre-crops the source to the requested aspect ratio. */
  const cropTo = (ratio: number | null) => {
    record()
    if (!ratio) return patch({ clip: undefined } as Partial<ImageElement>)
    const current = el.width / el.height
    if (current > ratio) {
      const span = ratio / current
      const inset = (1 - span) / 2
      return patch({
        clip: {
          range: [
            [inset, 0],
            [1 - inset, 1],
          ],
        },
      } as Partial<ImageElement>)
    }
    const span = current / ratio
    const inset = (1 - span) / 2
    patch({
      clip: {
        range: [
          [0, inset],
          [1, 1 - inset],
        ],
      },
    } as Partial<ImageElement>)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <Button
          variant={el.flipH ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            record()
            patch({ flipH: !el.flipH } as Partial<ImageElement>)
          }}
        >
          <FlipHorizontal className="size-4" /> {t("panel.flipHorizontal")}
        </Button>
        <Button
          variant={el.flipV ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            record()
            patch({ flipV: !el.flipV } as Partial<ImageElement>)
          }}
        >
          <FlipVertical className="size-4" /> {t("panel.flipV")}
        </Button>
      </div>

      <Row label="panel.crop">
        <div className="flex flex-wrap gap-1">
          {CROP_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => cropTo(preset.ratio)}
            >
              {preset.labelKey ? t(preset.labelKey) : preset.key}
            </Button>
          ))}
        </div>
      </Row>

      <Row label="panel.replaceImage">
        <Input
          type="file"
          accept="image/*"
          className="h-8 text-xs"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              record()
              patch({ src: String(reader.result) } as Partial<ImageElement>)
            }
            reader.readAsDataURL(file)
            e.target.value = ""
          }}
        />
      </Row>

      <Row label="panel.tint">
        <ColorPicker
          value={el.colorMask ?? "#2563eb"}
          onChange={(colorMask) => {
            record()
            patch({ colorMask } as Partial<ImageElement>)
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            record()
            patch({ colorMask: undefined } as Partial<ImageElement>)
          }}
        >
          {t("panel.clear")}
        </Button>
      </Row>

      <SliderRow
        label="panel.radius"
        value={el.radius}
        min={0}
        max={200}
        onChange={(radius) => patch({ radius } as Partial<ImageElement>)}
      />
      <Separator />
      <SliderRow label="panel.brightness" value={el.filter.brightness} min={0} max={200} onChange={(v) => setFilter("brightness", v)} />
      <SliderRow label="panel.contrast" value={el.filter.contrast} min={0} max={200} onChange={(v) => setFilter("contrast", v)} />
      <SliderRow label="panel.saturation" value={el.filter.saturate} min={0} max={200} onChange={(v) => setFilter("saturate", v)} />
      <SliderRow label="panel.grayscale" value={el.filter.grayscale} min={0} max={100} onChange={(v) => setFilter("grayscale", v)} />
      <SliderRow label="panel.blur" value={el.filter.blur} min={0} max={20} onChange={(v) => setFilter("blur", v)} />
      <Separator />
      <OutlineControls
        outline={el.outline}
        onChange={(outline) => patch({ outline } as Partial<ImageElement>)}
      />
      <ShadowControls
        shadow={el.shadow}
        onChange={(shadow) => patch({ shadow } as Partial<ImageElement>)}
      />
    </div>
  )
}

function LinePanel({ el, patch }: { el: LineElement; patch: Patch }) {
  const t = useT()
  return (
    <div className="space-y-3">
      <Row label="panel.color">
        <ColorPicker
          value={el.color}
          onChange={(color) => {
            record()
            patch({ color } as Partial<LineElement>)
          }}
        />
      </Row>
      <Row label="panel.lineStyle">
        <Select
          value={el.style}
          onValueChange={(style) => {
            record()
            patch({ style } as Partial<LineElement>)
          }}
        >
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">{t("panel.styleSolid")}</SelectItem>
            <SelectItem value="dashed">{t("panel.styleDashed")}</SelectItem>
            <SelectItem value="dotted">{t("panel.styleDotted")}</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <SwitchRow
        label="panel.curve"
        checked={!!el.curve}
        onChange={(on) =>
          patch({
            curve: on
              ? ([
                  (el.start[0] + el.end[0]) / 2,
                  (el.start[1] + el.end[1]) / 2 - Math.max(30, el.width * 0.25),
                ] as [number, number])
              : undefined,
          } as Partial<LineElement>)
        }
      />
      <SliderRow
        label="panel.thickness"
        value={el.strokeWidth}
        min={1}
        max={30}
        onChange={(strokeWidth) => patch({ strokeWidth } as Partial<LineElement>)}
      />
      <Row label="panel.endpoints">
        <Select
          value={el.startCap}
          onValueChange={(startCap) => {
            record()
            patch({ startCap } as Partial<LineElement>)
          }}
        >
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("panel.capNone")}</SelectItem>
            <SelectItem value="arrow">{t("panel.capArrow")}</SelectItem>
            <SelectItem value="dot">{t("panel.capDot")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={el.endCap}
          onValueChange={(endCap) => {
            record()
            patch({ endCap } as Partial<LineElement>)
          }}
        >
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("panel.capNone")}</SelectItem>
            <SelectItem value="arrow">{t("panel.capArrow")}</SelectItem>
            <SelectItem value="dot">{t("panel.capDot")}</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </div>
  )
}

function TablePanel({ el, patch }: { el: TableElement; patch: Patch }) {
  const t = useT()
  const store = useEditor.getState
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("panel.tableHint")}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().addTableRow()}>
          <Rows3 className="size-4" /> {t("panel.insertRow")}
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().addTableColumn()}>
          <Columns3 className="size-4" /> {t("panel.insertColumn")}
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().removeTableRow()}>
          <Trash2 className="size-4" /> {t("panel.deleteRow")}
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().removeTableColumn()}>
          <Trash2 className="size-4" /> {t("panel.deleteColumn")}
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().mergeTableCells()}>
          <Combine className="size-4" /> {t("panel.mergeCells")}
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().splitTableCell()}>
          <Split className="size-4" /> {t("panel.splitCell")}
        </Button>
      </div>

      <Separator />
      <Row label="panel.themeColor">
        <ColorPicker
          value={el.theme.color}
          onChange={(color) => {
            record()
            patch({ theme: { ...el.theme, color } } as Partial<TableElement>)
          }}
        />
      </Row>
      <SwitchRow
        label="panel.headerRow"
        checked={el.theme.rowHeader}
        onChange={(rowHeader) => patch({ theme: { ...el.theme, rowHeader } } as Partial<TableElement>)}
      />
      <SwitchRow
        label="panel.bandedRows"
        checked={el.theme.banded}
        onChange={(banded) => patch({ theme: { ...el.theme, banded } } as Partial<TableElement>)}
      />
      <Row label="panel.fontSize">
        <Select
          value={String(el.fontSize)}
          onValueChange={(v) => {
            record()
            patch({ fontSize: Number(v) } as Partial<TableElement>)
          }}
        >
          <SelectTrigger className="h-8 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <OutlineControls
        outline={el.outline}
        onChange={(outline) =>
          patch({
            outline: outline ?? { style: "solid", width: 0, color: "#d4d4d8" },
          } as Partial<TableElement>)
        }
      />
    </div>
  )
}

function ChartPanel({ el, patch }: { el: ChartElement; patch: Patch }) {
  const t = useT()
  /**
   * The typed-but-not-yet-applied text, tagged with the chart it belongs to.
   *
   * Holding it as plain state meant the box was filled once, on first mount, and this
   * panel is not remounted when the selection moves from one chart to another: the second
   * chart showed the first one's numbers, and blurring wrote them onto it. The tag also
   * settles the race on the way out — the pointer down that changes the selection lands
   * before the blur, so the write has to name the chart the text was typed for rather than
   * whatever is selected by the time it runs.
   */
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null)
  const text = draft?.id === el.id ? draft.text : serializeChart(el)
  /**
   * The same edit again, in a ref, because it has to outlive this component. Clicking the
   * slide clears the selection, which unmounts the whole panel — and the browser fires no
   * blur on a node that has already been removed. Typing here and then clicking away *in
   * the sidebar* saved; typing here and clicking back onto the slide silently did not.
   */
  const pending = useRef<{ id: string; text: string } | null>(null)

  const apply = useCallback(() => {
    const edit = pending.current
    pending.current = null
    if (!edit) return
    const data = parseChart(edit.text)
    // unparseable text is left alone rather than turned into an empty chart
    if (!data) return
    record()
    // by id, not by selection: the pointer down that changes the selection lands before
    // the blur, so by now `el` may be a different chart
    useEditor.getState().updateElement(edit.id, { data } as Partial<ChartElement>)
  }, [])

  useEffect(() => () => apply(), [apply])

  return (
    <div className="space-y-3">
      <Row label="panel.chartType">
        <Select
          value={el.chartType}
          onValueChange={(chartType) => {
            record()
            patch({ chartType } as Partial<ChartElement>)
          }}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHART_TYPES.map((chart) => (
              <SelectItem key={chart.value} value={chart.value}>
                {t(chart.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">
          {t("panel.chartData")}
        </Label>
        <textarea
          value={text}
          onChange={(e) => {
            const edit = { id: el.id, text: e.target.value }
            pending.current = edit
            setDraft(edit)
          }}
          onBlur={() => {
            apply()
            // dropping the draft is also how the box re-syncs: with nothing pending it
            // shows the element's own data again, including when the text did not parse
            setDraft(null)
          }}
          rows={6}
          spellCheck={false}
          className="w-full resize-none rounded-md border bg-transparent p-2 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>

      <SwitchRow
        label="panel.legend"
        checked={el.showLegend}
        onChange={(showLegend) => patch({ showLegend } as Partial<ChartElement>)}
      />
      <SwitchRow
        label="panel.gridLines"
        checked={el.showGrid}
        onChange={(showGrid) => patch({ showGrid } as Partial<ChartElement>)}
      />
      <SwitchRow
        label="panel.valueLabels"
        checked={el.showValue}
        onChange={(showValue) => patch({ showValue } as Partial<ChartElement>)}
      />
      <Row label="panel.textAndGrid">
        <ColorPicker
          value={el.textColor}
          onChange={(textColor) => {
            record()
            patch({ textColor } as Partial<ChartElement>)
          }}
        />
        <ColorPicker
          value={el.gridColor}
          onChange={(gridColor) => {
            record()
            patch({ gridColor } as Partial<ChartElement>)
          }}
        />
      </Row>
      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">{t("panel.seriesColours")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {el.themeColors.map((color, i) => (
            <ColorPicker
              key={i}
              value={color}
              onChange={(next) => {
                record()
                const themeColors = [...el.themeColors]
                themeColors[i] = next
                patch({ themeColors } as Partial<ChartElement>)
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function MediaPanel({ el, patch }: { el: MediaElement; patch: Patch }) {
  const t = useT()
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t("panel.mediaHint")}
      </p>
      <Row label="panel.replaceFile">
        <Input
          type="file"
          accept={el.type === "video" ? "video/*" : "audio/*"}
          className="h-8 text-xs"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              record()
              patch({ src: String(reader.result), name: file.name } as Partial<MediaElement>)
            }
            reader.readAsDataURL(file)
            e.target.value = ""
          }}
        />
      </Row>

      {el.type === "video" && (
        <Row label="panel.posterImage">
          <Input
            type="file"
            accept="image/*"
            className="h-8 text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                record()
                patch({ poster: String(reader.result) } as Partial<MediaElement>)
              }
              reader.readAsDataURL(file)
              e.target.value = ""
            }}
          />
        </Row>
      )}

      <SwitchRow
        label="panel.autoplay"
        checked={el.autoplay}
        onChange={(autoplay) => patch({ autoplay } as Partial<MediaElement>)}
      />
      <SwitchRow
        label="panel.loop"
        checked={el.loop}
        onChange={(loop) => patch({ loop } as Partial<MediaElement>)}
      />
    </div>
  )
}

const FORMULA_SAMPLES: { labelKey: MessageKey; latex: string }[] = [
  { labelKey: "formula.fraction", latex: "\\frac{a}{b}" },
  { labelKey: "formula.root", latex: "\\sqrt{x^2 + y^2}" },
  { labelKey: "formula.sum", latex: "\\sum_{i=1}^{n} i" },
  { labelKey: "formula.integral", latex: "\\int_{0}^{\\infty} e^{-x} dx" },
  { labelKey: "formula.matrix", latex: "\\begin{matrix} a & b \\\\ c & d \\end{matrix}" },
  { labelKey: "formula.limit", latex: "\\lim_{x \\to 0} \\frac{\\sin x}{x}" },
]

function FormulaPanel({ el, patch }: { el: FormulaElement; patch: Patch }) {
  const t = useT()
  const [draft, setDraft] = useState(el.latex)

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">LaTeX</Label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft === el.latex) return
            record()
            patch({ latex: draft } as Partial<FormulaElement>)
          }}
          rows={4}
          spellCheck={false}
          className="w-full resize-none rounded-md border bg-transparent p-2 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {FORMULA_SAMPLES.map((sample) => (
          <Button
            key={sample.labelKey}
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              record()
              setDraft(sample.latex)
              patch({ latex: sample.latex } as Partial<FormulaElement>)
            }}
          >
            {t(sample.labelKey)}
          </Button>
        ))}
      </div>

      <Row label="panel.color">
        <ColorPicker
          value={el.color}
          onChange={(color) => {
            record()
            patch({ color } as Partial<FormulaElement>)
          }}
        />
      </Row>
      <p className="text-[11px] text-muted-foreground">
        {t("panel.formulaNote")}
      </p>
    </div>
  )
}

function AnimationPanel() {
  const t = useT()
  const slides = useEditor((s) => s.slides)
  const slideIndex = useEditor((s) => s.slideIndex)
  const activeIds = useEditor((s) => s.activeIds)
  const slide = slides[Math.min(slideIndex, slides.length - 1)]
  const animations = slide.animations ?? []

  const labelFor = (elId: string) => {
    const index = slide.elements.findIndex((el) => el.id === elId)
    return index < 0 ? t("element.deleted") : t("element.indexed", { n: index + 1 })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {activeIds.length === 1
          ? t("panel.animationHintOne")
          : t("panel.animationHintNone")}
      </p>

      <Select
        value=""
        disabled={activeIds.length !== 1}
        onValueChange={(effect) => {
          const preset = ANIMATIONS.find((a) => a.value === effect)
          if (!preset) return
          useEditor.getState().addAnimation({
            elId: activeIds[0],
            effect: effect as AnimationEffect,
            type: preset.type,
            duration: 600,
            trigger: "click",
          })
        }}
      >
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder={t("panel.addAnimation")} />
        </SelectTrigger>
        <SelectContent>
          {ANIMATIONS.map((a) => (
            <SelectItem key={a.value} value={a.value}>
              {t(a.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!animations.length && (
        <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          {t("panel.noAnimations")}
        </p>
      )}

      <ul className="space-y-2">
        {animations.map((animation, index) => (
          <li key={animation.id} className="space-y-1.5 rounded-md border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">
                {index + 1}.{" "}
                {(() => {
                  const preset = ANIMATIONS.find((a) => a.value === animation.effect)
                  return preset ? t(preset.labelKey) : animation.effect
                })()}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => useEditor.getState().moveAnimation(index, index - 1)}
                >
                  ↑
                </button>
                <button
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={index === animations.length - 1}
                  onClick={() => useEditor.getState().moveAnimation(index, index + 1)}
                >
                  ↓
                </button>
                <button
                  className="text-destructive"
                  onClick={() => useEditor.getState().removeAnimation(animation.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{labelFor(animation.elId)}</p>
            <div className="flex items-center gap-1.5">
              <Select
                value={animation.trigger}
                onValueChange={(trigger) =>
                  useEditor
                    .getState()
                    .updateAnimation(animation.id, { trigger: trigger as "click" | "auto" })
                }
              >
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="click">{t("panel.triggerClick")}</SelectItem>
                  <SelectItem value="auto">{t("panel.triggerAuto")}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                step={100}
                value={animation.duration}
                className="h-7 w-20 text-xs"
                onChange={(e) =>
                  useEditor
                    .getState()
                    .updateAnimation(animation.id, { duration: Number(e.target.value) || 600 })
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
