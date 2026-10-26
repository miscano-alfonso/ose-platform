import { getStyles } from "@/lib/site-content";
import { stylesCss, fontsHref } from "@/lib/styles";
import { StyleBridge } from "../(site)/StyleBridge";

// Dashboard fonts, sizes and spacing from Admin → Page styles → Dashboards (and its live preview).
export async function DashStyles() {
  const s = await getStyles("dash");
  const css = stylesCss(s, "dash"), fonts = fontsHref(s);
  return <>
    {fonts && <link id="ose-fonts" rel="stylesheet" href={fonts} />}
    <style id="ose-styles" dangerouslySetInnerHTML={{ __html: css }} />
    <StyleBridge />
  </>;
}
