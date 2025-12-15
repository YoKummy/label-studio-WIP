import { types, getRoot } from "mobx-state-tree";
import { message } from "antd";

import BaseTool, { DEFAULT_DIMENSIONS } from "./Base";
import ToolMixin from "../mixins/Tool";
import { ThreePointsDrawingTool, TwoPointsDrawingTool } from "../mixins/DrawingTool";
import { AnnotationMixin } from "../mixins/AnnotationMixin";
import { NodeViews } from "../components/Node/Node";
import { FF_DEV_3793, isFF } from "../utils/feature-flags";

const _BaseNPointTool = types
  .model("BaseNTool", {
    group: "segmentation",
    smart: true,
    shortcut: "tool:rect",
  })
  .views((self) => {
    const Super = {
      createRegionOptions: self.createRegionOptions,
      isIncorrectControl: self.isIncorrectControl,
      isIncorrectLabel: self.isIncorrectLabel,
    };

    return {
      get getActivePolygon() {
        const poly = self.currentArea;

        if (poly && poly.closed) return null;
        if (poly === undefined) return null;
        if (poly && poly.type !== "rectangleregion") return null;

        return poly;
      },

      get tagTypes() {
        return {
          stateTypes: "rectanglelabels",
          controlTagTypes: ["rectanglelabels", "rectangle"],
        };
      },
      get defaultDimensions() {
        return DEFAULT_DIMENSIONS.rect;
      },
      createRegionOptions({ x, y }) {
        return Super.createRegionOptions({
          x,
          y,
          height: isFF(FF_DEV_3793) ? self.obj.canvasToInternalY(1) : 1,
          width: isFF(FF_DEV_3793) ? self.obj.canvasToInternalX(1) : 1,
        });
      },

      isIncorrectControl() {
        return Super.isIncorrectControl() && self.current() === null;
      },
      isIncorrectLabel() {
        return !self.current() && Super.isIncorrectLabel();
      },
      canStart() {
        return self.current() === null && !self.annotation.isReadOnly();
      },

      current() {
        return self.getActivePolygon;
      },
    };
  })
  .actions((self) => {
    const Super = {
      commitDrawingRegion: self.commitDrawingRegion,
    };

    return {
      beforeCommitDrawing() {
        const s = self.getActiveShape;

        return s.width > self.MIN_SIZE.X && s.height > self.MIN_SIZE.Y;
      },

      commitDrawingRegion() {
        const { currentArea, control, obj } = self;

        if (!currentArea) return;

        // Apply snap to pixel if enabled before finalizing the region
        if (control?.snap === "pixel") {
          const canvasX = currentArea.parent.internalToCanvasX(currentArea.x);
          const canvasY = currentArea.parent.internalToCanvasY(currentArea.y);
          const canvasWidth = currentArea.parent.internalToCanvasX(currentArea.width);
          const canvasHeight = currentArea.parent.internalToCanvasY(currentArea.height);

          // Apply snap logic through setPosition which handles both corners
          currentArea.setPosition(canvasX, canvasY, canvasWidth, canvasHeight, currentArea.rotation);
        }

        // Use the parent commitDrawingRegion to finalize the region
        const region = Super.commitDrawingRegion();

        if (region) {
          const settings = getRoot(self).settings;
          if (settings && settings.enableTemplateAssist) {
            self.requestSuggestions(region);
          }
        }

        return region;
      },

      requestSuggestions(region) {
        const image = self.obj;
        if (!image || !image.src) return;

        const imageUrl = image.src;
        const bbox = {
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
        };

        const hideLoading = message.loading("Searching for similar objects...", 0);

        fetch("http://localhost:9090/suggest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_url: imageUrl,
            bbox: bbox,
          }),
        })
          .then((response) => response.json())
          .then((data) => {
            hideLoading();
            if (data.suggestions && data.suggestions.length > 0) {
              message.success(`Found ${data.suggestions.length} similar objects`);
              self.addSuggestions(data.suggestions);
            } else {
              message.info("No similar objects found");
            }
          })
          .catch((err) => {
            hideLoading();
            console.error("Error fetching suggestions:", err);
            message.error("Error searching for objects");
          });
      },

      addSuggestions(suggestions) {
        const { annotation, control, obj } = self;

        suggestions.forEach((s) => {
          const value = {
            x: s.x,
            y: s.y,
            width: s.width,
            height: s.height,
            rotation: 0,
          };

          const resultValue = control.getResultValue();
          annotation.createResult(value, resultValue, control, obj);
        });
      },
    };
  });

const _Tool = types
  .model("RectangleTool", {
    shortcut: "tool:rect",
  })
  .views((self) => ({
    get viewTooltip() {
      return "Rectangle";
    },
    get iconComponent() {
      return self.dynamic ? NodeViews.RectRegionModel.altIcon : NodeViews.RectRegionModel.icon;
    },
  }));

const _Tool3Point = types
  .model("Rectangle3PointTool", {
    shortcut: "tool:rect-3point",
  })
  .views((self) => ({
    get viewTooltip() {
      return "3 Point Rectangle";
    },
    get iconComponent() {
      return self.dynamic ? NodeViews.Rect3PointRegionModel.altIcon : NodeViews.Rect3PointRegionModel.icon;
    },
  }));

const Rect = types.compose(
  _Tool.name,
  ToolMixin,
  BaseTool,
  TwoPointsDrawingTool,
  _BaseNPointTool,
  _Tool,
  AnnotationMixin,
);

const Rect3Point = types.compose(
  _Tool3Point.name,
  ToolMixin,
  BaseTool,
  ThreePointsDrawingTool,
  _BaseNPointTool,
  _Tool3Point,
  AnnotationMixin,
);

export { Rect, Rect3Point };
