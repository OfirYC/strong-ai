
import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Attributes

struct LiveActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var title: String
    var subtitle: String?

    // Rest countdown dates (ms since epoch)
    var timerEndDateInMilliseconds: Double?
    var timerStartDateInMilliseconds: Double?

    // Workout progress (0..1)
    var progress: Double?

    // Workout elapsed text (computed in JS: "12:34" or "1:02:03")
    var workoutStartDateInMilliseconds: Double?

    var imageName: String?
    var dynamicIslandImageName: String?
    
    // Current set info
    var exerciseName: String?
    var currentSet: Int?
    var totalSets: Int?
    var currentWeight: Double?
    var currentReps: Int?
    var durationInSeconds: Double?
    var distanceInKm: Double?
    var completedSets: Int?
    var isSetComplete: Bool?
  }

  struct LiveActivityPayload: Codable, Hashable {
     var subtitle: String? 

      // moved here:
     var timerStartDateInMilliseconds: Double?
     var workoutStartDateInMilliseconds: Double?  
     // workout fields moved here:
     var exerciseName: String?
     var currentSet: Int?
     var totalSets: Int?
     var currentWeight: Double?
     var currentReps: Int?
     var durationInSeconds: Double?
     var distanceInKm: Double?
     var completedSets: Int?
     var isSetComplete: Bool?  
   } 

  var name: String

  var backgroundColor: String?
  var titleColor: String?
  var subtitleColor: String?
  var progressViewTint: String?
  var progressViewLabelColor: String?
  var deepLinkUrl: String?
  var timerType: DynamicIslandTimerType?
  var padding: Int?
  var paddingDetails: PaddingDetails?
  var imagePosition: String?
  var imageWidth: Int?
  var imageHeight: Int?
  var imageWidthPercent: Double?
  var imageHeightPercent: Double?
  var imageAlign: String?
  var contentFit: String?

  enum DynamicIslandTimerType: String, Codable {
    case circular
    case digital
  }

  struct PaddingDetails: Codable, Hashable {
    var top: Int?
    var bottom: Int?
    var left: Int?
    var right: Int?
    var vertical: Int?
    var horizontal: Int?
  }
}

// MARK: - Widget

struct LiveActivityWidget: Widget {
  private func merge(_ state: LiveActivityAttributes.ContentState) -> LiveActivityAttributes.ContentState {
    guard let raw = state.subtitle,
          let data = raw.data(using: .utf8),
          let injected = try? JSONDecoder().decode(LiveActivityAttributes.LiveActivityPayload.self, from: data)
    else {
      return state
    }

    var copy = state
    copy.subtitle = injected.subtitle ?? state.subtitle
    copy.timerStartDateInMilliseconds = injected.timerStartDateInMilliseconds ?? state.timerStartDateInMilliseconds
    copy.workoutStartDateInMilliseconds =
    injected.workoutStartDateInMilliseconds ?? state.workoutStartDateInMilliseconds
    copy.currentSet = injected.currentSet ?? state.currentSet
    copy.totalSets = injected.totalSets ?? state.totalSets
    copy.currentWeight = injected.currentWeight ?? state.currentWeight
    copy.currentReps = injected.currentReps ?? state.currentReps
    copy.completedSets = injected.completedSets ?? state.completedSets
    copy.isSetComplete = injected.isSetComplete ?? state.isSetComplete
    copy.exerciseName = injected.exerciseName ?? state.exerciseName
    copy.durationInSeconds = injected.durationInSeconds ?? state.durationInSeconds
    copy.distanceInKm = injected.distanceInKm ?? state.distanceInKm

    return copy
  }

  var body: some WidgetConfiguration {
  ActivityConfiguration(for: LiveActivityAttributes.self) { context in
    let merged = merge(context.state)
    WorkoutLiveActivityView(contentState: merged, attributes: context.attributes)
      .activityBackgroundTint(context.attributes.backgroundColor.map { Color(hex: $0) })
      .activitySystemActionForegroundColor(.black)
      .applyWidgetURL(from: context.attributes.deepLinkUrl)
  } dynamicIsland: { _ in
    DynamicIsland {
      DynamicIslandExpandedRegion(.leading) {
        EmptyView()
      }
      DynamicIslandExpandedRegion(.trailing) {
        EmptyView()
      }
      DynamicIslandExpandedRegion(.bottom) {
        EmptyView()
      }
    } compactLeading: {
      EmptyView()
    } compactTrailing: {
      EmptyView()
    } minimal: {
      EmptyView()
    }
  }
}

}

// MARK: - Lock Screen / Banner (App-style: light surface + thick blue bar)

private struct WorkoutLiveActivityView: View {
  let contentState: LiveActivityAttributes.ContentState
  let attributes: LiveActivityAttributes
 

  private var tint: Color { attributes.progressViewTint.map { Color(hex: $0) } ?? Color(red: 0.04, green: 0.52, blue: 1.0) } // iOS-ish blue
  private var titleColor: Color { attributes.titleColor.map { Color(hex: $0) } ?? .black }
  private var subtitleColor: Color { attributes.subtitleColor.map { Color(hex: $0) } ?? .gray }

  private var isRest: Bool {
  guard let endMs = contentState.timerEndDateInMilliseconds else { return false }
  return Date() < Date(timeIntervalSince1970: endMs / 1000.0)
  }

  var body: some View {
   VStack(spacing: 0) {

    // FULL WIDTH HEADER (no horizontal padding)
    headerRow
        .padding(.horizontal, 14) // small safe inset
        .padding(.top, 12)

    // Card body (padded)
    VStack(alignment: .leading, spacing: 8) {

        if isRest, let endMs = contentState.timerEndDateInMilliseconds {
            RestBarSystem(
                startMs: contentState.timerStartDateInMilliseconds,
                endMs: endMs,
                tint: tint
            )
        } else {
            ActiveRow(
                progress: contentState.progress,
                workoutStartDateInMilliseconds: contentState.workoutStartDateInMilliseconds,
                tint: tint,
                subtitleColor: subtitleColor,
                currentSet: contentState.currentSet,
                totalSets: contentState.totalSets,
                currentWeight: contentState.currentWeight,
                currentReps: contentState.currentReps,
                completedSets: contentState.completedSets,
                isSetComplete: contentState.isSetComplete,
                exerciseName: contentState.exerciseName,
                durationInSeconds: contentState.durationInSeconds,
                distanceInKm: contentState.distanceInKm,
            )
        }

    }
    .padding(resolvePadding(attributes))
}
.background(
    RoundedRectangle(cornerRadius: 18, style: .continuous)
        .fill(Color(red: 0.91, green: 0.97, blue: 0.91))
)
.overlay(
    RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(Color.black.opacity(0.04), lineWidth: 1)
)

  }

private var headerRow: some View {
    HStack(alignment: .top, spacing: 8) {

        // ICON
        Image(systemName: "dumbbell.fill")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(tint)

        VStack(alignment: .leading, spacing: 3) {

            // TITLE & TIMER ROW
            HStack(alignment: .firstTextBaseline) {
                Text(contentState.title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(titleColor)
                    .lineLimit(1)

                Spacer(minLength: 8)

                if let startMs = contentState.workoutStartDateInMilliseconds {
                    let startDate = Date(timeIntervalSince1970: startMs / 1000.0)
                    Text(timerInterval: startDate...Date.distantFuture, countsDown: false)
                        .monospacedDigit()
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(titleColor.opacity(0.5))
                        .multilineTextAlignment(.trailing)
                        .frame(width: 72, alignment: .trailing)  // fixed width, enough for "0:00:00"

                }
            }

            // SUBTITLE
            if let subtitle = contentState.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(subtitleColor.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
}





  private func resolvePadding(_ attrs: LiveActivityAttributes) -> EdgeInsets {
    if let details = attrs.paddingDetails {
      let top = CGFloat(details.top ?? details.vertical ?? attrs.padding ?? 12)
      let bottom = CGFloat(details.bottom ?? details.vertical ?? attrs.padding ?? 12)
      let left = CGFloat(details.left ?? details.horizontal ?? attrs.padding ?? 14)
      let right = CGFloat(details.right ?? details.horizontal ?? attrs.padding ?? 14)
      return EdgeInsets(top: top, leading: left, bottom: bottom, trailing: right)
    }
    let p = CGFloat(attrs.padding ?? 12)
    return EdgeInsets(top: p, leading: p + 2, bottom: p, trailing: p + 2)
  }
}

private struct ActiveRow: View {
  let progress: Double?
  let workoutStartDateInMilliseconds: Double?
  let tint: Color
  let subtitleColor: Color
  let currentSet: Int?
  let totalSets: Int?
  let currentWeight: Double?
  let currentReps: Int?
  let completedSets: Int?
  let isSetComplete: Bool?
  let exerciseName: String?
  let durationInSeconds: Double?
  let distanceInKm: Double?
  private func weightText(_ weight: Double) -> some View {
    Text(weight.truncatingRemainder(dividingBy: 1) == 0
         ? "\(Int(weight))kg"
         : String(format: "%.1fkg", weight))
        .font(.system(size: 22, weight: .bold))
        .foregroundStyle(tint)
}

private func repsText(_ reps: Int) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text("\(reps)")
            .font(.system(size: 22, weight: .bold))
            .foregroundStyle(.black)

        Text("reps")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(subtitleColor.opacity(0.45))
    }
}

private func durationText(_ seconds: Double) -> some View {
    let total = Int(seconds)
    let mins = total / 60
    let secs = total % 60

    let formatted = mins > 0
        ? "\(mins)m \(secs)s"
        : "\(secs)s"

    return Text(formatted)
        .font(.system(size: 22, weight: .bold))
        .foregroundStyle(.black)
}

private func distanceText(_ km: Double) -> some View {
    Text(String(format: "%.2fkm", km))
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(.black)
}

private var separator: some View {
    Text("×")
        .font(.system(size: 15, weight: .light))
        .foregroundStyle(subtitleColor.opacity(0.3))
}

private var bullet: some View {
    Text("•")
        .foregroundStyle(subtitleColor.opacity(0.3))
}

  @ViewBuilder
private func buildPrimaryDisplay() -> some View {

    let weight = currentWeight
    let reps = currentReps
    let duration = durationInSeconds
    let distance = distanceInKm

    let hasStrength = weight != nil || reps != nil
    let hasCardio   = duration != nil || distance != nil

    // ---- FULL COMBO (Weighted Cardio / EMOM etc) ----
    if hasStrength && hasCardio {
        HStack(spacing: 6) {
            if let weight { weightText(weight) }
            if let reps {
                separator
                repsText(reps)
            }
            if let duration {
                bullet
                durationText(duration)
            }
            if let distance {
                bullet
                distanceText(distance)
            }
        }
    }

    // ---- WEIGHT + REPS ----
    else if let weight, let reps {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            weightText(weight)
            separator
            repsText(reps)
        }
    }

    // ---- REPS ONLY ----
    else if let reps {
        repsText(reps)
    }

    // ---- DURATION + DISTANCE ----
    else if let duration, let distance {
        HStack(spacing: 6) {
            durationText(duration)
            bullet
            distanceText(distance)
        }
    }

    // ---- WEIGHT + DURATION ----
    else if let weight, let duration {
        HStack(spacing: 6) {
            weightText(weight)
            bullet
            durationText(duration)
        }
    }

    // ---- DURATION ONLY ----
    else if let duration {
        durationText(duration)
    }

    else {
        EmptyView()
    }
}


  var body: some View {
    VStack(alignment: .leading, spacing: 6) {

        // Exercise name
        if let exerciseName, !exerciseName.isEmpty {
            Text(exerciseName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(subtitleColor.opacity(0.85))
                .lineLimit(1)
        }

        HStack(alignment: .firstTextBaseline, spacing: 6) {
            buildPrimaryDisplay()
            Spacer(minLength: 8)
        }
    }
}


}
private struct RestBarSystem: View {
  let startMs: Double?
  let endMs: Double
  let tint: Color

  private var startDate: Date {
    if let startMs {
      return Date(timeIntervalSince1970: startMs / 1000.0)
    }
    return Date()
  }

  private var endDate: Date {
    Date(timeIntervalSince1970: endMs / 1000.0)
  }

  var body: some View {
    ZStack {
      // Track - lighter, more subtle
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(Color.black.opacity(0.06))
      
      // Fill with ProgressView - using the blue tint
      ProgressView(
        timerInterval: startDate...endDate,
        countsDown: true,
        label: { EmptyView() },
        currentValueLabel: { EmptyView() }
      )
      .progressViewStyle(.linear)
      .tint(tint) // Back to blue tint
      .scaleEffect(x: 1, y: 8, anchor: .center)
      
      // Timer text - white on blue background
      HStack(spacing: 0) {
        Spacer(minLength: 0)
        Text(timerInterval: startDate...endDate, countsDown: true)
          .monospacedDigit()
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(.white)
          .multilineTextAlignment(.center)
        Spacer(minLength: 0)
      }
    }
    .frame(height: 28)
    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
  }
}


// MARK: - Local helpers (safe to define)

private func clamp01(_ v: Double) -> Double { min(1, max(0, v)) }

private extension Date {
  /// If startMs is nil, we fall back to now...end so the timer text works.
  /// For *progress*, you should provide a stable startMs.
  static func toTimerInterval(millisecondsStart startMs: Double?, millisecondsEnd endMs: Double) -> ClosedRange<Date> {
    let end = Date(timeIntervalSince1970: endMs / 1000.0)

    if let startMs {
      let start = Date(timeIntervalSince1970: startMs / 1000.0)
      return start...end
    }

    let now = Date()
    return now...end
  }
}

private extension String {
  func padStart2() -> String {
    count >= 2 ? self : String(repeating: "0", count: 2 - count) + self
  }
}
