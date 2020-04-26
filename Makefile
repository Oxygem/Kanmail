client:
	python -m make

docker:
	python -m make --docker

docker-release:
	python -m make --docker --release

release:
	python -m make --release

release-complete:
	python -m make --release --complete

clean:
	rm -rf dist/*
	rm -f dist/.release_version_lock
	rm -f dist/.spec
	rm -rf build/*
	rm -rf pyu-data/new/*
	git checkout -- CHANGELOG.md
