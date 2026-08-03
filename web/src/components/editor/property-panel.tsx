"use client"

import { useMemo, useRef, useState } from "react"
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
import { ANIMATIONS, CHART_TYPES, FONT_FAMILIES, FONT_SIZES, TRANSITIONS } from "@/lib/constants"
import { cn } from "@/lib/utils"
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="shrink-0 text-xs font-normal text-muted-foreground">{label}</Label>
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
  className = "h-8 w-20",
}: {
  value: number
  onChange: (value: number) => void
  step?: number
  className?: string
}) {
  const dirty = useRef(false)
  return (
    <Input
      type="number"
      step={step}
      value={Math.round(value * 100) / 100}
      onFocus={() => {
        dirty.current = false
      }}
      onChange={(e) => {
        if (!dirty.current) {
          dirty.current = true
          record()
        }
        onChange(Number(e.target.value))
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
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
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
  label: string
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
            样式
          </TabsTrigger>
          <TabsTrigger value="position" disabled={!selected.length}>
            位置
          </TabsTrigger>
          <TabsTrigger value="animation">动画</TabsTrigger>
          <TabsTrigger value="slide">页面</TabsTrigger>
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
              <p className="text-xs text-muted-foreground">已选中 {selected.length} 个元素</p>
            )}
            {!!selected.length && (
              <>
                <Separator />
                <SliderRow
                  label="不透明度"
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
                <Row label="X / Y">
                  <NumberField value={single.left} onChange={(v) => patch({ left: v })} />
                  <NumberField value={single.top} onChange={(v) => patch({ top: v })} />
                </Row>
                <Row label="宽 / 高">
                  <NumberField value={single.width} onChange={(v) => patch({ width: v })} />
                  <NumberField value={single.height} onChange={(v) => patch({ height: v })} />
                </Row>
                <Row label="旋转">
                  <NumberField value={single.rotate} onChange={(v) => patch({ rotate: v })} />
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    title={single.lock ? "解锁" : "锁定"}
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
                  ["left", "左对齐"],
                  ["center", "水平居中"],
                  ["right", "右对齐"],
                  ["top", "顶对齐"],
                  ["middle", "垂直居中"],
                  ["bottom", "底对齐"],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => useEditor.getState().alignElements(key)}
                >
                  {label}
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
                水平等距
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={selected.length < 3}
                onClick={() => useEditor.getState().distributeElements("v")}
              >
                垂直等距
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="animation" className="mt-0 space-y-3">
            <AnimationPanel />
          </TabsContent>

          <TabsContent value="slide" className="mt-0 space-y-4">
            <Row label="背景类型">
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
                  <SelectItem value="solid">纯色</SelectItem>
                  <SelectItem value="gradient">渐变</SelectItem>
                  <SelectItem value="image">图片</SelectItem>
                </SelectContent>
              </Select>
            </Row>

            {slide.background.type === "solid" && (
              <Row label="颜色">
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
                <Row label="起止色">
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
                  label="角度"
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
                <Row label="填充方式">
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
                      <SelectItem value="cover">铺满</SelectItem>
                      <SelectItem value="contain">适应</SelectItem>
                      <SelectItem value="repeat">平铺</SelectItem>
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
              应用到全部幻灯片
            </Button>

            <Separator />
            <Row label="切换动画">
              <Select
                value={slide.transition ?? "none"}
                onValueChange={(value) => useEditor.getState().setTransition(value as TransitionType)}
              >
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSITIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>

            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">分节标题</Label>
              <Input
                value={slide.section ?? ""}
                placeholder="留空表示不新建分节"
                className="h-8 text-xs"
                onChange={(e) => useEditor.getState().setSection(e.target.value || undefined)}
              />
            </div>

            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">演讲者备注</Label>
              <textarea
                value={slide.notes}
                onChange={(e) => useEditor.getState().setNotes(e.target.value)}
                rows={5}
                className="w-full resize-none rounded-md border bg-transparent p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="仅在放映的演讲者视图中可见"
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
  const slides = useEditor((s) => s.slides)
  const [draft, setDraft] = useState(el.link?.type === "web" ? el.link.target : "")

  return (
    <div className="space-y-2">
      <Row label="超链接">
        <Select
          value={el.link?.type ?? "none"}
          onValueChange={(value) => {
            if (value === "none") return useEditor.getState().setLink(el.id, undefined)
            if (value === "web")
              return useEditor.getState().setLink(el.id, { type: "web", target: draft })
            useEditor.getState().setLink(el.id, { type: "slide", target: slides[0].id })
          }}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">无</SelectItem>
            <SelectItem value="web">网页</SelectItem>
            <SelectItem value="slide">跳转到页</SelectItem>
          </SelectContent>
        </Select>
        <Link2 className="size-4 text-muted-foreground" />
      </Row>

      {el.link?.type === "web" && (
        <Input
          value={draft}
          placeholder="https://"
          className="h-8 text-xs"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => useEditor.getState().setLink(el.id, { type: "web", target: draft })}
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
                第 {i + 1} 页
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
        label="阴影"
        checked={!!shadow}
        onChange={(on) => onChange(on ? current : undefined)}
      />
      {shadow && (
        <>
          <Row label="偏移 / 颜色">
            <NumberField value={shadow.h} onChange={(h) => onChange({ ...shadow, h })} className="h-8 w-16" />
            <NumberField value={shadow.v} onChange={(v) => onChange({ ...shadow, v })} className="h-8 w-16" />
            <ColorPicker value={shadow.color} onChange={(color) => onChange({ ...shadow, color })} />
          </Row>
          <SliderRow
            label="模糊"
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
  const style = outline?.style ?? "solid"
  const color = outline?.color ?? "#111827"
  return (
    <>
      <Row label="边框">
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
            <SelectItem value="solid">实线</SelectItem>
            <SelectItem value="dashed">虚线</SelectItem>
            <SelectItem value="dotted">点线</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <SliderRow
        label="边框宽度"
        value={outline?.width ?? 0}
        min={0}
        max={20}
        onChange={(width) => onChange(width ? { style, color, width } : undefined)}
      />
    </>
  )
}

function TextPanel({ el, patch }: { el: TextElement; patch: Patch }) {
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
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Row label="字号 / 颜色">
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
          title="背景填充"
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

      <Row label="垂直">
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
            <SelectItem value="top">顶部</SelectItem>
            <SelectItem value="middle">居中</SelectItem>
            <SelectItem value="bottom">底部</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      <SliderRow
        label="行高"
        value={el.lineHeight}
        min={0.8}
        max={3}
        step={0.1}
        onChange={(lineHeight) => patch({ lineHeight } as Partial<TextElement>)}
      />
      <SliderRow
        label="字间距"
        value={el.letterSpacing}
        min={-4}
        max={20}
        onChange={(letterSpacing) => patch({ letterSpacing } as Partial<TextElement>)}
      />
      <SliderRow
        label="段间距"
        value={el.paragraphSpacing ?? 0}
        min={0}
        max={40}
        onChange={(paragraphSpacing) => patch({ paragraphSpacing } as Partial<TextElement>)}
      />
      <SliderRow
        label="内边距"
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
  const theme = useEditor((s) => s.theme)
  return (
    <div className="space-y-3">
      <SwitchRow
        label="渐变填充"
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
          <Row label="起止色">
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
                <SelectItem value="linear">线性</SelectItem>
                <SelectItem value="radial">径向</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <SliderRow
            label="渐变角度"
            value={el.gradient.rotate}
            min={0}
            max={360}
            onChange={(rotate) =>
              patch({ gradient: { ...el.gradient!, rotate } } as Partial<ShapeElement>)
            }
          />
        </>
      ) : (
        <Row label="填充">
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
          <FlipHorizontal className="size-4" /> 水平
        </Button>
        <Button
          variant={el.flipV ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            record()
            patch({ flipV: !el.flipV } as Partial<ShapeElement>)
          }}
        >
          <FlipVertical className="size-4" /> 垂直
        </Button>
      </div>

      <Separator />
      <p className="text-xs text-muted-foreground">形状文字（双击形状可编辑内容）</p>
      <Row label="字号 / 颜色">
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

const CROP_PRESETS: { label: string; ratio: number | null }[] = [
  { label: "还原", ratio: null },
  { label: "1:1", ratio: 1 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "16:9", ratio: 16 / 9 },
]

function ImagePanel({ el, patch }: { el: ImageElement; patch: Patch }) {
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
          <FlipHorizontal className="size-4" /> 水平翻转
        </Button>
        <Button
          variant={el.flipV ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            record()
            patch({ flipV: !el.flipV } as Partial<ImageElement>)
          }}
        >
          <FlipVertical className="size-4" /> 垂直
        </Button>
      </div>

      <Row label="裁剪">
        <div className="flex flex-wrap gap-1">
          {CROP_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => cropTo(preset.ratio)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </Row>

      <Row label="替换图片">
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

      <Row label="着色">
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
          清除
        </Button>
      </Row>

      <SliderRow
        label="圆角"
        value={el.radius}
        min={0}
        max={200}
        onChange={(radius) => patch({ radius } as Partial<ImageElement>)}
      />
      <Separator />
      <SliderRow label="亮度" value={el.filter.brightness} min={0} max={200} onChange={(v) => setFilter("brightness", v)} />
      <SliderRow label="对比度" value={el.filter.contrast} min={0} max={200} onChange={(v) => setFilter("contrast", v)} />
      <SliderRow label="饱和度" value={el.filter.saturate} min={0} max={200} onChange={(v) => setFilter("saturate", v)} />
      <SliderRow label="灰度" value={el.filter.grayscale} min={0} max={100} onChange={(v) => setFilter("grayscale", v)} />
      <SliderRow label="模糊" value={el.filter.blur} min={0} max={20} onChange={(v) => setFilter("blur", v)} />
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
  return (
    <div className="space-y-3">
      <Row label="颜色">
        <ColorPicker
          value={el.color}
          onChange={(color) => {
            record()
            patch({ color } as Partial<LineElement>)
          }}
        />
      </Row>
      <Row label="线型">
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
            <SelectItem value="solid">实线</SelectItem>
            <SelectItem value="dashed">虚线</SelectItem>
            <SelectItem value="dotted">点线</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <SwitchRow
        label="曲线"
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
        label="粗细"
        value={el.strokeWidth}
        min={1}
        max={30}
        onChange={(strokeWidth) => patch({ strokeWidth } as Partial<LineElement>)}
      />
      <Row label="端点">
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
            <SelectItem value="none">无</SelectItem>
            <SelectItem value="arrow">箭头</SelectItem>
            <SelectItem value="dot">圆点</SelectItem>
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
            <SelectItem value="none">无</SelectItem>
            <SelectItem value="arrow">箭头</SelectItem>
            <SelectItem value="dot">圆点</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </div>
  )
}

function TablePanel({ el, patch }: { el: TableElement; patch: Patch }) {
  const store = useEditor.getState
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">双击表格进入编辑，拖选多格后可合并</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().addTableRow()}>
          <Rows3 className="size-4" /> 插入行
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().addTableColumn()}>
          <Columns3 className="size-4" /> 插入列
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().removeTableRow()}>
          <Trash2 className="size-4" /> 删除行
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().removeTableColumn()}>
          <Trash2 className="size-4" /> 删除列
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().mergeTableCells()}>
          <Combine className="size-4" /> 合并
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => store().splitTableCell()}>
          <Split className="size-4" /> 拆分
        </Button>
      </div>

      <Separator />
      <Row label="主题色">
        <ColorPicker
          value={el.theme.color}
          onChange={(color) => {
            record()
            patch({ theme: { ...el.theme, color } } as Partial<TableElement>)
          }}
        />
      </Row>
      <SwitchRow
        label="标题行"
        checked={el.theme.rowHeader}
        onChange={(rowHeader) => patch({ theme: { ...el.theme, rowHeader } } as Partial<TableElement>)}
      />
      <SwitchRow
        label="隔行变色"
        checked={el.theme.banded}
        onChange={(banded) => patch({ theme: { ...el.theme, banded } } as Partial<TableElement>)}
      />
      <Row label="字号">
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
  const [text, setText] = useState(() => serializeChart(el))

  return (
    <div className="space-y-3">
      <Row label="图表类型">
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
            {CHART_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">
          数据（首行为系列名，首列为分类）
        </Label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const data = parseChart(text)
            if (!data) return setText(serializeChart(el))
            record()
            patch({ data } as Partial<ChartElement>)
          }}
          rows={6}
          spellCheck={false}
          className="w-full resize-none rounded-md border bg-transparent p-2 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>

      <SwitchRow
        label="图例"
        checked={el.showLegend}
        onChange={(showLegend) => patch({ showLegend } as Partial<ChartElement>)}
      />
      <SwitchRow
        label="网格线"
        checked={el.showGrid}
        onChange={(showGrid) => patch({ showGrid } as Partial<ChartElement>)}
      />
      <SwitchRow
        label="数值标签"
        checked={el.showValue}
        onChange={(showValue) => patch({ showValue } as Partial<ChartElement>)}
      />
      <Row label="文字 / 网格">
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
        <Label className="text-xs font-normal text-muted-foreground">系列配色</Label>
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

/** Chart data is edited as a small TSV block — quick to retype, and paste-friendly from a spreadsheet. */
function serializeChart(el: ChartElement): string {
  const header = ["", ...el.data.series.map((s) => s.name)].join("\t")
  const rows = el.data.categories.map((category, i) =>
    [category, ...el.data.series.map((s) => s.values[i] ?? 0)].join("\t"),
  )
  return [header, ...rows].join("\n")
}

function parseChart(text: string): ChartElement["data"] | null {
  const lines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length)
  if (lines.length < 2) return null

  const split = (line: string) => line.split(/\t|\s{2,}|,/).map((cell) => cell.trim())
  const header = split(lines[0])
  const names = header.slice(1)
  if (!names.length) return null

  const categories: string[] = []
  const series = names.map((name) => ({ name, values: [] as number[] }))

  for (const line of lines.slice(1)) {
    const cells = split(line)
    categories.push(cells[0] ?? "")
    names.forEach((_, i) => {
      const value = Number(cells[i + 1])
      series[i].values.push(Number.isFinite(value) ? value : 0)
    })
  }
  return { categories, series }
}

function MediaPanel({ el, patch }: { el: MediaElement; patch: Patch }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        编辑时显示为静帧，放映时才会播放
      </p>
      <Row label="替换文件">
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
        <Row label="封面图">
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
        label="自动播放"
        checked={el.autoplay}
        onChange={(autoplay) => patch({ autoplay } as Partial<MediaElement>)}
      />
      <SwitchRow
        label="循环播放"
        checked={el.loop}
        onChange={(loop) => patch({ loop } as Partial<MediaElement>)}
      />
    </div>
  )
}

const FORMULA_SAMPLES = [
  { label: "分式", latex: "\\frac{a}{b}" },
  { label: "根式", latex: "\\sqrt{x^2 + y^2}" },
  { label: "求和", latex: "\\sum_{i=1}^{n} i" },
  { label: "积分", latex: "\\int_{0}^{\\infty} e^{-x} dx" },
  { label: "矩阵", latex: "\\begin{matrix} a & b \\\\ c & d \\end{matrix}" },
  { label: "极限", latex: "\\lim_{x \\to 0} \\frac{\\sin x}{x}" },
]

function FormulaPanel({ el, patch }: { el: FormulaElement; patch: Patch }) {
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
            key={sample.label}
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              record()
              setDraft(sample.latex)
              patch({ latex: sample.latex } as Partial<FormulaElement>)
            }}
          >
            {sample.label}
          </Button>
        ))}
      </div>

      <Row label="颜色">
        <ColorPicker
          value={el.color}
          onChange={(color) => {
            record()
            patch({ color } as Partial<FormulaElement>)
          }}
        />
      </Row>
      <p className="text-[11px] text-muted-foreground">
        导出 PPTX 时公式会转成图片——PowerPoint 的公式是 OMML，和 LaTeX 不是一回事
      </p>
    </div>
  )
}

function AnimationPanel() {
  const slides = useEditor((s) => s.slides)
  const slideIndex = useEditor((s) => s.slideIndex)
  const activeIds = useEditor((s) => s.activeIds)
  const slide = slides[Math.min(slideIndex, slides.length - 1)]
  const animations = slide.animations ?? []

  const labelFor = (elId: string) => {
    const index = slide.elements.findIndex((el) => el.id === elId)
    return index < 0 ? "已删除" : `元素 ${index + 1}`
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {activeIds.length === 1 ? "为选中元素添加动画" : "先在画布上选中一个元素"}
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
          <SelectValue placeholder="添加动画…" />
        </SelectTrigger>
        <SelectContent>
          {ANIMATIONS.map((a) => (
            <SelectItem key={a.value} value={a.value}>
              {a.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!animations.length && (
        <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          本页还没有动画
        </p>
      )}

      <ul className="space-y-2">
        {animations.map((animation, index) => (
          <li key={animation.id} className="space-y-1.5 rounded-md border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">
                {index + 1}. {ANIMATIONS.find((a) => a.value === animation.effect)?.label}
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
                  <SelectItem value="click">单击时</SelectItem>
                  <SelectItem value="auto">与上一动画同时</SelectItem>
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
