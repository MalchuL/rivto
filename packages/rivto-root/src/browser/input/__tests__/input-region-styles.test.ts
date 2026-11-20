import { createBrowserInputRegion } from "../input-region";

it("updates styles only while attached and applies final styles after detachment", () => {
  const root = document.createElement("div");
  const element = document.createElement("div");
  root.append(element);
  let attached = true;
  const region = createBrowserInputRegion(root, element, () => attached);
  const styles = region.captureStyles(["width", "transform"])!;
  styles.set({ width: "40px", transform: "translate(5px, 0px)" });
  expect(element.style.width).toBe("40px");
  attached = false;
  styles.set({ width: "90px" });
  expect(element.style.width).toBe("40px");
  styles.finish({ width: "20px", transform: null });
  styles.finish({ width: "90px" });
  styles.set({ width: "90px" });
  expect(element.style.width).toBe("20px");
  expect(element.style.transform).toBe("");
  expect(region.captureStyles(["width"])).toBeUndefined();
});

it("does not let a detached session overwrite a replacement session", () => {
  const root = document.createElement("div");
  const element = document.createElement("div");
  root.append(element);
  let attached = true;
  const oldRegion = createBrowserInputRegion(root, element, () => attached);
  const oldStyles = oldRegion.captureStyles(["width"])!;
  oldStyles.set({ width: "10px" });
  attached = false;
  const newRegion = createBrowserInputRegion(root, element, () => true);
  const newStyles = newRegion.captureStyles(["width"])!;
  newStyles.set({ width: "30px" });
  oldStyles.finish({ width: "20px" });
  expect(element.style.width).toBe("30px");
  newStyles.finish({ width: "40px" });
  expect(element.style.width).toBe("40px");
});
