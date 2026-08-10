//! Route preset and explainability scaffolding.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RoutePreset {
    Performance,
    Balanced,
    Battery,
    Privacy,
    LocalFirst,
    CloudAllowed,
    NeverCloud,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RouteTarget {
    Local,
    Cloud,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RoutePolicy {
    pub prefer_local: bool,
    pub allow_cloud: bool,
    pub prefer_warm_runtime: bool,
    pub optimize_battery: bool,
}

impl RoutePreset {
    pub const ALL: [Self; 7] = [
        Self::Performance,
        Self::Balanced,
        Self::Battery,
        Self::Privacy,
        Self::LocalFirst,
        Self::CloudAllowed,
        Self::NeverCloud,
    ];

    pub fn policy(self) -> RoutePolicy {
        match self {
            Self::Performance => RoutePolicy {
                prefer_local: false,
                allow_cloud: true,
                prefer_warm_runtime: true,
                optimize_battery: false,
            },
            Self::Balanced => RoutePolicy {
                prefer_local: true,
                allow_cloud: true,
                prefer_warm_runtime: true,
                optimize_battery: false,
            },
            Self::Battery => RoutePolicy {
                prefer_local: true,
                allow_cloud: false,
                prefer_warm_runtime: true,
                optimize_battery: true,
            },
            Self::Privacy | Self::NeverCloud => RoutePolicy {
                prefer_local: true,
                allow_cloud: false,
                prefer_warm_runtime: false,
                optimize_battery: false,
            },
            Self::LocalFirst => RoutePolicy {
                prefer_local: true,
                allow_cloud: true,
                prefer_warm_runtime: false,
                optimize_battery: false,
            },
            Self::CloudAllowed => RoutePolicy {
                prefer_local: false,
                allow_cloud: true,
                prefer_warm_runtime: true,
                optimize_battery: false,
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RouteSimulatorInput {
    pub preset: RoutePreset,
    pub local_available: bool,
    pub cloud_available: bool,
    pub local_warm: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RouteExplanation {
    pub preset: RoutePreset,
    pub selected: RouteTarget,
    pub fallback: Option<RouteTarget>,
    pub reasons: Vec<String>,
}

pub fn explain_route(input: &RouteSimulatorInput) -> RouteExplanation {
    let policy = input.preset.policy();
    let selected = if policy.prefer_local && input.local_available {
        RouteTarget::Local
    } else if policy.allow_cloud && input.cloud_available {
        RouteTarget::Cloud
    } else if input.local_available {
        RouteTarget::Local
    } else {
        RouteTarget::Unavailable
    };
    let fallback = match selected {
        RouteTarget::Local if policy.allow_cloud && input.cloud_available => {
            Some(RouteTarget::Cloud)
        }
        RouteTarget::Cloud if input.local_available => Some(RouteTarget::Local),
        _ => None,
    };
    let mut reasons = vec![match selected {
        RouteTarget::Local => "local runtime selected".to_owned(),
        RouteTarget::Cloud => "cloud runtime selected".to_owned(),
        RouteTarget::Unavailable => "no permitted runtime is available".to_owned(),
    }];
    if input.local_warm && selected == RouteTarget::Local {
        reasons.push("warm local runtime avoids startup latency".to_owned());
    }
    if !policy.allow_cloud {
        reasons.push("cloud routing is disabled by this preset".to_owned());
    }
    RouteExplanation {
        preset: input.preset,
        selected,
        fallback,
        reasons,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn never_cloud_does_not_select_or_fallback_to_cloud() {
        let explanation = explain_route(&RouteSimulatorInput {
            preset: RoutePreset::NeverCloud,
            local_available: false,
            cloud_available: true,
            local_warm: false,
        });
        assert_eq!(explanation.selected, RouteTarget::Unavailable);
        assert_eq!(explanation.fallback, None);
    }

    #[test]
    fn local_first_uses_local_and_explains_warm_start() {
        let explanation = explain_route(&RouteSimulatorInput {
            preset: RoutePreset::LocalFirst,
            local_available: true,
            cloud_available: true,
            local_warm: true,
        });
        assert_eq!(explanation.selected, RouteTarget::Local);
        assert_eq!(explanation.fallback, Some(RouteTarget::Cloud));
        assert!(
            explanation
                .reasons
                .iter()
                .any(|reason| reason.contains("warm"))
        );
    }
}
