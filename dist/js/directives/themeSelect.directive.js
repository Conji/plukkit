angular.module('app')
    .directive('themeSelect', function() {
        return {
            restrict: 'E',
            require: '^ngModel',
            scope: {
                themes: '=',
                ngModel: '='
            },
            template: '<select class="theme-select" ng-model="ngModel" ng-options="theme for theme in themes"></select',
            link: function(scope, element, attrs, ngModelCtrl) {
                scope.$watch('ngModel', function(newValue, oldValue) {

                });
            }
        }
    });