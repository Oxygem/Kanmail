client:
	python -m make

docker:
	python -m make --docker

release:
	python -m make --release

clean:
	rm -rf dist/*
	rm -f dist/.release_version_lock
	rm -f dist/.spec
	rm -rf build/*
	rm -rf pyu-data/new/*
	git checkout -- CHANGELOG.md
