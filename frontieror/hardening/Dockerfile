ARG PY_VERSION=3.12
FROM python:${PY_VERSION}-slim-bookworm
RUN python -m pip install --no-cache-dir 'ortools==9.15.6755' 'scipy==1.18.1'
RUN groupadd -g 1000 runner && useradd -u 1000 -g 1000 -M runner
ENV PYTHONDONTWRITEBYTECODE=1 \
    OPENBLAS_NUM_THREADS=1 \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1 \
    HOME=/tmp
USER 1000:1000
WORKDIR /work/solver
