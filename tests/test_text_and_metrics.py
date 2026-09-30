from app.services import text_utils
from app.services.metrics import bleu, cider_d, evaluate_all, rouge_l, tokenize


class TestCleanCaption:
    def test_strips_default_prompt(self):
        assert text_utils.clean_caption("a picture of a dog on a beach", "a picture of") == "a dog on a beach"

    def test_removes_blip_artefacts(self):
        assert text_utils.clean_caption("arafed man riding a horse") == "man riding a horse"
        assert text_utils.clean_caption("there is a cat on the sofa") == "a cat on the sofa"

    def test_collapses_repeated_words(self):
        assert text_utils.clean_caption("a dog dog on the the grass") == "a dog on the grass"

    def test_collapses_x_and_x(self):
        assert text_utils.clean_caption("a mountain of lava and lava with a sky background") == "a mountain of lava with a sky background"
        assert text_utils.clean_caption("a cat and a dog") == "a cat and a dog"

    def test_keeps_there_inside_sentence(self):
        assert text_utils.clean_caption("a table where there are cups") == "a table where there are cups"


class TestFormatting:
    def test_sentence(self):
        assert text_utils.to_sentence("a dog") == "A dog."
        assert text_utils.to_sentence("is it a dog?") == "Is it a dog?"
        assert text_utils.to_sentence("") == ""

    def test_keywords_skip_stopwords_and_duplicates(self):
        kw = text_utils.keywords("a woman sitting on a beach with her dog and a dog toy")
        assert kw == ["woman", "beach", "dog", "toy"]

    def test_hashtags(self):
        assert text_utils.hashtags(["ice-cream", "beach"]) == ["#icecream", "#beach"]

    def test_format_outputs_shape(self):
        out = text_utils.format_outputs("two cats sleeping on a couch")
        assert out["sentence"] == "Two cats sleeping on a couch."
        assert out["word_count"] == 6
        assert 'alt="Two cats sleeping on a couch."' in out["alt_text"]


class TestMetrics:
    refs = {"a": ["a dog runs on the beach", "a dog running on sand"], "b": ["two cats sleep on a couch", "cats on a sofa"]}

    def test_tokenize(self):
        assert tokenize("A Dog's toy, 2 balls!") == ["a", "dog's", "toy", "2", "balls"]

    def test_perfect_hypothesis_scores_one(self):
        hyps = {"a": "a dog runs on the beach", "b": "two cats sleep on a couch"}
        b = bleu(hyps, self.refs)
        assert abs(b[3] - 1.0) < 1e-9
        assert abs(rouge_l(hyps, self.refs) - 1.0) < 1e-9

    def test_wrong_hypothesis_scores_low(self):
        good = {"a": "a dog runs on the beach", "b": "two cats sleep on a couch"}
        bad = {"a": "a red car parked outside", "b": "a plate of food"}
        assert evaluate_all(bad, self.refs)["CIDEr-D"] < evaluate_all(good, self.refs)["CIDEr-D"]
        assert evaluate_all(bad, self.refs)["BLEU-4"] < 0.01

    def test_brevity_penalty(self):
        short = {"a": "a dog", "b": "two cats"}
        assert bleu(short, self.refs)[0] < 0.5

    def test_cider_is_non_negative(self):
        assert cider_d({"a": "dog", "b": "cats"}, self.refs) >= 0
