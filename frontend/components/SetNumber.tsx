import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { SET_TYPE_CONFIG, SetType } from "../types";

export interface SetNumberProps {
  setType: SetType;
  completed?: boolean;
  setIndex: number;
  onClick?: () => void;
}
export const SetNumber = ({
  setType,
  setIndex,
  completed,
  onClick,
}: SetNumberProps) => {
  const typeConfig = SET_TYPE_CONFIG[setType];

  if (setType === "normal") {
    return (
      <TouchableOpacity
        style={styles.setNumberContainer}
        onPress={() => onClick?.()}
        disabled={!onClick}
      >
        <Text
          style={[styles.setNumber, completed && styles.setNumberCompleted]}
        >
          {setIndex + 1}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.setTypeIndicator, { backgroundColor: typeConfig.bgColor }]}
      onPress={() => onClick?.()}
      disabled={!onClick}
    >
      <Text style={[styles.setTypeInitial, { color: typeConfig.color }]}>
        {typeConfig.initial}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  setHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
    paddingHorizontal: 4,
    gap: 8,
  },
  setHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    textAlign: "center",
  },
  headerSetCell: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerFieldCell: {
    width: "100%",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCompleteCell: {
    width: 36,
  },

  /* LAYOUT */
  setIndexColumn: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  setFieldColumn: {
    flex: 1,
    justifyContent: "center",
  },
  completeColumn: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ROW */
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  setRowCompleted: {
    opacity: 0.65,
  },
  setNumberContainer: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  setNumber: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    textAlign: "center",
  },
  setNumberCompleted: {
    color: "#34C759",
  },

  /* TYPE INDICATORS */
  setTypeIndicator: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  setTypeInitial: {
    fontSize: 14,
    fontWeight: "700",
  },

  /* PREVIOUS CELL */
  previousCell: {
    width: "100%",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  previousText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#8E8E93",
    textAlign: "center",
  },

  /* INPUTS */
  setInput: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#D1D1D6",
  },
  setInputCompleted: {
    backgroundColor: "#E8F8ED",
    borderColor: "#34C759",
  },
  durationInput: {
    width: "100%",
  },
  durationInputCompleted: {
    backgroundColor: "#E8F8ED",
    borderColor: "#34C759",
  },

  /* COMPLETE BUTTON */
  completeButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F2F2F7",
    justifyContent: "center",
    alignItems: "center",
  },
  completeButtonActive: {
    backgroundColor: "#34C759",
  },

  /* DROPDOWN */
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    width: 250,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 12,
    textAlign: "center",
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  dropdownOptionSelected: {
    backgroundColor: "#F2F2F7",
  },
  dropdownIndicator: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  dropdownIndicatorNormal: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: "#F2F2F7",
  },
  dropdownNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8E8E93",
  },
  dropdownInitial: {
    fontSize: 14,
    fontWeight: "700",
  },
  dropdownLabel: {
    flex: 1,
    fontSize: 16,
    color: "#1C1C1E",
  },
  dropdownLabelSelected: {
    fontWeight: "600",
  },
  checkIcon: {
    marginRight: 8,
  },
  infoButton: {
    padding: 4,
    marginLeft: 4,
  },
});
