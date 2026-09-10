/**
 * Minimal host-owned fixture for the preserved E3 characterization tests.
 *
 * The source project built this empty canvas by cloning its full demo landing
 * page. Meliora keeps only the data contract needed by the E3 host seam so the
 * page editor and its template catalog do not enter the extraction closure.
 */
export const E3_MINIMUM_INTEGRATION_PATH = "/e3-minimum-integration";

export const createE3MinimumIntegrationData = () => ({
  content: [
    {
      type: "BlankCanvas",
      props: {
        id: "BlankCanvas-e3-minimum-integration",
        editorName: "E3 最小集成画布",
        canvasVersion: 1,
        offsetX: 0,
        horizontalAlign: "center",
        width: 1280,
        height: 720,
        responsiveSize: {
          tablet: { width: 768, height: 720 },
          mobile: { width: 360, height: 720 }
        },
        shape: "rectangle",
        backgroundColor: "#0D0D0F",
        fill: {
          color: "#0D0D0F",
          enabled: true,
          gradientAngle: 135,
          gradientMirror: false,
          gradientFrom: "#0D0D0F",
          gradientTo: "#FFE3DC",
          imageFit: "cover",
          imageOverlay: { color: "#000000", opacity: 0 },
          imagePositionX: 50,
          imagePositionY: 50,
          imageUrl: "",
          mode: "solid",
          opacity: 100,
          stops: [
            { color: "#0D0D0F", id: "start", opacity: 100, position: 0 },
            { color: "#FFE3DC", id: "end", opacity: 100, position: 100 }
          ]
        },
        borderColor: "transparent",
        borderWidth: 0,
        borderPosition: "center",
        borderStyle: "solid",
        borderRadius: 0,
        shadow: "none",
        opacity: 100,
        overflow: "hidden",
        layoutMode: "free",
        columns: 1,
        columnGap: 0,
        rowGap: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        alignItems: "center",
        justifyContent: "start",
        wrap: false,
        items: []
      }
    }
  ],
  root: {
    props: {
      title: "E3 最小集成画布",
      background: "#F5F5F7",
      foreground: "#17181C",
      primary: "#C9A85C",
      primaryForeground: "#0D0D0F",
      secondary: "#F2F0EA",
      secondaryForeground: "#2B2C31",
      muted: "#ECEDEF",
      mutedForeground: "#696B72",
      accent: "#F4E8CC",
      accentForeground: "#17181C",
      border: "#D9DADD",
      input: "#ECEDEF",
      focus: "#D2B36B",
      card: "#FFFFFF",
      cardForeground: "#17181C",
      radius: 12,
      fontFamily: "InterVariable, Inter, \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
      pageMaxWidth: "1280px",
      sectionSpacing: "0px"
    }
  },
  zones: {}
});
