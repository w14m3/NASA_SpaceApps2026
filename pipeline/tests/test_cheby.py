"""Data-free tests (run in CI without downloads): Chebyshev fit/evaluate and the stellar-aberration formula."""
import numpy as np

from lunarnav import cheby
from lunarnav.de421 import stellar_aberration, pa_to_me_matrix


def test_cheby_fit_reproduces_smooth_vector_function():
    f = lambda t: np.stack([np.cos(t / 3e8), np.sin(t / 3e8), 0.1 * np.cos(t / 7e8)], axis=1) * 4e5  # noqa: E731
    c = cheby.fit_segments(f, 0.0, 4 * 86400.0, 10, 15)
    t = np.linspace(0, 40 * 86400e3, 777)
    assert cheby.angle_deg(cheby.evaluate(c, 0.0, 4 * 86400.0, t), f(t)).max() < 1e-9


def test_stellar_aberration_magnitude_is_v_over_c():
    p = np.array([[1.0e8, 0.0, 0.0]])
    v = np.array([[0.0, 30.0, 0.0]])  # km/s, perpendicular
    q = stellar_aberration(p, v)
    ang = np.degrees(np.arctan2(q[0, 1], q[0, 0])) * 3600
    assert abs(ang - np.degrees(30.0 / 299792.458) * 3600) < 1e-3  # ~20.6 arcsec
    assert abs(np.linalg.norm(q) - 1.0e8) < 1e-6


def test_pa_to_me_is_a_rotation_of_about_104_arcsec():
    m = pa_to_me_matrix()
    assert np.allclose(m @ m.T, np.eye(3), atol=1e-14)
    ang = np.degrees(np.arccos((np.trace(m) - 1) / 2)) * 3600
    assert 95 < ang < 110
