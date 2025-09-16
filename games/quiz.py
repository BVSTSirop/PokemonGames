from flask import Blueprint, render_template

bp = Blueprint('quiz', __name__)

@bp.route('/quiz')
def quiz():
    return render_template('quiz.html', title='Quiz (Coming Soon)', active_page='quiz')
