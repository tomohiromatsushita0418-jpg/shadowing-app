import React, { useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutRectangle,
  type PanResponderGestureState,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

/**
 * Word/phrase tiles for 瞬間英作文 that can be tapped OR dragged.
 *
 *  - tap a bank tile → append it; tap an answer tile → send it back
 *  - drag a bank tile into the answer row → insert at the drop point
 *  - drag an answer tile → reorder; drop it outside the row → send it back
 *
 * Built on PanResponder so it works on web and native without extra deps.
 * Hit-testing uses the chip layouts captured before the drag and an overlay
 * caret instead of reflowing the row, so the insertion point never jitters.
 */

type Styles = {
  answerArea: StyleProp<ViewStyle>;
  answerChip: StyleProp<ViewStyle>;
  answerChipText: StyleProp<TextStyle>;
  answerPlaceholder: StyleProp<TextStyle>;
  bank: StyleProp<ViewStyle>;
  bankTile: StyleProp<ViewStyle>;
  bankTileText: StyleProp<TextStyle>;
};

type Props = {
  tiles: string[];
  selected: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
  /** Lets the parent pause its ScrollView while a tile is being dragged. */
  onDragging?: (active: boolean) => void;
  styles: Styles;
};

type Source = { from: 'answer'; pos: number; tile: number } | { from: 'bank'; tile: number };

type Drag = {
  src: Source;
  label: string;
  x: number;
  y: number;
  insert: number | null;
};

const TAP_SLOP = 6;
const DROP_MARGIN = 28;

// Web: stop the browser from selecting text / scrolling the page mid-drag.
const noSelect = (Platform.OS === 'web'
  ? { userSelect: 'none', touchAction: 'none', cursor: 'grab' }
  : {}) as ViewStyle;

export default function DragTiles({ tiles, selected, onChange, disabled, onDragging, styles }: Props) {
  const wrapRef = useRef<View>(null);
  const areaRef = useRef<View>(null);
  const chipRects = useRef<Record<number, LayoutRectangle>>({}); // answer position → rect in area
  const origin = useRef({ wrapX: 0, wrapY: 0, areaX: 0, areaY: 0, areaW: 0, areaH: 0 });
  const grab = useRef({ x: 0, y: 0, moved: false });
  const [drag, setDrag] = useState<Drag | null>(null);

  // Latest values for the (re-created) responder callbacks.
  const live = useRef({ selected, drag });
  live.current = { selected, drag };

  const measure = () => {
    wrapRef.current?.measureInWindow((x, y) => {
      origin.current.wrapX = x;
      origin.current.wrapY = y;
    });
    areaRef.current?.measureInWindow((x, y, w, h) => {
      Object.assign(origin.current, { areaX: x, areaY: y, areaW: w, areaH: h });
    });
  };

  /** Answer positions in order, without the tile being dragged. */
  const remaining = (src: Source) =>
    live.current.selected.map((tile, pos) => ({ tile, pos })).filter((e) => !(src.from === 'answer' && e.pos === src.pos));

  const insertionIndex = (src: Source, pageX: number, pageY: number): number | null => {
    const o = origin.current;
    const rx = pageX - o.areaX;
    const ry = pageY - o.areaY;
    const inside =
      rx >= -DROP_MARGIN && rx <= o.areaW + DROP_MARGIN && ry >= -DROP_MARGIN && ry <= o.areaH + DROP_MARGIN;
    if (!inside) return null;
    const list = remaining(src);
    for (let k = 0; k < list.length; k++) {
      const r = chipRects.current[list[k].pos];
      if (!r) continue;
      if (ry < r.y + r.height && (ry < r.y || rx < r.x + r.width / 2)) return k;
    }
    return list.length;
  };

  const finish = () => {
    setDrag(null);
    onDragging?.(false);
  };

  const responder = (src: Source, label: string) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        grab.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, moved: false };
        measure();
      },
      onPanResponderMove: (e: GestureResponderEvent, g: PanResponderGestureState) => {
        if (!grab.current.moved) {
          if (Math.hypot(g.dx, g.dy) < TAP_SLOP) return;
          grab.current.moved = true;
          onDragging?.(true);
        }
        const { pageX, pageY } = e.nativeEvent;
        setDrag({
          src,
          label,
          x: pageX - origin.current.wrapX - grab.current.x,
          y: pageY - origin.current.wrapY - grab.current.y,
          insert: insertionIndex(src, pageX, pageY),
        });
      },
      onPanResponderRelease: () => {
        const current = live.current.selected;
        if (!grab.current.moved) {
          // A tap: keep the original behaviour.
          if (src.from === 'answer') onChange(current.filter((_, p) => p !== src.pos));
          else onChange([...current, src.tile]);
          return;
        }
        const insert = live.current.drag?.insert ?? null;
        if (insert !== null) {
          const next = remaining(src).map((e) => e.tile);
          next.splice(insert, 0, src.tile);
          onChange(next);
        } else if (src.from === 'answer') {
          onChange(current.filter((_, p) => p !== src.pos)); // dragged out → back to the bank
        }
        finish();
      },
      onPanResponderTerminate: finish,
    });

  // Where to draw the insertion caret, in answer-area coordinates.
  let caret: { x: number; y: number; h: number } | null = null;
  if (drag && drag.insert !== null) {
    const list = remaining(drag.src);
    const at = list[drag.insert];
    const last = list[list.length - 1];
    if (at && chipRects.current[at.pos]) {
      const r = chipRects.current[at.pos];
      caret = { x: r.x - 5, y: r.y, h: r.height };
    } else if (last && chipRects.current[last.pos]) {
      const r = chipRects.current[last.pos];
      caret = { x: r.x + r.width + 2, y: r.y, h: r.height };
    } else {
      caret = { x: 10, y: 8, h: 30 };
    }
  }

  const usedSet = new Set(selected);

  return (
    <View ref={wrapRef} style={{ position: 'relative' }} collapsable={false}>
      <View ref={areaRef} style={[styles.answerArea, { position: 'relative' }]} collapsable={false}>
        {selected.length === 0 ? (
          <Text style={styles.answerPlaceholder}>
            {disabled ? 'ここに組み立てた英文が入ります' : 'ここにドラッグ、またはタップで追加'}
          </Text>
        ) : (
          selected.map((tile, pos) => {
            const dragging = drag?.src.from === 'answer' && drag.src.pos === pos;
            return (
              <View
                key={`a-${tile}`}
                onLayout={(e) => {
                  chipRects.current[pos] = e.nativeEvent.layout;
                }}
                style={[styles.answerChip, noSelect, dragging && { opacity: 0.25 }]}
                {...(disabled ? {} : responder({ from: 'answer', pos, tile }, tiles[tile]).panHandlers)}
              >
                <Text style={styles.answerChipText}>{tiles[tile]}</Text>
              </View>
            );
          })
        )}
        {caret && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: caret.x,
              top: caret.y,
              width: 3,
              height: caret.h,
              borderRadius: 2,
              backgroundColor: '#fbbf24',
            }}
          />
        )}
      </View>

      {!disabled && (
        <View style={styles.bank}>
          {tiles.map((t, i) => {
            if (usedSet.has(i)) return null;
            const dragging = drag?.src.from === 'bank' && drag.src.tile === i;
            return (
              <View
                key={`b-${i}`}
                style={[styles.bankTile, noSelect, dragging && { opacity: 0.25 }]}
                {...responder({ from: 'bank', tile: i }, t).panHandlers}
              >
                <Text style={styles.bankTileText}>{t}</Text>
              </View>
            );
          })}
        </View>
      )}

      {drag && (
        <View
          pointerEvents="none"
          style={[
            styles.answerChip,
            {
              position: 'absolute',
              left: drag.x,
              top: drag.y,
              zIndex: 1000,
              elevation: 12,
              shadowColor: '#000',
              shadowOpacity: 0.4,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 6 },
              transform: [{ scale: 1.08 }],
            },
          ]}
        >
          <Text style={styles.answerChipText}>{drag.label}</Text>
        </View>
      )}
    </View>
  );
}
