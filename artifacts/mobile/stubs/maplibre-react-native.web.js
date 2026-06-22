import React from "react";
import { View, Text, StyleSheet } from "react-native";

const MapView = ({ children, style }) =>
  React.createElement(
    View,
    { style: [styles.map, style] },
    React.createElement(
      View,
      { style: styles.placeholder },
      React.createElement(Text, { style: styles.text }, "Map available on device")
    ),
    children
  );

const Camera = () => null;
const UserLocation = () => null;
const PointAnnotation = ({ children }) => children ?? null;
const ShapeSource = ({ children }) => children ?? null;
const LineLayer = () => null;
const FillLayer = () => null;
const SymbolLayer = () => null;

const offlineManager = {
  createPack: async () => {},
  getPack: async () => null,
  deletePack: async () => {},
  getPacks: async () => [],
};

const setAccessToken = () => {};

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: "#1a1a1a" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: { color: "#666", fontSize: 14, fontWeight: "600" },
});

const MapLibreGL = {
  MapView,
  Camera,
  UserLocation,
  PointAnnotation,
  ShapeSource,
  LineLayer,
  FillLayer,
  SymbolLayer,
  offlineManager,
  setAccessToken,
};

export default MapLibreGL;
export {
  MapView,
  Camera,
  UserLocation,
  PointAnnotation,
  ShapeSource,
  LineLayer,
  FillLayer,
  SymbolLayer,
  offlineManager,
  setAccessToken,
};
