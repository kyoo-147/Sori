use crate::{ContextSnapshot, ModelRoute};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PipelineStage {
    ContextSnapshot,
    AudioCapture,
    Dsp,
    Vad,
    AsrRoute,
    ModelRuntime,
    Transcribe,
    PostProcess,
    FastIntent,
    InjectOrAct,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PipelinePlan {
    pub context: ContextSnapshot,
    pub route: ModelRoute,
    pub stages: Vec<PipelineStage>,
}

impl PipelinePlan {
    pub fn hot_path(context: ContextSnapshot, route: ModelRoute) -> Self {
        Self {
            context,
            route,
            stages: vec![
                PipelineStage::ContextSnapshot,
                PipelineStage::AudioCapture,
                PipelineStage::Dsp,
                PipelineStage::Vad,
                PipelineStage::AsrRoute,
                PipelineStage::ModelRuntime,
                PipelineStage::Transcribe,
                PipelineStage::PostProcess,
                PipelineStage::FastIntent,
                PipelineStage::InjectOrAct,
            ],
        }
    }
}
