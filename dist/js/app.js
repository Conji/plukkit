(function() {
    'use strict';

    angular.module('app', ['ngRoute', 'ngAnimate'])
        .config(['$routeProvider', function($routeProvider) {
            $routeProvider.when('/', {
                templateUrl: './pages/templates/home.html',
                controller: 'HomeController',
                controllerAs: '_home'
            });
            $routeProvider.when('/about', {
                templateUrl: './pages/templates/about.html'
            });
            $routeProvider.otherwise({ redirectTo: '/' });
        }]);
})();
