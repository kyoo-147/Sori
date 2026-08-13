use crate::Transcript;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Vocabulary {
    pub terms: Vec<VocabularyTerm>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VocabularyTerm {
    pub term: String,
    pub pronunciation_hint: Option<String>,
    pub correction: Option<String>,
}

impl Vocabulary {
    pub fn prompt(&self) -> String {
        self.terms
            .iter()
            .filter_map(|term| {
                let word = term.term.trim();
                if word.is_empty() {
                    return None;
                }
                Some(
                    match term
                        .pronunciation_hint
                        .as_deref()
                        .map(str::trim)
                        .filter(|v| !v.is_empty())
                    {
                        Some(hint) => format!("{word} (pronounced {hint})"),
                        None => word.to_owned(),
                    },
                )
            })
            .collect::<Vec<_>>()
            .join(", ")
    }
}

pub fn normalize_transcript(mut transcript: Transcript, vocabulary: &Vocabulary) -> Transcript {
    for segment in &mut transcript.segments {
        segment.text = normalize_text(&segment.text, vocabulary);
    }
    transcript.text = normalize_text(&transcript.text, vocabulary);
    transcript
}

fn normalize_text(input: &str, vocabulary: &Vocabulary) -> String {
    let mut output = input.to_owned();
    let mut terms = vocabulary
        .terms
        .iter()
        .filter(|t| !t.term.trim().is_empty())
        .collect::<Vec<_>>();
    terms.sort_by_key(|t| std::cmp::Reverse(t.term.len()));
    for item in terms {
        let canonical = item.term.trim();
        let replacement = item
            .correction
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(canonical);
        output = replace_ascii_case_insensitive(&output, canonical, replacement);
    }
    output
}

fn replace_ascii_case_insensitive(input: &str, needle: &str, replacement: &str) -> String {
    if needle.is_empty() {
        return input.to_owned();
    }
    let lower = input.to_ascii_lowercase();
    let target = needle.to_ascii_lowercase();
    let mut result = String::with_capacity(input.len());
    let mut cursor = 0;
    while let Some(relative) = lower[cursor..].find(&target) {
        let start = cursor + relative;
        let end = start + target.len();
        let boundary = |byte: Option<u8>| {
            byte.map(|v| !v.is_ascii_alphanumeric() && v != b'_')
                .unwrap_or(true)
        };
        if boundary(input.as_bytes().get(start.wrapping_sub(1)).copied())
            && boundary(input.as_bytes().get(end).copied())
        {
            result.push_str(&input[cursor..start]);
            result.push_str(replacement);
            cursor = end;
        } else {
            result.push_str(&input[cursor..end]);
            cursor = end;
        }
    }
    result.push_str(&input[cursor..]);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalization_is_boundary_safe_and_explicit() {
        let vocabulary = Vocabulary {
            terms: vec![VocabularyTerm {
                term: "Sori".into(),
                pronunciation_hint: Some("so-ree".into()),
                correction: Some("Sori".into()),
            }],
        };
        assert_eq!(vocabulary.prompt(), "Sori (pronounced so-ree)");
        assert_eq!(
            normalize_transcript(Transcript::plain("sori sorine"), &vocabulary).text,
            "Sori sorine"
        );
    }
}
