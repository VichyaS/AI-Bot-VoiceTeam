export default {
  target: (dependencyName) => {
    if (dependencyName === '@types/node')
      return 'minor';
    return 'latest';
  }
};
