import React from "react";
import { View, Text, StyleSheet } from "react-native";

const MapView = ({ children, style, ...props }) =>
  React.createElement(
    View,
    { style: [styles.map, style] },
    React.createElement(
      View,
      { style: styles.placeholder },
      React.createElement(Text, { style: styles.text }, "Map view available on device")
    ),
    children
  );

const Marker = () => null;
const Polyline = () => null;
const Polygon = () => null;
const Circle = () => null;
const Callout = () => null;
const PROVIDER_GOOGLE = "google";
const PROVIDER_DEFAULT = undefined;

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: "#1a1a1a" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: { color: "#666", fontSize: 14, fontWeight: "600" },
});

export default MapView;
export { Marker, Polyline, Polygon, Circle, Callout, PROVIDER_GOOGLE, PROVIDER_DEFAULT };
